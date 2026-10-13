import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController } from '@ionic/angular/lazy';
import { Editor, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

/**
 * Small rich-text editor for Mitteilungen with a fixed toolbar (works on
 * phones, unlike the bubble menu of the protocol editor). Emits the Tiptap
 * JSON; HTML for recipients is rendered server-side from that JSON
 * (supabase/functions/_shared/message-render.ts), so only the nodes and marks
 * enabled here are supported there.
 */
@Component({
  selector: 'app-message-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toolbar" role="toolbar" aria-label="Formatierung">
      <button type="button" (mousedown)="$event.preventDefault()" (click)="cmd('toggleBold')" [class.active]="isActive('bold')" aria-label="Fett"><b>B</b></button>
      <button type="button" (mousedown)="$event.preventDefault()" (click)="cmd('toggleItalic')" [class.active]="isActive('italic')" aria-label="Kursiv"><i>I</i></button>
      <button type="button" (mousedown)="$event.preventDefault()" (click)="cmd('toggleUnderline')" [class.active]="isActive('underline')" aria-label="Unterstrichen"><u>U</u></button>
      <button type="button" (mousedown)="$event.preventDefault()" (click)="cmd('toggleStrike')" [class.active]="isActive('strike')" aria-label="Durchgestrichen"><s>S</s></button>
      <span class="sep"></span>
      <button type="button" (mousedown)="$event.preventDefault()" (click)="toggleHeading()" [class.active]="isActive('heading')" aria-label="Überschrift">H</button>
      <button type="button" (mousedown)="$event.preventDefault()" (click)="cmd('toggleBulletList')" [class.active]="isActive('bulletList')" aria-label="Aufzählung">&#8226;&#8801;</button>
      <button type="button" (mousedown)="$event.preventDefault()" (click)="cmd('toggleOrderedList')" [class.active]="isActive('orderedList')" aria-label="Nummerierte Liste">1&#8801;</button>
      <span class="sep"></span>
      <button type="button" (mousedown)="$event.preventDefault()" (click)="editLink()" [class.active]="isActive('link')" aria-label="Link">&#128279;</button>
      <button type="button" (mousedown)="$event.preventDefault()" (click)="cmd('undo')" aria-label="Rückgängig">&#8630;</button>
    </div>
    <div class="host-wrap">
      @if (empty) {
        <div class="placeholder">{{ placeholder }}</div>
      }
      <div #editorHost class="host"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      padding: 6px;
      border-bottom: 1px solid var(--ion-color-step-150, #e3e3e8);
      background: var(--ion-color-step-50, #fafafc);
    }
    .toolbar button {
      min-width: 34px;
      height: 34px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--ion-text-color, #1c1c1e);
      font-size: 15px;
      cursor: pointer;
    }
    .toolbar button.active {
      background: rgba(var(--ion-color-primary-rgb, 67, 142, 150), 0.15);
      color: var(--ion-color-primary);
    }
    .toolbar .sep {
      width: 1px;
      margin: 6px 3px;
      background: var(--ion-color-step-150, #e3e3e8);
    }
    .host-wrap { position: relative; }
    .placeholder {
      position: absolute;
      top: 12px;
      left: 14px;
      color: var(--ion-color-medium);
      pointer-events: none;
    }
    .host ::ng-deep .ProseMirror {
      min-height: 200px;
      padding: 12px 14px;
      outline: none;
      font-size: 15px;
      line-height: 1.5;
    }
    .host ::ng-deep .ProseMirror p { margin: 0 0 8px; }
    .host ::ng-deep .ProseMirror h2 { font-size: 1.2em; font-weight: 700; margin: 12px 0 6px; }
    .host ::ng-deep .ProseMirror h3 { font-size: 1.05em; font-weight: 700; margin: 10px 0 4px; }
    .host ::ng-deep .ProseMirror ul { padding-left: 1.4em; list-style: disc; margin: 0 0 8px; }
    .host ::ng-deep .ProseMirror ol { padding-left: 1.4em; list-style: decimal; margin: 0 0 8px; }
    .host ::ng-deep .ProseMirror a { color: var(--ion-color-primary); text-decoration: underline; }
  `],
})
export class MessageEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorHost') private editorHost: ElementRef<HTMLDivElement>;

  @Input() content: JSONContent | null = null;
  @Input() placeholder = 'Nachricht schreiben …';
  @Output() contentChange = new EventEmitter<JSONContent>();

  empty = true;

  private editor: Editor | null = null;
  private zone = inject(NgZone);
  private alertController = inject(AlertController);

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.editor = new Editor({
        element: this.editorHost.nativeElement,
        extensions: [
          StarterKit.configure({
            heading: { levels: [2, 3] },
            code: false,
            codeBlock: false,
            blockquote: false,
            horizontalRule: false,
            link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
          }),
        ],
        content: this.content ?? { type: 'doc', content: [] },
        onUpdate: ({ editor }) => {
          const json = editor.getJSON();
          this.zone.run(() => {
            this.empty = editor.isEmpty;
            this.contentChange.emit(json);
          });
        },
        onSelectionUpdate: () => this.zone.run(() => {}),
      });
      this.zone.run(() => this.empty = this.editor?.isEmpty ?? true);
    });
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }

  cmd(command: string): void {
    if (!this.editor) return;
    (this.editor.chain().focus() as any)[command]().run();
  }

  toggleHeading(): void {
    this.editor?.chain().focus().toggleHeading({ level: 2 }).run();
  }

  isActive(name: string): boolean {
    return this.editor?.isActive(name) ?? false;
  }

  async editLink(): Promise<void> {
    if (!this.editor) return;
    const current = (this.editor.getAttributes('link')['href'] as string) ?? '';
    const { from, to } = this.editor.state.selection;
    const hasSelection = from !== to;

    const alert = await this.alertController.create({
      header: 'Link',
      inputs: [
        { name: 'url', type: 'url', placeholder: 'https://…', value: current },
        ...(hasSelection || current ? [] : [{ name: 'text', type: 'text' as const, placeholder: 'Angezeigter Text (optional)' }]),
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        ...(current ? [{
          text: 'Entfernen',
          role: 'destructive',
          handler: () => { this.editor?.chain().focus().extendMarkRange('link').unsetLink().run(); },
        }] : []),
        {
          text: 'Übernehmen',
          handler: (data: { url?: string; text?: string }) => {
            let url = (data.url ?? '').trim();
            if (!url) return;
            if (!/^(https?:|mailto:|tel:)/i.test(url)) url = `https://${url}`;
            const chain = this.editor!.chain().focus();
            if (hasSelection || current) {
              chain.extendMarkRange('link').setLink({ href: url }).run();
            } else {
              const text = (data.text ?? '').trim() || url;
              chain.insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: url } }] }).run();
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
