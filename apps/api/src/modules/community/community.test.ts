import { describe, expect, it } from 'vitest';
import { platformOf } from './community.service.js';

describe('creator video links (P-008)', () => {
  it('accepts https links to TikTok, YouTube and Instagram only', () => {
    expect(platformOf('https://www.tiktok.com/@kampalacars/video/123')).toBe('tiktok');
    expect(platformOf('https://vm.tiktok.com/ZM123/')).toBe('tiktok');
    expect(platformOf('https://youtu.be/abc')).toBe('youtube');
    expect(platformOf('https://m.youtube.com/watch?v=abc')).toBe('youtube');
    expect(platformOf('https://www.instagram.com/reel/abc/')).toBe('instagram');
    expect(platformOf('http://www.youtube.com/watch?v=abc')).toBeUndefined();
    expect(platformOf('https://youtube.com.evil.example/watch')).toBeUndefined();
    expect(platformOf('https://user:pass@youtube.com/watch')).toBeUndefined();
    expect(platformOf('javascript:alert(1)')).toBeUndefined();
  });
});
