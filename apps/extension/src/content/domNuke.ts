/**
 * FocusWatch DOM Nuke Sanitizer Engine (Disabled)
 */

export function initDomNuke(): void {
  // Disabled to prevent altering website UI layout
}

export function toggleSanitizer(_enable: boolean): void {
  const root = document.documentElement;
  if (root) {
    root.classList.remove('focuswatch-nuke-active');
  }
}
