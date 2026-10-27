import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { TranslocoModule } from '@jsverse/transloco';

interface Point {
  x: number;
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const TAP_SLOP_PX = 10;
const DISMISS_DISTANCE_PX = 110;
const DISMISS_VELOCITY = 0.6; // px per ms

/**
 * Fullscreen image viewer meant to be placed inside an `ion-modal`
 * (with `class="image-viewer-modal"`).
 *
 * Gestures: pinch to zoom around the fingers, double tap / double click to
 * zoom into the tapped spot (and back), drag to pan with inertia, mouse wheel
 * or trackpad pinch to zoom at the cursor, swipe down to close when not
 * zoomed, single tap to hide/show the controls. Keyboard: Esc, +, -, 0.
 *
 * Extra actions can be projected into the bottom bar via `[viewerActions]`.
 */
@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [CommonModule, IonicModule, TranslocoModule],
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.scss'],
})
export class ImageViewerComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) src = '';
  @Input() title = '';
  @Input() fallbackSrc = '';
  @Output() closed = new EventEmitter<void>();

  @ViewChild('stage', { static: true }) stageRef: ElementRef<HTMLDivElement>;
  @ViewChild('image', { static: true }) imageRef: ElementRef<HTMLImageElement>;

  public loading = signal(true);
  public failed = signal(false);
  public chromeVisible = signal(true);
  public showHint = signal(false);
  public zoomPercent = signal(100);
  public backdropOpacity = signal(1);

  private scale = 1;
  private tx = 0;
  private ty = 0;
  private dismissY = 0;

  private pointers = new Map<number, Point>();
  private gesture: 'none' | 'pan' | 'pinch' | 'dismiss' = 'none';
  private startScale = 1;
  private startTx = 0;
  private startTy = 0;
  private startDist = 0;
  private startMid: Point = { x: 0, y: 0 };
  private startPoint: Point = { x: 0, y: 0 };
  private downAt = 0;
  private moved = false;
  private multiTouchUsed = false;
  private lastTapAt = 0;
  private lastTapPoint: Point = { x: 0, y: 0 };
  private singleTapTimer: ReturnType<typeof setTimeout> | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private velocity: Point = { x: 0, y: 0 };
  private lastMove = { x: 0, y: 0, t: 0 };
  private inertiaFrame = 0;
  private closing = false;

  ngAfterViewInit(): void {
    this.applyTransform(false);
    try {
      if (!localStorage.getItem('imageViewerHintSeen')) {
        this.showHint.set(true);
        this.hintTimer = setTimeout(() => this.showHint.set(false), 3200);
        localStorage.setItem('imageViewerHintSeen', '1');
      }
    } catch {
      // storage unavailable, skip the hint
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
    cancelAnimationFrame(this.inertiaFrame);
  }

  // ---------- public actions ----------

  close(): void {
    if (this.closing) {
      return;
    }
    this.closing = true;
    this.closed.emit();
  }

  zoomIn(): void {
    this.zoomTo(this.scale * 1.6, { x: 0, y: 0 });
  }

  zoomOut(): void {
    this.zoomTo(this.scale / 1.6, { x: 0, y: 0 });
  }

  resetZoom(): void {
    this.zoomTo(1, { x: 0, y: 0 });
  }

  onImageLoad(): void {
    this.loading.set(false);
    this.fitImage();
  }

  /** Size the image to fill the screen (also upscaling small pictures). */
  @HostListener('window:resize')
  fitImage(): void {
    const img = this.imageRef?.nativeElement;
    const stage = this.stageRef?.nativeElement;
    if (!img?.naturalWidth || !stage) {
      return;
    }
    const fit = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight);
    img.style.width = `${img.naturalWidth * fit}px`;
    img.style.height = `${img.naturalHeight * fit}px`;
    this.settle();
  }

  onImageError(): void {
    const img = this.imageRef.nativeElement;
    if (this.fallbackSrc && !img.src.endsWith(this.fallbackSrc)) {
      img.src = this.fallbackSrc;
      return;
    }
    this.loading.set(false);
    this.failed.set(true);
  }

  // ---------- keyboard ----------

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.close();
        break;
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
        this.zoomOut();
        break;
      case '0':
        this.resetZoom();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // ---------- wheel / trackpad ----------

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    cancelAnimationFrame(this.inertiaFrame);
    // Trackpad pinch arrives as ctrl+wheel with small deltas; scale it up.
    const intensity = event.ctrlKey ? 0.01 : 0.0025;
    const factor = Math.exp(-event.deltaY * intensity);
    this.zoomAt(this.scale * factor, this.toCenter(event.clientX, event.clientY), false);
  }

  // ---------- pointer gestures ----------

  onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    cancelAnimationFrame(this.inertiaFrame);
    this.stageRef.nativeElement.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 1) {
      this.downAt = performance.now();
      this.moved = false;
      this.multiTouchUsed = false;
      this.startPoint = { x: event.clientX, y: event.clientY };
      this.beginSinglePointer();
    } else if (this.pointers.size === 2) {
      this.multiTouchUsed = true;
      this.beginPinch();
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) {
      return;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.gesture === 'pinch' && this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }

    const dx = event.clientX - this.startPoint.x;
    const dy = event.clientY - this.startPoint.y;
    if (!this.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) {
      this.moved = true;
    }
    if (!this.moved) {
      return;
    }

    this.trackVelocity(event.clientX, event.clientY);

    if (this.gesture === 'pan') {
      const rawX = this.startTx + dx;
      const rawY = this.startTy + dy;
      const bounds = this.bounds(this.scale);
      this.tx = this.rubberBand(rawX, -bounds.x, bounds.x);
      this.ty = this.rubberBand(rawY, -bounds.y, bounds.y);
      this.applyTransform(false);
    } else if (this.gesture === 'dismiss') {
      this.dismissY = dy;
      this.tx = dx * 0.4;
      this.backdropOpacity.set(Math.max(0.15, 1 - Math.abs(dy) / 400));
      this.applyTransform(false);
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) {
      return;
    }
    this.pointers.delete(event.pointerId);

    if (this.pointers.size === 1) {
      // One finger lifted after a pinch: continue as a pan with the other one.
      const [remaining] = Array.from(this.pointers.values());
      this.startPoint = { ...remaining };
      this.moved = true;
      this.beginSinglePointer();
      if (this.gesture === 'dismiss') {
        this.gesture = 'none';
      }
      return;
    }
    if (this.pointers.size > 0) {
      return;
    }

    const wasTap = !this.moved && !this.multiTouchUsed && performance.now() - this.downAt < 350;
    const gesture = this.gesture;
    this.gesture = 'none';

    if (wasTap) {
      this.handleTap(event.clientX, event.clientY);
      return;
    }

    if (gesture === 'dismiss') {
      this.finishDismiss();
    } else if (gesture === 'pan' && this.scale >= MIN_SCALE && this.scale <= MAX_SCALE) {
      this.startInertia();
    } else {
      this.settle();
    }
  }

  // ---------- gesture helpers ----------

  private beginSinglePointer(): void {
    this.startTx = this.tx;
    this.startTy = this.ty;
    this.velocity = { x: 0, y: 0 };
    this.lastMove = { x: this.startPoint.x, y: this.startPoint.y, t: performance.now() };
    this.gesture = this.scale > 1.01 ? 'pan' : 'dismiss';
    this.dismissY = 0;
  }

  private beginPinch(): void {
    const [a, b] = Array.from(this.pointers.values());
    this.gesture = 'pinch';
    this.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    this.startMid = this.toCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
    this.startScale = this.scale;
    this.startTx = this.tx;
    this.startTy = this.ty + this.dismissY;
    this.dismissY = 0;
    this.backdropOpacity.set(1);
  }

  private updatePinch(): void {
    const [a, b] = Array.from(this.pointers.values());
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = this.toCenter((a.x + b.x) / 2, (a.y + b.y) / 2);

    let next = this.startScale * (dist / this.startDist);
    // Soft limits so over-pinching feels elastic instead of stuck.
    if (next < MIN_SCALE) {
      next = MIN_SCALE - (MIN_SCALE - next) * 0.4;
    } else if (next > MAX_SCALE) {
      next = MAX_SCALE + (next - MAX_SCALE) * 0.3;
    }

    const ratio = next / this.startScale;
    // Keep the point under the fingers fixed, and follow the midpoint.
    this.tx = mid.x - (this.startMid.x - this.startTx) * ratio;
    this.ty = mid.y - (this.startMid.y - this.startTy) * ratio;
    this.scale = next;
    this.applyTransform(false);
  }

  private handleTap(clientX: number, clientY: number): void {
    const now = performance.now();
    const point = { x: clientX, y: clientY };
    const isDouble =
      now - this.lastTapAt < DOUBLE_TAP_MS &&
      Math.hypot(point.x - this.lastTapPoint.x, point.y - this.lastTapPoint.y) < 40;

    if (isDouble) {
      this.lastTapAt = 0;
      if (this.singleTapTimer) {
        clearTimeout(this.singleTapTimer);
        this.singleTapTimer = null;
      }
      if (this.scale > 1.01) {
        this.zoomTo(1, { x: 0, y: 0 });
      } else {
        this.zoomTo(DOUBLE_TAP_SCALE, this.toCenter(clientX, clientY));
      }
      return;
    }

    this.lastTapAt = now;
    this.lastTapPoint = point;
    this.singleTapTimer = setTimeout(() => {
      this.singleTapTimer = null;
      this.chromeVisible.update((v) => !v);
    }, DOUBLE_TAP_MS);
  }

  private finishDismiss(): void {
    const shouldClose =
      Math.abs(this.dismissY) > DISMISS_DISTANCE_PX || Math.abs(this.velocity.y) > DISMISS_VELOCITY;

    if (shouldClose) {
      const direction = this.dismissY < 0 ? -1 : 1;
      this.dismissY = direction * window.innerHeight;
      this.backdropOpacity.set(0);
      this.applyTransform(true);
      setTimeout(() => this.close(), 180);
      return;
    }

    this.dismissY = 0;
    this.tx = 0;
    this.backdropOpacity.set(1);
    this.applyTransform(true);
  }

  private startInertia(): void {
    let { x: vx, y: vy } = this.velocity;
    if (Math.hypot(vx, vy) < 0.05) {
      this.settle();
      return;
    }

    let last = performance.now();
    const step = (time: number) => {
      const dt = Math.min(32, time - last);
      last = time;
      this.tx += vx * dt;
      this.ty += vy * dt;
      const decay = Math.pow(0.94, dt / 16);
      vx *= decay;
      vy *= decay;

      const bounds = this.bounds(this.scale);
      const outX = Math.abs(this.tx) > bounds.x;
      const outY = Math.abs(this.ty) > bounds.y;
      if (outX) {
        vx *= 0.5;
      }
      if (outY) {
        vy *= 0.5;
      }
      this.applyTransform(false);

      if (Math.hypot(vx, vy) > 0.02 && !(outX && outY)) {
        this.inertiaFrame = requestAnimationFrame(step);
      } else {
        this.settle();
      }
    };
    this.inertiaFrame = requestAnimationFrame(step);
  }

  /** Animate back into valid scale/position bounds. */
  private settle(): void {
    const scale = this.clampScale(this.scale);
    const bounds = this.bounds(scale);
    this.scale = scale;
    this.tx = this.clamp(this.tx, -bounds.x, bounds.x);
    this.ty = this.clamp(this.ty, -bounds.y, bounds.y);
    this.dismissY = 0;
    this.backdropOpacity.set(1);
    this.applyTransform(true);
  }

  /** Animated zoom keeping `focus` (relative to the stage centre) in place. */
  private zoomTo(target: number, focus: Point): void {
    cancelAnimationFrame(this.inertiaFrame);
    this.zoomAt(target, focus, true);
  }

  private zoomAt(target: number, focus: Point, animate: boolean): void {
    const next = this.clampScale(target);
    const ratio = next / this.scale;
    this.tx = focus.x - (focus.x - this.tx) * ratio;
    this.ty = focus.y - (focus.y - this.ty) * ratio;
    this.scale = next;
    const bounds = this.bounds(next);
    this.tx = this.clamp(this.tx, -bounds.x, bounds.x);
    this.ty = this.clamp(this.ty, -bounds.y, bounds.y);
    this.applyTransform(animate);
  }

  private trackVelocity(x: number, y: number): void {
    const now = performance.now();
    const dt = now - this.lastMove.t;
    if (dt > 0) {
      const vx = (x - this.lastMove.x) / dt;
      const vy = (y - this.lastMove.y) / dt;
      // Smooth to avoid spikes from irregular event timing.
      this.velocity = { x: this.velocity.x * 0.2 + vx * 0.8, y: this.velocity.y * 0.2 + vy * 0.8 };
    }
    this.lastMove = { x, y, t: now };
  }

  /** Maximum translation per axis so the image edge never leaves the screen edge. */
  private bounds(scale: number): Point {
    const stage = this.stageRef.nativeElement;
    const img = this.imageRef.nativeElement;
    const w = img.clientWidth * scale;
    const h = img.clientHeight * scale;
    return {
      x: Math.max(0, (w - stage.clientWidth) / 2),
      y: Math.max(0, (h - stage.clientHeight) / 2),
    };
  }

  private toCenter(clientX: number, clientY: number): Point {
    const rect = this.stageRef.nativeElement.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  private rubberBand(value: number, min: number, max: number): number {
    if (value < min) {
      return min - (min - value) * 0.35;
    }
    if (value > max) {
      return max + (value - max) * 0.35;
    }
    return value;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private clampScale(value: number): number {
    return this.clamp(value, MIN_SCALE, MAX_SCALE);
  }

  private applyTransform(animate: boolean): void {
    const img = this.imageRef?.nativeElement;
    if (!img) {
      return;
    }
    img.classList.toggle('animating', animate);
    img.style.transform = `translate3d(${this.tx}px, ${this.ty + this.dismissY}px, 0) scale(${this.scale})`;
    this.zoomPercent.set(Math.round(this.scale * 100));
  }

  private clearTimers(): void {
    if (this.singleTapTimer) {
      clearTimeout(this.singleTapTimer);
    }
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
    }
  }
}
