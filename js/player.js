'use strict';

/* ============ 播放器核心 ============ */

const Player = {
  audio: null,
  queue: [],          // 歌曲对象列表
  index: -1,
  mode: 'order',      // order | loop | shuffle
  currentUrl: null,
  lyricLines: [],
  lyricIndex: -1,
  _lastLyricCheck: 0,

  init() {
    this.audio = document.getElementById('audioPlayer');
    this.audio.volume = 0.8;
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('play', () => this.onPlayState(true));
    this.audio.addEventListener('pause', () => this.onPlayState(false));
    this.audio.addEventListener('error', () => {
      showToast('音频加载失败，可能无版权或需要更高音质权限', true);
    });
  },

  /* 设置播放队列并播放指定序号 */
  async playAt(index) {
    if (!this.queue.length || index < 0 || index >= this.queue.length) return;
    this.index = index;
    const song = this.queue[index];
    if (!song) return;

    /* 本地音乐：直接用本地文件播放，不请求 API */
    if (song.localUrl) {
      this.currentUrl = song.localUrl;
      this.audio.src = song.localUrl;
      this.audio.play().catch(() => { /* 自动播放被拦截时忽略 */ });
      this.updatePlayingUI(song);
      if (song.localLyric) {
        this.lyricLines = this.parseLrc(song.localLyric);
        this.lyricIndex = -1;
        renderLyricPanel();
      } else {
        // 本地歌曲无内嵌歌词：直接清空，不请求网络歌词接口
        this.lyricLines = [];
        this.lyricIndex = -1;
        renderLyricPanel();
      }
      this.fillCover(song);
      if (typeof onPlayerStateChanged === 'function') onPlayerStateChanged();
      return;
    }

    try {
      const data = await API.songUrl(song.id);
      const item = data.data && data.data[0];
      if (!item || !item.url) {
        showToast('该歌曲暂无可用音源（可能需登录或购买）', true);
        return;
      }
      this.currentUrl = item.url;
      this.audio.src = item.url;
      this.audio.play().catch(() => { /* 自动播放被拦截时忽略 */ });
      this.updatePlayingUI(song);
      this.loadLyric(song.id);
      this.fillCover(song);
      PlayHistory.add(song);
      if (typeof onPlayerStateChanged === 'function') onPlayerStateChanged();
    } catch (e) {
      showToast(e.message, true);
    }
  },

  /* 播放时补全专辑封面（本地音乐直接使用内嵌封面，网络歌曲用详情接口） */
  fillCover(song) {
    if (song.localCover) {
      const coverEl = document.getElementById('coverImg');
      if (coverEl) coverEl.src = song.localCover;
      const rowImg = document.querySelector('.song-row[data-id="' + song.id + '"] .song-cover');
      if (rowImg) rowImg.src = song.localCover;
      return;
    }
    if (hasAlbumCover(song)) return;
    API.songDetail([song.id]).then(function (d) {
      const s = (d.songs || [])[0];
      if (!s) return;
      const al = s.al || s.album || {};
      const u = al.picUrl || al.coverImgUrl || '';
      if (!u) return;
      const coverEl = document.getElementById('coverImg');
      if (coverEl) coverEl.src = coverUrl(u, 300);
      const rowImg = document.querySelector('.song-row[data-id="' + song.id + '"] .song-cover');
      if (rowImg) rowImg.src = coverUrl(u, 100);
    }).catch(function () { /* 忽略 */ });
  },

  playSong(song) {
    // 从单曲播放：替换队列或加入队列
    const idx = this.queue.findIndex(s => s.id === song.id);
    if (idx >= 0) {
      this.playAt(idx);
    } else {
      this.queue.push(song);
      this.playAt(this.queue.length - 1);
    }
  },

  playList(songs, startIndex) {
    this.queue = songs.slice();
    this.playAt(startIndex || 0);
  },

  /* 从队列移除指定序号歌曲 */
  removeFromQueue(idx) {
    if (idx < 0 || idx >= this.queue.length) return;
    this.queue.splice(idx, 1);
    if (!this.queue.length) {
      this.resetPlayingUI();
    } else if (idx < this.index) {
      this.index--;
    } else if (idx === this.index) {
      this.playAt(Math.min(idx, this.queue.length - 1));
    }
  },

  /* 清空播放队列 */
  clearQueue() {
    this.queue = [];
    this.index = -1;
    this.resetPlayingUI();
  },

  /* 重置底部播放器显示（无播放状态） */
  resetPlayingUI() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.currentUrl = null;
    this.lyricLines = [];
    this.lyricIndex = -1;
    renderLyricPanel();
    const nameEl = document.getElementById('songName');
    const artistEl = document.getElementById('songArtist');
    const coverEl = document.getElementById('coverImg');
    const cur = document.getElementById('curTime');
    const dur = document.getElementById('durTime');
    const fill = document.getElementById('progressFill');
    const thumb = document.getElementById('progressThumb');
    if (nameEl) nameEl.textContent = '未在播放';
    if (artistEl) artistEl.textContent = '暂无歌曲';
    if (coverEl) coverEl.src = '';
    if (cur) cur.textContent = '00:00';
    if (dur) dur.textContent = '00:00';
    if (fill) fill.style.width = '0%';
    if (thumb) thumb.style.left = '0%';
    document.querySelectorAll('.song-row').forEach(row => row.classList.remove('playing'));
  },

  togglePlay() {
    if (this.audio.paused) {
      if (!this.audio.src) {
        if (this.queue.length) this.playAt(this.index >= 0 ? this.index : 0);
        return;
      }
      this.audio.play().catch(() => { /* ignore */ });
    } else {
      this.audio.pause();
    }
  },

  next() {
    if (!this.queue.length) return;
    let idx;
    if (this.mode === 'shuffle' && this.queue.length > 1) {
      do { idx = Math.floor(Math.random() * this.queue.length); } while (idx === this.index);
    } else {
      idx = (this.index + 1) % this.queue.length;
    }
    this.playAt(idx);
  },

  prev() {
    if (!this.queue.length) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    const idx = (this.index - 1 + this.queue.length) % this.queue.length;
    this.playAt(idx);
  },

  cycleMode() {
    const modes = ['order', 'loop', 'shuffle'];
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.updateModeUI();
  },

  onEnded() {
    if (this.mode === 'loop') {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => { /* ignore */ });
    } else if (this.mode === 'shuffle' && this.queue.length > 1) {
      let idx;
      do { idx = Math.floor(Math.random() * this.queue.length); } while (idx === this.index);
      this.playAt(idx);
    } else {
      this.next();
    }
  },

  onTimeUpdate() {
    const cur = document.getElementById('curTime');
    const dur = document.getElementById('durTime');
    const fill = document.getElementById('progressFill');
    const thumb = document.getElementById('progressThumb');
    if (cur) cur.textContent = fmtTime(this.audio.currentTime);
    if (dur) dur.textContent = fmtTime(this.audio.duration || 0);
    if (fill && this.audio.duration) {
      const pct = (this.audio.currentTime / this.audio.duration) * 100;
      fill.style.width = pct + '%';
      if (thumb) thumb.style.left = pct + '%';
    }
    // 歌词同步（节流 250ms）
    const now = Date.now();
    if (now - this._lastLyricCheck > 250) {
      this._lastLyricCheck = now;
      this.syncLyric(this.audio.currentTime);
    }
  },

  onPlayState(playing) {
    const btn = document.getElementById('btnPlay');
    if (!btn) return;
    btn.classList.toggle('playing', playing);
    btn.title = playing ? '暂停' : '播放';
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.innerHTML = playing
        ? '<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>'
        : '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>';
    }
  },

  /* LRC 解析 */
  parseLrc(lrc) {
    const lines = [];
    if (!lrc) return lines;
    const timeRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    for (const line of lrc.split('\n')) {
      const times = [];
      let m;
      timeRe.lastIndex = 0;
      while ((m = timeRe.exec(line)) !== null) {
        const min = parseFloat(m[1]);
        const sec = parseFloat(m[2]);
        // 小数部分：2位为百分秒，3位为毫秒，1位为十分之一秒，统一按小数处理
        const frac = parseFloat('0.' + (m[3] || '0'));
        times.push(min * 60 + sec + frac);
      }
      if (!times.length) continue;
      const text = line.replace(timeRe, '').trim();
      for (const t of times) lines.push({ time: t, text: text });
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
  },

  async loadLyric(id) {
    this.lyricLines = [];
    this.lyricIndex = -1;
    try {
      const data = await API.lyric(id);
      const lrc = (data.lrc && data.lrc.lyric) || '';
      this.lyricLines = this.parseLrc(lrc);
      renderLyricPanel();
    } catch (e) {
      this.lyricLines = [];
      renderLyricPanel();
    }
  },

  syncLyric(t) {
    if (!this.lyricLines.length) return;
    let idx = -1;
    for (let i = 0; i < this.lyricLines.length; i++) {
      if (this.lyricLines[i].time <= t) idx = i; else break;
    }
    if (idx !== this.lyricIndex) {
      this.lyricIndex = idx;
      highlightLyric(idx);
    }
  },

  /* 更新底部播放器 UI */
  updatePlayingUI(song) {
    const nameEl = document.getElementById('songName');
    const artistEl = document.getElementById('songArtist');
    const coverEl = document.getElementById('coverImg');
    const qTag = document.getElementById('qualityTag');
    const al = song.al || song.album || {};
    const ar = song.ar || song.artists || [];
    if (nameEl) nameEl.textContent = song.name || '未知歌曲';
    if (artistEl) artistEl.textContent = ar.map(a => a.name).join(' / ') || '未知歌手';
    if (coverEl) coverEl.src = song.localCover || pickImage(song, 300);
    if (qTag) qTag.textContent = song.localUrl ? '本地' : (QUALITY_LABELS[CONFIG.api.audioLevel] || CONFIG.api.audioLevel);
    document.querySelectorAll('.song-row').forEach(row => {
      row.classList.toggle('playing', Number(row.dataset.id) === song.id || Number(row.dataset.id) === song.localId);
    });
  },

  updateModeUI() {
    const btn = document.getElementById('btnMode');
    if (!btn) return;
    const labels = { order: '列表循环', loop: '单曲循环', shuffle: '随机播放' };
    btn.title = labels[this.mode];
    btn.classList.toggle('active', this.mode === 'loop');
    const svg = btn.querySelector('svg');
    if (this.mode === 'shuffle') {
      svg.innerHTML = '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>';
    } else {
      svg.innerHTML = '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>';
    }
  },

  /* 下载（无需登录） */
  async downloadCurrent() {
    const song = this.queue[this.index];
    if (!song) return;
    try {
      showToast('正在获取音源...');
      const data = await API.songUrl(song.id);
      const item = data.data && data.data[0];
      if (!item || !item.url) {
        showToast('暂无可用音源', true);
        return;
      }
      downloadFile(item.url, song.name + ' - ' + (song.ar || []).map(a => a.name).join('/') + '.mp3');
    } catch (e) {
      showToast(e.message, true);
    }
  }
};

