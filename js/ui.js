'use strict';

/* ============ UI 渲染与交互工具 ============ */

/* Toast 提示（不含表情符号） */
function showToast(msg, isError) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

/* ============ 歌曲列表渲染 ============ */

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>'
};

/* 渲染歌曲列表（歌曲对象为网易云格式） */
function renderSongList(container, songs) {
  if (!container) return;
  container._songs = songs || [];
  window.__debugSongs = songs || []; // 供控制台诊断：copy(__debugSongs[0])
  if (!songs || !songs.length) {
    container.innerHTML = '<div class="empty-tip">暂无歌曲</div>';
    return;
  }
  container.innerHTML = songs.map(song => {
    const al = song.al || song.album || {};
    const ar = song.ar || song.artists || [];
    const id = song.id;
    const name = song.name || '未知歌曲';
    const artists = ar.map(a => a.name).join(' / ') || '未知歌手';
    const album = al.name || '';
    const pic = pickImage(song, 100);
    const dur = formatMs(song.dt || song.duration);
    const playing = Player.queue[Player.index] && Player.queue[Player.index].id === id ? ' playing' : '';
    const sub = (song.alia && song.alia.length ? ' (' + song.alia[0] + ')' : '') ||
                (song.subName ? ' (' + song.subName + ')' : '');
    return '<div class="song-row' + playing + '" data-id="' + id + '" data-name="' + escAttr(name) + '" title="点击播放">' +
      '<img class="song-cover" src="' + (pic || '') + '" alt="" loading="lazy">' +
      '<div class="song-main">' +
      '<div class="song-name">' + escHtml(name) + escHtml(sub) + '</div>' +
      '<div class="song-artist">' + escHtml(artists) + (album ? ' - ' + escHtml(album) : '') + '</div>' +
      '</div>' +
      '<div class="song-actions">' +
      '<button class="icon-btn" data-act="play" title="播放">' + ICONS.play + '</button>' +
      '<button class="icon-btn" data-act="download" title="下载">' + ICONS.download + '</button>' +
      '</div>' +
      '<div class="song-duration">' + dur + '</div>' +
      '</div>';
  }).join('');

  /* 封面补全：部分 API 的搜索/列表接口不返回专辑封面，用 /song/detail 批量补齐 */
  const needCover = songs.filter(s => !hasAlbumCover(s)).map(s => s.id);
  if (needCover.length) {
    API.songDetail(needCover).then(function (d) {
      const list = d.songs || [];
      const map = {};
      list.forEach(function (s) {
        const al = s.al || s.album || {};
        const u = al.picUrl || al.coverImgUrl || '';
        if (u) map[s.id] = coverUrl(u, 100);
      });
      if (!Object.keys(map).length) return;
      container.querySelectorAll('.song-row').forEach(function (row) {
        const u = map[Number(row.dataset.id)];
        if (u) {
          const img = row.querySelector('.song-cover');
          if (img) img.src = u;
        }
      });
    }).catch(function () { /* 忽略补全失败 */ });
  }
}

/* 渲染历史播放列表（带播放时间与移除按钮） */
function renderHistoryList(container, songs) {
  if (!container) return;
  container._songs = songs || [];
  if (!songs || !songs.length) {
    container.innerHTML = '<div class="empty-tip">暂无播放历史，去听首歌吧</div>';
    return;
  }
  container.innerHTML = songs.map(song => {
    const al = song.al || song.album || {};
    const ar = song.ar || song.artists || [];
    const id = song.id;
    const name = song.name || '未知歌曲';
    const artists = ar.map(a => a.name).join(' / ') || '未知歌手';
    const album = al.name || '';
    const pic = pickImage(song, 100);
    const playing = Player.queue[Player.index] && Player.queue[Player.index].id === id ? ' playing' : '';
    return '<div class="song-row' + playing + '" data-id="' + id + '" data-name="' + escAttr(name) + '" title="点击播放">' +
      '<img class="song-cover" src="' + (pic || '') + '" alt="" loading="lazy">' +
      '<div class="song-main">' +
      '<div class="song-name">' + escHtml(name) + '</div>' +
      '<div class="song-artist">' + escHtml(artists) + (album ? ' - ' + escHtml(album) : '') + '</div>' +
      '</div>' +
      '<div class="song-actions">' +
      '<button class="icon-btn" data-act="play" title="播放">' + ICONS.play + '</button>' +
      '<button class="icon-btn" data-act="download" title="下载">' + ICONS.download + '</button>' +
      '<button class="icon-btn" data-act="remove-history" title="从历史移除">' + ICONS.remove + '</button>' +
      '</div>' +
      '<div class="song-duration" title="' + escAttr(new Date(song._playedAt || 0).toLocaleString()) + '">' + relTime(song._playedAt) + '</div>' +
      '</div>';
  }).join('');
}

