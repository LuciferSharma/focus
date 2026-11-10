/**
 * FocusWatch 20-20-20 Eye Shield Micro-Break Reticle
 * Renders an animated dark tactical overlay every 50 minutes of continuous browsing.
 */

let eyeShieldTimer: ReturnType<typeof setInterval> | null = null;
const BREAK_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

export function initEyeShield(): void {
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  chrome.storage.local.get(['eyeShieldEnabled', 'lastEyeShieldBreak'], (res) => {
    const enabled = res.eyeShieldEnabled !== false;
    if (enabled) {
      startEyeShieldTimer();
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.eyeShieldEnabled) {
      if (changes.eyeShieldEnabled.newValue !== false) {
        startEyeShieldTimer();
      } else {
        stopEyeShieldTimer();
      }
    }
  });
}

function startEyeShieldTimer(): void {
  if (eyeShieldTimer) clearInterval(eyeShieldTimer);

  eyeShieldTimer = setInterval(() => {
    triggerEyeShieldBreak();
  }, BREAK_INTERVAL_MS);
}

function stopEyeShieldTimer(): void {
  if (eyeShieldTimer) {
    clearInterval(eyeShieldTimer);
    eyeShieldTimer = null;
  }
}

export function triggerEyeShieldBreak(): void {
  if (document.getElementById('focuswatch-eye-shield')) return;

  const overlay = document.createElement('div');
  overlay.id = 'focuswatch-eye-shield';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483647;
    background: rgba(3, 7, 18, 0.96);
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #f8fafc;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    user-select: none;
    animation: fwFadeIn 0.4s ease;
  `;

  let remainingSeconds = 20;

  overlay.innerHTML = `
    <div style="position: relative; width: 140px; height: 140px; display: flex; justify-content: center; align-items: center;">
      <!-- Outer Reticle Ring -->
      <div style="position: absolute; width: 100%; height: 100%; border: 2px dashed #10b981; border-radius: 50%; animation: fwSpin 10s linear infinite;"></div>
      <!-- Inner Pulsing Circle -->
      <div style="position: absolute; width: 70%; height: 70%; border: 2px solid #06b6d4; border-radius: 50%; animation: fwPulse 2s ease-in-out infinite;"></div>
      <!-- Seconds Counter -->
      <div id="fw-break-countdown" style="font-size: 32px; font-weight: 900; color: #10b981; text-shadow: 0 0 12px rgba(16,185,129,0.5);">${remainingSeconds}</div>
    </div>

    <div style="margin-top: 24px; text-align: center; max-width: 420px;">
      <h2 style="font-size: 14px; font-weight: 800; color: #10b981; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 8px 0;">
        👁️ [ 20-20-20 EYE SHIELD ACTIVE ]
      </h2>
      <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0 0 20px 0;">
        Focus your eyes on an object at least 20 feet (6 meters) away for 20 seconds to reset ciliary muscles and reduce fatigue.
      </p>

      <button id="fw-skip-break-btn" style="
        background: #090d16;
        border: 1px solid #334155;
        color: #64748b;
        padding: 6px 16px;
        border-radius: 4px;
        font-family: inherit;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        letter-spacing: 0.05em;
        transition: all 0.2s ease;
      ">
        [ SKIP_BREAK ]
      </button>
    </div>
  `;

  injectEyeShieldStyles();
  document.body.appendChild(overlay);

  const countdownEl = overlay.querySelector('#fw-break-countdown');
  const skipBtn = overlay.querySelector('#fw-skip-break-btn');

  const interval = setInterval(() => {
    remainingSeconds--;
    if (countdownEl) countdownEl.textContent = `${remainingSeconds}`;

    if (remainingSeconds <= 0) {
      clearInterval(interval);
      dismissOverlay(overlay);
    }
  }, 1000);

  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      clearInterval(interval);
      dismissOverlay(overlay);
    });
  }
}

function dismissOverlay(overlay: HTMLElement): void {
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.3s ease';
  setTimeout(() => overlay.remove(), 300);
}

function injectEyeShieldStyles(): void {
  if (document.getElementById('focuswatch-eyeshield-styles')) return;
  const style = document.createElement('style');
  style.id = 'focuswatch-eyeshield-styles';
  style.textContent = `
    @keyframes fwFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fwSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes fwPulse {
      0%, 100% { transform: scale(0.9); opacity: 0.6; }
      50% { transform: scale(1.1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
