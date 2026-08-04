'use strict';

/* ============ LM音乐台 主逻辑 ============ */

/* ---------- 初始化 ---------- */
(async function init() {
  await initConfig();
  Player.init();
  bindEvents();
  loadHome();
})();

/* ---------- 视图切换 ---------- */
function switchView(name, skipLoad) {
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach(el => {
    el.classList.remove('active');
  });
  const view = document.getElementById('view-' + name);
  if (view) view.classList.add('active');
  if (name === 'queue') renderQueueView();
  if (name === 'history') renderHistoryView();
  if (name === 'top') loadTop();
  if (name === 'local') renderLocalView();
}

/* ---------- 排行榜 ---------- */
let topSeq = 0;
async function loadTop() {
  const seq = ++topSeq;
  const grid = document.getElementById('topList');
  if (!grid) return;
  grid.innerHTML = '<div class="empty-tip">加载中...</div>';
  try {
    const d = await API.toplist();
    if (seq !== topSeq) return;
    renderTopGrid(grid, d.list || []);
  } catch (e) {
    if (seq !== topSeq) return;
    grid.innerHTML = '<div class="empty-tip">' + escHtml(e.message) + '</div>';
  }
}

/* ---------- 播放列表视图 ---------- */
function renderQueueView() {
  const list = document.getElementById('queueList');
  if (list) renderQueueList(list, Player.queue);
}

/* ---------- 历史播放视图 ---------- */
function renderHistoryView() {
  const list = document.getElementById('historyList');
  if (list) renderHistoryList(list, PlayHistory.getAll());
}

/* 播放状态变化时刷新可见视图（保持 playing 高亮） */
function onPlayerStateChanged() {
  const qv = document.getElementById('view-queue');
  if (qv && qv.classList.contains('active')) renderQueueView();
  const hv = document.getElementById('view-history');
  if (hv && hv.classList.contains('active')) renderHistoryView();
  const lv = document.getElementById('view-local');
  if (lv && lv.classList.contains('active')) renderLocalView();
}

/* ---------- 本地音乐视图 ---------- */
async function renderLocalView() {
  const list = document.getElementById('localList');
  if (!list) return;
  try {
    const records = await LocalMusic.getAll();
    renderLocalList(list, records);
  } catch (e) {
    list.innerHTML = '<div class="empty-tip">' + escHtml(e.message) + '</div>';
  }
}

/* 本地记录 → 播放器歌曲对象（兼容网络歌曲字段结构） */
function buildLocalSong(rec) {
  const song = {
    id: 'local_' + rec.id,          // 字符串 id，避免与网络歌曲数字 id 冲突
    localId: rec.id,
    name: rec.name || stripExtName(rec.fileName),
    localUrl: rec._objectUrl || URL.createObjectURL(rec.fileBlob),
    localCover: rec.cover || '',
    localLyric: rec.lyric || '',
    localFile: rec.fileBlob,
    picUrl: rec.cover || '',        // 供队列/历史视图 pickImage 显示封面
    al: { name: rec.album || '' },
    ar: [{ name: rec.artist || '未知歌手' }],
    fileName: rec.fileName,
    fileSize: rec.fileSize
  };
  rec._objectUrl = song.localUrl; // 缓存 objectURL，删除/清空时 revoke
  return song;
}

/* 点击本地歌曲播放 */
function playLocalRecord(rec) {
  if (!rec) return;
  const song = buildLocalSong(rec);
  Player.playSong(song);
  showToast('正在播放本地音乐');
}

/* 删除单条本地音乐（同时从播放队列移除并释放 objectURL） */
async function removeLocalRecord(rec) {
  if (!rec) return;
  try {
    await LocalMusic.remove(rec.id);
    // 从播放队列中移除对应项
    const qIdx = Player.queue.findIndex(s => s.localId === rec.id);
    if (qIdx >= 0) {
      Player.removeFromQueue(qIdx);
      renderQueueView();
    }
    if (rec._objectUrl) URL.revokeObjectURL(rec._objectUrl);
    renderLocalView();
    showToast('已删除本地音乐');
  } catch (e) {
    showToast('删除失败: ' + e.message, true);
  }
}

