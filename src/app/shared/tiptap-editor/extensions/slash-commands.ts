import { Editor, Extension } from '@tiptap/core';
import { AgendaItem } from 'src/app/utilities/interfaces';

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
      title: 'Überschrift 1',
      description: 'Große Überschrift',
      action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: 'Überschrift 2',
      description: 'Mittlere Überschrift',
      action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: 'Aufzählung',
      description: 'Ungeordnete Liste',
      action: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      title: 'Nummerierte Liste',
      description: 'Geordnete Liste',
      action: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      title: '/aufgabe – Neue Aufgabe',
      description: 'Aufgabe erstellen und verknüpfen',
      action: (e) => onCreateTask(e),
    },
    ...agendaItems.map(item => ({
      title: `/tagesordnung – ${item.title}`,
      description: 'Tagesordnungspunkt einfügen',
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
