# FocusWatch — Product & Technical Build Specification

> A local-first deep-work monitor, website blocker, and always-visible accountability widget built on top of ActivityWatch.

**Document purpose:** This file is designed to be handed directly to a coding agent or developer. It contains the product decision, immediate ActivityWatch browser-tracking fix, architecture, UX, data model, APIs, implementation phases, acceptance criteria, privacy rules, testing plan, and instructions for avoiding unnecessary rewrites.

**Target platform for V1:** Windows 10/11 with Chrome or Microsoft Edge  
**Recommended stack:** React + TypeScript + Tauri 2 + SQLite + Chrome/Edge Manifest V3 extension  
**Working project name:** `FocusWatch`

---

## 1. Executive Decision

### Recommendation

Do **not** rebuild all of ActivityWatch from scratch, and do **not** begin by redesigning or forking the entire ActivityWatch user interface.

Use a **hybrid companion architecture**:

1. Keep ActivityWatch running as the local tracking engine for:
   - Active desktop application
   - Window title
   - AFK/idle detection
   - Local event storage

2. Install or repair the ActivityWatch browser extension so browser URLs are captured immediately.

3. Build a new, independent desktop application with:
   - A much simpler dashboard
   - Deep-work session management
   - Domain-level productivity classification
   - Focus score
   - Daily accountability report
   - Always-on-top widget

4. Build a custom Chrome/Edge extension that eventually handles:
   - Browser URL tracking
   - Website blocking
   - YouTube Music exceptions
   - Distraction-attempt logging
   - Emergency unlocks

5. During the first version, the official ActivityWatch browser extension may continue handling browser tracking. The custom extension should initially focus on blocking. Once stable, the custom extension can replace the official browser watcher.

### Why this is the right choice

Rebuilding from scratch sounds cleaner, but it requires reproducing difficult background infrastructure:

- Windows foreground-window detection
- Reliable app-name and window-title capture
- Keyboard/mouse idle detection
- Heartbeat merging
- Sleep, shutdown, and resume handling
- Local server lifecycle
- Autostart
- Event storage and retention
- Timezone and daylight-saving correctness
- Browser/desktop event intersection
- Packaging, updates, and crash recovery

ActivityWatch already solves much of this. Its user interface is confusing for this specific use case, but the tracking engine and local data are useful.

The product should therefore treat ActivityWatch as a replaceable **data provider**, not as the product UI.

---

## 2. Immediate Problem: Browser Sites Are Not Appearing

### Important distinction

The ActivityWatch Windows application alone usually knows that the active app is Chrome or Edge and may capture the browser window title. It does **not** automatically have reliable access to the active tab URL.

Detailed browser tracking requires the separate **ActivityWatch Web Watcher** extension.

The official extension records:

- Active tab title
- URL
- Audible state
- Incognito state

The browser extension currently supports Chrome, Edge, and Firefox.

---

## 3. Five-Minute Browser Tracking Fix

Follow this before writing any code.

### Step 1 — Confirm ActivityWatch is running

1. Look for the ActivityWatch icon in the Windows system tray.
2. Open the dashboard.
3. Confirm this address loads:

```text
http://localhost:5600
```

4. Confirm the API page loads:

```text
http://localhost:5600/api/
```

If neither loads, ActivityWatch itself is not running correctly.

### Step 2 — Install the browser extension

For Chrome or Edge, install:

```text
ActivityWatch Web Watcher
```

Current Chrome Web Store extension ID:

```text
nglaklhklhcoonedhgnpgddginnjdadi
```

Chrome Web Store page:

```text
https://chromewebstore.google.com/detail/activitywatch-web-watcher/nglaklhklhcoonedhgnpgddginnjdadi
```

For Microsoft Edge, Chrome Web Store extensions can normally be installed after allowing extensions from other stores.

### Step 3 — Check the correct browser profile

Extensions are installed per browser profile.

If daily browsing happens in a profile called `Ansh`, but the extension was installed in `Default`, it will not capture the actual activity.

Check:

- The extension is enabled in the exact Chrome/Edge profile being used.
- The extension is not paused.
- The browser profile is not a temporary or guest profile.
- The extension has permission to read browser tabs/sites.

### Step 4 — Generate test activity

Open these three pages and actively use each for approximately 30–60 seconds:

```text
https://docs.google.com
https://github.com
https://www.youtube.com
```

Do not leave the browser in the background. The tab must be active.

### Step 5 — Inspect raw buckets

Open:

```text
http://localhost:5600/#/buckets
```

Look for a bucket whose name starts with:

```text
aw-watcher-web
```

Open that bucket and inspect recent events.

A working browser event should include fields resembling:

```json
{
  "title": "Page title",
  "url": "https://example.com/page",
  "audible": false,
  "incognito": false
}
```

### Diagnosis

#### Case A — No `aw-watcher-web` bucket exists

The extension is not successfully communicating with ActivityWatch.

Check:

1. ActivityWatch is running before the browser starts.
2. Reload the extension.
3. Restart Chrome/Edge.
4. Restart ActivityWatch.
5. Disable and re-enable the extension.
6. Open the extension’s service-worker/error console from:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
7. Check whether security software, a proxy, VPN, or browser policy blocks localhost.
8. Confirm these local addresses are reachable:

