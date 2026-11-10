/**
 * FocusWatch Content Script Entrypoint
 * Integrates 20-20-20 Eye Shield, Velocity Alerts, and Shadow DOM Note Drawer.
 */

import { initEyeShield } from './eyeShield';
import { showVelocityToast, showProofCapturedFlash } from './toast';
import { toggleNoteDrawer, initNoteDrawerSync } from './noteDrawer';

// The script can be injected again into a tab that already has it (e.g. after the extension
// reloads). Only the first copy sets things up, so there is never a second drawer.
const alreadyLoaded = Boolean((window as any).__focuswatch_cs_loaded);
(window as any).__focuswatch_cs_loaded = true;

if (!alreadyLoaded) {
// Initialize Content Subsystems
initEyeShield();

// The notes drawer is shared by every tab: show it here if it is open or minimized elsewhere.
initNoteDrawerSync();

// Expose global execution handle for background script direct invocation fallback
(window as any).__focuswatch_toggle_notes = toggleNoteDrawer;

// Direct client-side hotkey listener for Alt + N (instant toggle)
window.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    toggleNoteDrawer();
  }
});

// Listen for messages from background script or popup
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'VELOCITY_WARNING') {
      showVelocityToast(message.count || 10, message.task || 'Active Objective');
      sendResponse({ status: 'ok' });
    } else if (message.type === 'PROOF_CAPTURED_FLASH') {
      showProofCapturedFlash();
      sendResponse({ status: 'ok' });
    } else if (message.type === 'TOGGLE_NOTE_DRAWER') {
      toggleNoteDrawer();
      sendResponse({ status: 'ok' });
    } else if (message.type === 'FOCUSWATCH_PING') {
      sendResponse({ status: 'ok' });
    }
  });
}
}