/* ---------- 首页加载（带请求序号保护） ---------- */
let homeSeq = 0;
async function loadHome() {
  const seq = ++homeSeq;
  const plGrid = document.getElementById('recommendPlaylists');
  const songList = document.getElementById('homeSongs');
  const title = document.getElementById('homeTitle');
  plGrid.innerHTML = '<div class="empty-tip">加载中...</div>';
  songList.innerHTML = '';
  try {
    const d = await API.personalized(12);
    if (seq !== homeSeq) return;
    renderPlaylistGrid(plGrid, d.result || []);
  } catch (e) {
    if (seq !== homeSeq) return;
    plGrid.innerHTML = '<div class="empty-tip">' + escHtml(e.message) + '</div>';
  }
  try {
    const d = await API.topSongs();
    if (seq !== homeSeq) return;
    title.textContent = '热门歌曲';
    renderSongList(songList, d.data || []);
  } catch (e) {
    if (seq !== homeSeq) return;
    songList.innerHTML = '<div class="empty-tip">' + escHtml(e.message) + '</div>';
  }
}

/* ---------- 搜索（带请求序号保护，避免旧响应覆盖新结果） ---------- */
let searchSeq = 0;
async function doSearch() {
  const kw = document.getElementById('searchInput').value.trim();
  if (!kw) { showToast('请输入搜索关键词', true); return; }
  const seq = ++searchSeq;
  const box = document.getElementById('searchResults');
  box.innerHTML = '<div class="empty-tip">搜索中...</div>';
  try {
    const d = await API.search(kw, 30);
    if (seq !== searchSeq) return; // 已被更新的搜索取代
    const songs = (d.result && d.result.songs) || [];
    // 诊断：确认 API 返回内容与关键词是否匹配（仅记录到控制台）
    console.log('[LM搜索] 关键词:', kw, '| 返回数:', songs.length, '| 第一首:', songs[0] && songs[0].name);
    if (!songs.length) box.innerHTML = '<div class="empty-tip">未找到相关歌曲</div>';
    else renderSongList(box, songs);
  } catch (e) {
    if (seq !== searchSeq) return;
    box.innerHTML = '<div class="empty-tip">' + escHtml(e.message) + '</div>';
  }
}

/* ---------- 歌单详情 ---------- */
let plSeq = 0;
let plBackView = 'home'; // 返回目标：home | top

function showPlaylistDetail(plid, source) {
  plBackView = source || 'home';
  switchView('playlists', true);
  const view = document.getElementById('playlistView');
  view.innerHTML = '<div class="back-link" id="plBack">' + ICONS.back + ' 返回</div>' +
    '<div id="plDetailWrap"><div class="empty-tip">加载中...</div></div>';
  document.getElementById('plBack').addEventListener('click', () => {
    if (plBackView === 'top') { switchView('top'); loadTop(); }
    else { switchView('home'); loadHome(); }
  });
  loadPlaylistDetail(plid);
}

async function loadPlaylistDetail(plid) {
  const seq = ++plSeq;
  const wrap = document.getElementById('plDetailWrap');
  try {
    const d = await API.playlistDetail(plid);
    if (seq !== plSeq) return;
    const pl = d.playlist;
    wrap.innerHTML =
      '<div class="playlist-detail">' +
      '<img class="pd-cover" src="' + coverUrl(pl.coverImgUrl, 300) + '" alt="">' +
      '<div class="pd-info">' +
      '<h2>' + escHtml(pl.name) + '</h2>' +
      '<div class="pd-meta">创建者：' + escHtml(pl.creator ? pl.creator.nickname : '未知') + '<br>' +
      '歌曲数：' + (pl.trackCount || 0) + '<br>播放量：' + formatCount(pl.playCount) + '</div>' +
      '<div class="pd-actions"><button class="btn primary" id="btnPlayAll">播放全部</button></div>' +
      '</div></div>' +
      '<div class="song-list" id="plSongs"></div>';
    renderSongList(document.getElementById('plSongs'), pl.tracks || []);
    document.getElementById('btnPlayAll').addEventListener('click', () => {
      Player.playList(pl.tracks || [], 0);
    });
  } catch (e) {
    if (seq !== plSeq) return;
    wrap.innerHTML = '<div class="empty-tip">' + escHtml(e.message) + '</div>';
  }
}
/* ---------- 下载功能（音频 / 图片 / 歌词 / 完整包） ---------- */
let pendingDownloadSong = null;

