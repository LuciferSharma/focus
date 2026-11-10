import { describe, expect, it } from 'vitest';
import {
  classifyEvent,
  classifyYouTubeUrl,
  extractDomain,
  sanitizeUrl,
} from '../packages/domain-rules/src/index';

describe('domain-rules', () => {
  it('extracts clean domain from URLs', () => {
    expect(extractDomain('https://www.youtube.com/watch?v=123')).toBe('youtube.com');
    expect(extractDomain('music.youtube.com/explore')).toBe('music.youtube.com');
    expect(extractDomain('http://localhost:5600/api/')).toBe('localhost');
  });

  it('sanitizes URL query parameters and fragments', () => {
    const raw = 'https://docs.google.com/document/d/123/edit?token=secret123#private';
    const sanitized = sanitizeUrl(raw, 'domain_and_path');
    expect(sanitized.domain).toBe('docs.google.com');
    expect(sanitized.path).toBe('/document/d/123/edit');
    expect(sanitized.url).toBe('https://docs.google.com/document/d/123/edit');
  });

  it('correctly classifies YouTube URL types', () => {
    expect(classifyYouTubeUrl('https://music.youtube.com')).toBe('youtube_music');
    expect(classifyYouTubeUrl('https://studio.youtube.com')).toBe('youtube_studio');
    expect(classifyYouTubeUrl('https://www.youtube.com/shorts/abc')).toBe('youtube_shorts');
    expect(classifyYouTubeUrl('https://www.youtube.com/feed/subscriptions')).toBe('youtube_feed');
    expect(classifyYouTubeUrl('https://www.youtube.com/')).toBe('youtube_homepage');
  });

  it('classifies YouTube Music as Neutral and YouTube Studio as Productive', () => {
    const musicRes = classifyEvent({ domain: 'music.youtube.com', url: 'https://music.youtube.com' });
    expect(musicRes.category.id).toBe('neutral');

    const studioRes = classifyEvent({ domain: 'studio.youtube.com', url: 'https://studio.youtube.com' });
    expect(studioRes.category.id).toBe('productive');
  });

  it('classifies VS Code and GitHub as Deep Work', () => {
    const codeRes = classifyEvent({ app: 'Code.exe', title: 'index.ts - FocusWatch' });
    expect(codeRes.category.id).toBe('deep_work');

    const ghRes = classifyEvent({ domain: 'github.com', url: 'https://github.com/repo' });
    expect(ghRes.category.id).toBe('deep_work');
  });

  it('classifies Instagram and Reddit as Highly Distracting', () => {
    const instaRes = classifyEvent({ domain: 'instagram.com' });
    expect(instaRes.category.id).toBe('highly_distracting');

    const redditRes = classifyEvent({ domain: 'reddit.com' });
    expect(redditRes.category.id).toBe('highly_distracting');
  });
});
