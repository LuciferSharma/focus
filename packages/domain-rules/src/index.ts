import { Category, ClassificationRule } from '@focuswatch/shared-types';

export const DEFAULT_BLOCKED_DOMAINS = [
  'youtube.com',
  'instagram.com',
  'reddit.com',
  'x.com',
  'facebook.com',
  'linkedin.com',
];

export const ALLOWED_EXCEPTIONS = [
  'music.youtube.com',
  'studio.youtube.com',
];

/**
 * Extracts normalized hostname/domain from a raw URL or hostname string.
 * Example: "https://www.youtube.com/watch?v=123" -> "youtube.com"
 * Example: "music.youtube.com" -> "music.youtube.com"
 */
export function extractDomain(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    let formattedUrl = rawUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }
    const parsed = new URL(formattedUrl);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch {
    // Fallback for invalid URLs or plain app strings
    return rawUrl.toLowerCase().trim();
  }
}

/**
 * Sanitizes a URL according to privacy settings:
 * Strips sensitive query params (?token=, ?email=, ?session=) and fragments (#fragment).
 * Mode 'domain_and_path': returns domain + path (no query/hash).
 * Mode 'domain_only': returns domain only.
 * Mode 'full_sanitized': returns sanitized full URL.
 */
export function sanitizeUrl(
  rawUrl: string,
  mode: 'domain_only' | 'domain_and_path' | 'full_sanitized' = 'domain_and_path'
): { url: string; domain: string; path: string } {
  const domain = extractDomain(rawUrl);
  if (!rawUrl) return { url: '', domain: '', path: '' };

  try {
    let formattedUrl = rawUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }
    const parsed = new URL(formattedUrl);
    const path = parsed.pathname || '/';

    if (mode === 'domain_only') {
      return {
        url: `https://${domain}`,
        domain,
        path: '/',
      };
    }

    if (mode === 'domain_and_path') {
      return {
        url: `https://${domain}${path}`,
        domain,
        path,
      };
    }

    // Full sanitized: strip sensitive keys from search params
    const sensitiveKeys = ['token', 'access_token', 'auth', 'email', 'session', 'key', 'pwd', 'password', 'code'];
    const searchParams = new URLSearchParams(parsed.search);
    for (const key of Array.from(searchParams.keys())) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        searchParams.delete(key);
      }
    }

    const cleanQuery = searchParams.toString();
    const cleanUrl = `https://${domain}${path}${cleanQuery ? '?' + cleanQuery : ''}`;

    return {
      url: cleanUrl,
      domain,
      path,
    };
  } catch {
    return {
      url: rawUrl,
      domain,
      path: '',
    };
  }
}

/**
 * Analyzes YouTube URLs for fine-grained classification & blocking decisions.
 */
export type YouTubeUrlType =
  | 'youtube_music'       // music.youtube.com (Allowed/Neutral)
  | 'youtube_studio'      // studio.youtube.com (Allowed/Productive)
  | 'youtube_shorts'      // youtube.com/shorts/* (Blocked)
  | 'youtube_feed'        // youtube.com/feed/* (Blocked)
  | 'youtube_homepage'    // youtube.com/ (Blocked)
  | 'youtube_watch'       // youtube.com/watch?v=* (Temp exception or Blocked)
  | 'other_youtube';

export function classifyYouTubeUrl(rawUrl: string): YouTubeUrlType {
  const domain = extractDomain(rawUrl);
  if (domain === 'music.youtube.com') return 'youtube_music';
  if (domain === 'studio.youtube.com') return 'youtube_studio';

  if (domain === 'youtube.com' || domain.endsWith('.youtube.com')) {
    try {
      let formattedUrl = rawUrl.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      const parsed = new URL(formattedUrl);
      const pathname = parsed.pathname.toLowerCase();

      if (pathname.startsWith('/shorts')) return 'youtube_shorts';
      if (pathname.startsWith('/feed') || pathname.startsWith('/explore')) return 'youtube_feed';
      if (pathname === '/' || pathname === '') return 'youtube_homepage';
      if (pathname.startsWith('/watch')) return 'youtube_watch';
    } catch {
      return 'youtube_homepage';
    }
    return 'other_youtube';
  }

  return 'other_youtube';
}

/**
 * Default categories as defined in Build Spec Section 13.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'deep_work', name: 'Deep Work', productivityWeight: 1.0, type: 'deep_work' },
  { id: 'productive', name: 'Productive', productivityWeight: 0.7, type: 'productive' },
  { id: 'communication', name: 'Communication', productivityWeight: 0.2, type: 'communication' },
  { id: 'neutral', name: 'Neutral', productivityWeight: 0.0, type: 'neutral' },
  { id: 'distracting', name: 'Distracting', productivityWeight: -0.7, type: 'distracting' },
  { id: 'highly_distracting', name: 'Highly Distracting', productivityWeight: -1.0, type: 'highly_distracting' },
  { id: 'unknown', name: 'Unknown', productivityWeight: 0.0, type: 'unknown' },
];

/**
 * Default classification rules as defined in Build Spec Section 14.
 */
