/**
 * FocusWatch Context-Switching Velocity Engine
 * Tracks tab activation timestamps over a 60-second sliding window.
 * Triggers a tactical warning banner if tab switches >= 10 in 60s during an active focus session.
 */

const switchBuffer: number[] = [];
const WINDOW_MS = 60000; // 60 seconds
const THRESHOLD = 10;   // 10 tab switches / minute

export function initVelocityTracker(): void {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const now = Date.now();
    switchBuffer.push(now);

    // Evict entries older than 60 seconds
    while (switchBuffer.length > 0 && switchBuffer[0] < now - WINDOW_MS) {
      switchBuffer.shift();
    }

    if (switchBuffer.length >= THRESHOLD) {
      // Check if session is active
      const data = await chrome.storage.local.get(['activeSession']);
      const isSessionActive = Boolean(data.activeSession && data.activeSession.active);

      if (isSessionActive) {
        const activeTask = data.activeSession.task || 'Active Deep Work Session';

        // Notify active tab
        try {
          chrome.tabs.sendMessage(activeInfo.tabId, {
            type: 'VELOCITY_WARNING',
            count: switchBuffer.length,
            task: activeTask,
          });
        } catch {}
      }
    }
  });
}