function openDownloadMenu(song) {
  if (!song) { showToast('当前没有可下载的歌曲', true); return; }
  pendingDownloadSong = song;
  const el = document.getElementById('downloadSongName');
  if (el) {
    const artists = (song.ar || song.artists || []).map(a => a.name).join(' / ');
    el.textContent = song.name + (artists ? ' - ' + artists : '');
  }
  openModal('downloadOverlay');
}

/* 文件名净化（去掉 Windows/Linux 非法字符） */
function sanitizeFilename(name) {
  return String(name || 'download').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').trim() || 'download';
}

/* 获取歌曲基础文件名：歌手 - 歌曲名 */
function songBaseName(song) {
  const artists = (song.ar || song.artists || []).map(a => a.name).join('_');
  return sanitizeFilename((artists ? artists + ' - ' : '') + (song.name || '未知歌曲'));
}

/* 获取音源 URL（失败抛错） */
async function getSongUrl(song) {
  const d = await API.songUrl(song.id);
  const item = d.data && d.data[0];
  if (!item || !item.url) throw new Error('该歌曲暂无可用音源');
  return item.url;
}

/* 获取封面 URL（songDetail 补全） */
async function getCoverUrl(song) {
  const al = song.al || song.album || {};
  if (al.picUrl || al.coverImgUrl) return al.picUrl || al.coverImgUrl;
  const d = await API.songDetail([song.id]);
  const s = (d.songs || [])[0];
  const sal = s && (s.al || s.album || {});
  const u = (sal && (sal.picUrl || sal.coverImgUrl)) || '';
  if (!u) throw new Error('该歌曲没有封面图片');
  return u;
}

/* 获取歌词文本（可能为空串） */
async function getLyricText(song) {
  const d = await API.lyric(song.id);
  return (d.lrc && d.lrc.lyric) || '';
}

/* fetch 资源为 ArrayBuffer（失败抛错） */
async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('资源获取失败 HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  if (!buf || !buf.byteLength) throw new Error('资源内容为空');
  return buf;
}

/* dataURL → Blob（用于本地内嵌封面下载） */
function dataUrlToBlob(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) throw new Error('图片数据无效');
  const mime = m[1] || 'application/octet-stream';
  const bytes = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* 本地歌曲文件名（用原始文件名，净化后去扩展名） */
function localBaseName(song) {
  return sanitizeFilename((song.fileName || song.name || '本地音乐').replace(/\.[^.]+$/, ''));
}

/* 只下载音频 */
async function downloadAudioOnly(song) {
  try {
    showToast('正在获取音源...');
    /* 本地音乐：直接下载本地文件 */
    if (song.localFile) {
      downloadBlob(song.localFile, sanitizeFilename(song.fileName || (song.name + '.mp3')));
      showToast('音频下载已开始');
      return;
    }
    const url = await getSongUrl(song);
    const blob = await fetchBuffer(url);
    downloadBlob(new Blob([blob], { type: 'audio/mpeg' }), songBaseName(song) + '.mp3');
    showToast('音频下载已开始');
  } catch (e) {
    showToast(e.message, true);
  }
}

