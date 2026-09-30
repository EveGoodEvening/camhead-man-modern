// P3r3 (open-play e): 微信 toast previews.
import { describe, expect, it } from 'vitest';
import { cutPreview } from './wx';

describe('cutPreview', () => {
  it('drops trailing punctuation before the ellipsis', () => {
    expect(cutPreview('\u8FD9\u5F20\uFF0C')).toBe('\u8FD9\u5F20');
    expect(cutPreview('\u8FD9\u5F20\u3002 ')).toBe('\u8FD9\u5F20');
    expect(cutPreview('\u300C\u62C6\u300D')).toBe('\u300C\u62C6\u300D');
  });
});
