export interface PatternRule {
  domain: string;
  pathRegex?: string;
  isException?: boolean;
}

export const DEFAULT_BLOCKED_DOMAINS = [
  'youtube.com',
  'instagram.com',
  'reddit.com',
  'x.com',
  'facebook.com',
  'linkedin.com',
  'twitter.com',
  'tiktok.com',
];

export const ALLOWED_EXCEPTIONS = [
  'music.youtube.com',
  'studio.youtube.com',
];

let lastAppliedFingerprint: string | null = null;

/**
 * Updates chrome.declarativeNetRequest dynamic rules based on active session state.
 * Uses high-efficiency subdomain-aware regex matching and state fingerprinting to prevent rule churn.
 */
export async function updateDeclarativeNetRequestRules(
  blockedDomains: string[] = [],
  allowedExceptions: string[] = [],
  force: boolean = false
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) return;

  const sortedBlocked = [...new Set(blockedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))].sort();
  const sortedExceptions = [...new Set(allowedExceptions.map((e) => e.trim().toLowerCase()).filter(Boolean))].sort();
  const currentFingerprint = JSON.stringify({ blocked: sortedBlocked, exceptions: sortedExceptions });

  // Skip update if rules haven't changed to prevent 2-second rule churn
  if (!force && currentFingerprint === lastAppliedFingerprint) {
    return;
  }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map((r) => r.id);

  const newRules: chrome.declarativeNetRequest.Rule[] = [];
  let ruleIdCounter = 1;

  // 1. High Priority Allow Exceptions (Priority 100)
  for (const exc of sortedExceptions) {
    newRules.push({
      id: ruleIdCounter++,
      priority: 100,
      action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
      condition: {
        urlFilter: `||${exc}^`,
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
          chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
        ],
      },
    });
  }

  // 2. Block Rules with Subdomain-Aware Regex & Redirection (Priority 50)
  const blockedRedirectUrl = chrome.runtime.getURL('blocked.html');

  for (const domain of sortedBlocked) {
    const escapedDomain = domain.replace(/\./g, '\\.');

    newRules.push({
      id: ruleIdCounter++,
      priority: 50,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: {
          regexSubstitution: `${blockedRedirectUrl}?url=\\0`,
        },
      },
      condition: {
        regexFilter: `^https?://(?:[^/]+\\.)?${escapedDomain}(?:[/?#].*)?$`,
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
          chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
        ],
      },
    });
  }

  console.log(
    `[FocusWatch DNR Engine] 🛡️ Updating dynamic rules: ${sortedBlocked.length} blocked domains, ${sortedExceptions.length} exceptions.`
  );

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: newRules,
  });

  lastAppliedFingerprint = currentFingerprint;

  const updatedRules = await chrome.declarativeNetRequest.getDynamicRules();
  console.log(
    `[FocusWatch DNR Engine] ✅ Installed ${updatedRules.length} dynamic DNR rules in Chrome engine.`,
    updatedRules
  );
}
