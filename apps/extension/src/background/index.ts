import { updateDeclarativeNetRequestRules } from '../rules/engine';
import { stashCurrentWindowTabs } from './stash';
import { captureDeliverableProof } from './screenshot';
import { initVelocityTracker } from './velocityTracker';
import { initTabAgingEngine } from './tabAging';
import { DrawerMode, getDrawerMode, isRestrictedUrl, toggleDrawerMode } from '../shared/noteDrawerState';
import {
  activeUnlocks,
  addUnlock,
  effectiveExceptions,
  matchBlockedDomain,
  sessionKeyOf,
} from './tempUnlock';

const BRIDGE_URL = 'http://127.0.0.1:47777';
const TEMP_UNLOCKS_KEY = 'temporaryUnlocks';
const UNLOCK_EXPIRY_ALARM_PREFIX = 'temp_unlock_expiry:';
let pollIntervalTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let previousSessionActive = false;

// Initialize Velocity Tracker & Tab Aging Engines
initVelocityTracker();
initTabAgingEngine();

/**
 * Domain matching helper for fallback navigation interception.
 */
function isDomainBlocked(urlStr: string, blockedDomains: string[], allowedExceptions: string[] = []): boolean {
  if (!urlStr || !blockedDomains.length) return false;
  try {
    const urlObj = new URL(urlStr);
    const hostname = urlObj.hostname.toLowerCase();

    // 1. Check exception whitelist
    const isAllowed = allowedExceptions.some((exc) => {
      const clean = exc.trim().toLowerCase();
      return hostname === clean || hostname.endsWith(`.${clean}`);
    });
    if (isAllowed) return false;

    // 2. Check if host matches blocked domain or subdomain
    return blockedDomains.some((d) => {
      const clean = d.trim().toLowerCase();
      return hostname === clean || hostname.endsWith(`.${clean}`);
    });
  } catch {
    return false;
  }
}

/**
 * Discard and mute active tabs matching blocked domains when a session activates.
 */
async function autoDiscardAndMuteBlockedTabs(blockedDomains: string[], allowedExceptions: string[] = []): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs || !blockedDomains.length) return;
  try {
    const tabs = await chrome.tabs.query({});
    const blockedRedirectUrl = chrome.runtime.getURL('blocked.html');

    for (const tab of tabs) {
      if (!tab.id || !tab.url || tab.url.startsWith(blockedRedirectUrl)) continue;

      if (isDomainBlocked(tab.url, blockedDomains, allowedExceptions)) {
        console.log(`[FocusWatch SW] 🔇 Auto-muting & discarding tab #${tab.id} (${tab.url})`);
        try {
          await chrome.tabs.update(tab.id, { muted: true });
        } catch {}

        try {
          await chrome.tabs.update(tab.id, {
            url: `${blockedRedirectUrl}?url=${encodeURIComponent(tab.url)}`,
          });
        } catch {}

        try {
          await chrome.tabs.discard(tab.id);
        } catch {}
      }
    }
  } catch {}
}

/** The session's allowed exceptions plus any sites unlocked from the block page. */
async function exceptionsForSession(session: any): Promise<string[]> {
  const allowed: string[] = Array.isArray(session?.allowed_exceptions) ? session.allowed_exceptions : [];
  try {
    const stored = await chrome.storage.local.get([TEMP_UNLOCKS_KEY]);
    return effectiveExceptions(allowed, activeUnlocks(stored[TEMP_UNLOCKS_KEY], sessionKeyOf(session), Date.now()));
  } catch {
    return allowed;
  }
}

/** Unlocks a blocked site for a few minutes, then lets the expiry alarm block it again. */
async function grantTemporaryUnlock(payload: { url?: string; minutes?: number; reason?: string }) {
  const { activeSession: session } = await chrome.storage.local.get(['activeSession']);
  if (!session || !session.active || !Array.isArray(session.blocked_domains)) {
    return { success: true, reason: 'no_active_session' };
  }

  const domain = matchBlockedDomain(payload.url || '', session.blocked_domains);
  if (!domain) return { success: false, error: 'invalid_url' };

  const stored = await chrome.storage.local.get([TEMP_UNLOCKS_KEY]);
  const { list, added } = addUnlock(
    stored[TEMP_UNLOCKS_KEY],
    {
      domain,
      minutes: Number(payload.minutes) || 5,
      reason: String(payload.reason || '').slice(0, 500),
      sessionKey: sessionKeyOf(session),
    },
    Date.now()
  );
  await chrome.storage.local.set({ [TEMP_UNLOCKS_KEY]: list });
  chrome.alarms.create(`${UNLOCK_EXPIRY_ALARM_PREFIX}${domain}`, { when: added.expiresAt + 500 });

  // Apply the new rules before replying, so the page can navigate straight to the site.
  await updateDeclarativeNetRequestRules(session.blocked_domains, await exceptionsForSession(session));
  const minutes = Math.round((added.expiresAt - Date.now()) / 60_000);
  await pushTelemetryLog(`Temporary unlock: ${domain} for ${minutes} min. Reason: "${added.reason}"`);
  return { success: true, domain, expiresAt: added.expiresAt };
}

