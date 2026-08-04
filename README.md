# LM音乐台

一个纯前端+Python音乐播放网站，通过可配置的 API 服务获取音频数据，支持搜索、播放、下载、收藏、歌单、歌词、音质切换与个性化外观。

## 部署步骤

1. **准备 API 服务**（本项目默认对接 [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)，需调整，请自行调整，最新版本调用API(https://ncm-api.prod.gbclstudio.cn））：
   ```bash
   git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git
   cd NeteaseCloudMusicApi
   npm install
   node app.js        # 默认监听 http://localhost:3000
   ```

2. **启动本网站**：
   - 在项目目录启动静态服务器（推荐，可读取 config.json文件）：
     ```bash
     python3 -m http.server 8080
     # 访问 http://localhost:8080
     ```
   - 注意：若 API 与网站不在同一域名，API 服务需开启 CORS（NeteaseCloudMusicApi 默认允许跨域）。

3. **设置API**（config.json）：
   - 填写 API 地址（如 `https://ncm-api.prod.gbclstudio.cn`）
   - 保存后即可使用

## 配置文件（config.json）

默认配置如下，均可通过网站内"设置"面板修改（修改后保存到 localStorage，优先级高于本文件；也可导出/导入/恢复默认）：

```json
{
  "api": {
    "baseUrl": "https://ncm-api.prod.gbclstudio.cn",
    "audioLevel": "exhigh"
  },
  "theme": {
    "primaryColor": "#ffffff",
    "backgroundImage": ""
  },
  "ui": {
    "controlStyle": "blur"
  }
}
```

- `api.baseUrl`：API 服务地址
- `api.audioLevel`：音频质量（`standard` 标准 / `higher` 较高 / `exhigh` 极高 / `lossless` 无损 / `hires` Hi-Res）
- `theme.primaryColor`：主题色，默认白色（白色主题下按钮自动使用深色保证可读性）
- `theme.backgroundImage`：背景图片 URL（留空为纯白背景），也可在设置中上传本地图片
- `ui.controlStyle`：控制栏样式（`blur` 模糊 / `glass` 毛玻璃 / `liquid` 液态玻璃），默认模糊

## 功能说明

- 推荐：推荐歌单 + 热门歌曲（登录后显示每日推荐）
- 搜索：按歌名/歌手搜索
- 播放：列表循环 / 单曲循环 / 随机，进度条拖动，音量调节 / 播放列表
- 歌词：右侧歌词面板，随播放进度自动滚动高亮
- 封面：歌曲封面、歌单封面
- 下载：Blob 下载，跨域受限时自动在新窗口打开

## 常见问题

- 页面提示"无法连接 API 服务器"：检查 API 地址是否正确、服务是否启动、是否跨域。
- 歌曲无法播放：可能无版权、需登录或需要更高音质权限，可尝试切换API或者音质。
