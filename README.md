# 七十一日行程 · 71 Day Journey

2026 年 8 月 25 日至 11 月 3 日，**71 天、17 个阶段、18 个路线节点**。今日安排、共享协作与可安装的离线行程。

**[公开行程 · GitHub Pages](https://xudaniel.github.io/xuyuanpeng-71-day-journey/)** · **[公开行程 · Sites](https://xuyuanpeng-71-day-journey.danyelxu.chatgpt.site/)** · **[登录协作空间](https://xuyuanpeng-71-day-journey.danyelxu.chatgpt.site/shared.html)**

## 三个主要功能

### 今日随行

首页优先展示当天安排、已确认时间、住宿与下一转场，可切换日期查看。已知地址可一键复制。点击「添加日历提醒」下载当天 `.ics`：有准确时刻的活动附带提前 30 分钟提醒；时间待定的安排导出为全天事件，不虚构时刻。提醒需要将文件导入手机或电脑日历后才会生效。

进度按北京时间计算；日本及多伦多的已确认时刻标明当地时区，导出时转为对应 UTC 时间。来源仍为原始行程资料，并非航班或酒店实时查询。

### 私密协作空间

使用 ChatGPT 登录，行程所有者可按邮箱加入协作者。每个阶段可共享地点、日期显示、核心安排、备注与核验状态。数据保存到服务端 D1，打开的页面每 15 秒检查更新。每次修改保留作者与时间，支持撤销最近一次修改、恢复历史版本。

- 匿名访客与未获授权的登录用户无法读取或更改共享记录。
- 编辑权限由服务端检查，只有所有者可增删协作者。
- 同阶段版本冲突时拒绝覆盖，并保留当前输入供用户处理。
- 日期显示只改变文字，不改变原始进度计算日期。
- 添加邮箱不会发送邮件；请自行将协作链接分享给对方。
- 共享内容不自动发布到公开行程，也不缓存到离线存储。

原公开页面的本机助理编辑、JSON 备份恢复仍可使用，与服务端协作记录独立；旧版笔记不会自动上传。

### 安装、离线与分享

点击「安装到手机」，或在 iPhone Safari 中选择「分享 → 添加到主屏幕」。Android 支持的浏览器会显示安装提示。首次联网访问并完成缓存后，可离线打开公开行程；页面显示离线可用状态和资料更新日期。共享空间需要联网登录。

「分享行程」提供 GitHub 网页版二维码、复制链接、系统分享与二维码下载。分享只包含公开链接，不含本机或共享备注。

2026-09-07 使用 443.cn 对 GitHub 链接进行一次多地 HTTP 测试：38 个大陆节点中 36 个返回 200，上海电信与河北衡水联通超时。测试反映当次 HTTP 可达性，不代表完整页面渲染或长期可用性；未部署新的大陆镜像。

## 原有功能

- 完整路线与可展开时间线；按城市、人物、公司、中文或 ISO 日期搜索。
- 全部、已结束、已核验、进行中、未开始筛选及定位当前阶段。
- 17 阶段完整日历导出、打印／另存 PDF。
- 本机核验进度、助理编辑、JSON 备份与合并恢复。
- 桌面／手机布局、键盘焦点、屏幕阅读器展开状态与无结果提示。

时间进度 = 当前行程日 ÷ 71（含当天）；核验进度 = 已核验阶段数 ÷ 17。「已结束」仅指计划日期已过，不等同于实际核验完成。

## 本地运行公开页面

无需前端依赖：

```sh
git clone https://github.com/xudaniel/xuyuanpeng-71-day-journey.git
cd xuyuanpeng-71-day-journey
python3 -m http.server 8000
```

访问 <http://localhost:8000>。离线功能要求 HTTPS 或 localhost，直接打开文件不支持 Service Worker。本地静态服务器不运行协作 API；页面协作入口指向线上服务。

## 构建和验证

服务端构建需要 Node.js 24+、pnpm 和 Python 3：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

8 项自动化检查覆盖时区与提醒、离线资源完整性、私密接口不缓存、身份和权限、跨设备编辑、冲突保护、历史恢复及请求来源校验。数据库测试使用 SQLite，生产使用 D1 的预编译查询。

原有 `tests/browser.cjs` 保留为可选 Chromium 回归脚本，需要另行安装 Playwright；支持 `TEST_URL` 和 `BROWSER_PATH`。

## 项目结构

```text
index.html / styles.css          公开页面
itinerary.js                    原始阶段和路线
daily-plan.js                   已确认的当日活动、时区与酒店
app.js                          原有搜索、核验与本机编辑
features.js                     今日安排、提醒、分享与安装
sw.js / manifest.webmanifest    公开行程离线缓存与安装
shared.html / shared.js         私密协作界面
server/worker.js                登录身份、授权和共享 API
db/schema.ts / drizzle/         共享数据与不可变迁移
scripts/build.py / vite.config.js  公开文件和 Worker 构建
tests/                          自动化验证
```

`itinerary.js` 的 `start` 同时是核验及共享记录标识，修改日期需考虑已有数据。更新每日确切活动时同时更新 `daily-plan.js`；调整离线文件集合时修改 `sw.js` 缓存版本。

## 部署

- **GitHub Pages**：从 `main` 根目录发布公开文件。协作入口跳转到 Sites，不会在 GitHub Pages 运行服务端代码。
- **Sites**：`pnpm build` 输出 `dist/client` 和 `dist/server/index.js`。`.openai/hosting.json` 绑定现有项目及逻辑数据库 `DB`。通过 Sites 保存并发布同一份已推送源代码构建的版本。
- 在 Sites 环境中配置 `JOURNEY_OWNER_EMAIL`（所有者登录邮箱，标记为秘密值）与 `JOURNEY_ORIGIN`（线上 origin）。不将真实配置写入 Git。
- 登录由 Sites 的 `/signin-with-chatgpt` 与 `/signout-with-chatgpt` 提供。Worker 信任平台验证并转发的身份头；不要把此 Worker 直接部署在允许外部伪造身份头的服务上。
- 数据库变更使用 `pnpm db:generate` 生成迁移，保留已应用迁移，发布时由平台执行。

## English

A 71-day travel dashboard with a focused Today view, time-zone-correct calendar reminders, private collaborative editing, version history and undo, and an installable offline public itinerary. Public pages require no sign-in. The shared workspace uses ChatGPT sign-in plus an owner-managed collaborator list and server-side persistence. Shared notes never appear in the public feed or offline cache. GitHub Pages hosts the public version; Sites hosts the authenticated collaboration service.
