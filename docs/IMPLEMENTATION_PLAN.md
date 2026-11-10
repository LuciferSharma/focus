# FocusWatch — Implementation Plan & Phase Tracking

> Based on `FOCUSWATCH_BUILD_SPEC.md`
> Stack: React + TypeScript + Tauri 2 + SQLite + Chrome/Edge Manifest V3 Extension (pnpm monorepo)

---

## Architecture & Structure Overview

```text
focuswatch/
├── apps/
│   ├── desktop/                # Tauri 2 + React + TypeScript + SQLite + Tailwind
│   └── extension/              # Manifest V3 Extension (declarativeNetRequest, block page, bridge client)
├── packages/
│   ├── shared-types/           # Common TypeScript interfaces & Zod schemas
│   ├── domain-rules/           # URL sanitizer, domain parser, classification rules, YouTube rules
│   ├── score-engine/           # Productivity & focus score algorithm, context-switching engine
│   └── activity-normalizer/    # AW event normalizer & AFK merger
├── IMPLEMENTATION_PLAN.md
└── package.json                # pnpm workspace config
```

---

## Task Checklist Grouped by Phase

### Phase 0: System Verification & Environment Setup
- [x] Verify local ActivityWatch server connectivity (`http://localhost:5600/api/`)
- [x] Inspect window (`aw-watcher-window_*`) and AFK (`aw-watcher-afk_*`) buckets
- [x] Identify missing browser bucket (`aw-watcher-web_*`) & document diagnostic finding
- [x] Set up pnpm workspace root and package manifests
- [x] Create shared packages (`shared-types`, `domain-rules`, `score-engine`, `activity-normalizer`)

### Phase 1: Read-Only Companion Desktop App
- [x] Initialize Tauri 2 + React + TypeScript desktop app shell
- [x] Integrate Tauri SQLite plugin & database migrations
- [x] Build `ActivityProvider` adapter interface & `ActivityWatchProvider` implementation
- [x] Implement bucket discovery (dynamic window, afk, web bucket detection)
- [x] Implement event fetch & normalization (merging window activity with AFK state)
- [x] Implement URL sanitizer, domain parser, and classification engine
- [x] Build Diagnostics Screen (AW status, bucket status, extension bridge, SQLite health)
- [x] Build "Today" Dashboard (Deep work time, Distracted time, Focus score, Goal progress, Top activities/distractions, Escape attempts)

### Phase 2: Focus Session Engine
- [x] Implement SQLite schema for `focus_sessions` & `daily_summaries`
- [x] Build Focus Session Start Modal (Output target validation, duration picker, mode selection, blocked list preview)
- [x] Build Active Session State Management & persistent timer
- [x] Implement Session Completion Flow (Output verification modal: Yes / Partially / No)
- [x] Add Crash Recovery & session state restoration

### Phase 3: Manifest V3 Website Blocker Extension
- [x] Initialize Manifest V3 extension with Vite + React + TypeScript
- [x] Implement `declarativeNetRequest` rules engine with session rule support
- [x] Build YouTube Music (`music.youtube.com`) and Studio (`studio.youtube.com`) exception rules
- [x] Build FocusWatch Block Page UI with active session output, escape counter, and return button
- [x] Implement Emergency Unlock request flow (with configurable delays: 0s/15s/30s)
- [x] Implement Localhost Bridge Client in extension and Local Bridge Server (port 47777) in Desktop app
- [x] Build Attempt Logger & offline retry queue in extension

### Phase 4: Always-On-Top Widget
- [x] Create frameless, always-on-top Tauri secondary window
- [x] Implement compact (timer only) and expanded widget layouts
- [x] Add corner snapping, window position persistence, and opacity controls
- [x] Ensure non-focus stealing behavior for seamless typing

### Phase 5: Reports, Polish & Installer
- [x] Build Daily Summary Generator & Weekly Report screen
- [x] Implement Context Switching analyzer (sustained switching alert)
- [x] Implement Privacy controls (domain-only mode, query param stripping, data export/purge)
- [x] Build Onboarding Flow (purpose, AW check, extension link, default rules, goal setup)
- [x] Configure Tauri Windows installer build & auto-start on startup
