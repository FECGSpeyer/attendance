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
});