export const DEFAULT_CLASSIFICATION_RULES: ClassificationRule[] = [
  // Deep Work Apps & Sites
  { id: 'rule_1', name: 'VS Code', target: 'app', matchType: 'contains', pattern: 'code', categoryId: 'deep_work', priority: 100, enabled: true },
  { id: 'rule_2', name: 'Cursor', target: 'app', matchType: 'contains', pattern: 'cursor', categoryId: 'deep_work', priority: 100, enabled: true },
  { id: 'rule_3', name: 'Terminal', target: 'app', matchType: 'contains', pattern: 'terminal', categoryId: 'deep_work', priority: 100, enabled: true },
  { id: 'rule_4', name: 'PowerShell', target: 'app', matchType: 'contains', pattern: 'powershell', categoryId: 'deep_work', priority: 100, enabled: true },
  { id: 'rule_5', name: 'GitHub', target: 'domain', matchType: 'exact', pattern: 'github.com', categoryId: 'deep_work', priority: 100, enabled: true },
  { id: 'rule_6', name: 'Localhost', target: 'domain', matchType: 'contains', pattern: 'localhost', categoryId: 'deep_work', priority: 100, enabled: true },

  // Productive Sites
  { id: 'rule_7', name: 'Gmail', target: 'domain', matchType: 'contains', pattern: 'mail.google.com', categoryId: 'productive', priority: 80, enabled: true },
  { id: 'rule_8', name: 'Google Docs', target: 'domain', matchType: 'contains', pattern: 'docs.google.com', categoryId: 'productive', priority: 80, enabled: true },
  { id: 'rule_9', name: 'Google Calendar', target: 'domain', matchType: 'contains', pattern: 'calendar.google.com', categoryId: 'productive', priority: 80, enabled: true },
  { id: 'rule_10', name: 'YouTube Studio', target: 'domain', matchType: 'exact', pattern: 'studio.youtube.com', categoryId: 'productive', priority: 95, enabled: true },

  // Neutral Sites & Apps
  { id: 'rule_11', name: 'YouTube Music', target: 'domain', matchType: 'exact', pattern: 'music.youtube.com', categoryId: 'neutral', priority: 95, enabled: true },
  { id: 'rule_12', name: 'Spotify', target: 'domain', matchType: 'contains', pattern: 'spotify.com', categoryId: 'neutral', priority: 80, enabled: true },
  { id: 'rule_13', name: 'File Explorer', target: 'app', matchType: 'contains', pattern: 'explorer', categoryId: 'neutral', priority: 80, enabled: true },

  // Distracting & Highly Distracting Sites
  { id: 'rule_14', name: 'Instagram', target: 'domain', matchType: 'contains', pattern: 'instagram.com', categoryId: 'highly_distracting', priority: 90, enabled: true },
  { id: 'rule_15', name: 'Reddit', target: 'domain', matchType: 'contains', pattern: 'reddit.com', categoryId: 'highly_distracting', priority: 90, enabled: true },
  { id: 'rule_16', name: 'X / Twitter', target: 'domain', matchType: 'contains', pattern: 'x.com', categoryId: 'highly_distracting', priority: 90, enabled: true },
  { id: 'rule_17', name: 'Facebook', target: 'domain', matchType: 'contains', pattern: 'facebook.com', categoryId: 'highly_distracting', priority: 90, enabled: true },
  { id: 'rule_18', name: 'LinkedIn Feed', target: 'domain', matchType: 'contains', pattern: 'linkedin.com', categoryId: 'distracting', priority: 85, enabled: true },
  { id: 'rule_19', name: 'YouTube General', target: 'domain', matchType: 'exact', pattern: 'youtube.com', categoryId: 'highly_distracting', priority: 80, enabled: true },
];

/**
 * Classifies an event target (app name, title, domain, or full URL) against classification rules.
 */
export function classifyEvent(
  params: {
    app?: string;
    title?: string;
    url?: string;
    domain?: string;
  },
  rules: ClassificationRule[] = DEFAULT_CLASSIFICATION_RULES,
  categories: Category[] = DEFAULT_CATEGORIES
): { category: Category; matchedRule?: ClassificationRule } {
  // Sort rules by priority descending
  const sortedRules = [...rules].filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);

  // Special YouTube classification override
  if (params.url || params.domain) {
    const rawTarget = params.url || params.domain || '';
    const ytType = classifyYouTubeUrl(rawTarget);
    if (ytType === 'youtube_music') {
      const neutralCat = categories.find((c) => c.id === 'neutral') || DEFAULT_CATEGORIES[3];
      return { category: neutralCat };
    }
    if (ytType === 'youtube_studio') {
      const prodCat = categories.find((c) => c.id === 'productive') || DEFAULT_CATEGORIES[1];
      return { category: prodCat };
    }
  }

  for (const rule of sortedRules) {
    let targetValue = '';
    if (rule.target === 'app' && params.app) targetValue = params.app.toLowerCase();
    else if (rule.target === 'title' && params.title) targetValue = params.title.toLowerCase();
    else if (rule.target === 'domain' && params.domain) targetValue = params.domain.toLowerCase();
    else if (rule.target === 'url' && params.url) targetValue = params.url.toLowerCase();

    if (!targetValue) continue;

    const pattern = rule.pattern.toLowerCase();
    let isMatch = false;

    if (rule.matchType === 'exact') {
      isMatch = targetValue === pattern;
    } else if (rule.matchType === 'contains') {
      isMatch = targetValue.includes(pattern);
    } else if (rule.matchType === 'wildcard') {
      const regexPattern = '^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
      isMatch = new RegExp(regexPattern).test(targetValue);
    } else if (rule.matchType === 'regex') {
      try {
        isMatch = new RegExp(pattern, 'i').test(targetValue);
      } catch {
        isMatch = false;
      }
    }

    if (isMatch) {
      const foundCategory = categories.find((c) => c.id === rule.categoryId) || DEFAULT_CATEGORIES.find((c) => c.id === 'unknown')!;
      return { category: foundCategory, matchedRule: rule };
    }
  }

  const defaultUnknown = categories.find((c) => c.id === 'unknown') || DEFAULT_CATEGORIES.find((c) => c.id === 'unknown')!;
  return { category: defaultUnknown };
}