/* ============ 通用工具 ============ */

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function coverUrl(picUrl, size) {
  size = size || 300;
  if (!picUrl) return '';
  if (picUrl.indexOf('?param=') >= 0) return picUrl;
  return picUrl + '?param=' + size + 'y' + size;
}

function formatCount(n) {
  if (n == null) return '';
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

function formatMs(ms) {
  if (!ms) return '--:--';
  return fmtTime(ms / 1000);
}

/* Blob 下载，失败时回退为新窗口打开 */
async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'download.mp3';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    showToast('下载已开始');
  } catch (e) {
    window.open(url, '_blank');
    showToast('已在新窗口打开音频地址');
  }
}

/* ============ 播放历史（localStorage，纯本地） ============ */
const PlayHistory = {
  KEY: 'lm_history_v1',
  MAX: 100,

  getAll() {
    try {
      const list = JSON.parse(localStorage.getItem(this.KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  },

  save(list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) { /* 存储满时忽略 */ }
  },

  /* 播放时记录：去重置顶，最多保留 MAX 条 */
  add(song) {
    if (!song || !song.id) return;
    const list = this.getAll();
    const idx = list.findIndex(s => s.id === song.id);
    const item = Object.assign({}, song, { _playedAt: Date.now() });
    if (idx >= 0) list.splice(idx, 1);
    list.unshift(item);
    if (list.length > this.MAX) list.length = this.MAX;
    this.save(list);
  },

  remove(id) {
    this.save(this.getAll().filter(s => s.id !== id));
  },

  clear() {
    this.save([]);
  }
};

/* 相对时间显示 */
function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const hour = Math.floor(min / 60);
  if (hour < 24) return hour + ' 小时前';
  const day = Math.floor(hour / 24);
  if (day < 30) return day + ' 天前';
  const d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}