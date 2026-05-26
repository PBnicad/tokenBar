# tokenBar

> A lightweight Electron desktop app for visualizing AI agent token usage — OpenCode, Pi Agent, and more.

[English](#english) | [中文](#chinese)

---

<a name="chinese"></a>
## 中文介绍

### 功能特性

- **多 Agent 支持** — 适配器架构，同时监控 OpenCode、Pi Agent 等 AI 编程工具的 Token 用量
- **仪表盘** — 总览卡片 + 自定义日期范围选择器 + 堆叠柱状图（花费/Token）+ SVG 环形图 + 全年日历热力图
- **模型页** — 按模型维度展示使用卡片，每张卡片内含独立的迷你热力图
- **会话页** — 可搜索的分页历史记录，支持 Agent 来源筛选 + 详情滑出面板
- **GitHub 风格日历热力图** — 5 级强度、自定义 Tooltip（Token 明细、花费、消息数）
- **系统托盘** — 关闭窗口最小化到托盘，右键菜单退出
- **国际化** — 中文 / English 切换
- **主题切换** — 深色 / 浅色模式
- **Agent 路径配置** — 每个 Agent 独立配置数据源路径，支持自动检测和手动浏览
- **自动同步** — 启动时全量同步，15s 轮询增量同步，30s 定期聚合刷新
- **CI/CD 自动构建** — GitHub Actions 构建 Windows / macOS / Linux 安装包

### 技术栈

| 技术 | 说明 |
|------|------|
| Electron | 桌面应用框架 |
| Vite | 构建工具 |
| React 18 + TypeScript | UI 框架 |
| sql.js (WASM) | 浏览器端 SQLite |
| MiSans | 小米开源字体 |
| CSS Variables | 主题系统 |

### 快速开始

```bash
git clone https://github.com/PBnicad/opencodeBar.git
cd opencodeBar

npm install
npm run dev          # 开发模式
npm run build        # 生产构建
npm run dist         # 打包当前平台
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

### 自动发布

推送语义化版本 tag 触发 CI/CD：

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Agent 数据源

| Agent | 数据格式 | 默认路径 |
|-------|---------|---------|
| OpenCode | SQLite（opencode.db） | `~/.local/share/opencode/opencode.db` |
| Pi Agent | JSONL 会话文件 | `~/.pi/agent/sessions/` |

可在 **设置 → Data Sources** 中为每个 Agent 单独配置路径。

### 接入新 Agent

在 `src/main/adapters/` 下新建文件实现 `AgentAdapter` 接口（5 个方法），然后在 `index.ts` 中 `registerAdapter()` 即可。

### 项目结构

```
tokenbar/
├── .github/workflows/      # CI/CD
├── src/
│   ├── main/
│   │   ├── adapters/       # Agent 适配器（opencode, pi-agent, ...）
│   │   │   ├── types.ts    # AgentAdapter 接口
│   │   │   ├── registry.ts # 适配器注册表
│   │   │   ├── opencode.ts # OpenCode 适配器
│   │   │   └── pi-agent.ts # Pi Agent 适配器
│   │   ├── db.ts           # 本地聚合数据库
│   │   ├── ipc.ts          # IPC 通信
│   │   ├── sync.ts         # 多 Agent 同步引擎
│   │   └── index.ts        # 主进程入口
│   ├── preload/            # 预加载脚本
│   ├── renderer/           # 渲染进程 (React)
│   │   ├── components/     # 共享组件（TitleBar, DateRangePicker, StyledDropdown 等）
│   │   ├── pages/          # Dashboard / Models / Sessions
│   │   ├── i18n/           # 国际化
│   │   ├── styles/         # 全局 CSS + 主题变量
│   │   └── theme/          # 主题上下文
│   └── shared/             # 共享类型
├── build/                  # 应用图标
└── package.json
```

### 许可证

[MIT](LICENSE)

---

<a name="english"></a>
## English

### Features

- **Multi-Agent Support** — Adapter architecture monitors OpenCode, Pi Agent, and more simultaneously
- **Dashboard** — Overview cards + custom date range picker + stacked bar charts (cost/tokens) + SVG donut + yearly heatmap
- **Models Page** — Per-model usage cards with individual mini heatmaps
- **Sessions Page** — Searchable paginated history with agent source filter + detail slide-out panel
- **GitHub-style Calendar Heatmap** — 5-level intensity, custom tooltip (token breakdown, cost, messages)
- **System Tray** — Close to tray, right-click to quit
- **i18n** — Chinese / English
- **Theme** — Dark / Light mode
- **Per-Agent Path Config** — Independent data source path per agent, auto-detect or manual browse
- **Auto Sync** — Full sync on startup, 15s incremental polling, 30s periodic aggregation
- **CI/CD** — GitHub Actions for Windows / macOS / Linux

### Tech Stack

| Tech | Description |
|------|-------------|
| Electron | Desktop app framework |
| Vite | Build tool |
| React 18 + TypeScript | UI framework |
| sql.js (WASM) | In-browser SQLite |
| MiSans | Xiaomi open-source font |
| CSS Variables | Theming system |

### Quick Start

```bash
git clone https://github.com/PBnicad/opencodeBar.git
cd opencodeBar

npm install
npm run dev          # development
npm run build        # production build
npm run dist         # package current platform
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

### Auto Release

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Agent Data Sources

| Agent | Format | Default Path |
|-------|--------|-------------|
| OpenCode | SQLite (opencode.db) | `~/.local/share/opencode/opencode.db` |
| Pi Agent | JSONL session files | `~/.pi/agent/sessions/` |

Configure each agent's path independently in **Settings → Data Sources**.

### Adding a New Agent

Create a file in `src/main/adapters/` implementing the `AgentAdapter` interface (5 methods), then call `registerAdapter()` in `index.ts`.

### Project Structure

```
tokenbar/
├── .github/workflows/      # CI/CD
├── src/
│   ├── main/
│   │   ├── adapters/       # Agent adapters (opencode, pi-agent, ...)
│   │   │   ├── types.ts    # AgentAdapter interface
│   │   │   ├── registry.ts # Adapter registry
│   │   │   ├── opencode.ts # OpenCode adapter
│   │   │   └── pi-agent.ts # Pi Agent adapter
│   │   ├── db.ts           # Local aggregation DB
│   │   ├── ipc.ts          # IPC handlers
│   │   ├── sync.ts         # Multi-agent sync engine
│   │   └── index.ts        # Main process entry
│   ├── preload/            # Preload script
│   ├── renderer/           # Renderer (React)
│   │   ├── components/     # Shared components
│   │   ├── pages/          # Dashboard / Models / Sessions
│   │   ├── i18n/           # Internationalization
│   │   ├── styles/         # Global CSS + theme vars
│   │   └── theme/          # Theme context
│   └── shared/             # Shared types
├── build/                  # App icon
└── package.json
```

### License

[MIT](LICENSE)
