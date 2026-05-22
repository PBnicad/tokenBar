# opencodeBar

> 一款轻量级的 Electron 桌面应用，用于可视化监控本地 opencode 模型调用情况。

[English](#english) | [中文](#chinese)

---

<a name="chinese"></a>
## 中文介绍

### 功能特性

- **直连 SQLite** — 直接读取 `opencode.db`，无需启动 `opencode serve` 服务进程
- **仪表盘** — 总览卡片 + 自定义堆叠柱状图（成本/Token）+ SVG 环形图 + 日历热力图
- **模型页** — 按模型维度展示使用卡片，每张卡片内含独立的迷你热力图
- **会话页** — 可搜索的分页历史记录列表，支持详情滑出面板
- **GitHub 风格日历热力图** — 支持 M/W/F 标签、5 级绿色强度、自定义 Tooltip（Token 明细、成本、消息数）
- **国际化** — 支持中文 / 英语切换（懒加载语言包）
- **主题切换** — 默认暗色模式，可选浅色模式
- **数据库路径配置** — 自动探测常见安装位置，支持手动浏览选择
- **自动同步** — 启动时全量同步，文件修改后每 30 秒增量同步
- **CI/CD 自动构建** — GitHub Actions 自动构建 Windows / macOS / Linux 安装包并发布 Release

### 技术栈

| 技术 | 说明 |
|------|------|
| Electron | 桌面应用框架 |
| Vite | 构建工具 |
| React 18 + TypeScript | UI 框架 |
| sql.js (WASM) | 浏览器端 SQLite |
| CSS Variables | 主题系统（暗色/浅色） |

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/PBnicad/opencodeBar.git
cd opencodeBar

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产包
npm run build

# 打包分发（当前平台）
npm run dist

# 打包特定平台
npm run dist:win
npm run dist:mac
npm run dist:linux
```

### 自动发布

推送符合语义化版本的 tag 即可触发 CI/CD 自动构建并发布 Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

Actions 会在 Windows、macOS、Linux 上并行构建，完成后自动创建 GitHub Release 并上传安装包。

### 数据库路径

应用启动时会自动探测以下位置的 `opencode.db`：
- Windows: `%LOCALAPPDATA%\opencode\opencode.db`
- macOS: `~/Library/Application Support/opencode/opencode.db`
- Linux: `~/.local/share/opencode/opencode.db` 或 `$XDG_DATA_HOME/opencode/opencode.db`

也可在 **设置 → 数据库路径** 中手动指定。

### 项目结构

```
opencodeBar/
├── .github/workflows/      # GitHub Actions CI/CD
├── src/
│   ├── main/               # Electron 主进程
│   │   ├── local-reader.ts # SQLite 直连读取
│   │   ├── db.ts           # 本地数据库 + app_settings
│   │   ├── ipc.ts          # IPC 通信
│   │   └── sync.ts         # 同步逻辑
│   ├── preload/            # 预加载脚本
│   ├── renderer/           # 渲染进程 (React)
│   │   ├── components/     # 共享组件
│   │   ├── pages/          # Dashboard / Models / Sessions
│   │   ├── i18n/           # 国际化
│   │   ├── styles/         # 全局 CSS + 主题变量
│   │   └── theme/          # 主题上下文
│   └── shared/             # 共享类型
├── build/                  # 应用图标等资源
└── package.json
```

### 许可证

[MIT](LICENSE)

---

<a name="english"></a>
## English

### Features

- **Direct SQLite Read** — Reads `opencode.db` directly without spawning `opencode serve`
- **Dashboard** — Overview cards + custom stacked bar chart (cost/tokens) + SVG donut chart + calendar heatmap
- **Models Page** — Per-model usage cards with individual mini heatmaps
- **Sessions Page** — Searchable paginated history with detail slide-out panel
- **GitHub-style Calendar Heatmap** — M/W/F labels, 5-level green intensity, custom tooltip (token breakdown, cost, messages)
- **i18n** — Chinese / English with lazy-loaded locale files
- **Theme Switching** — Dark mode default, optional light mode
- **Configurable DB Path** — Auto-detect common locations + manual browse
- **Auto Sync** — Full sync on startup, incremental sync every 30s when DB mtime changes
- **CI/CD Auto Build** — GitHub Actions builds for Windows / macOS / Linux and auto-publishes releases

### Tech Stack

| Tech | Description |
|------|-------------|
| Electron | Desktop app framework |
| Vite | Build tool |
| React 18 + TypeScript | UI framework |
| sql.js (WASM) | In-browser SQLite |
| CSS Variables | Theming system (dark/light) |

### Quick Start

```bash
git clone https://github.com/PBnicad/opencodeBar.git
cd opencodeBar
npm install
npm run dev       # development
npm run build     # production build
npm run dist      # package for current platform
npm run dist:win  # Windows
npm run dist:mac  # macOS
npm run dist:linux # Linux
```

### Auto Release

Push a semantic version tag to trigger CI/CD:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will build in parallel on Windows, macOS, and Linux, then automatically create a GitHub Release with installable artifacts.

### DB Path Auto-Detection

On startup, the app auto-detects `opencode.db` at:
- Windows: `%LOCALAPPDATA%\opencode\opencode.db`
- macOS: `~/Library/Application Support/opencode/opencode.db`
- Linux: `~/.local/share/opencode/opencode.db` or `$XDG_DATA_HOME/opencode/opencode.db`

You can also manually set the path in **Settings → Database Path**.

### Project Structure

```
opencodeBar/
├── .github/workflows/      # GitHub Actions CI/CD
├── src/
│   ├── main/               # Electron main process
│   │   ├── local-reader.ts # Direct SQLite reader
│   │   ├── db.ts           # Local DB + app_settings
│   │   ├── ipc.ts          # IPC handlers
│   │   └── sync.ts         # Sync logic
│   ├── preload/            # Preload script
│   ├── renderer/           # Renderer (React)
│   │   ├── components/     # Shared components
│   │   ├── pages/          # Dashboard / Models / Sessions
│   │   ├── i18n/           # Internationalization
│   │   ├── styles/         # Global CSS + theme vars
│   │   └── theme/          # Theme context
│   └── shared/             # Shared types
├── build/                  # App icons etc.
└── package.json
```

### License

[MIT](LICENSE)