/* 渲染播放队列（带序号与移除按钮） */
function renderQueueList(container, songs) {
  if (!container) return;
  container._songs = songs || [];
  if (!songs || !songs.length) {
    container.innerHTML = '<div class="empty-tip">播放列表为空，从推荐或搜索结果点击歌曲即可加入</div>';
    return;
  }
  container.innerHTML = songs.map((song, i) => {
    const al = song.al || song.album || {};
    const ar = song.ar || song.artists || [];
    const id = song.id;
    const name = song.name || '未知歌曲';
    const artists = ar.map(a => a.name).join(' / ') || '未知歌手';
    const album = al.name || '';
    const pic = pickImage(song, 100);
    const playing = Player.index === i ? ' playing' : '';
    return '<div class="song-row' + playing + '" data-id="' + id + '" data-name="' + escAttr(name) + '" title="点击播放">' +
      '<img class="song-cover" src="' + (pic || '') + '" alt="" loading="lazy">' +
      '<div class="song-main">' +
      '<div class="song-name">' + escHtml(name) + '</div>' +
      '<div class="song-artist">' + escHtml(artists) + (album ? ' - ' + escHtml(album) : '') + '</div>' +
      '</div>' +
      '<div class="song-actions">' +
      '<button class="icon-btn" data-act="play" title="播放">' + ICONS.play + '</button>' +
      '<button class="icon-btn" data-act="download" title="下载">' + ICONS.download + '</button>' +
      '<button class="icon-btn" data-act="remove-queue" data-idx="' + i + '" title="从队列移除">' + ICONS.remove + '</button>' +
      '</div>' +
      '<div class="song-duration">' + (i + 1) + '</div>' +
      '</div>';
  }).join('');
}

/* 渲染本地音乐列表（IndexedDB 记录，含标签封面/歌词/大小） */
function renderLocalList(container, records) {
  if (!container) return;
  container._localRecords = records || [];
  if (!records || !records.length) {
    container.innerHTML = '<div class="empty-tip">暂无本地音乐，点击右上角「上传音乐」添加 MP3 / FLAC 文件</div>';
    return;
  }
  container.innerHTML = records.map(rec => {
    const name = rec.name || stripExtName(rec.fileName);
    const artists = rec.artist || '未知歌手';
    const album = rec.album || '';
    const pic = rec.cover || '';
    const size = formatSize(rec.fileSize);
    const playing = Player.queue[Player.index] && Player.queue[Player.index].localId === rec.id ? ' playing' : '';
    const hasLyric = rec.lyric ? ' lyric' : '';
    return '<div class="song-row' + playing + '" data-id="' + rec.id + '" data-local="1" data-name="' + escAttr(name) + '" title="点击播放">' +
      '<img class="song-cover" src="' + (pic || '') + '" alt="" loading="lazy">' +
      '<div class="song-main">' +
      '<div class="song-name">' + escHtml(name) + '<span class="local-badge">本地</span>' + (hasLyric ? '<span class="local-badge lyric">歌词</span>' : '') + '</div>' +
      '<div class="song-artist">' + escHtml(artists) + (album ? ' - ' + escHtml(album) : '') + '</div>' +
      '</div>' +
      '<div class="song-actions">' +
      '<button class="icon-btn" data-act="play" title="播放">' + ICONS.play + '</button>' +
      '<button class="icon-btn" data-act="download" title="下载">' + ICONS.download + '</button>' +
      '<button class="icon-btn" data-act="remove-local" title="删除本地音乐">' + ICONS.remove + '</button>' +
      '</div>' +
      '<div class="song-duration" title="' + escAttr(rec.fileName) + '">' + size + '</div>' +
      '</div>';
  }).join('');
}

/* 文件大小格式化 */
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