/* 只下载歌曲图片（封面） */
async function downloadCoverOnly(song) {
  try {
    showToast('正在获取封面...');
    /* 本地音乐：直接用内嵌封面 dataURL */
    if (song.localCover) {
      const blob = dataUrlToBlob(song.localCover);
      const ext = (blob.type.match(/image\/(\w+)/) || [])[1] || 'jpg';
      downloadBlob(blob, localBaseName(song) + '_cover.' + ext);
      showToast('封面下载已开始');
      return;
    }
    const url = await getCoverUrl(song);
    const blob = await fetchBuffer(url);
    const ext = (url.split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i) || [])[1] || 'jpg';
    downloadBlob(new Blob([blob]), songBaseName(song) + '_cover.' + ext);
    showToast('封面下载已开始');
  } catch (e) {
    showToast(e.message, true);
  }
}

/* 只下载歌词 */
async function downloadLyricOnly(song) {
  try {
    showToast('正在获取歌词...');
    /* 本地音乐：直接用标签内歌词 */
    const lrc = song.localLyric !== undefined ? song.localLyric : await getLyricText(song);
    if (!lrc) throw new Error('该歌曲没有歌词');
    downloadBlob(lrc, localBaseName(song) + '.lrc', 'text/plain');
    showToast('歌词下载已开始');
  } catch (e) {
    showToast(e.message, true);
  }
}

/* 下载带标签音频：MP3 内嵌封面（APIC）+ 歌词（USLT）+ 标题/歌手/专辑 */
async function downloadTaggedAudio(song) {
  try {
    showToast('正在获取并嵌入标签（封面+歌词）...');
    const base = song.localFile ? localBaseName(song) : songBaseName(song);
    /* 本地音乐：直接使用本地文件 + 内嵌封面/歌词重建标签 */
    if (song.localFile) {
      const audioBuf = await song.localFile.arrayBuffer();
      const coverBlob = song.localCover ? dataUrlToBlob(song.localCover) : null;
      const coverBytes = coverBlob ? new Uint8Array(await coverBlob.arrayBuffer()) : null;
      const mime = coverBlob ? (coverBlob.type || 'image/jpeg') : 'image/jpeg';
      const al = song.al || {};
      const ar = song.ar || [];
      const frames = [
        textFrame('TIT2', song.name || ''),
        textFrame('TPE1', ar.map(a => a.name).join(' / ')),
        textFrame('TALB', al.name || ''),
        textFrame('TCON', '')
      ];
      if (coverBytes && coverBytes.length) frames.push(apicFrame(coverBytes, mime, ''));
      if (song.localLyric) frames.push(usltFrame(song.localLyric, 'chi'));
      const tagged = attachId3(new Uint8Array(audioBuf), frames);
      downloadBlob(new Blob([tagged], { type: 'audio/mpeg' }), base + '.mp3');
      showToast('带标签音频下载已开始（内嵌封面+歌词）');
      return;
    }
    const [audioBuf, coverUrl, lrc] = await Promise.all([
      getSongUrl(song).then(fetchBuffer),
      getCoverUrl(song),
      getLyricText(song)
    ]);
    const coverBuf = await fetchBuffer(coverUrl);
    const mime = (coverUrl.split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i) || [])[0] || '.jpg';
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const al = song.al || song.album || {};
    const ar = song.ar || song.artists || [];
    const frames = [
      textFrame('TIT2', song.name || ''),
      textFrame('TPE1', ar.map(a => a.name).join(' / ')),
      textFrame('TALB', al.name || ''),
      textFrame('TCON', ''),
      apicFrame(new Uint8Array(coverBuf), mimeMap[mime] || 'image/jpeg', ''),
      usltFrame(lrc || '')
    ];
    const tagged = attachId3(new Uint8Array(audioBuf), frames);
    downloadBlob(new Blob([tagged], { type: 'audio/mpeg' }), base + '.mp3');
    showToast('带标签音频下载已开始（内嵌封面+歌词）');
  } catch (e) {
    showToast(e.message, true);
  }
}

/* ---------- ID3v2.4 标签构建（纯 JS，无依赖） ---------- */

