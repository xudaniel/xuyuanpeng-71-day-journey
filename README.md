# 七十一日行程 · 71 Day Journey

徐远鹏先生 2026 年 8 月 25 日至 11 月 3 日的行程看板，覆盖 **71 天、17 个阶段、18 个路线节点**。提供北京时间进度、完整时间线、助理编辑与执行核验。

**[打开在线应用](https://xuyuanpeng-71-day-journey.danyelxu.chatgpt.site)** · [源代码](https://github.com/xudaniel/xuyuanpeng-71-day-journey)

> 在线应用沿用现有的仅所有者访问设置，需要使用有权限的账号登录。核验记录与助理备注保存在当前浏览器，不会自动跨设备同步。

## 功能

- **实时行程概览**：北京时间日期、行程日、当前计划、阶段剩余天数与下一转场。跨日自动刷新。
- **完整时间线**：按城市、人物、公司、中文日期或 `YYYY-MM-DD` 搜索；按全部、已结束、已核验、进行中、未开始筛选。
- **执行核验**：每阶段可独立标记完成，显示核验比例；时间进度与实际核验分开统计。
- **助理编辑**：修改日期显示、地点、核心安排与备注；保留原始行程，支持恢复内容。
- **备份与恢复**：导出 JSON，换设备后导入。核验记录合并，已有同阶段编辑优先保留。
- **日历与打印**：导出全部 17 个阶段的 `.ics` 日历，或打印／另存为 PDF。
- **手机与键盘可用**：响应式布局、明确的焦点提示、可访问的展开状态、无结果提示及当前阶段定位。

## 使用方法

1. 打开应用，查看当前计划与下一转场。
2. 点击阶段展开详情，核对实际安排后勾选「标记为已核验完成」。
3. 在页面底部选择「助理编辑」修改本机备注和显示内容。
4. 点击「备份进度」下载文件；在另一台设备点击「恢复进度」导入。
5. 点击顶部「导出日历」，将文件导入 Apple 日历、Outlook 或 Google 日历。

**进度定义**：时间比例 = 当前行程日 ÷ 71，含当天；出发前为 0%，11 月 3 日为 100%。「今日后剩余」不包含当天。「已结束」只表示计划日期已过，不代表执行完成。「核验进度」= 已核验阶段数 ÷ 17。

**日期说明**：所有进度按 `Asia/Shanghai` 计算，不随设备时区或夏令时变化。日历导出为全天阶段，不会将文字中的航班时刻转为定时事件。日历的结束日期按标准使用次日排他边界。助理编辑中的「日期显示」只修改文字；真实日期需在 `itinerary.js` 修改 `start` / `end`。

## 本地运行

无需安装前端依赖；使用 Python 3 启动静态服务器：

```sh
git clone https://github.com/xudaniel/xuyuanpeng-71-day-journey.git
cd xuyuanpeng-71-day-journey
python3 -m http.server 8000
```

在浏览器打开 <http://localhost:8000>。也可直接打开 `index.html`，但浏览器对本地文件的存储支持可能不同，推荐使用本地服务器。应用资源全部随仓库提供，没有外部字体、追踪脚本或第三方运行时依赖。

## 项目结构

```text
index.html          页面结构
styles.css          桌面、手机、打印与无障碍样式
itinerary.js        行程原始数据与路线节点
app.js              日期逻辑、搜索筛选、核验、编辑、备份与日历
assets/logo.jpg     优化后的品牌图片
scripts/build.py    静态发布构建
tests/             浏览器回归测试
.openai/hosting.json 现有 Sites 项目配置
```

更新行程时编辑 `itinerary.js`。日期使用 `YYYY-MM-DD`，阶段保持时间顺序、首尾连续；`start` 同时作为核验记录的稳定标识，修改它会影响已有记录的匹配。`cities` 为独立维护的路线节点列表。

## 构建与部署

```sh
python3 scripts/build.py
python3 -m http.server 8000 --directory dist
```

构建结果位于 `dist/`，可托管在支持静态文件的网站服务。现有在线地址由 Sites 托管，`.openai/hosting.json` 绑定该项目。发布到 Sites 时，应从已提交并推送的同一份源代码构建、保存版本，再部署。向 GitHub 推送代码本身不会自动更新 Sites。

## 验证

`tests/browser.cjs` 使用 Playwright 检查：17 个阶段、日期边界、北京时间跨日、搜索及空状态、核验保存、损坏存储容错、展开状态、日历格式、旧版编辑迁移、备份合并与手机横向溢出。

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
# 在另一终端运行 python3 -m http.server 8000
TEST_URL=http://localhost:8000 nodetests/browser.cjs
```

可通过 `BROWSER_PATH` 指定已安装的 Chrome 可执行文件。

## 数据与兼容性

支持现代 Chrome、Edge、Safari 和 Firefox；自动化回归在 Chromium 执行。清除浏览器数据、切换域名或使用无痕模式可能导致记录不可用，建议定期备份。存储失败时，页面会提示下载备份。

保留原静态版存储键 `new-vision-itinerary-local-v1`；兼容已有在线助理版的 `new-vision-itinerary-state-v1`，读取其核验记录与编辑备注。应用没有后台数据库或共享编辑功能。

## English

A lightweight itinerary dashboard for a 71-day journey, with Beijing-time progress, searchable stages, local verification, assistant notes, JSON backup/restore, calendar export, and print layouts. Run it with `python3 -m http.server 8000`; no frontend dependencies are required. The live Sites application requires an authorized account. Browser records stay on the current device unless exported and restored.
