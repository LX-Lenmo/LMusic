'use strict';

/* ============ 本地音乐：IndexedDB 存储 + ID3/FLAC 标签解析 ============ */

const LocalMusic = {
  DB_NAME: 'lm_local_music',
  STORE: 'songs',

  _db: null,

  openDB() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  async add(record) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).add(record).onsuccess = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAll() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readonly');
      const req = tx.objectStore(this.STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async remove(id) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).delete(id).onsuccess = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async clear() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).clear().onsuccess = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /* 上传文件：解析标签并存入 IndexedDB */
  async uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return 0;
    let ok = 0;
    for (const file of files) {
      try {
        const tags = await this.parseTags(file);
        const record = {
          fileName: file.name,
          fileBlob: file,
          fileSize: file.size,
          name: tags.name || stripExtName(file.name),
          artist: tags.artist || '',
          album: tags.album || '',
          cover: tags.cover || '',
          lyric: tags.lyric || '',
          addedAt: Date.now()
        };
        await this.add(record);
        ok++;
      } catch (e) {
        console.warn('解析失败:', file.name, e);
      }
    }
    return ok;
  },

  /* 解析音频文件标签（返回 {name, artist, album, cover(dataURL), lyric}） */
  async parseTags(file) {
    const buf = await file.arrayBuffer();
    const b = new Uint8Array(buf);
    if (b.length > 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
      return parseId3(b);
    }
    if (b.length > 4 && b[0] === 0x66 && b[1] === 0x4C && b[2] === 0x61 && b[3] === 0x43) {
      return parseFlac(b);
    }
    return { name: '', artist: '', album: '', cover: '', lyric: '' };
  }
};

/* ---------- 工具 ---------- */

function stripExtName(name) {
  return String(name || '').replace(/\.[^.]+$/, '') || '未知音乐';
}

function syncsafeRead(b, off) {
  return ((b[off] & 0x7F) << 21) | ((b[off + 1] & 0x7F) << 14) |
         ((b[off + 2] & 0x7F) << 7) | (b[off + 3] & 0x7F);
}

