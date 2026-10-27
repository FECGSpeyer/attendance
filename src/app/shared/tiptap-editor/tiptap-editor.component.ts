import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import { Placeholder } from '@tiptap/extensions';
import { AgendaItemNode } from './extensions/agenda-item-node';
import { TaskRefNode, taskRefText } from './extensions/task-ref-node';
import { translate } from '@jsverse/transloco';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-tiptap-editor',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  template: `
    <div #bubbleMenuEl class="tiptap-bubble-menu">
      <button (mousedown)="$event.preventDefault(); cmd('toggleBold')"       [class.active]="isActive('bold')">        <b>B</b></button>
      <button (mousedown)="$event.preventDefault(); cmd('toggleItalic')"     [class.active]="isActive('italic')">      <i>I</i></button>
      <button (mousedown)="$event.preventDefault(); cmd('toggleUnderline')"  [class.active]="isActive('underline')">   <u>U</u></button>
      <button (mousedown)="$event.preventDefault(); cmd('toggleStrike')"     [class.active]="isActive('strike')">      <s>S</s></button>
      <span class="sep"></span>
      <button (mousedown)="$event.preventDefault(); setHeading(1)"  [class.active]="isActive('heading', {level:1})">H1</button>
      <button (mousedown)="$event.preventDefault(); setHeading(2)"  [class.active]="isActive('heading', {level:2})">H2</button>
      <button (mousedown)="$event.preventDefault(); setHeading(3)"  [class.active]="isActive('heading', {level:3})">H3</button>
      <span class="sep"></span>
      <button (mousedown)="$event.preventDefault(); cmd('toggleBulletList')"  [class.active]="isActive('bulletList')"> &#8226;&#8226;</button>
      <button (mousedown)="$event.preventDefault(); cmd('toggleOrderedList')" [class.active]="isActive('orderedList')">1.</button>
    </div>
    <div #editorHost class="tiptap-host"></div>
  `,
  styles: [`
    :host { display: block; position: relative; }

    .tiptap-bubble-menu {
      /* Hidden until text is selected; the bubble menu plugin shows it. */
      visibility: hidden;
      opacity: 0;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 6px;
      background: var(--ion-color-dark, #222);
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      z-index: 100;
    }
    .tiptap-bubble-menu button {
      background: none;
      border: none;
      color: #fff;
      font-size: 14px;
      padding: 4px 7px;
      border-radius: 5px;
      cursor: pointer;
      line-height: 1;
      min-width: 28px;
      transition: background 0.1s;
    }
    .tiptap-bubble-menu button:hover,
    .tiptap-bubble-menu button.active {
      background: rgba(255,255,255,0.2);
    }
    .tiptap-bubble-menu .sep {
      width: 1px;
      height: 18px;
      background: rgba(255,255,255,0.25);
      margin: 0 2px;
    }

    .tiptap-host ::ng-deep .ProseMirror {
      min-height: 120px;
      padding: 8px;
      outline: none;
      font-family: inherit;
      /* Tiptap's default 'break-spaces' makes Safari split words mid-word;
         wrap at spaces and only break a word longer than the whole line. */
      white-space: pre-wrap;
      word-break: normal;
      overflow-wrap: break-word;
      hyphens: manual;
    }
    :host(.editable) .tiptap-host ::ng-deep .ProseMirror {
      cursor: text;
    }
    /* Empty editor: show where to write. */
    .tiptap-host ::ng-deep .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      height: 0;
      pointer-events: none;
      color: var(--ion-color-medium);
    }
    .tiptap-host ::ng-deep .ProseMirror h1 { font-size: 1.4em; font-weight: 700; margin: 0.5em 0 0.2em; }
    .tiptap-host ::ng-deep .ProseMirror h2 { font-size: 1.2em; font-weight: 700; margin: 0.5em 0 0.2em; }
    .tiptap-host ::ng-deep .ProseMirror h3 { font-size: 1.05em; font-weight: 700; margin: 0.5em 0 0.2em; }
    .tiptap-host ::ng-deep .ProseMirror ul  { padding-left: 1.4em; list-style: disc; }
    .tiptap-host ::ng-deep .ProseMirror ol  { padding-left: 1.4em; list-style: decimal; }
    .tiptap-host ::ng-deep .ProseMirror li  { margin: 2px 0; }

    .tiptap-host ::ng-deep .agenda-item-ref-node,
    .tiptap-host ::ng-deep .task-ref-node {
      background: var(--ion-color-light);
      border-left: 3px solid var(--ion-color-secondary);
      border-radius: 4px;
      padding: 6px 10px;
      margin: 4px 0;
      font-size: 0.9em;
      cursor: default;
      user-select: none;
    }
    .tiptap-host ::ng-deep .task-ref-node {
      border-left-color: var(--ion-color-primary);
    }
  `]
})
export class TiptapEditorComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('editorHost')   private editorHost:   ElementRef<HTMLDivElement>;
  @ViewChild('bubbleMenuEl') private bubbleMenuEl: ElementRef<HTMLDivElement>;

  @Input() content: Record<string, unknown> | null = null;
  @Input() editable = true;
  // Optional key so a host page with several editors can find the right one.
  @Input() sectionId?: string;
  /** Hint shown while the editor is empty and editable. */
  @Input() placeholder = translate('editor.notesPlaceholder');
  @HostBinding('class.editable') get isEditableHost() { return this.editable; }
  /** Live task statuses (id → status) for task references in the text. */
  @Input() taskStatuses: Record<string, string> | null = null;
  private dirty = false;
  @Output() contentChange = new EventEmitter<JSONContent>();

  private editor: Editor | null = null;
  private debounceTimer: any;
  private zone = inject(NgZone);

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      this.editor = new Editor({
        element: this.editorHost.nativeElement,
        extensions: [
          StarterKit,
          Highlight,
          TextAlign.configure({ types: ['heading', 'paragraph'] }),
          Link,
          Underline,
          TaskList,
          TaskItem.configure({ nested: true }),
          BubbleMenu.configure({
            element: this.bubbleMenuEl.nativeElement,
            shouldShow: ({ editor, state }) => {
              const { from, to } = state.selection;
              // show only when text is selected and not inside a custom atom node
              return from !== to &&
                !editor.isActive('agendaItemRef') &&
                !editor.isActive('taskRef');
            },
          }),
          AgendaItemNode,
          TaskRefNode,
          Placeholder.configure({
            placeholder: () => (this.editable ? this.placeholder : ''),
          }),
        ],
        onBeforeCreate: ({ editor }) => {
          editor.storage['taskRef'].statuses = this.taskStatuses ?? {};
        },
        content: (this.content as JSONContent) ?? { type: 'doc', content: [] },
        editable: this.editable,
        onUpdate: ({ editor }) => {
          this.dirty = true;
          clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.dirty = false;
            const json = editor.getJSON();
            this.zone.run(() => this.contentChange.emit(json));
          }, 600);
        },
        onSelectionUpdate: () => {
          // re-run change detection so [class.active] bindings update
          this.zone.run(() => {});
        },
      });
    });
  }

  cmd(command: string) {
    if (!this.editor) return;
    (this.editor.chain().focus() as any)[command]().run();
  }

  setHeading(level: 1 | 2 | 3) {
    if (!this.editor) return;
    if (this.editor.isActive('heading', { level })) {
      this.editor.chain().focus().setParagraph().run();
    } else {
      this.editor.chain().focus().setHeading({ level }).run();
    }
  }

  isActive(name: string, attrs?: Record<string, unknown>): boolean {
    return this.editor?.isActive(name, attrs) ?? false;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['content'] && this.editor && !changes['content'].firstChange) {
      const incoming = changes['content'].currentValue;
      if (incoming && JSON.stringify(incoming) !== JSON.stringify(this.editor.getJSON())) {
        this.editor.commands.setContent(incoming as JSONContent, { emitUpdate: false });
      }
    }
    if (changes['editable'] && this.editor) {
      this.editor.setEditable(this.editable);
    }
    if (changes['taskStatuses'] && this.editor) {
      this.refreshTaskRefs();
    }
  }

  /** Shows the current status on every task reference without touching the document. */
  private refreshTaskRefs() {
    const statuses = this.taskStatuses ?? {};
    this.editor!.storage['taskRef'].statuses = statuses;
    this.editorHost.nativeElement.querySelectorAll<HTMLElement>('.task-ref-node[data-task-id]').forEach(el => {
      const id = el.dataset['taskId'];
      el.textContent = taskRefText(el.dataset['title'] ?? '', (id && statuses[id]) || el.dataset['status']);
    });
  }

  insertAgendaItemRef(attrs: { id: string; title: string; status: string; priority: string }) {
    this.editor?.chain().focus().insertContent({ type: 'agendaItemRef', attrs }).run();
  }

  insertTaskRef(attrs: { id: string; title: string; status: string }) {
    this.editor?.chain().focus().insertContent({ type: 'taskRef', attrs }).run();
  }

  getJSON(): JSONContent | null {
    return this.editor?.getJSON() ?? null;
  }

  /** True while a user change has not been emitted via contentChange yet. */
  get hasPendingChange(): boolean {
    return this.dirty;
  }

  /** Returns the pending change (if any) right away and cancels the debounced emit. */
  takePendingChange(): JSONContent | null {
    if (!this.dirty || !this.editor) return null;
    clearTimeout(this.debounceTimer);
    this.dirty = false;
    return this.editor.getJSON();
  }

  ngOnDestroy() {
    clearTimeout(this.debounceTimer);
    this.editor?.destroy();
  }
}