/* ID3v2 syncsafe 32位编码 */
function syncsafe32(n) {
  return [(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F];
}

/* 通用帧：FrameID(4) + size(syncsafe 4) + flags(2) + data */
function id3Frame(id, data) {
  const out = new Uint8Array(10 + data.length);
  out.set(new TextEncoder().encode(id), 0);
  out.set(syncsafe32(data.length), 4);
  const dv = new DataView(out.buffer);
  dv.setUint16(8, 0, false); // flags
  out.set(data, 10);
  return out;
}

/* 文本帧（UTF-8） */
function textFrame(id, text) {
  const enc = new TextEncoder();
  const bytes = enc.encode(String(text || ''));
  const data = new Uint8Array(1 + bytes.length);
  data[0] = 0x03; // 编码：UTF-8
  data.set(bytes, 1);
  return id3Frame(id, data);
}

/* APIC 封面帧：编码(1) + MIME(\0结尾) + 图片类型(1) + 描述(\0结尾) + 图片数据 */
function apicFrame(imageBytes, mime, description) {
  const enc = new TextEncoder();
  const mimeBytes = enc.encode(mime || 'image/jpeg');
  const descBytes = enc.encode(description || '');
  const data = new Uint8Array(1 + mimeBytes.length + 1 + 1 + descBytes.length + 1 + imageBytes.length);
  let p = 0;
  data[p++] = 0x03; // UTF-8
  data.set(mimeBytes, p); p += mimeBytes.length;
  data[p++] = 0; // MIME 结束
  data[p++] = 0x03; // 图片类型：3 = 封面 (front cover)
  data.set(descBytes, p); p += descBytes.length;
  data[p++] = 0; // 描述结束
  data.set(imageBytes, p);
  return id3Frame('APIC', data);
}

/* USLT 歌词帧：编码(1) + 语言(3) + 描述(\0结尾) + 歌词文本 */
function usltFrame(lyricText, lang) {
  const enc = new TextEncoder();
  const langBytes = enc.encode((lang || 'chi').substring(0, 3));
  const descBytes = enc.encode('');
  const textBytes = enc.encode(String(lyricText || ''));
  const data = new Uint8Array(1 + 3 + descBytes.length + 1 + textBytes.length);
  let p = 0;
  data[p++] = 0x03; // UTF-8
  data.set(langBytes, p); p += 3;
  data.set(descBytes, p); p += descBytes.length;
  data[p++] = 0; // 描述结束
  data.set(textBytes, p);
  return id3Frame('USLT', data);
}

/* 把 ID3 标签附加到音频字节前 */
function attachId3(audioBytes, frames) {
  const total = frames.reduce((s, f) => s + f.length, 0);
  const header = new Uint8Array(10);
  header.set(new TextEncoder().encode('ID3'), 0);
  header[3] = 4; // v2.4
  header[4] = 0;
  header[5] = 0; // flags
  header.set(syncsafe32(total), 6);
  const out = new Uint8Array(10 + total + audioBytes.length);
  out.set(header, 0);
  let p = 10;
  frames.forEach(f => { out.set(f, p); p += f.length; });
  out.set(audioBytes, p);
  return out;
}

/* ---------- 设置面板 ---------- */
let pendingBgDataUrl = null;

function fillSettingsForm() {
  document.getElementById('setAudioLevel').value = CONFIG.api.audioLevel || 'exhigh';
  document.getElementById('setBgUrl').value = CONFIG.theme.backgroundImage || '';
  document.getElementById('setPrimaryColor').value = CONFIG.theme.primaryColor || '#ffffff';
  // 色板高亮
  document.querySelectorAll('#colorSwatches span').forEach(sp => {
    sp.classList.toggle('active', sp.dataset.color === (CONFIG.theme.primaryColor || '#ffffff'));
  });
  // 样式单选
  const styleRadio = document.querySelector('input[name="ctlstyle"][value="' + (CONFIG.ui.controlStyle || 'blur') + '"]');
  if (styleRadio) styleRadio.checked = true;
  updateStyleCards();
}

function updateStyleCards() {
  document.querySelectorAll('.style-card').forEach(card => {
    const radio = card.querySelector('input[type="radio"]');
    card.classList.toggle('active', !!(radio && radio.checked));
  });
}

function saveSettingsFromForm() {
  const oldLevel = CONFIG.api.audioLevel;
  CONFIG.api.audioLevel = document.getElementById('setAudioLevel').value;
  CONFIG.theme.backgroundImage = pendingBgDataUrl || document.getElementById('setBgUrl').value.trim();
  CONFIG.theme.primaryColor = document.getElementById('setPrimaryColor').value;
  const styleRadio = document.querySelector('input[name="ctlstyle"]:checked');
  CONFIG.ui.controlStyle = styleRadio ? styleRadio.value : 'blur';
  pendingBgDataUrl = null;
  saveConfig();
  // 音质变化时重新加载当前歌曲音源
  if (CONFIG.api.audioLevel !== oldLevel && Player.queue[Player.index]) {
    Player.playAt(Player.index);
  }
  loadHome();
}

/* 背景图片上传（压缩后转 dataURL） */
function handleBgFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      const MAX_W = 1600;
      let w = img.width, h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      pendingBgDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      document.getElementById('setBgUrl').value = '（已上传本地图片，保存后生效）';
      showToast('图片已就绪，点击保存设置生效');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}