```text
http://127.0.0.1:5600/api/
http://localhost:5600/api/
```

ActivityWatch documentation notes that proxy configurations can interfere with localhost access. If a proxy is active, ensure `127.0.0.1` and `localhost` bypass the proxy.

#### Case B — The bucket exists, but has no recent events

Likely causes:

- Extension installed in the wrong profile
- Browser permission issue
- Browser service worker stopped or crashed
- Unsupported/custom Chromium browser behavior
- ActivityWatch server changed ports
- Extension storage/configuration issue

Actions:

1. Keep ActivityWatch running.
2. Reload the browser extension.
3. Open a normal non-incognito tab.
4. Keep it active for one minute.
5. Refresh the bucket page.
6. Check extension errors.

#### Case C — The bucket contains URLs, but the main Activity page does not show websites

This is primarily a display/merging problem, not a tracking problem.

The ActivityWatch UI combines window events and web events. Certain browser names, profiles, executable names, or custom Chromium browsers may cause matching problems.

For this project, this is acceptable. The custom FocusWatch dashboard should read the browser bucket directly and should not depend on ActivityWatch’s existing visualization.

#### Case D — Websites appear, but categorization is poor

ActivityWatch’s current built-in categorization is mainly based on application and window-title matching; URL-based categorization is limited in the default UI.

FocusWatch should classify browser events directly using parsed domains and URL rules.

---

## 4. Should We Use ActivityWatch or Build From Scratch?

### Option A — Build everything from scratch

#### Advantages

- Total control
- One clean codebase
- Exact data model
- No dependency on ActivityWatch API
- Easier long-term commercial branding

#### Disadvantages

- Highest engineering cost
- Background tracking is deceptively difficult
- More Windows-specific bugs
- Must rebuild AFK detection
- Must build reliable event heartbeat merging
- Must handle app crashes, sleep, restart, timezone changes, and updates
- Greater privacy and security responsibility
- Delays the useful product

#### Verdict

Not recommended for V1.

---

### Option B — Fork ActivityWatch and redesign its UI

#### Advantages

- Existing data and UI integration
- No need for a second desktop application
- Can reuse its queries and components

#### Disadvantages

- Must understand a large multi-repository project
- Upstream merges become difficult
- Existing concepts and architecture leak into the product
- UI changes become coupled to ActivityWatch releases
- Browser blocking still requires a separate extension
- The main repository uses multiple modules/submodules
- The product remains shaped around ActivityWatch terminology

#### Verdict

Better than a full rewrite, but still not the best starting point.

---

### Option C — Build a companion app around ActivityWatch

#### Advantages

- Fastest path to a useful tool
- ActivityWatch remains untouched and upgradeable
- UI can be designed from zero
- React/TypeScript can be used
- Easy to replace one data provider later
- Blocking extension remains independent
- Lower risk

#### Disadvantages

- ActivityWatch must remain installed in early versions
- Local API is subject to change
- Requires an adapter layer
- Two apps/processes exist initially

#### Verdict

**Recommended.**

---

## 5. Product Vision

FocusWatch should answer only five questions:

1. What am I supposed to be working on right now?
2. How much real focused time have I completed today?
3. What distracted me?
4. How many times did I attempt to escape the task?
5. Did I complete the output I promised?

It should not feel like a data-analysis product.

It should feel like a personal supervisor that is:

- Private
- Local
- Simple
- Visible
- Difficult to ignore
- Not annoying during genuine work
- Strict only when a focus session is active

---

## 6. Core Product Principles

### 6.1 Output before timer

Every focus session must begin with a concrete output:

```text
Finish the QuickReel API pricing page
```

Not:

```text
Work on QuickReel
```

### 6.2 Monitor automatically

The user should not manually start and stop every application timer.

### 6.3 Interrupt escape behavior

The product should track and block the moment the user attempts to leave the task.

### 6.4 Allow legitimate tools

Examples:

- YouTube Music allowed
- YouTube Studio allowed
- YouTube homepage blocked
- A direct work video may be temporarily allowed
- Google search allowed
- Social feeds blocked

### 6.5 Local by default

Raw browsing history, window titles, and app usage must stay on the computer.

### 6.6 Simple surface, detailed engine

The dashboard should show a few useful numbers while retaining detailed events underneath.

### 6.7 Replaceable ActivityWatch dependency

All ActivityWatch communication must be isolated behind an adapter.

No UI component should call ActivityWatch endpoints directly.

---

## 7. V1 Scope

### Must have

- Windows desktop app
- ActivityWatch connection status
- Browser watcher status
- Today dashboard
- Start focus session
- Current session task and timer
- Productive, neutral, and distracting categories
- Domain-level browser tracking
- App-level tracking
- Website blocking
- YouTube Music exception
- Blocked-attempt count
- Emergency unlock
- Always-on-top mini widget
- Daily summary
- Local settings
- Local SQLite database

### Explicitly not in V1

- Mobile app
- Team monitoring
- Employer dashboard
- Cloud account
- Cloud sync
- Subscription
- AI coaching
- Screenshot recording
- Keystroke logging
- Cross-device sync
- macOS/Linux support
- Public extension store release
- Automatic payroll or billing
- Social accountability
- Full ActivityWatch replacement

---

## 8. System Architecture

