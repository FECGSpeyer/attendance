import { describe, expect, it } from 'vitest';
import { ancestorFilePaths, canMoveInto, isBlockedTarget, isCurrentLocation, isSameOrInside, parentFilePath } from './file-move';

describe('file move helpers', () => {
  it('detects paths inside a folder without prefix false positives', () => {
    expect(isSameOrInside('Noten/2026', 'Noten')).toBe(true);
    expect(isSameOrInside('Noten', 'Noten')).toBe(true);
    expect(isSameOrInside('Noten-Archiv', 'Noten')).toBe(false);
    expect(isSameOrInside('anything', '')).toBe(true);
  });

  it('blocks moving a folder into itself or a subfolder', () => {
    const items = [{ path: 'Noten', isFolder: true }, { path: 'a.pdf', isFolder: false }];
    expect(isBlockedTarget('Noten', items)).toBe(true);
    expect(isBlockedTarget('Noten/2026', items)).toBe(true);
    expect(isBlockedTarget('Noten-Archiv', items)).toBe(false);
    expect(isBlockedTarget('', items)).toBe(false);
  });

  it('treats the folder the items already live in as no target', () => {
    const items = [{ path: 'Proben/a.mp3', isFolder: false }, { path: 'Proben/b.mp3', isFolder: false }];
    expect(isCurrentLocation('Proben', items)).toBe(true);
    expect(canMoveInto('Proben', items)).toBe(false);
    expect(canMoveInto('', items)).toBe(true);
    expect(canMoveInto('Archiv', items)).toBe(true);
    expect(canMoveInto('Archiv', [])).toBe(false);
  });

  it('builds parent and ancestor paths', () => {
    expect(parentFilePath('a/b/c.pdf')).toBe('a/b');
    expect(parentFilePath('c.pdf')).toBe('');
    expect(ancestorFilePaths('a/b')).toEqual(['', 'a', 'a/b']);
    expect(ancestorFilePaths('')).toEqual(['']);
  });
});
