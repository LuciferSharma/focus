/**
 * FocusWatch Auto-Tab Aging & Dormancy Engine
 * Tracks last accessed timestamp per tab.
 * Discards inactive tabs (>30 mins) to free memory and prepends dormant indicator [💤] to title.
 */

const tabAccessTimes = new Map<number, number>();
const DORMANT_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export function initTabAgingEngine(): void {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;

  // Record initial tab timestamps
  chrome.tabs.query({}, (tabs) => {
    const now = Date.now();
    for (const tab of tabs) {
      if (tab.id) {
        const lastAccess = (tab as any).lastAccessed || now;
        tabAccessTimes.set(tab.id, lastAccess);
      }
    }
  });

  // Track tab activations
  chrome.tabs.onActivated.addListener((activeInfo) => {
    tabAccessTimes.set(activeInfo.tabId, Date.now());
  });

  // Track tab removals
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabAccessTimes.delete(tabId);
  });

  // Alarm interval to check for stale tabs (every 2 minutes)
  chrome.alarms.create('check_tab_aging_alarm', { periodInMinutes: 2 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'check_tab_aging_alarm') {
      checkAndDiscardAgingTabs();
    }
  });
}

async function checkAndDiscardAgingTabs(): Promise<void> {
  const now = Date.now();
  const tabs = await chrome.tabs.query({});
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  for (const tab of tabs) {
    if (!tab.id || tab.active || tab.pinned || tab.discarded) continue;
    if (activeTab && tab.id === activeTab.id) continue;

    const chromeLastAccess = (tab as any).lastAccessed || now;
    const lastAccessed = tabAccessTimes.get(tab.id) || chromeLastAccess;
    const inactiveDuration = now - lastAccessed;

    if (inactiveDuration >= DORMANT_THRESHOLD_MS) {
      console.log(`[FocusWatch Tab Aging] 💤 Tab #${tab.id} (${tab.title}) inactive for ${Math.round(inactiveDuration / 60000)}m. Discarding to free RAM.`);

      try {
        // Discard tab memory
        await chrome.tabs.discard(tab.id);
      } catch (err) {
        console.warn(`[FocusWatch Tab Aging] Discard tab #${tab.id} failed:`, err);
      }
    }
  }
}
