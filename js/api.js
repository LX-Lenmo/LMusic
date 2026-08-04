'use strict';

/* ============ API 封装（NeteaseCloudMusicApi 协议） ============ */

const API = {
  async request(path, params, method) {
    method = method || 'POST';
    const base = String(CONFIG.api.baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    // 追加随机时间戳参数，绕过 URL 级缓存（如 nginx proxy_cache 只按 URL 缓存）
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    const url = base + path + sep + '_t=' + Date.now() + '_' + Math.floor(Math.random() * 9999);

    try {
      if (method === 'GET') {
        // GET：参数放入 URL query（部分 API 的 POST 会被缓存，GET 可穿透）
        const qs = new URLSearchParams(params).toString();
        const realUrl = url + (qs ? '&' + qs : '');
        const res = await fetch(realUrl, { method: 'GET' });
        return await res.json();
      }
      const opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } };
      opts.body = new URLSearchParams(params).toString();
      const res = await fetch(url, opts);
      return await res.json();
    } catch (e) {
      throw new Error('无法连接 API 服务器 (' + base + ')，请检查设置中的 API 地址');
    }
  },

  checkResult(data) {
    if (!data) throw new Error('API 返回为空');
    if (data.code === 200) return data;
    throw new Error(data.message || ('API 错误，code=' + data.code));
  },

  search(keywords, limit) {
    // 使用 GET 方式：部分 API 部署对 POST /search 有缓存，GET 已验证可返回正确结果
    return this.request('/search', { keywords: keywords, limit: limit || 30, type: 1 }, 'GET').then(d => this.checkResult(d));
  },

  personalized(limit) {
    return this.request('/personalized', { limit: limit || 10 }).then(d => this.checkResult(d));
  },

  topSongs() {
    return this.request('/top/song', { type: 0 }).then(d => this.checkResult(d));
  },

  /* 排行榜：返回全部榜单列表 */
  toplist() {
    return this.request('/toplist', {}).then(d => this.checkResult(d));
  },

  songDetail(ids) {
    return this.request('/song/detail', { ids: ids.join(',') }).then(d => this.checkResult(d));
  },

  songUrl(id, level) {
    return this.request('/song/url/v1', { id: id, level: level || CONFIG.api.audioLevel || 'exhigh' })
      .then(d => this.checkResult(d));
  },

  lyric(id) {
    return this.request('/lyric', { id: id }).then(d => this.checkResult(d));
  },

  playlistDetail(id) {
    return this.request('/playlist/detail', { id: id }).then(d => this.checkResult(d));
  }
};
