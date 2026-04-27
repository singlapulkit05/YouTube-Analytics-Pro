# YouTube Analytics Extension Implementation Plan

This document outlines the architecture and implementation plan for the YouTube & YouTube Music Analytics Chrome Extension and its backend system.

## User Review Required

> [!IMPORTANT]
> The architecture has been significantly upgraded based on your feedback:
> - **Heartbeat Tracking:** Delta-based tracking (`lastTimestamp`, `currentVideoTime`) to handle throttling and skipping.
> - **Raw Data Sync:** Sending `watchSegments` (start, end) tagged with `tabId` instead of aggregated metrics.
> - **Backend Deduplication:** The backend will handle overlapping multi-tab segments.
> - **Hybrid Sync & Alarms:** Using `chrome.alarms` for background syncing, with immediate syncs on tab close or video end.
> - **Auth:** Short-lived access tokens and long-lived refresh tokens.
> 
> Please review these updates. If this looks solid, I will proceed with the implementation!

## Proposed Changes

### Extension Architecture (`d:\BEE_PROJECT\Project\extension`)
The Chrome extension will use Manifest V3.

- **`manifest.json`**: 
  - Permissions: `storage`, `tabs`, `alarms`, `host_permissions` for youtube and backend.
- **`background.js` (Service Worker)**:
  - Manages Access/Refresh tokens in `chrome.storage.local`.
  - Maintains `chrome.alarms` for the 60s background sync loop.
  - Receives raw watch segments from content scripts.
  - Handles Hybrid Sync: Immediate send on `video ended`/`tab closed`, or batched via the alarm.
- **`content.js`**:
  - Injected into `youtube.com` and `music.youtube.com`.
  - Listens for DOM events AND SPA navigation (`yt-navigate-finish`).
  - **Heartbeat System**: Uses a 1-2 second interval to compute `delta = currentTime - lastTime`. Only counts if playing and delta is reasonable (< 2s).
  - Emits raw segments (`start`, `end`) and `tabId` to the background script.
- **`popup/` (Dashboard UI)**:
  - Modern dark-themed dashboard using vanilla JS/CSS + Chart.js.
  - Bar chart (Avg watch time/day) and Donut chart (Top 10 Channels).
  - Summary and Channel Tables.

### Backend Architecture (`d:\BEE_PROJECT\Project\backend`)
Node.js + Express API to manage users and store analytics.

- **`server.js` & `app.js`**: Setup Express server, CORS, JSON parsing.
- **`config/db.js`**: MongoDB connection setup.
- **`models/`**:
  - `User.js`: Username, hashed password, refreshToken.
  - `WatchSession.js`: Stores raw event payloads (userId, videoId, title, channel, `watchSegments: [{start, end}]`, tabId, source).
  - `DailyStat.js`: Precomputed daily aggregate watch time.
  - `ChannelStat.js`: Precomputed channel aggregate watch time.
- **`routes/` & `controllers/`**:
  - `auth`: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`.
  - `sync`: `/api/sync` - Accepts batches of watch segments. Handles multi-tab deduplication by checking overlapping timestamps per user.
  - `stats`: `/api/stats/dashboard` - Returns precomputed stats for fast UI load.
- **`services/`**:
  - `aggregation.js`: Logic to asynchronously process raw `WatchSession` data into `DailyStat` and `ChannelStat`.

## Verification Plan

### Automated Tests
- Postman or curl tests for Auth flow (including refresh tokens).
- Testing the `/api/sync` endpoint with overlapping multi-tab data to ensure deduplication works.

### Manual Verification
1. Load unpacked extension and login.
2. Test Multi-tab scenario: Open two tabs, play videos simultaneously.
3. Test Edge cases: Seek forward/backward, pause video, switch to background tab.
4. Verify YT Music specifically (`yt-navigate-finish` event triggers).
5. Verify that `chrome.alarms` correctly fires and syncs data to the backend.
6. Verify Dashboard UI visualizes the data correctly based on precomputed backend stats.
