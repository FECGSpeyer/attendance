import { Node, mergeAttributes } from '@tiptap/core';

export const TaskRefNode = Node.create({
  name: 'taskRef',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

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
    }), `✅ ${HTMLAttributes['title']} · ${HTMLAttributes['status']}`];
  },
});
