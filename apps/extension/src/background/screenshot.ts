/**
 * FocusWatch Deliverable Proof Screenshot Grabber (Alt + Shift + C)
 * Captures active viewport, dispatches base64 artifact to desktop bridge, and triggers confirmation flash.
 */

const BRIDGE_URL = 'http://127.0.0.1:47777';

export async function captureDeliverableProof(): Promise<{ success: boolean }> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
    if (!dataUrl) return { success: false };

    // Query active tab title & url
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Tag the capture with the running session so the desktop can attach it to the right one.
    const stored0 = await chrome.storage.local.get(['activeSession']);
    const sessionStartedAt = stored0.activeSession?.active
      ? stored0.activeSession.started_at || stored0.activeSession.startedAt || null
      : null;

    const payload = {
      session_started_at: sessionStartedAt,
      timestamp: new Date().toISOString(),
      url: activeTab?.url || '',
      title: activeTab?.title || 'Active Viewport',
      imageDataUrl: dataUrl,
    };

    // Send payload to desktop app HTTP bridge
    let bridgeOk = false;
    try {
      const res = await fetch(`${BRIDGE_URL}/session/artifact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      bridgeOk = res.ok;
    } catch {
      bridgeOk = false;
    }

    if (!bridgeOk) {
      // Local fallback in chrome.storage.local (capped at last 10 artifacts to prevent quota overflow)
      const stored = await chrome.storage.local.get(['proofArtifacts']);
      const currentList = Array.isArray(stored.proofArtifacts) ? stored.proofArtifacts : [];
      const updatedList = [...currentList, payload].slice(-10);
      await chrome.storage.local.set({ proofArtifacts: updatedList });
    }

    // Trigger visual feedback flash on current tab
    if (activeTab?.id) {
      try {
        chrome.tabs.sendMessage(activeTab.id, { type: 'PROOF_CAPTURED_FLASH' });
      } catch {}
    }

    return { success: true };
  } catch (err) {
    console.error('[FocusWatch Proof Grabber] Capture failed:', err);
    return { success: false };
  }
}
