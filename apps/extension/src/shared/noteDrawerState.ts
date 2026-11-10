/**
 * One notes drawer for the whole browser. Its state lives in chrome.storage, so every tab
 * shows the same thing: open, minimized to a small tab on the right edge, or closed.
 */
export type DrawerMode = 'open' | 'minimized' | 'closed';

export const DRAWER_MODE_KEY = 'noteDrawerMode';

export const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
];

export function isRestrictedUrl(url?: string): boolean {
  return !url || RESTRICTED_URL_PREFIXES.some((p) => url.startsWith(p));
}

export function normalizeMode(value: unknown): DrawerMode {
  return value === 'open' || value === 'minimized' ? value : 'closed';
}

/** What Alt+N and the NOTES button do: show it if it is hidden or minimized, otherwise close it. */
export function nextModeOnToggle(current: DrawerMode): DrawerMode {
  return current === 'open' ? 'closed' : 'open';
}

export async function getDrawerMode(): Promise<DrawerMode> {
  try {
    const res = await chrome.storage.local.get([DRAWER_MODE_KEY]);
    return normalizeMode(res[DRAWER_MODE_KEY]);
  } catch {
    return 'closed';
  }
}

export async function setDrawerMode(mode: DrawerMode): Promise<void> {
  try {
    await chrome.storage.local.set({ [DRAWER_MODE_KEY]: mode });
  } catch {}
}

export async function toggleDrawerMode(): Promise<DrawerMode> {
  const next = nextModeOnToggle(await getDrawerMode());
  await setDrawerMode(next);
  return next;
}