```text
┌─────────────────────────────────────────────────────┐
│ ActivityWatch                                       │
│                                                     │
│  aw-watcher-window ── Active app + window title    │
│  aw-watcher-afk ───── Active/idle state             │
│  aw-server ────────── Local events and REST API      │
└───────────────────────┬─────────────────────────────┘
                        │ localhost REST
                        ▼
┌─────────────────────────────────────────────────────┐
│ FocusWatch Desktop App — Tauri + React              │
│                                                     │
│  ActivityWatch Adapter                              │
│  Event Normalizer                                   │
│  Classification Engine                              │
│  Focus Session Engine                               │
│  Score Calculator                                   │
│  SQLite                                             │
│  Main Dashboard                                     │
│  Always-on-top Widget                               │
│  Local Extension Bridge                             │
└───────────────────────┬─────────────────────────────┘
                        │ localhost bridge
                        ▼
┌─────────────────────────────────────────────────────┐
│ FocusWatch Browser Extension — Manifest V3          │
│                                                     │
│  Active-tab observer                                │
│  Domain/URL tracker                                 │
│  Blocking rules                                     │
│  YouTube routing rules                              │
│  Block page                                         │
│  Emergency unlock                                   │
│  Attempt logger                                     │
└─────────────────────────────────────────────────────┘
```

---

## 9. Recommended Technology Stack

### Desktop

- Tauri 2
- React
- TypeScript
- Vite
- TanStack Query
- Zustand
- Zod
- date-fns
- Recharts or lightweight SVG charts
- Tauri SQL plugin with SQLite

### Browser extension

- Manifest V3
- TypeScript
- Vite
- React for popup/options/block page
- `chrome.tabs`
- `chrome.storage`
- `chrome.alarms`
- `chrome.declarativeNetRequest`
- `chrome.runtime`
- `chrome.idle` only if needed
- `chrome.webNavigation` only if needed

### Development

- pnpm workspace
- ESLint
- Prettier
- Vitest
- Playwright
- GitHub Actions
- Conventional commits

---

## 10. Repository Structure

