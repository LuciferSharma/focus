/**
 * FocusWatch Content Toast UI Component
 * Renders dark cyberpunk tactical warning banners and deliverable proof capture flashes.
 */

export function showVelocityToast(count: number, task: string): void {
  const existing = document.getElementById('focuswatch-velocity-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'focuswatch-velocity-toast';
  toast.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: #090d16;
    border: 1px solid #f43f5e;
    box-shadow: 0 0 20px rgba(244, 63, 94, 0.4);
    color: #f8fafc;
    padding: 10px 18px;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.4;
    text-align: center;
    pointer-events: none;
    animation: fwToastSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  toast.innerHTML = `
    <div style="font-weight: 800; color: #f43f5e; letter-spacing: 0.05em; text-transform: uppercase;">
      ⚠️ [TACTICAL_WARNING]: Context Switch Velocity Spike (${count} switches/min)
    </div>
    <div style="color: #94a3b8; margin-top: 2px;">
      Active Objective: "<span style="color: #10b981; font-weight: 700;">${escapeHtml(task)}</span>"
    </div>
  `;

  injectKeyframes();
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s ease';
    setTimeout(() => toast.remove(), 500);
  }, 3500);
}

export function showProofCapturedFlash(): void {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    background: #090d16;
    border: 1px solid #10b981;
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
    color: #10b981;
    padding: 8px 14px;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    pointer-events: none;
  `;
  flash.innerText = '⚡ [ DELIVERABLE_PROOF_CAPTURED ]';

  document.body.appendChild(flash);

  setTimeout(() => {
    flash.style.opacity = '0';
    flash.style.transition = 'opacity 0.4s ease';
    setTimeout(() => flash.remove(), 400);
  }, 2000);
}

function injectKeyframes(): void {
  if (document.getElementById('focuswatch-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'focuswatch-toast-styles';
  style.textContent = `
    @keyframes fwToastSlide {
      from { transform: translate(-50%, -20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
