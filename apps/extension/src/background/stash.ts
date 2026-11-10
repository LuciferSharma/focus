/**
 * FocusWatch 1-Click Tab Stashing Engine (Alt + S)
 * Queries open tabs, formats a research backlog task, sends to desktop SQLite DB/Bridge, and closes stashed tabs.
 */

const BRIDGE_URL = 'http://127.0.0.1:47777';

export async function stashCurrentWindowTabs(): Promise<{ success: boolean; stashedCount: number; error?: string }> {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // Exclude pinned tabs and internal extension/chrome pages
    const tabsToStash = tabs.filter((tab) => {
      if (!tab.url || tab.pinned) return false;
      const lowerUrl = tab.url.toLowerCase();
      return (
        !lowerUrl.startsWith('chrome://') &&
        !lowerUrl.startsWith('edge://') &&
        !lowerUrl.startsWith('about:') &&
        !lowerUrl.startsWith('chrome-extension://') &&
        !lowerUrl.startsWith('https://chrome.google.com/webstore') &&
        !lowerUrl.startsWith('https://chromewebstore.google.com')
      );
    });

    if (tabsToStash.length === 0) {
      return { success: true, stashedCount: 0 };
    }

    // Build structured Markdown task description
    const tabListMarkdown = tabsToStash
      .map((t, idx) => `${idx + 1}. [${t.title || 'Untitled'}](${t.url})`)
      .join('\n');

    const timestamp = new Date().toISOString();
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const taskPayload = {
      id: taskId,
      title: `Stashed Research Bundle (${tabsToStash.length} Tabs)`,
      description: `### Stashed Tabs (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}):\n\n${tabListMarkdown}`,
      estimatedMinutes: Math.min(60, tabsToStash.length * 5),
      priority: 'medium',
      status: 'backlog',
      tags: ['stash', 'research'],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 1. Always save to chrome.storage.local for immediate reliability
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const localData = await chrome.storage.local.get(['tacticalTasks', 'stashedBacklog']);
        const currentTasks = Array.isArray(localData.tacticalTasks) ? localData.tacticalTasks : [];
        await chrome.storage.local.set({
          tacticalTasks: [taskPayload, ...currentTasks],
          stashedBacklog: [taskPayload, ...(Array.isArray(localData.stashedBacklog) ? localData.stashedBacklog : [])],
        });
      } catch (err) {
        console.warn('[FocusWatch Stash] Local storage write warning:', err);
      }
    }

    // 2. Attempt HTTP fetch to desktop bridge with 2-second timeout
    let bridgeOk = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${BRIDGE_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      bridgeOk = response.ok;
    } catch {
      bridgeOk = false;
    }

    console.log(`[FocusWatch Stash] Stashed ${tabsToStash.length} tabs. Bridge status: ${bridgeOk ? 'ONLINE' : 'OFFLINE'}`);

    // 3. Close the stashed tabs safely
    const tabIdsToClose = tabsToStash.map((t) => t.id!).filter((id): id is number => typeof id === 'number');

    if (tabIdsToClose.length > 0) {
      // Create a clean extension notification tab if all window tabs are being closed so browser window stays open
      if (tabIdsToClose.length === tabs.length) {
        await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
      }
      await chrome.tabs.remove(tabIdsToClose);
    }

    return { success: true, stashedCount: tabsToStash.length };
  } catch (err: any) {
    console.error('[FocusWatch Stash] Failed to stash tabs:', err);
    return { success: false, stashedCount: 0, error: err?.message || 'UNKNOWN_STASH_ERROR' };
  }
}
