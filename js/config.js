'use strict';

/* ============ 配置管理 ============ */

const CONFIG_KEY = 'lm_radio_config_v1';
const COOKIE_KEY = 'lm_radio_cookie_v1';

const DEFAULT_CONFIG = {
  api: {
    baseUrl: 'http://localhost:3000',
    audioLevel: 'exhigh'
  },
  theme: {
    primaryColor: '#ffffff',
    backgroundImage: ''
  },
  ui: {
    controlStyle: 'blur'
  }
};

let CONFIG = null;

function deepMerge(base, override) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (override && typeof override === 'object') {
    for (const k of Object.keys(override)) {
      if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k])
          && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = deepMerge(out[k], override[k]);
      } else {
        out[k] = override[k];
      }
    }
  }
  return out;
}

/* 读取同目录 JSON 文件（file:// 协议下可能失败，返回 null） */
async function loadJsonFile(path) {
  try {
    const res = await fetch(path + '?t=' + Date.now());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/* 初始化配置：config.json 文件 -> localStorage（UI 个性化后者优先，API 地址始终以文件为准） */
async function initConfig() {
  CONFIG = deepMerge(DEFAULT_CONFIG, {});
  const fileCfg = await loadJsonFile('config.json');
  if (fileCfg) CONFIG = deepMerge(CONFIG, fileCfg);
  // API 地址只能由 config.json 文件配置（管理员修改），localStorage 不允许覆盖
  const fileBaseUrl = CONFIG.api.baseUrl || DEFAULT_CONFIG.api.baseUrl;
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) CONFIG = deepMerge(CONFIG, JSON.parse(saved));
  } catch (e) { /* ignore */ }
  CONFIG.api.baseUrl = fileBaseUrl;
  applyTheme();
}

function saveConfig() {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(CONFIG)); } catch (e) { /* ignore */ }
  applyTheme();
}

function resetConfig() {
  CONFIG = deepMerge(DEFAULT_CONFIG, {});
  try { localStorage.removeItem(CONFIG_KEY); } catch (e) { /* ignore */ }
  applyTheme();
}

function exportConfigJson() {
  return JSON.stringify(CONFIG, null, 2);
}

/* ============ 主题工具 ============ */

function hexToRgb(hex) {
  let h = String(hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  if (isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function getContrastColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 186 ? '#1a1a1a' : '#ffffff';
}

/* 应用主题：主题色、背景图片、控制栏样式 */
function applyTheme() {
  const root = document.documentElement;
  const primary = CONFIG.theme.primaryColor || '#ffffff';
  const { r, g, b } = hexToRgb(primary);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const accent = lum > 186 ? '#2b2b2b' : primary;

  root.style.setProperty('--primary', primary);
  root.style.setProperty('--on-primary', getContrastColor(primary));
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-soft', 'rgba(' + r + ',' + g + ',' + b + ',0.10)');

  const bgLayer = document.getElementById('bgLayer');
  if (bgLayer) {
    if (CONFIG.theme.backgroundImage) {
      bgLayer.style.backgroundImage = 'url("' + CONFIG.theme.backgroundImage + '")';
      bgLayer.style.opacity = '1';
    } else {
      bgLayer.style.backgroundImage = 'none';
      bgLayer.style.opacity = '0';
    }
  }

  document.body.style.backgroundColor = '#ffffff';

  const bar = document.getElementById('playerBar');
  if (bar) {
    bar.classList.remove('style-blur', 'style-glass', 'style-liquid');
    bar.classList.add('style-' + (CONFIG.ui.controlStyle || 'blur'));
  }
}

/* 音频质量标签映射 */
const QUALITY_LABELS = {
  standard: '标准',
  higher: '较高',
  exhigh: '极高',
  lossless: '无损',
  hires: 'Hi-Res'
};
