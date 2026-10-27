import { Node, mergeAttributes } from '@tiptap/core';
import { translate } from '@jsverse/transloco';

const STATUS_KEYS: Record<string, string> = {
  open: 'tasks.status.open',
  in_progress: 'tasks.status.inProgress',
  completed: 'tasks.status.completed',
};

/** Text of a task reference; `status` is the live status when known. */
export function taskRefText(title: string, status: string | undefined): string {
  const key = STATUS_KEYS[status ?? ''];
  const label = key ? translate(key) : status ?? '';
  return label ? `${status === 'completed' ? '✅' : '📋'} ${title} · ${label}` : `📋 ${title}`;
}

export const TaskRefNode = Node.create<Record<string, never>, { statuses: Record<string, string> }>({
  name: 'taskRef',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    // Live task statuses (id → status), set by the host page. The `status`
    // attribute is only the status at the time the task was inserted.
    return { statuses: {} };
  },

  addAttributes() {
    return {
      id: { default: null },
      title: { default: '' },
      status: { default: 'open' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="task-ref"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'task-ref',
      class: 'task-ref-node',
    }), taskRefText(HTMLAttributes['title'], HTMLAttributes['status'])];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'task-ref-node';
      dom.dataset['type'] = 'task-ref';
      dom.dataset['taskId'] = node.attrs['id'] ?? '';
      dom.dataset['title'] = node.attrs['title'] ?? '';
      dom.dataset['status'] = node.attrs['status'] ?? '';
      const live = node.attrs['id'] ? this.storage.statuses[node.attrs['id']] : undefined;
      dom.textContent = taskRefText(node.attrs['title'], live ?? node.attrs['status']);
      return { dom };
    };
  },
});