```text
focuswatch/
├── apps/
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── sessions/
│   │   │   │   ├── rules/
│   │   │   │   ├── reports/
│   │   │   │   ├── onboarding/
│   │   │   │   └── widget/
│   │   │   ├── adapters/
│   │   │   │   └── activitywatch/
│   │   │   ├── services/
│   │   │   ├── stores/
│   │   │   ├── types/
│   │   │   └── utils/
│   │   └── src-tauri/
│   │       ├── src/
│   │       ├── capabilities/
│   │       ├── migrations/
│   │       └── tauri.conf.json
│   │
│   └── extension/
│       ├── src/
│       │   ├── background/
│       │   ├── blocked-page/
│       │   ├── popup/
│       │   ├── options/
│       │   ├── bridge/
│       │   ├── rules/
│       │   └── tracking/
│       ├── public/
│       └── manifest.json
│
├── packages/
│   ├── shared-types/
│   ├── domain-rules/
│   ├── score-engine/
│   ├── activity-normalizer/
│   └── config/
│
├── docs/
│   ├── architecture.md
│   ├── privacy.md
│   ├── api.md
│   └── decisions/
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

## 11. ActivityWatch Adapter

Create a single interface:

```ts
export interface ActivityProvider {
  healthCheck(): Promise<ActivityHealth>;
  listBuckets(): Promise<ActivityBucket[]>;
  getDesktopEvents(range: DateRange): Promise<DesktopActivityEvent[]>;
  getBrowserEvents(range: DateRange): Promise<BrowserActivityEvent[]>;
  getAfkEvents(range: DateRange): Promise<AfkEvent[]>;
}
```

Implementation:

```text
ActivityWatchProvider
```

Future implementation:

```text
NativeWindowsProvider
```

The rest of the app must depend only on `ActivityProvider`.

### ActivityWatch local endpoints

Default base URL:

```text
http://127.0.0.1:5600
```

Useful endpoints:

```text
GET  /api/0/buckets/
GET  /api/0/buckets/{bucket_id}
GET  /api/0/buckets/{bucket_id}/events
POST /api/0/buckets/{bucket_id}
POST /api/0/buckets/{bucket_id}/events
POST /api/0/buckets/{bucket_id}/heartbeat
```

The ActivityWatch API is not frozen. Protect the application with:

- One adapter
- Runtime validation using Zod
- Version detection
- Graceful failure
- Fixture-based integration tests
- No endpoint strings outside the adapter

### Bucket discovery

Never hardcode the complete bucket ID because hostnames vary.

Detect buckets by type/prefix:

```text
aw-watcher-window
aw-watcher-afk
aw-watcher-web
```

If multiple browser buckets exist, merge them by timestamp and hostname.

---

## 12. Normalized Event Model

### Desktop event

```ts
export interface DesktopActivityEvent {
  source: "activitywatch";
  sourceBucketId: string;
  timestamp: string;
  durationSeconds: number;
  app: string;
  title: string;
  isAfk: boolean;
}
```

### Browser event

```ts
export interface BrowserActivityEvent {
  source: "activitywatch" | "focuswatch-extension";
  sourceBucketId?: string;
  timestamp: string;
  durationSeconds: number;
  title: string;
  url: string;
  domain: string;
  path: string;
  audible: boolean;
  incognito: boolean;
  browser: "chrome" | "edge" | "firefox" | "unknown";
}
```

### Focus session

```ts
export interface FocusSession {
  id: string;
  task: string;
  expectedOutput?: string;
  plannedMinutes: number;
  startedAt: string;
  plannedEndAt: string;
  endedAt?: string;
  status: "active" | "completed" | "stopped" | "abandoned";
  strictness: "soft" | "standard" | "strict";
  blockRuleSetId: string;
  completedOutcome?: "yes" | "partial" | "no";
  completionNote?: string;
}
```

### Block attempt

```ts
export interface BlockAttempt {
  id: string;
  sessionId?: string;
  timestamp: string;
  url: string;
  domain: string;
  ruleId: string;
  action: "blocked" | "warned" | "unlocked";
  unlockReason?: string;
  unlockMinutes?: number;
}
```

### Classification rule

```ts
export interface ClassificationRule {
  id: string;
  name: string;
  target: "app" | "title" | "domain" | "url";
  matchType: "exact" | "contains" | "wildcard" | "regex";
  pattern: string;
  categoryId: string;
  priority: number;
  enabled: boolean;
}
```

---

## 13. Local Database Schema

Use SQLite.

### `focus_sessions`

```sql
CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  expected_output TEXT,
  planned_minutes INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  planned_end_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  strictness TEXT NOT NULL,
  block_rule_set_id TEXT,
  completed_outcome TEXT,
  completion_note TEXT
);
```

### `block_attempts`

```sql
CREATE TABLE block_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  timestamp TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  action TEXT NOT NULL,
  unlock_reason TEXT,
  unlock_minutes INTEGER,
  FOREIGN KEY(session_id) REFERENCES focus_sessions(id)
);
```

### `categories`

```sql
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  productivity_weight REAL NOT NULL,
  type TEXT NOT NULL
);
```

Recommended categories:

```text
Deep Work       +1.00
Productive      +0.70
Communication   +0.20
Neutral          0.00
Distracting     -0.70
Highly Distracting -1.00
Unknown          0.00
```

### `classification_rules`

```sql
CREATE TABLE classification_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target TEXT NOT NULL,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  category_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(category_id) REFERENCES categories(id)
);
```

### `settings`

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `daily_summaries`

```sql
CREATE TABLE daily_summaries (
  date TEXT PRIMARY KEY,
  active_seconds INTEGER NOT NULL,
  focused_seconds INTEGER NOT NULL,
  productive_seconds INTEGER NOT NULL,
  distracting_seconds INTEGER NOT NULL,
  neutral_seconds INTEGER NOT NULL,
  context_switches INTEGER NOT NULL,
  block_attempts INTEGER NOT NULL,
  unlocks INTEGER NOT NULL,
  sessions_started INTEGER NOT NULL,
  sessions_completed INTEGER NOT NULL,
  outputs_completed INTEGER NOT NULL,
  focus_score REAL NOT NULL,
  generated_at TEXT NOT NULL
);
```

Do not duplicate all ActivityWatch raw events in SQLite during V1. Query ActivityWatch for raw activity and cache only computed summaries.

---

## 14. Classification Engine

### Matching order

1. Temporary session allow/block rule
2. Exact URL
3. Domain
4. Application + title
5. Application
6. Default category

Higher priority wins.

### Default rules for this user

#### Deep work

```text
Visual Studio Code
Cursor
Terminal
PowerShell
GitHub
localhost development URLs
Figma when actively designing
Google Docs when document is work-related
```

#### Productive

```text
Gmail
Google Calendar
QuickReel dashboards
AWS
GCP
Canva
Client documents
Research pages
```

#### Neutral

```text
music.youtube.com
Spotify
File Explorer
Windows Settings
Calculator
```

#### Distracting

```text
youtube.com
instagram.com
reddit.com
x.com
facebook.com
linkedin.com/feed
news sites
```

### YouTube-specific classification

Rules must distinguish:

```text
music.youtube.com                 Neutral / allowed
studio.youtube.com                Productive / allowed
youtube.com/shorts/*              Highly distracting / blocked
youtube.com/feed/*                Highly distracting / blocked
youtube.com/                      Highly distracting / blocked
youtube.com/watch?v=*             Depends on temporary allowance
```

Direct YouTube watch URLs should not be permanently allowed. They require a temporary session exception or a work-research mode.

---

## 15. Browser Extension Responsibilities

### V1 responsibilities

- Receive active focus-session state
- Install session blocking rules
- Redirect blocked URLs to a FocusWatch block page
- Allow permanent exceptions
- Log each block attempt
- Support emergency unlock
- Send attempts to desktop app
- Store attempts locally if desktop app is temporarily unavailable
- Retry transmission later

### V2 responsibilities

- Capture active tab URL/title
- Send browser heartbeats to the desktop app
- Replace official ActivityWatch Web Watcher
- Optionally write browser events into an ActivityWatch-compatible bucket

### Blocking implementation

Use Manifest V3 `chrome.declarativeNetRequest`.

Use:

- Dynamic rules for permanent user rules
- Session rules for active focus sessions
- Redirect rules to the extension’s block page
- Explicit high-priority allow rules for exceptions

### Example rule behavior

```text
Block:  ||youtube.com/
Allow:  ||music.youtube.com/
Allow:  ||studio.youtube.com/
Block:  ||instagram.com/
Block:  ||reddit.com/
```

Implementation must test priority carefully so `music.youtube.com` and `studio.youtube.com` remain accessible.

### Block page

Display:

```text
You chose to focus on:

Finish QuickReel API pricing page

42:18 remaining

You have attempted to leave this session 4 times.

[Return to work]
[Request temporary access]
```

The page must not include feeds, motivational quotes, complex analytics, or browsing suggestions.

### Emergency unlock

Required inputs:

```text
Why is this needed?
How many minutes are needed?
```

Options:

```text
5 minutes
10 minutes
15 minutes
Until session ends
```

Strict mode should not offer `Until session ends`.

Add a configurable delay:

```text
Soft mode:      0 seconds
Standard mode: 15 seconds
Strict mode:   30 seconds
```

Every unlock is recorded.

---

## 16. Desktop-to-Extension Communication

### Preferred V1 method

Run a localhost bridge inside the Tauri app:

```text
http://127.0.0.1:<focuswatch-port>
```

Example port:

```text
47777
```

The extension communicates with this bridge.

### Required endpoints

```text
GET  /health
GET  /session/active
GET  /rules/active
POST /attempts
POST /browser/heartbeat
POST /unlock/request
```

### Example active session response

```json
{
  "active": true,
  "session": {
    "id": "session_123",
    "task": "Finish QuickReel API pricing page",
    "startedAt": "2026-08-05T20:00:00+05:30",
    "endsAt": "2026-08-05T21:15:00+05:30",
    "strictness": "standard"
  },
  "rulesVersion": 17
}
```

### Security

- Bind only to `127.0.0.1`.
- Never bind to `0.0.0.0`.
- Generate a local installation token.
- Extension includes token in request header.
- Rotate token if extension is re-paired.
- Validate origin where feasible.
- Reject oversized payloads.
- Do not expose file-system operations through HTTP.

---

## 17. Dashboard UX

### Main dashboard

The opening screen must look like:

```text
TODAY

Deep work             2h 42m
Distracted              18m
Focus score               82
Longest session        1h 14m

[ Start Focus Session ]

Current goal
3h 00m / 4h 00m

Top distractions
YouTube                 9m
WhatsApp                5m
LinkedIn                4m

Escape attempts
14 blocked • 2 unlocked
```

### Dashboard sections

1. Today header
2. Primary metrics
3. Start/active session
4. Daily goal progress
5. Simple timeline
6. Top productive activities
7. Top distractions
8. Block attempts
9. Session outcomes
10. End-day summary

### Avoid

- Raw bucket names
- Query language
- Event JSON
- Nested settings
- Sunburst charts
- More than one timeline
- Excessive colors
- Technical terms such as heartbeat, watcher, canonical query, or bucket

These may exist only in a hidden diagnostics screen.

---

## 18. Focus Session Flow

### Start modal

```text
What will be finished?

[ Finish the QuickReel API pricing page ]

Duration
[ 75 minutes ]

Mode
[ Standard ]

Music
[ YouTube Music allowed ]

Blocked
[ YouTube videos ]
[ Instagram ]
[ Reddit ]
[ LinkedIn feed ]
[ WhatsApp Web ]

[ Start Deep Work ]
```

### Validation

- Task: minimum 8 characters
- Encourage a verb and output
- Duration: 15–180 minutes
- Warn if task is vague
- No mandatory project setup

### During session

- Show remaining time
- Show current app/site
- Show focused minutes
- Show distracting minutes
- Show blocked attempts
- Widget stays visible
- Desktop notifications are optional
- Do not repeatedly interrupt productive work

### Ending session

Ask:

```text
Did you complete the promised output?

[ Yes ]
[ Partially ]
[ No ]
```

Optional:

```text
What was completed?
```

Do not let the user silently close an active session without recording an outcome. If the app crashes, restore the session and ask on restart.

---

## 19. Always-on-Top Widget

### Default appearance

```text
┌─────────────────────────┐
│ DEEP WORK        48:21  │
│ Pricing page            │
│                         │
│ Focused  24m   Escapes 3│
└─────────────────────────┘
```

### Requirements

- Always on top
- Frameless
- Resizable between compact and expanded
- Snaps to screen corners
- Remembers position
- Adjustable opacity
- Click-through mode optional
- Can collapse to timer only
- Must not steal keyboard focus
- Must survive main-window close
- Main app may minimize to tray

### Expanded widget

```text
┌────────────────────────────┐
│ DEEP WORK            48:21 │
│ Finish API pricing page    │
│                            │
│ Current: Visual Studio Code│
│ Focused: 24m               │
│ Distracted: 1m             │
│ Blocked attempts: 3        │
│                            │
│ [Pause] [End]              │
└────────────────────────────┘
```

Pausing should be optional and configurable. Strict mode should not allow unbounded pause.

---

## 20. Focus Score

The score must be understandable, not scientifically exaggerated.

### Inputs

- Productive active time
- Distracting active time
- Focus-session completion
- Output completion
- Context switches
- Block attempts
- Manual unlocks
- Long uninterrupted blocks

### Suggested formula

```text
Base productive ratio        50 points
Session completion           20 points
Output completion            15 points
Low distraction              10 points
Low unnecessary switching     5 points
```

### Productive ratio

```text
productive_ratio =
  productive_seconds /
  max(active_seconds, 1)
```

### Distraction penalty

```text
distraction_ratio =
  distracting_seconds /
  max(active_seconds, 1)
```

### Example

```ts
const score =
  productiveRatio * 50 +
  sessionCompletionRate * 20 +
  outputCompletionRate * 15 +
  Math.max(0, 1 - distractionRatio * 4) * 10 +
  contextSwitchQuality * 5;
```

Clamp:

```text
0–100
```

### Important

Blocked attempts should not heavily reduce the score if the block succeeded. An attempted distraction that was successfully blocked is better than five minutes of actual distraction.

Manual unlocks should reduce the score more than blocked attempts.

---

## 21. Context Switching

### Definition

A context switch occurs when the active category or app changes for longer than a minimum threshold.

Do not count rapid technical switches between related tools as harmful.

Examples of one work context:

```text
VS Code
Terminal
GitHub
localhost
technical documentation
```

Examples of unrelated switches:

```text
VS Code → Instagram
Google Docs → YouTube homepage
Figma → Reddit
```

### Algorithm

1. Normalize events.
2. Ignore events under 3 seconds.
3. Group related tools into a work context.
4. Count transitions between contexts.
5. Calculate switches per active hour.
6. Do not issue alerts until repeated switching is sustained.

### Alert threshold

Example:

```text
12 unrelated context switches in 10 minutes
```

Alert:

```text
You have switched away from the task repeatedly.
Return to the planned output?
```

Only one alert per 15 minutes.

---

## 22. Daily Report

### Report format

```text
Wednesday, 5 August

Deep work:              3h 38m
Productive time:        5h 12m
Distracting time:         27m
Longest focus block:    1h 19m

Sessions completed:       3/4
Outputs completed:        3/4
Blocked attempts:          21
Manual unlocks:             3

Most distracting:
YouTube                    14m
LinkedIn                    8m
Reddit                      5m

Best session:
Finish API pricing page
79 minutes • 96% focused

Focus score: 84
```

### Weekly report

Show:

- Total deep work
- Average focus score
- Daily deep-work bars
- Top distraction
- Block attempts versus unlocks
- Output completion rate
- Best day
- Most common focus-session start time

Do not create complicated analytics until at least seven days of data exist.

---

## 23. Onboarding

### Screen 1 — Purpose

```text
FocusWatch helps you see real focused work, block escape routes, and complete specific outputs.
```

### Screen 2 — ActivityWatch connection

- Detect local server
- Show connected/not connected
- Detect window bucket
- Detect AFK bucket
- Detect browser bucket

### Screen 3 — Browser extension

Show:

```text
Browser URLs are not being recorded.
Install ActivityWatch Web Watcher or the FocusWatch extension.
```

Provide a live test:

```text
Open any website and return here.
```

Show detected domain.

### Screen 4 — Rules

Preselect:

```text
Allow YouTube Music
Allow YouTube Studio
Block YouTube homepage
Block YouTube Shorts
Block Instagram
Block Reddit
Block X
Block LinkedIn feed
```

### Screen 5 — Goal

```text
Daily deep-work goal
[ 3 hours ]
```

### Screen 6 — Start first session

Prompt for one output and begin.

---

## 24. Diagnostics Screen

Hidden under Settings → Diagnostics.

Show:

- ActivityWatch server status
- Server version
- Detected buckets
- Last event timestamp per bucket
- Browser extension connection
- FocusWatch extension connection
- Local bridge port
- SQLite health
- Last error
- Export logs
- Copy diagnostic report

### Example status

```text
ActivityWatch server      Connected
Window tracking           Working — 4s ago
AFK tracking              Working — 3s ago
Browser URL tracking      Missing
FocusWatch blocker        Connected — 1s ago
Local database            Healthy
```

This screen is critical because the existing ActivityWatch setup is confusing.

---

## 25. Privacy and Security Requirements

Activity data is sensitive.

### Never collect

- Keystrokes
- Passwords
- Form fields
- Page contents
- Email bodies
- Screenshots by default
- Clipboard contents
- Browser cookies
- Authentication tokens

### Store by default

- App name
- Window title
- Active URL
- Domain
- Duration
- AFK state
- Session task
- Block attempts
- Unlock reason

### Privacy controls

- Exclude domains
- Exclude apps
- Strip URL query parameters
- Store domain only
- Redact page titles
- Disable incognito tracking
- Delete date range
- Delete all data
- Export summaries
- Export raw local data
- Retention period

### Default URL sanitation

Store:

```text
https://example.com/path
```

Remove:

```text
?token=...
?email=...
?session=...
#private-fragment
```

Allow user to choose:

```text
Domain only
Domain + path
Full URL
```

Default: domain + path, no query or fragment.

### ActivityWatch security note

ActivityWatch’s local API does not use normal user authentication and is designed for localhost use. FocusWatch must not expose ActivityWatch data to the network or cloud.

---

## 26. Licensing and Branding

ActivityWatch and its browser watcher use the Mozilla Public License 2.0.

### Safest approach

- Do not copy ActivityWatch branding.
- Do not call the product ActivityWatch Pro.
- Keep FocusWatch as a separate app.
- Communicate with ActivityWatch through its local API.
- Avoid modifying covered ActivityWatch source files during V1.
- Include attribution in documentation.
- Review MPL requirements before distributing modified ActivityWatch code.

A separate companion app that merely uses the local API is easier to maintain and license than a heavily modified fork.

This document is not legal advice.

---

## 27. Development Phases

## Phase 0 — Repair and verify tracking

### Deliverables

- ActivityWatch server detected
- Window bucket detected
- AFK bucket detected
- Browser extension installed
- Browser bucket detected
- URLs visible in raw data
- Written diagnostic notes

### Acceptance criteria

- Browsing three domains creates recent browser events.
- Each event contains a URL.
- The system can distinguish YouTube Music from normal YouTube.

Do not begin major UI development before this is verified.

---

## Phase 1 — Read-only companion dashboard

### Deliverables

- Tauri desktop shell
- ActivityWatch adapter
- Bucket discovery
- Desktop event query
- Browser event query
- AFK intersection
- Event normalization
- Basic categorization
- Today dashboard
- Diagnostics screen

### Acceptance criteria

- Dashboard launches without opening ActivityWatch UI.
- Today totals match ActivityWatch within a reasonable tolerance.
- Browser time is grouped by domain.
- YouTube Music and YouTube are separate.
- Missing browser extension produces a clear action, not an empty chart.

---

## Phase 2 — Focus sessions

### Deliverables

- Session creation
- Session timer
- Current task
- Planned end time
- Outcome recording
- Session history
- Focused/distracted time inside session
- Crash recovery
- Daily goals

### Acceptance criteria

- Starting a session creates a persistent record.
- Closing and reopening the app restores the active session.
- Ending asks for output completion.
- Session report shows productive and distracting time.

---

## Phase 3 — Blocking extension

### Deliverables

- Manifest V3 extension
- Rule synchronization
- Block page
- YouTube Music exception
- YouTube Studio exception
- Attempt logging
- Emergency unlock
- Offline attempt queue
- Extension diagnostics

### Acceptance criteria

- Normal YouTube is blocked during session.
- YouTube Music remains accessible.
- YouTube Studio remains accessible.
- Each blocked navigation creates exactly one attempt.
- Temporary unlock expires automatically.
- Ending session removes temporary blocking rules.

---

## Phase 4 — Widget

### Deliverables

- Always-on-top Tauri window
- Timer-only mode
- Expanded mode
- Snap-to-corner
- Opacity setting
- Live metrics
- Start/end controls

### Acceptance criteria

- Widget remains above normal windows.
- Widget does not steal focus while typing.
- Position persists after restart.
- Metrics update within five seconds.
- Widget disappears or changes state when session ends.

---

## Phase 5 — Reports and polish

### Deliverables

- Daily report
- Weekly report
- Focus score
- Context-switch analysis
- Data export
- Retention controls
- Onboarding
- Installer
- Autostart
- Error reporting stored locally

### Acceptance criteria

- A non-technical user understands the dashboard without reading documentation.
- No ActivityWatch terms appear in the normal UI.
- Browser-tracking failure is diagnosable in one screen.
- App starts automatically and silently.
- Data remains local.

---

## 28. Testing Plan

### Unit tests

- URL parsing
- Domain extraction
- Query stripping
- Classification priority
- Focus score
- Context-switch grouping
- Session duration
- Rule generation
- YouTube exception logic
- Unlock expiry

### Integration tests

- Mock ActivityWatch server
- Multiple bucket discovery
- Missing browser bucket
- Empty activity day
- AFK intersection
- ActivityWatch API schema change
- Extension bridge authentication
- Browser attempt retry queue

### End-to-end tests

1. Start session.
2. Open YouTube homepage.
3. Confirm block page.
4. Confirm attempt count increments.
5. Open YouTube Music.
6. Confirm allowed.
7. Open VS Code.
8. Confirm focused time increments.
9. Go AFK.
10. Confirm AFK time is excluded.
11. End session.
12. Confirm output question.
13. Confirm daily report updates.

### Windows scenarios

- Sleep and resume
- Browser restart
- ActivityWatch restart
- FocusWatch restart
- Multiple monitors
- Display scaling
- Windows startup
- VPN/proxy enabled
- Edge and Chrome profiles
- Timezone change
- Midnight-crossing session

---

## 29. Error Handling

### ActivityWatch unavailable

Show:

```text
Tracking engine is offline.
Your focus session and website blocking will continue, but desktop activity will not be measured.
```

Actions:

```text
[Restart ActivityWatch]
[Open diagnostics]
```

### Browser watcher unavailable

Show:

```text
Browser sites are not being recorded.
Install or reconnect the browser extension.
```

Do not silently classify all Chrome time as unknown.

### FocusWatch extension unavailable

Show:

```text
Website blocking is not active in this browser.
```

### Local bridge unavailable

Extension should:

- Keep blocking rules active
- Store attempts locally
- Retry every 30 seconds
- Never disable blocking merely because the desktop app is closed

---

## 30. Performance Requirements

- Dashboard initial load under 2 seconds for a normal day
- Session timer update every second visually
- Metrics refresh every 5–15 seconds
- Extension blocking immediate
- Low idle CPU usage
- Avoid querying entire ActivityWatch history
- Query bounded date ranges
- Aggregate before rendering
- Cache daily summaries
- Virtualize long event tables in diagnostics

---

## 31. Coding-Agent Instructions

The coding agent must follow these rules.

### First action

1. Read this entire specification.
2. Create `IMPLEMENTATION_PLAN.md`.
3. Create a task checklist grouped by phase.
4. Implement Phase 0 and Phase 1 only before adding blocking.
5. Keep the application runnable after every milestone.

### Architecture rules

- Do not modify ActivityWatch source.
- Do not fork ActivityWatch in V1.
- Do not duplicate raw events in FocusWatch SQLite.
- Do not call ActivityWatch from React components.
- All ActivityWatch access goes through `ActivityProvider`.
- Validate external data with Zod.
- Store all times as ISO 8601 UTC.
- Convert to local timezone only for display.
- Keep blocking rules in a shared package.
- Keep UI terminology non-technical.
- Add diagnostics for every external dependency.
- Add migrations for every database change.
- Never expose a localhost API on all network interfaces.

### UI rules

- One primary action per screen.
- No raw JSON in normal UI.
- No more than five primary metrics on the dashboard.
- The session task must always be visible during a session.
- YouTube Music must be visually shown as allowed.
- Missing data must show an explanation and action.
- Do not add features outside the stated phase.

### Definition of done

A feature is done only when:

- It works on Windows
- It has tests
- It handles missing dependencies
- It persists correctly
- It is represented in diagnostics
- It does not leak sensitive data
- It has acceptance criteria verified

---

## 32. Suggested First Implementation Tasks

```text
[ ] Create pnpm monorepo
[ ] Create Tauri 2 + React desktop app
[ ] Add SQLite plugin and migrations
[ ] Create ActivityProvider interface
[ ] Implement ActivityWatch health check
[ ] Implement bucket discovery
[ ] Implement desktop-event fetch
[ ] Implement AFK-event fetch
[ ] Implement browser-event fetch
[ ] Add event normalization
[ ] Add domain parser and URL sanitizer
[ ] Add default categories
[ ] Add classification engine
[ ] Build diagnostics screen
[ ] Build browser-tracking setup checker
[ ] Build Today dashboard
[ ] Add daily summary cache
[ ] Add focus session database table
[ ] Add focus session start/end flow
[ ] Create extension project
[ ] Add Manifest V3 rule engine
[ ] Add YouTube Music and Studio exceptions
[ ] Add block page
[ ] Add local bridge
[ ] Add attempt logging
[ ] Add emergency unlock
[ ] Add always-on-top widget
[ ] Add installer and autostart
```

---

## 33. Go/No-Go Check After the First Version

Continue using ActivityWatch underneath if:

- Window and AFK tracking are reliable
- API queries are fast enough
- Browser and desktop events can be normalized
- Upgrades do not repeatedly break the adapter
- Installation is acceptable for personal use

Start replacing ActivityWatch components only if:

- The API repeatedly breaks
- Packaging a second app becomes unacceptable
- Native tracking needs cannot be met
- Commercial distribution requires a single installer
- Performance or event merging becomes a real constraint

### Replacement order

If replacement becomes necessary:

1. Replace browser watcher first — custom extension already exists.
2. Replace local summary storage.
3. Replace window watcher.
4. Replace AFK watcher.
5. Remove ActivityWatch server last.

Do not replace all components simultaneously.

---

## 34. Final Recommendation

Use ActivityWatch as the **temporary tracking infrastructure**, not as the user experience.

The current confusing UI is not a reason to discard a functioning data engine. The missing browser sites are most likely caused by the separate browser watcher not being installed, not connected, or not merged correctly in the existing UI.

The correct path is:

```text
Fix browser capture
→ verify raw URL events
→ build a simple read-only dashboard
→ add focus sessions
→ add website blocking
→ add the always-visible widget
→ replace ActivityWatch pieces only when necessary
```

The first genuinely useful version needs only one screen, one button, and one widget:

```text
TODAY
Deep work: 2h 42m
Distracted: 18m
Escape attempts: 14

[ Start 75-minute session ]
```

During the session:

```text
Finish QuickReel API pricing page
48:21 remaining
YouTube blocked
YouTube Music allowed
3 escape attempts
```

That is the product.

---

## 35. Primary References

ActivityWatch documentation:

- https://docs.activitywatch.net/en/latest/getting-started.html
- https://docs.activitywatch.net/en/latest/watchers.html
- https://docs.activitywatch.net/en/latest/features/user-interface.html
- https://docs.activitywatch.net/en/latest/examples/working-with-data.html
- https://docs.activitywatch.net/en/latest/api/rest.html
- https://docs.activitywatch.net/en/latest/security.html
- https://docs.activitywatch.net/en/latest/features/exporting-data.html

ActivityWatch repositories:

- https://github.com/ActivityWatch/activitywatch
- https://github.com/ActivityWatch/aw-watcher-web

Browser extension:

- https://chromewebstore.google.com/detail/activitywatch-web-watcher/nglaklhklhcoonedhgnpgddginnjdadi

Chrome extension blocking:

- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest

Tauri:

- https://v2.tauri.app/
- https://v2.tauri.app/plugin/sql/
- https://v2.tauri.app/reference/javascript/api/namespacewindow/
