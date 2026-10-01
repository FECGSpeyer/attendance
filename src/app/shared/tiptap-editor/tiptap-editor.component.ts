import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
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
import { AgendaItemNode } from './extensions/agenda-item-node';
import { TaskRefNode } from './extensions/task-ref-node';

@Component({
  selector: 'app-tiptap-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #editorHost class="tiptap-host"></div>
  `,
  styles: [`
    :host { display: block; }
    .tiptap-host :global(.ProseMirror) {
      min-height: 120px;
      padding: 8px;
      outline: none;
      font-family: inherit;
    }
    .tiptap-host :global(.agenda-item-ref-node),
    .tiptap-host :global(.task-ref-node) {
      background: var(--ion-color-light);
      border-left: 3px solid var(--ion-color-secondary);
      border-radius: 4px;
      padding: 6px 10px;
      margin: 4px 0;
      font-size: 0.9em;
      cursor: default;
      user-select: none;
    }
    .tiptap-host :global(.task-ref-node) {
      border-left-color: var(--ion-color-primary);
    }
  `]
})
export class TiptapEditorComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('editorHost') private editorHost: ElementRef<HTMLDivElement>;

  @Input() content: Record<string, unknown> | null = null;
  @Input() editable = true;
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
          AgendaItemNode,
          TaskRefNode,
        ],
        content: (this.content as JSONContent) ?? { type: 'doc', content: [] },
        editable: this.editable,
        onUpdate: ({ editor }) => {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            const json = editor.getJSON();
            this.zone.run(() => this.contentChange.emit(json));
          }, 600);
        },
      });
    });
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

  ngOnDestroy() {
    clearTimeout(this.debounceTimer);
    this.editor?.destroy();
  }
}
