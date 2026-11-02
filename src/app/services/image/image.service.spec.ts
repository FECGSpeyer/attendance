import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageCalls: { op: string; args: any[] }[] = [];
const playerUpdates: { values: any; match: any }[] = [];

vi.mock('../base/supabase', () => {
  const bucket = {
    remove: vi.fn(async (...args: any[]) => { storageCalls.push({ op: 'remove', args }); return { error: null }; }),
    copy: vi.fn(async (...args: any[]) => { storageCalls.push({ op: 'copy', args }); return { error: null }; }),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/profiles/${path}` } })),
  };
  return {
    supabase: {
      storage: { from: () => bucket },
      from: () => ({
        update: (values: any) => ({
          match: async (match: any) => { playerUpdates.push({ values, match }); return { error: null }; },
        }),
      }),
    },
  };
});

import { ImageService } from './image.service';
import { DEFAULT_IMAGE } from '../../utilities/constants';

describe('ImageService.copyProfileImage', () => {
  const svc = new ImageService();

  beforeEach(() => {
    storageCalls.length = 0;
    playerUpdates.length = 0;
  });

  it('copies a profiles bucket picture to the new player id', async () => {
    const url = await svc.copyProfileImage('https://x.supabase.co/storage/v1/object/public/profiles/111?v=1', 222);
    expect(storageCalls.find(c => c.op === 'copy')?.args).toEqual(['111', '222']);
    expect(url).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/profiles\/222\?v=\d+$/);
    expect(playerUpdates).toEqual([{ values: { img: url }, match: { id: 222 } }]);
  });

  it('reuses external URLs without copying', async () => {
    const url = await svc.copyProfileImage('https://example.com/pic.jpg', 222);
    expect(storageCalls).toEqual([]);
    expect(url).toBe('https://example.com/pic.jpg');
    expect(playerUpdates[0].values.img).toBe('https://example.com/pic.jpg');
  });

  it('skips empty, default and data URLs', async () => {
    for (const img of [null, '', DEFAULT_IMAGE, 'data:image/png;base64,AAA']) {
      expect(await svc.copyProfileImage(img, 222)).toBeNull();
    }
    expect(storageCalls).toEqual([]);
    expect(playerUpdates).toEqual([]);
  });
});