/* 渲染排行榜网格（榜单卡片） */
function renderTopGrid(container, tops) {
  if (!container) return;
  if (!tops || !tops.length) {
    container.innerHTML = '<div class="empty-tip">暂无榜单</div>';
    return;
  }
  container.innerHTML = tops.map(t => {
    const pic = pickImage(t, 300);
    const freq = t.updateFrequency ? '每' + t.updateFrequency : (formatCount(t.playCount) + ' 次播放');
    return '<div class="playlist-card" data-plid="' + t.id + '" title="' + escAttr(t.name) + '">' +
      '<img class="cover" src="' + coverUrl(pic, 300) + '" alt="" loading="lazy">' +
      '<div class="info">' +
      '<div class="name">' + escHtml(t.name) + '</div>' +
      '<div class="meta">' + escHtml(freq) + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

/* 渲染歌单卡片网格 */
function renderPlaylistGrid(container, playlists) {
  if (!container) return;
  if (!playlists || !playlists.length) {
    container.innerHTML = '<div class="empty-tip">暂无歌单</div>';
    return;
  }
  container.innerHTML = playlists.map(pl => {
    const pic = pickImage(pl, 300);
    return '<div class="playlist-card" data-plid="' + pl.id + '" title="' + escAttr(pl.name) + '">' +
      '<img class="cover" src="' + coverUrl(pic, 300) + '" alt="" loading="lazy">' +
      '<div class="info">' +
      '<div class="name">' + escHtml(pl.name) + '</div>' +
      '<div class="meta">' + formatCount(pl.playCount) + ' 次播放' + (pl.trackCount ? ' - ' + pl.trackCount + ' 首' : '') + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

/* ============ 歌词面板 ============ */

function renderLyricPanel() {
  const scroll = document.getElementById('lyricScroll');
  if (!scroll) return;
  if (!Player.lyricLines.length) {
    scroll.innerHTML = '<div class="lyric-empty">暂无歌词</div>';
    return;
  }
  scroll.innerHTML = Player.lyricLines.map((line, i) =>
    '<div class="lyric-line" data-idx="' + i + '">' + escHtml(line.text || '...') + '</div>'
  ).join('');
}

function highlightLyric(idx) {
  const scroll = document.getElementById('lyricScroll');
  if (!scroll) return;
  const lines = scroll.querySelectorAll('.lyric-line');
  if (!lines.length) return;
  lines.forEach(el => el.classList.remove('active'));
  if (idx < 0) return;
  const target = lines[idx];
  if (target) {
    target.classList.add('active');
    const panel = document.getElementById('lyricPanel');
    if (panel && panel.classList.contains('open')) {
      const scrollTop = target.offsetTop - scroll.clientHeight / 2 + target.clientHeight / 2;
      scroll.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
    }
  }
}

/* ============ 模态框控制 ============ */

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));
}

/* ============ 通用工具 ============ */

/* 从对象中深度提取图片 URL（兼容任意字段名/嵌套结构） */
function pickImage(obj, size) {
  const url = findImageUrl(obj, 0);
  return coverUrl(url || '', size);
}

function findImageUrl(obj, depth) {
  if (!obj || depth > 5) return '';
  if (typeof obj === 'string') {
    return isImageUrl(obj) ? obj : '';
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = findImageUrl(obj[i], depth + 1);
      if (r) return r;
    }
    return '';
  }
  if (typeof obj === 'object') {
    // 优先常见字段名
    const keys = ['picUrl', 'coverImgUrl', 'coverUrl', 'imgUrl', 'imageUrl', 'pic', 'cover', 'artPicUrl', 'bgPicUrl'];
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && isImageUrl(v)) return v;
    }
    // 深度遍历其余字段
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string' && isImageUrl(v)) return v;
      if (v && typeof v === 'object') {
        const r = findImageUrl(v, depth + 1);
        if (r) return r;
      }
    }
  }
  return '';
}

function isImageUrl(str) {
  // 兼容：带图片扩展名 或 URL 中含图片关键字（pic/img/cover/album/artwork）
  var isHttp = /^https?:\/\/.+/i.test(str);
  var hasExt = /\.(jpe?g|png|webp|gif|bmp)(\?.*)?$/i.test(str);
  var hasKey = /(pic|img|cover|album|artwork)/i.test(str);
  return isHttp && (hasExt || hasKey);
}

/* 判断歌曲对象是否已含专辑封面（al/album/picUrl/coverImgUrl） */
function hasAlbumCover(song) {
  if (!song) return false;
  const al = song.al || song.album || {};
  return !!(al.picUrl || al.coverImgUrl || song.picUrl || song.coverImgUrl);
}

/* ============ 通用转义 ============ */

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&' + 'quot;').replace(/'/g, '&#39;');
}

function escAttr(str) {
  return escHtml(str).replace(/`/g, '&#96;');
}