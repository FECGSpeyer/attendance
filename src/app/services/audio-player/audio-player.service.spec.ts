import { AudioPlayerService, AudioQueueItem } from './audio-player.service';

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  paused = true;
  currentTime = 0;
  duration = 100;

  constructor() {
    super();
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {}

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = '';
    }
  }
}

const item = (name: string): AudioQueueItem => ({
  fileName: name,
  title: name,
  resolveUrl: () => Promise.resolve(`https://example.com/${name}`),
});

describe('AudioPlayerService queue', () => {
  let service: AudioPlayerService;
  const originalAudio = globalThis.Audio;

  beforeEach(() => {
    FakeAudio.instances = [];
    (globalThis as any).Audio = FakeAudio;
    service = new AudioPlayerService();
  });

  afterEach(() => {
    (globalThis as any).Audio = originalAudio;
  });

  it('starts at the given index and exposes navigation state', async () => {
    await service.playQueue([item('a.mp3'), item('b.mp3'), item('c.mp3')], 1);

    expect(service.currentFile()?.fileName).toBe('b.mp3');
    expect(service.hasQueue()).toBe(true);
    expect(service.hasPrevious()).toBe(true);
    expect(service.hasNext()).toBe(true);
  });

  it('skips forward and backward', async () => {
    await service.playQueue([item('a.mp3'), item('b.mp3')], 0);

    await service.next();
    expect(service.currentFile()?.fileName).toBe('b.mp3');
    expect(service.hasNext()).toBe(false);

    await service.previous();
    expect(service.currentFile()?.fileName).toBe('a.mp3');
  });

  it('restarts the current track on previous after a few seconds', async () => {
    await service.playQueue([item('a.mp3'), item('b.mp3')], 1);
    FakeAudio.instances[0].currentTime = 10;

    await service.previous();

    expect(service.currentFile()?.fileName).toBe('b.mp3');
    expect(FakeAudio.instances[0].currentTime).toBe(0);
  });

  it('plays the next track automatically when one ends', async () => {
    await service.playQueue([item('a.mp3'), item('b.mp3')], 0);

    FakeAudio.instances[0].dispatchEvent(new Event('ended'));
    await new Promise(resolve => setTimeout(resolve));

    expect(service.currentFile()?.fileName).toBe('b.mp3');
    expect(FakeAudio.instances[0].src).toBe('https://example.com/b.mp3');
  });

  it('stays on the last track when it ends', async () => {
    await service.playQueue([item('a.mp3'), item('b.mp3')], 1);

    FakeAudio.instances[0].dispatchEvent(new Event('ended'));
    await new Promise(resolve => setTimeout(resolve));

    expect(service.currentFile()?.fileName).toBe('b.mp3');
    expect(service.isPlaying()).toBe(false);
  });

  it('clears the queue when a single file is played', async () => {
    await service.playQueue([item('a.mp3'), item('b.mp3')], 0);

    service.play({ url: 'x', fileName: 'single.mp3', fileType: 'audio/mpeg', created_at: '' }, 'Song');

    expect(service.hasQueue()).toBe(false);
    expect(service.hasNext()).toBe(false);
  });

  it('pre-resolves the next track URL only once', async () => {
    const resolveB = vi.fn(() => Promise.resolve('https://example.com/b.mp3'));
    const b: AudioQueueItem = { fileName: 'b.mp3', title: 'b', resolveUrl: resolveB };

    await service.playQueue([item('a.mp3'), b], 0);
    expect(resolveB).toHaveBeenCalledTimes(1);

    await service.next();
    expect(resolveB).toHaveBeenCalledTimes(1);
    expect(service.currentFile()?.url).toBe('https://example.com/b.mp3');
  });
});

describe('AudioPlayerService media session', () => {
  let service: AudioPlayerService;
  const originalAudio = globalThis.Audio;
  const handlers = new Map<string, (details: any) => void>();
  const session: any = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: (action: string, handler: (details: any) => void) => handlers.set(action, handler),
    setPositionState: vi.fn(),
  };

  beforeEach(() => {
    handlers.clear();
    FakeAudio.instances = [];
    (globalThis as any).Audio = FakeAudio;
    (globalThis as any).MediaMetadata = class { constructor(init: any) { Object.assign(this, init); } };
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
    service = new AudioPlayerService();
  });

  afterEach(() => {
    (globalThis as any).Audio = originalAudio;
    delete (globalThis as any).MediaMetadata;
    delete (navigator as any).mediaSession;
  });

  it('shows the current track and skips via lock screen controls', async () => {
    await service.playQueue([item('a.mp3'), item('b.mp3')], 0);
    expect(session.metadata.title).toBe('a.mp3');

    handlers.get('nexttrack')!({ action: 'nexttrack' });
    await new Promise(resolve => setTimeout(resolve));
    expect(service.currentFile()?.fileName).toBe('b.mp3');
    expect(session.metadata.title).toBe('b.mp3');

    handlers.get('previoustrack')!({ action: 'previoustrack' });
    await new Promise(resolve => setTimeout(resolve));
    expect(service.currentFile()?.fileName).toBe('a.mp3');
  });

  it('pauses and resumes from the lock screen', async () => {
    await service.playQueue([item('a.mp3')], 0);
    const audio = FakeAudio.instances[0];

    handlers.get('pause')!({ action: 'pause' });
    expect(audio.paused).toBe(true);
    expect(service.isPlaying()).toBe(false);

    handlers.get('play')!({ action: 'play' });
    await new Promise(resolve => setTimeout(resolve));
    expect(audio.paused).toBe(false);
    expect(service.isPlaying()).toBe(true);
  });

  it('shows the Attendix logo as cover', async () => {
    await service.playQueue([item('a.mp3')], 0);
    expect(session.metadata.title).toBe('a.mp3');
    expect(session.metadata.artwork?.[0].src).toMatch(/\/assets\/icons\/icon-256\.webp$/);
  });

  it('prefers the branding logo as cover', async () => {
    service.coverUrl = () => 'https://example.com/logo.png';
    await service.playQueue([item('a.mp3')], 0);
    expect(session.metadata.artwork?.[0].src).toBe('https://example.com/logo.png');
  });

  it('clears the lock screen when stopped', async () => {
    await service.playQueue([item('a.mp3')], 0);
    service.stop();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });
});