/* ---------- 进度条 ---------- */
function seekFromEvent(e) {
  const bar = document.getElementById('progressBar');
  const rect = bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  if (Player.audio.duration && isFinite(Player.audio.duration)) {
    Player.audio.currentTime = ratio * Player.audio.duration;
  }
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {

  /* 视图切换 */
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });

  /* 歌曲行 / 歌单卡片 事件委托 */
  document.addEventListener('click', function (e) {
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      e.stopPropagation();
      const row = actBtn.closest('.song-row');
      if (!row) return;
      const listEl = row.parentElement;
      const act = actBtn.dataset.act;
      /* 本地音乐行：用 _localRecords 查找记录 */
      if (row.dataset.local === '1') {
        const records = listEl._localRecords || [];
        const rec = records.find(r => r.id === Number(row.dataset.id));
        if (!rec) return;
        if (act === 'play') playLocalRecord(rec);
        else if (act === 'download') openDownloadMenu(buildLocalSong(rec));
        else if (act === 'remove-local') removeLocalRecord(rec);
        return;
      }
      const songs = listEl._songs || [];
      const song = songs.find(s => s.id === Number(row.dataset.id));
      if (!song) return;
      if (act === 'play') Player.playSong(song);
      else if (act === 'download') openDownloadMenu(song);
      else if (act === 'remove-history') {
        PlayHistory.remove(song.id);
        renderHistoryView();
        showToast('已从历史移除');
      } else if (act === 'remove-queue') {
        const idx = Number(actBtn.dataset.idx);
        if (!isNaN(idx)) {
          Player.removeFromQueue(idx);
          renderQueueView();
          showToast('已从播放列表移除');
        }
      }
      return;
    }
    const card = e.target.closest('.playlist-card');
    if (card) {
      const topView = document.getElementById('view-top');
      const fromTop = topView && topView.contains(card);
      showPlaylistDetail(Number(card.dataset.plid), fromTop ? 'top' : 'home');
    }
  });

  /* 歌曲行点击播放（点击非按钮区域） */
  document.addEventListener('dblclick', function (e) {
    const row = e.target.closest('.song-row');
    if (row && !e.target.closest('[data-act]')) {
      const listEl = row.parentElement;
      if (row.dataset.local === '1') {
        const records = listEl._localRecords || [];
        const rec = records.find(r => r.id === Number(row.dataset.id));
        if (rec) playLocalRecord(rec);
        return;
      }
      const songs = listEl._songs || [];
      const song = songs.find(s => s.id === Number(row.dataset.id));
      if (song) Player.playSong(song);
    }
  });

  /* 播放控制 */
  document.getElementById('btnPlay').addEventListener('click', () => Player.togglePlay());
  document.getElementById('btnPrev').addEventListener('click', () => Player.prev());
  document.getElementById('btnNext').addEventListener('click', () => Player.next());
  document.getElementById('btnMode').addEventListener('click', () => Player.cycleMode());
  document.getElementById('btnDownload').addEventListener('click', () => {
    openDownloadMenu(Player.queue[Player.index]);
  });

  /* 下载菜单选项 */
  document.getElementById('btnDlAudio').addEventListener('click', () => {
    const song = pendingDownloadSong;
    closeModal('downloadOverlay');
    if (song) downloadAudioOnly(song);
  });
  document.getElementById('btnDlCover').addEventListener('click', () => {
    const song = pendingDownloadSong;
    closeModal('downloadOverlay');
    if (song) downloadCoverOnly(song);
  });
  document.getElementById('btnDlLyric').addEventListener('click', () => {
    const song = pendingDownloadSong;
    closeModal('downloadOverlay');
    if (song) downloadLyricOnly(song);
  });
  document.getElementById('btnDlPack').addEventListener('click', () => {
    const song = pendingDownloadSong;
    closeModal('downloadOverlay');
    if (song) downloadTaggedAudio(song);
  });

  /* 播放列表：播放全部 / 清空队列 */
  document.getElementById('btnPlayQueueAll').addEventListener('click', () => {
    if (!Player.queue.length) { showToast('播放列表为空', true); return; }
    Player.playAt(0);
    showToast('开始播放全部歌曲');
  });
  document.getElementById('btnClearQueue').addEventListener('click', () => {
    if (!Player.queue.length) { showToast('播放列表已为空', true); return; }
    Player.clearQueue();
    renderQueueView();
    showToast('播放列表已清空');
  });

  /* 历史播放：清空历史 */
  document.getElementById('btnClearHistory').addEventListener('click', () => {
    if (!PlayHistory.getAll().length) { showToast('暂无播放历史', true); return; }
    PlayHistory.clear();
    renderHistoryView();
    showToast('播放历史已清空');
  });

  /* 本地音乐：上传文件（解析标签后存入 IndexedDB） */
  document.getElementById('localFileInput').addEventListener('change', async e => {
    const files = e.target.files;
    if (!files || !files.length) return;
    showToast('正在解析标签并保存...');
    try {
      const n = await LocalMusic.uploadFiles(files);
      renderLocalView();
      if (n > 0) showToast('成功上传 ' + n + ' 首本地音乐');
      else showToast('没有可识别的音频文件（需 MP3/FLAC）', true);
    } catch (err) {
      showToast('上传失败: ' + err.message, true);
    }
    e.target.value = '';
  });

  /* 本地音乐：清空全部 */
  document.getElementById('btnClearLocal').addEventListener('click', async () => {
    const list = document.getElementById('localList');
    const records = (list && list._localRecords) || [];
    if (!records.length) { showToast('暂无本地音乐', true); return; }
    if (!confirm('确定清空全部 ' + records.length + ' 首本地音乐吗？此操作不可恢复。')) return;
    try {
      records.forEach(rec => { if (rec._objectUrl) URL.revokeObjectURL(rec._objectUrl); });
      await LocalMusic.clear();
      // 从播放队列移除本地歌曲并复位
      if (Player.queue.some(s => s.localId !== undefined)) {
        Player.queue = Player.queue.filter(s => s.localId === undefined);
        if (Player.index >= Player.queue.length) Player.index = Player.queue.length - 1;
        if (!Player.queue.length) Player.resetPlayingUI();
        renderQueueView();
      }
      renderLocalView();
      showToast('本地音乐已全部清空');
    } catch (err) {
      showToast('清空失败: ' + err.message, true);
    }
  });

  /* 音量 */
  const volSlider = document.getElementById('volumeSlider');
  volSlider.addEventListener('input', () => {
    Player.audio.volume = volSlider.value / 100;
  });
  document.getElementById('btnVolume').addEventListener('click', () => {
    Player.audio.muted = !Player.audio.muted;
  });

  /* 进度条拖动 */
  const pBar = document.getElementById('progressBar');
  let dragging = false;
  pBar.addEventListener('pointerdown', function (e) {
    dragging = true;
    pBar.classList.add('dragging');
    pBar.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  });
  pBar.addEventListener('pointermove', function (e) {
    if (dragging) seekFromEvent(e);
  });
  pBar.addEventListener('pointerup', function () {
    dragging = false;
    pBar.classList.remove('dragging');
  });

  /* 歌词面板 */
  const lyricPanel = document.getElementById('lyricPanel');
  document.getElementById('btnLyricToggle').addEventListener('click', () => {
    const willOpen = !lyricPanel.classList.contains('open');
    lyricPanel.classList.remove('hidden');
    lyricPanel.classList.toggle('open');
    if (!willOpen) setTimeout(() => lyricPanel.classList.add('hidden'), 320);
    // 打开时滚动到当前行
    if (willOpen && Player.lyricIndex >= 0) {
      highlightLyric(Player.lyricIndex);
    }
  });
  document.getElementById('btnLyricClose').addEventListener('click', () => {
    lyricPanel.classList.remove('open');
    setTimeout(() => lyricPanel.classList.add('hidden'), 320);
  });

  /* 搜索 */
  document.getElementById('btnSearch').addEventListener('click', doSearch);
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  /* 音质切换 */
  document.getElementById('qualityTag').addEventListener('click', () => {
    document.querySelectorAll('#qualityList .quality-item').forEach(el => {
      el.classList.toggle('active', el.dataset.level === CONFIG.api.audioLevel);
    });
    openModal('qualityOverlay');
  });
  document.getElementById('qualityList').addEventListener('click', function (e) {
    const item = e.target.closest('.quality-item');
    if (!item) return;
    CONFIG.api.audioLevel = item.dataset.level;
    saveConfig();
    closeModal('qualityOverlay');
    showToast('音质已切换为 ' + (QUALITY_LABELS[item.dataset.level] || item.dataset.level));
    if (Player.queue[Player.index]) Player.playAt(Player.index);
  });

  /* 设置面板 */
  document.getElementById('btnOpenSettings').addEventListener('click', () => {
    fillSettingsForm();
    openModal('settingsOverlay');
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeAllModals());
  });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov) closeAllModals();
    });
  });

  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    saveSettingsFromForm();
    closeAllModals();
    showToast('设置已保存');
  });

  /* 色板 */
  document.querySelectorAll('#colorSwatches span').forEach(sp => {
    sp.addEventListener('click', () => {
      document.getElementById('setPrimaryColor').value = sp.dataset.color;
      document.querySelectorAll('#colorSwatches span').forEach(s => s.classList.remove('active'));
      sp.classList.add('active');
    });
  });

  /* 控制栏样式单选 */
  document.querySelectorAll('#styleOptions input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', updateStyleCards);
  });

  /* 背景图片上传 / 清除 */
  document.getElementById('setBgFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleBgFile(file);
    e.target.value = '';
  });
  document.getElementById('btnClearBg').addEventListener('click', () => {
    document.getElementById('setBgUrl').value = '';
    pendingBgDataUrl = null;
    document.getElementById('setPrimaryColor').value = '#ffffff';
  });

  /* 配置导出 / 导入 / 重置 */
  document.getElementById('btnExportConfig').addEventListener('click', () => {
    downloadBlob(exportConfigJson(), 'config.json');
  });
  document.getElementById('btnImportConfig').addEventListener('click', () => {
    document.getElementById('importConfigFile').click();
  });
  document.getElementById('importConfigFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const data = JSON.parse(ev.target.result);
        CONFIG = deepMerge(DEFAULT_CONFIG, data);
        saveConfig();
        fillSettingsForm();
        showToast('配置已导入');
        loadHome();
      } catch (err) {
        showToast('配置文件格式错误', true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  document.getElementById('btnResetConfig').addEventListener('click', () => {
    resetConfig();
    fillSettingsForm();
    showToast('已恢复默认设置');
  });
}