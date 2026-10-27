import { Editor, Extension } from '@tiptap/core';
import { AgendaItem } from 'src/app/utilities/interfaces';
import { translate } from '@jsverse/transloco';

export interface SlashCommandItem {
  title: string;
  description: string;
  action: (editor: Editor) => void;
}

function buildCommandItems(
  editor: Editor,
  agendaItems: AgendaItem[],
  onCreateTask: (editor: Editor) => void,
): SlashCommandItem[] {
  const items: SlashCommandItem[] = [
    {
      title: translate('editor.h1'),
      description: translate('editor.h1Desc'),
      action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: translate('editor.h2'),
      description: translate('editor.h2Desc'),
      action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: translate('editor.bulletList'),
      description: translate('editor.bulletDesc'),
      action: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      title: translate('editor.orderedList'),
      description: translate('editor.orderedDesc'),
      action: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      title: translate('editor.newTask'),
      description: translate('editor.newTaskDesc'),
      action: (e) => onCreateTask(e),
    },
    ...agendaItems.map(item => ({
      title: `/tagesordnung – ${item.title}`,
      description: translate('editor.agendaDesc'),
      action: (e: Editor) => {
        e.chain().focus().insertContent({
          type: 'agendaItemRef',
          attrs: { id: item.id, title: item.title, status: item.status, priority: item.priority },
        }).run();
      },
    })),
  ];
  return items;
}

export interface SlashCommandsOptions {
  agendaItems: AgendaItem[];
  onCreateTask: (editor: Editor) => void;
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      agendaItems: [],
      onCreateTask: () => {},
    };
  },

  addKeyboardShortcuts() {
    return {
      '/': () => {
        // The menu is shown via DOM approach in the component — handled there
        return false;
      },
    };
  },
});
