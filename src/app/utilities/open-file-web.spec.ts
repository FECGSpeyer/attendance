import { afterEach, describe, expect, it, vi } from 'vitest';
import { Utils } from './Utils';

const mockDisplayMode = (standalone: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query.includes('standalone') }));
};

describe('Utils.openFileNative (web)', () => {
  afterEach(() => {
    document.querySelector('.app-file-viewer')?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens a new tab in a regular browser', async () => {
    mockDisplayMode(false);
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await Utils.openFileNative('https://example.com/noten.pdf', 'noten.pdf');
    expect(open).toHaveBeenCalledWith('https://example.com/noten.pdf', '_blank');
    expect(document.querySelector('.app-file-viewer')).toBeNull();
  });

  it('shows PDFs inside the installed web app instead of opening a window', async () => {
    mockDisplayMode(true);
    const open = vi.spyOn(window, 'open');
    await Utils.openFileNative('https://example.com/noten.pdf', 'noten.pdf');
    expect(open).not.toHaveBeenCalled();
    const frame = document.querySelector('.app-file-viewer iframe') as HTMLIFrameElement;
    expect(frame.src).toBe('https://example.com/noten.pdf');
    expect(document.querySelector('.app-file-viewer__title')?.textContent).toBe('noten.pdf');
  });

  it('shows a hint for files without preview and closes on Escape', async () => {
    mockDisplayMode(true);
    await Utils.openFileNative('https://example.com/satz.sib', 'satz.sib');
    expect(document.querySelector('.app-file-viewer iframe')).toBeNull();
    expect(document.querySelector('.app-file-viewer__body p')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.app-file-viewer')).toBeNull();
  });
});