/** When an unlock runs out, send any tabs still open on that site back to the block page. */
async function reblockAfterUnlockExpiry(): Promise<void> {
  await syncSessionAndRules();
  const { activeSession: session } = await chrome.storage.local.get(['activeSession']);
  if (!session || !session.active || session.paused || !Array.isArray(session.blocked_domains)) return;
  await autoDiscardAndMuteBlockedTabs(session.blocked_domains, await exceptionsForSession(session));
}

async function pushTelemetryLog(entry: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  try {
    const res = await chrome.storage.local.get(['telemetryLogs']);
    const existing = Array.isArray(res.telemetryLogs) ? res.telemetryLogs : [];
    const time = new Date().toLocaleTimeString();
    const logItem = `[${time}] ${entry}`;
    const updated = [logItem, ...existing].slice(0, 35);
    await chrome.storage.local.set({ telemetryLogs: updated });
  } catch {}
}

const TIME_UP_ALARM = 'session_time_up';
const TIME_UP_NOTIFICATION_ID = 'focuswatch-time-up';

function sessionEndMs(data: any): number | null {
  const started = Date.parse(data?.started_at || data?.startedAt || '');
  const mins = Number(data?.planned_minutes || data?.plannedMinutes || 0);
  if (isNaN(started) || !mins) return null;
  // Time spent paused does not count, so the planned end moves out by that much.
  return started + mins * 60_000 + (Number(data?.total_paused_ms) || 0);
}

/**
 * Time-up handling for the running session: a one-shot alarm for the exact end time
 * (service workers cannot rely on timers), then a DONE badge and one notification.
 */
async function handleTimeUp(data: any): Promise<void> {
  try {
    const endMs = sessionEndMs(data);
    if (endMs === null) return;
    const sessionKey = String(data.started_at || data.startedAt);

    if (Date.now() >= endMs) {
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      await chrome.action.setBadgeText({ text: 'DONE' });

      const stored = await chrome.storage.local.get(['timeUpNotifiedFor']);
      if (stored.timeUpNotifiedFor !== sessionKey) {
        await chrome.storage.local.set({ timeUpNotifiedFor: sessionKey });
        await pushTelemetryLog(`Time is up for "${data.task}". Notifying.`);
        chrome.notifications.create(TIME_UP_NOTIFICATION_ID, {
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: 'Time is up: submit your results',
          message: `${data.task}
Click to stop the session and record the outcome.`,
          priority: 2,
          requireInteraction: true,
        });
      }
    } else {
      await chrome.action.setBadgeText({ text: '' });
      const wanted = endMs + 500;
      const existing = await chrome.alarms.get(TIME_UP_ALARM);
      if (!existing || Math.abs(existing.scheduledTime - wanted) > 1000) {
        chrome.alarms.create(TIME_UP_ALARM, { when: wanted });
      }
    }
  } catch (err) {
    console.warn('[FocusWatch SW] handleTimeUp failed:', err);
  }
}

/** Paused: no blocking, no time-up alert, and a badge so it is obvious in the toolbar. */
async function showPausedState(): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#0ea5e9' });
    await chrome.action.setBadgeText({ text: 'II' });
    await chrome.alarms.clear(TIME_UP_ALARM);
    chrome.notifications.clear(TIME_UP_NOTIFICATION_ID);
  } catch {}
}

async function clearTimeUpState(): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.alarms.clear(TIME_UP_ALARM);
    chrome.notifications.clear(TIME_UP_NOTIFICATION_ID);
  } catch {}
}

/**
 * Main state synchronization loop with Rust desktop bridge (127.0.0.1:47777).
 */