function readUint32BE(b, off) {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

function readUint32LE(b, off) {
  return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0;
}

/* 文本帧解码（支持 UTF-8 / UTF-16） */
function decodeTagText(data) {
  if (!data || !data.length) return '';
  const enc = data[0];
  const text = data.slice(1);
  if (enc === 1 || enc === 2) {
    // UTF-16（可能带 BOM）
    if (text.length >= 2 && text[0] === 0xFF && text[1] === 0xFE) return new TextDecoder('utf-16le').decode(text.slice(2));
    if (text.length >= 2 && text[0] === 0xFE && text[1] === 0xFF) return new TextDecoder('utf-16be').decode(text.slice(2));
    return new TextDecoder('utf-16le').decode(text);
  }
  try { return new TextDecoder('utf-8').decode(text); } catch (e) { return ''; }
}

/* 找文本中编码对应的终止符位置 */
function findTerminator(data, from, utf16) {
  if (utf16) {
    let i = from;
    while (i + 1 < data.length) {
      if (data[i] === 0 && data[i + 1] === 0) return i;
      i += 2;
    }
    return data.length;
  }
  let i = from;
  while (i < data.length && data[i] !== 0) i++;
  return i;
}

/* ---------- MP3 ID3v2 解析 ---------- */

function parseId3(b) {
  const res = { name: '', artist: '', album: '', cover: '', lyric: '' };
  const ver = b[3];
  const size = syncsafeRead(b, 6);
  let pos = 10;
  const end = Math.min(10 + size, b.length);
  while (pos + 10 <= end) {
    const id = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
    if (id.charCodeAt(0) === 0) break;
    const fsize = (ver >= 4) ? syncsafeRead(b, pos + 4) : readUint32BE(b, pos + 4);
    if (fsize <= 0 || pos + 10 + fsize > b.length) break;
    const data = b.slice(pos + 10, pos + 10 + fsize);
    pos += 10 + fsize;
    try {
      if (id === 'TIT2') res.name = decodeTagText(data);
      else if (id === 'TPE1') res.artist = decodeTagText(data);
      else if (id === 'TALB') res.album = decodeTagText(data);
      else if (id === 'APIC') res.cover = decodeApic(data);
      else if (id === 'USLT') res.lyric = decodeUslt(data);
    } catch (e) { /* 单帧失败忽略 */ }
  }
  return res;
}

/* APIC：编码(1) + MIME(\0) + 类型(1) + 描述(\0) + 图片 */
function decodeApic(data) {
  if (data.length < 4) return '';
  const enc = data[0];
  let p = 1;
  while (p < data.length && data[p] !== 0) p++;
  const mime = new TextDecoder('latin1').decode(data.slice(1, p));
  p++; // MIME 结束
  if (p >= data.length) return '';
  p++; // 图片类型
  const descEnd = findTerminator(data, p, enc === 1 || enc === 2);
  p = Math.min(data.length, (enc === 1 || enc === 2) ? descEnd + 2 : descEnd + 1);
  const img = data.slice(p);
  if (!img.length) return '';
  return blobToDataURL(new Blob([img], { type: mime || 'image/jpeg' }));
}

/* USLT：编码(1) + 语言(3) + 描述(\0) + 歌词 */
function decodeUslt(data) {
  if (data.length < 5) return '';
  const enc = data[0];
  const descEnd = findTerminator(data, 4, enc === 1 || enc === 2);
  const start = Math.min(data.length, (enc === 1 || enc === 2) ? descEnd + 2 : descEnd + 1);
  const text = data.slice(start);
  if (!text.length) return '';
  if (enc === 1 || enc === 2) {
    if (text.length >= 2 && text[0] === 0xFF && text[1] === 0xFE) return new TextDecoder('utf-16le').decode(text.slice(2));
    if (text.length >= 2 && text[0] === 0xFE && text[1] === 0xFF) return new TextDecoder('utf-16be').decode(text.slice(2));
    return new TextDecoder('utf-16le').decode(text);
  }
  try { return new TextDecoder('utf-8').decode(text); } catch (e) { return ''; }
}

/* ---------- FLAC 解析（VORBIS_COMMENT + PICTURE） ---------- */

function parseFlac(b) {
  const res = { name: '', artist: '', album: '', cover: '', lyric: '' };
  let pos = 4; // "fLaC"
  let last = false;
  while (!last && pos + 4 <= b.length) {
    const header = b[pos];
    last = (header & 0x80) !== 0;
    const type = header & 0x7F;
    const len = ((b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]) >>> 0;
    const data = b.slice(pos + 4, pos + 4 + len);
    pos += 4 + len;
    try {
      if (type === 4) parseVorbisComment(data, res);
      else if (type === 6) parseFlacPicture(data, res);
    } catch (e) { /* 忽略单块错误 */ }
  }
  return res;
}

/* VORBIS_COMMENT：vendor(4 LE + str) + count(4 LE) + [len(4 LE) + "KEY=value"] */
function parseVorbisComment(data, res) {
  let p = 4;
  const vendorLen = readUint32LE(data, 0);
  p += vendorLen;
  if (p + 4 > data.length) return;
  const count = readUint32LE(data, p);
  p += 4;
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < count && p + 4 <= data.length; i++) {
    const len = readUint32LE(data, p);
    p += 4;
    if (p + len > data.length) break;
    const kv = dec.decode(data.slice(p, p + len));
    p += len;
    const eq = kv.indexOf('=');
    if (eq <= 0) continue;
    const key = kv.slice(0, eq).toUpperCase();
    const val = kv.slice(eq + 1);
    if (key === 'TITLE' && !res.name) res.name = val;
    else if (key === 'ARTIST' && !res.artist) res.artist = val;
    else if (key === 'ALBUM' && !res.album) res.album = val;
    else if (key === 'LYRICS' && !res.lyric) res.lyric = val;
  }
}

/* FLAC PICTURE：type(4 BE) + mime_len(4 BE) + mime + desc_len(4 BE) + desc + 宽高深(各4) + data_len(4 BE) + data */
function parseFlacPicture(data, res) {
  if (data.length < 8) return;
  let p = 4; // 图片类型
  const mimeLen = readUint32BE(data, p);
  p += 4;
  if (p + mimeLen + 4 > data.length) return;
  const mime = new TextDecoder('latin1').decode(data.slice(p, p + mimeLen));
  p += mimeLen;
  const descLen = readUint32BE(data, p);
  p += 4;
  p += descLen;
  p += 16; // 宽高深色
  if (p + 4 > data.length) return;
  const dataLen = readUint32BE(data, p);
  p += 4;
  if (p + dataLen > data.length) return;
  const img = data.slice(p, p + dataLen);
  if (!img.length) return;
  res.cover = blobToDataURL(new Blob([img], { type: mime || 'image/jpeg' }));
}

/* Blob → dataURL */
function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result || '');
    fr.onerror = () => resolve('');
    fr.readAsDataURL(blob);
  });
}
