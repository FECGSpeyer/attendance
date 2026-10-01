import { Node, mergeAttributes } from '@tiptap/core';

export interface AgendaItemRefAttrs {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export const AgendaItemNode = Node.create({
  name: 'agendaItemRef',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      title: { default: '' },
      status: { default: 'open' },
      priority: { default: 'medium' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="agenda-item-ref"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'agenda-item-ref',
      class: 'agenda-item-ref-node',
    }), `📋 ${HTMLAttributes['title']} · ${HTMLAttributes['status']} · ${HTMLAttributes['priority']}`];
  },
});