export async function syncSessionAndRules(): Promise<void> {
  try {
    await pushTelemetryLog(`Fetching ${BRIDGE_URL}/session/active ...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${BRIDGE_URL}/session/active`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      consecutiveFailures = 0;
      const data = await res.json();
      const isActive = Boolean(data && data.active);
      const blockedCount = Array.isArray(data?.blocked_domains) ? data.blocked_domains.length : 0;

      await pushTelemetryLog(`Bridge Payload Received: active=${isActive}, blocked_count=${blockedCount}`);

      if (isActive && data.paused) {
        previousSessionActive = false; // so blocked tabs are cleaned up again on resume
        await updateDeclarativeNetRequestRules([], []);
        await chrome.storage.local.set({ activeSession: data, bridgeConnected: true });
        await showPausedState();
        schedulePolling(2000);
        return;
      }

      if (isActive && Array.isArray(data.blocked_domains)) {
        const exceptions = await exceptionsForSession(data);
        if (!previousSessionActive) {
          await autoDiscardAndMuteBlockedTabs(data.blocked_domains, exceptions);
        }
        previousSessionActive = true;

        await updateDeclarativeNetRequestRules(data.blocked_domains, exceptions);
        await chrome.storage.local.set({ activeSession: data, bridgeConnected: true });
        await handleTimeUp(data);
        schedulePolling(2000);
        return;
      } else {
        previousSessionActive = false;
        await updateDeclarativeNetRequestRules([], []);
        await chrome.storage.local.set({ activeSession: null, bridgeConnected: true });
        await clearTimeUpState();
        schedulePolling(5000);
        return;
      }
    } else {
      await pushTelemetryLog(`Bridge Error HTTP ${res.status} ${res.statusText}`);
      handleSyncFailure(`HTTP_${res.status}`);
    }
  } catch (err: any) {
    const errMsg = err?.name === 'AbortError' ? 'FETCH_TIMEOUT (2s)' : (err?.message || String(err));
    await pushTelemetryLog(`Bridge Exception: ${errMsg}`);
    handleSyncFailure(errMsg);
  }
}

/**
 * Handle connection failure (e.g. desktop bridge offline / ECONNREFUSED)
 */
async function handleSyncFailure(reason?: string): Promise<void> {
  consecutiveFailures++;
  previousSessionActive = false;

  if (consecutiveFailures >= 3) {
    await pushTelemetryLog(`⚠️ Offline threshold reached (${consecutiveFailures} failures: ${reason || 'ERR'}). Resetting session.`);
    await updateDeclarativeNetRequestRules([], [], true);
    await chrome.storage.local.set({ activeSession: null, bridgeConnected: false });
    schedulePolling(5000);
  } else {
    schedulePolling(2000);
  }
}

function schedulePolling(intervalMs: number): void {
  if (pollIntervalTimer) {
    clearInterval(pollIntervalTimer);
  }
  pollIntervalTimer = setInterval(() => {
    syncSessionAndRules();
  }, intervalMs);
}

/**
 * Makes sure a tab is running the content script, injecting it if the tab was open before
 * the extension (re)loaded. Returns false for pages extensions are not allowed to touch.
 */
export async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isRestrictedUrl(tab?.url)) return false;
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'FOCUSWATCH_PING' });
      if (res && res.status === 'ok') return true;
    } catch {}
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/index.js'] });
    return true;
  } catch (err) {
    console.warn('[FocusWatch] Could not load the content script:', err);
    return false;
  }
}

/** Opens or closes the shared notes drawer on every tab, starting with the active one. */
export async function toggleNotesEverywhere(): Promise<{ success: boolean; mode: DrawerMode; shownHere: boolean }> {
  const mode = await toggleDrawerMode();
  let shownHere = false;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) shownHere = await ensureContentScript(activeTab.id);
  } catch {}
  return { success: true, mode, shownHere };
}

// Hotkey Commands Listener (Alt + S, Alt + Shift + C, Alt + N)
if (typeof chrome !== 'undefined' && chrome.commands) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'stash_tabs') {
      console.log('[FocusWatch SW] ⚡ Command: Stash Tabs triggered');
      await stashCurrentWindowTabs();
    } else if (command === 'capture_proof') {
      console.log('[FocusWatch SW] ⚡ Command: Capture Proof triggered');
      await captureDeliverableProof();
    } else if (command === 'toggle_notes') {
      console.log('[FocusWatch SW] ⚡ Command: Toggle Notes Drawer triggered');
      await toggleNotesEverywhere();
    }
  });
}

// Service Worker Initialization
chrome.runtime.onInstalled.addListener(async () => {
  await updateDeclarativeNetRequestRules([], [], true);
  await syncSessionAndRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateDeclarativeNetRequestRules([], [], true);
  await syncSessionAndRules();
});

// Alarm heartbeat backup
chrome.alarms.create('sync_bridge_alarm', { periodInMinutes: 0.25 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync_bridge_alarm' || alarm.name === TIME_UP_ALARM) {
    syncSessionAndRules();
  } else if (alarm.name.startsWith(UNLOCK_EXPIRY_ALARM_PREFIX)) {
    reblockAfterUnlockExpiry();
  }
});

// Clicking the time-up notification opens the popup where results are submitted.
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== TIME_UP_NOTIFICATION_ID) return;
  chrome.notifications.clear(notificationId);
  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup needs a focused browser window; fall back to a tab with the same UI.
    await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});

// The notes drawer follows you between tabs. Tabs opened before the extension loaded have no
// content script yet, so give them one when you switch to them while the drawer is showing.
if (typeof chrome !== 'undefined' && chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    if ((await getDrawerMode()) !== 'closed') await ensureContentScript(tabId);
  });
}

// Navigation interceptor fallbacks (webNavigation & tabs.onUpdated)
if (typeof chrome !== 'undefined' && chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    try {
      const data = await chrome.storage.local.get(['activeSession']);
      const session = data.activeSession;
      if (!session || !session.active || session.paused || !Array.isArray(session.blocked_domains)) return;

      const blockedRedirectUrl = chrome.runtime.getURL('blocked.html');
      if (details.url.startsWith(blockedRedirectUrl)) return;

      if (isDomainBlocked(details.url, session.blocked_domains, await exceptionsForSession(session)) && details.tabId) {
        chrome.tabs.update(details.tabId, {
          url: `${blockedRedirectUrl}?url=${encodeURIComponent(details.url)}`,
        });
      }
    } catch {}
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'loading') {
      const targetUrl = changeInfo.url || tab.url;
      if (!targetUrl) return;

      const blockedRedirectUrl = chrome.runtime.getURL('blocked.html');
      if (targetUrl.startsWith(blockedRedirectUrl)) return;

      try {
        const data = await chrome.storage.local.get(['activeSession']);
        const session = data.activeSession;
        if (!session || !session.active || session.paused || !Array.isArray(session.blocked_domains)) return;

        if (isDomainBlocked(targetUrl, session.blocked_domains, await exceptionsForSession(session))) {
          console.log(`[FocusWatch SW] 🛑 Intercepted onUpdated on tab #${tabId} to ${targetUrl}`);
          await chrome.tabs.update(tabId, {
            url: `${blockedRedirectUrl}?url=${encodeURIComponent(targetUrl)}`,
          });
        }
      } catch {}
    }
  });
}

// Service Worker Startup Logging
pushTelemetryLog('Service Worker Initialized & Listening');

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FORCE_RESYNC') {
    pushTelemetryLog('Received FORCE_RESYNC command from Popup');
    syncSessionAndRules()
      .then(() => {
        sendResponse({ status: 'resynced' });
      })
      .catch((err) => {
        pushTelemetryLog(`FORCE_RESYNC Error: ${err?.message || err}`);
        sendResponse({ status: 'error', error: String(err) });
      });
    return true; // Keep channel open for async response
  } else if (message.type === 'GRANT_TEMP_UNLOCK') {
    grantTemporaryUnlock(message.payload || {})
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true; // Keep channel open for async response
  } else if (message.type === 'LOG_ATTEMPT') {
    fetch(`${BRIDGE_URL}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload),
    }).catch(() => {});
    sendResponse({ status: 'ok' });
  } else if (message.type === 'SYNC_NOTES_TO_BRIDGE') {
    fetch(`${BRIDGE_URL}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: message.notes }),
    }).catch(() => {});
    sendResponse({ status: 'ok' });
  } else if (message.type === 'CREATE_TASK_IN_BRIDGE') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    fetch(`${BRIDGE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.taskPayload),
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeoutId);
        sendResponse({ success: res.ok });
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        sendResponse({ success: false, error: String(err) });
      });
    return true; // Keep channel open for async fetch
  } else if (message.type === 'STASH_TABS') {
    stashCurrentWindowTabs().then((res) => sendResponse(res));
    return true;
  } else if (message.type === 'CAPTURE_PROOF') {
    captureDeliverableProof().then((res) => sendResponse(res));
    return true;
  } else if (message.type === 'TOGGLE_NOTE_DRAWER_BG') {
    toggleNotesEverywhere().then((result) => sendResponse(result));
    return true;
  } else if (message.type === 'CLEAR_ALL_RULES') {
    updateDeclarativeNetRequestRules([], [], true).then(() => {
      chrome.storage.local.set({ activeSession: null }, () => {
        sendResponse({ status: 'cleared' });
      });
    });
    return true;
  }
});

// Start initial sync loop
syncSessionAndRules();
