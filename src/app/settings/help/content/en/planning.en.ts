import { HelpArticleTranslation } from '../types';

// Run sheets, pieces and self-service.
export const PLANNING_EN: Record<string, HelpArticleTranslation> = {
  'plan-create': {
    title: 'Creating a run sheet',
    keywords: ['create plan', 'create programme', 'schedule', 'add field', 'programme item', 'info text', 'note', 'description'],
    body: `Under "Planning" you choose an event and create a [[Run sheet|run sheet]]: a sequence of programme items (pieces, speeches, breaks), each with its duration and start time. The end time is calculated automatically from the duration of all items.

**Adding an item:** In the schedule, tap **+** and then **Add field**. Next to name, performer and duration you can also enter an optional **info text**, for example a song title or a note. The info text appears in small print under the programme item. To change it later, tap the item.

With "Reset" you can return to the default programme items of the event type at any time; changes you have made are lost.`,
  },
  'plan-multiple': {
    title: 'Several run sheets for one event',
    keywords: ['several plans', 'another plan', 'multi-day', 'retreat', 'weekend', 'day', 'day plan', 'per day', 'second run sheet'],
    body: `An event can have more than one [[Run sheet|run sheet]], for example one for each day of a retreat, or a rehearsal and a concert on the same day.

**Creating a plan:** Open the run sheet in the editor, tap **+** in the schedule and, at the very bottom, **Create another run sheet**. You then decide whether the new plan takes over the current schedule as a **copy** or starts **empty**. Agenda topics always stay in the first plan.

**Names:** For multi-day events the plans are named after their day automatically (e.g. "Sat 18.10."), otherwise "Plan 1", "Plan 2" and so on.

**Switching and managing:** As soon as there is more than one plan, a bar with small chips appears above the schedule. With **⋯** next to it you can rename the selected plan, assign it to another day, move it or delete it. If only one plan is left, the bar disappears again.

**What members see:** On the event page, in the view for members and parents and via the share link, the same chips appear. Today's plan is selected automatically, otherwise the first one. The dashboard card "Current plan" also shows the plan for today.

**Sharing and PDF:** When sharing, you choose at the top whether only the plan currently shown or all plans are exported. "All" produces one PDF with one page per plan.`,
  },
  'plan-blocks': {
    title: 'Programme blocks with sub-items',
    keywords: ['programme block', 'block', 'sub-item', 'sub-items', 'group', 'programme', 'nested', 'indent', 'youth choir', 'children programme', 'block template', 'ad-hoc', 'planning tool', 'public'],
    body: `Some programme items consist of several parts, for example "Youth choir programme" with songs and a poem. That is what **programme blocks** are for.

**Creating a block:** In the run sheet editor, tap **+** in the schedule and then **Add programme block**. Enter a name and optionally a performer. Then you create the first sub-item right away. Add more sub-items with **Add sub-item** at the end of the block.

**Times:** The duration of the block results automatically from its sub-items. The first sub-item starts with the block, after that the schedule continues as normal.

**Sorting:** If you drag the block by its handle, all sub-items move with it. Drag a normal programme item between two sub-items to make it part of the block. If you drag a sub-item out of the block, it becomes a normal item again. Alternatively, swipe an item to the left and tap **Indent** or **Outdent**. The arrow on the left collapses or expands a block.

**Editing a block:** Tap the block name. There you can edit the block, **dissolve** it (the sub-items stay as normal items) or delete it completely.

**Block templates:** Admins can save a block with **Save as template**. Saved blocks appear in the **+** menu under "Programme blocks" and are added to the end of the schedule with one tap. Admins delete a template again with the bin icon next to it.

**Ad-hoc run sheets and the public planning tool:** The ad-hoc run sheet (Settings › Ad-hoc run sheet) and the public planning tool at attendix.de/planung also offer **Add programme block** in the **+** menu. Creating, sorting, indenting and outdenting work just like in the run sheet editor. When you are signed in, you can also insert your group's block templates there. With an edit link, blocks are moved together with their sub-items as well.

**What members see:** On the event page, in the plan view, on the dashboard card and in the PDF, sub-items appear indented under their block. In live mode the running sub-item is marked, and the block stays highlighted as long as one of its sub-items is running.`,
  },
  'plan-live-activity': {
    title: 'Running run sheet on the lock screen',
    keywords: ['live activity', 'dynamic island', 'lock screen', 'lockscreen', 'live update', 'countdown', 'time left', 'current item', 'notification', 'iphone', 'android'],
    body: `While a [[Run sheet|run sheet]] is running, the Attendix app shows the current programme item in large print with the time left on your lock screen, below it a bar for the whole schedule and the next item with its time. Long titles may take two lines. On the iPhone it also appears in the Dynamic Island, on Android as an ongoing notification with a countdown.

**When:** The display starts automatically 15 minutes before the first item. Until the start it shows a countdown and the first programme items with their times. After that it moves on to the next item by itself and disappears 15 minutes after the end. If the plan is changed during the event, the display is up to date within a minute at the latest. The plan runs by the clock: when an item's time is up, the time left stays at 0:00 briefly until the next item appears. On the iPhone the display moves on to the next item by itself within a minute, even without a connection.

**Who:** Everyone who may see the run sheet: admins and people in charge always, everyone else if the plan is shared with members. Observers never see the run sheet, so they get no display either. Anyone who has signed out of the event does not get one.

**Several plans:** For events with several plans (e.g. one per day of a retreat), the plan that is currently running is shown.

**Tapping** opens the run sheet in the app in live mode.

**Switching off:** Under Settings → Notifications → **Running run sheet**. On the iPhone the automatic start needs iOS 17.2 or later; on older versions the display appears as soon as you open the app during the event. The feature is only available in the app from the App Store or Play Store, not in the browser.`,
  },
  'plan-conductor': {
    title: 'Assigning a lead/conductor',
    keywords: ['choose conductor', 'choir leader', 'lead'],
    body: `Each programme item in the [[Run sheet|run sheet]] can be assigned a lead (conductor/choir leader). Attendix suggests people from the [[History|history]] of the respective [[Piece|piece]].`,
  },
  'plan-templates': {
    title: 'Plan templates & default fields',
    keywords: ['template', 'default field', 'organisation', 'reusable'],
    body: `Under **Settings → Organisation → Plan templates & fields** (or **Settings → Planning → Plan templates & fields**) two kinds of planning aids can be defined at organisation level:

**Default fields** are reusable single fields (e.g. "Welcome 5 min") with name, performer and duration. They appear in the planning menu and in ad-hoc run sheets under the "Fields" section and can be added to the current schedule with one tap.

**Templates** are complete run sheets with a name, an optional start time and any number of fields (including piece placeholders). In the planning menu they appear under "Templates"; one tap replaces the current schedule completely. In ad-hoc run sheets they appear in the template selection as "(Org)" entries.

Both templates and default fields are available to all instances of the organisation.`,
  },
  'plan-share': {
    title: 'Exporting and sharing a run sheet',
    keywords: ['pdf export', 'share', 'link', 'telegram', 'ad-hoc', 'image'],
    body: `A finished [[Run sheet|run sheet]] can be exported as PDF, sent via Telegram or shared via a public link. When sharing via link you can decide whether viewers can only look at the plan or also follow it live while it is updated during the event.

If an event has several run sheets, you can choose when sharing whether only the plan shown or all plans end up in one PDF (see "Several run sheets for one event").

The ad-hoc run sheet (Settings › Ad-hoc run sheet) can also send the plan via Telegram, as PDF, PDF 2x A5 or image. The options appear when exporting and sharing once you are signed in and have connected Telegram in your notifications.`,
  },
  'songs-add': {
    title: 'Adding a piece',
    keywords: ['add piece', 'sheet music library', 'new piece', 'song'],
    body: `Under "Pieces" you create a new [[Piece|piece]] with number, name, difficulty and categories. Optionally you can store matching sheet music files (PDF) for each [[Group|group]]/voice.`,
  },
  'songs-filter': {
    title: 'Searching and filtering pieces',
    keywords: ['search', 'filter', 'difficulty', 'last played', 'last sung', 'planned', 'not sung yet', 'prefix', 'song book', 'load more', 'scroll'],
    body: `The list of pieces can be filtered with the search field (title, number or prefix with number, e.g. "LB12") as well as by instrument, difficulty or date of the last performance. That way you quickly find, for example, all pieces that have not been played for a long time. Under each piece you see when it was last sung or played. If it is already planned for a future event, it also says "Planned on …", and for new pieces "Not sung yet · Planned on …". Only events that have already taken place count for "Last sung" and for sorting. For large lists Attendix shows the first 100 pieces first and loads more automatically as you scroll down.`,
  },
  'songs-import': {
    title: 'Importing pieces',
    keywords: ['bulk import', 'import list', 'csv'],
    body: `Larger lists of pieces can be imported. Attendix tries to assign instruments/voices to the matching [[Group|groups]] automatically based on the file names.`,
  },
  'songs-export-pdf': {
    title: 'Exporting the list of pieces as PDF',
    keywords: ['pdf export', 'print list of pieces', 'export list', 'pdf'],
    body: `Via the menu (three dots at the top right) you can export the current list of pieces as PDF. The list is exported as currently filtered and sorted, including all visible columns such as difficulty, last sung and custom fields.`,
  },
  'songs-group-directory': {
    title: 'Printing the group directory and music folder',
    keywords: ['group directory', 'music folder', 'voice', 'sheet music of a group', 'score', 'conductors', 'print'],
    body: `Via "Group directory" in the list of pieces you choose a [[Group|group]] and see all sheet music files stored for this group. With the printer icon at the top right you print the group's complete music folder at once.

If scores are stored, there is also the group "Conductors", which contains all scores. The group directory is also available if your instance does not use piece categories.`,
  },
  'songs-sync': {
    title: 'Sharing pieces with another instance (piece sync)',
    keywords: ['piece sync', 'synchronise', 'source instance', 'share pieces', 'shared pieces', 'merge pieces', 'delete piece'],
    body: `Linked [[Instance|instances]] can use a shared piece library. As super admin you choose a source instance under "Organisation → Piece sync". Your instance then shows the pieces, categories and sheet music files of the source instance, and all changes are saved there. Events and history stay separate per instance.

Important when deleting: a piece exists only once for all instances involved. If you delete it, it is gone everywhere, including the history of all instances. Attendix points this out when deleting and names the instances affected.`,
  },
  'self-signout': {
    title: 'Signing myself in or out',
    keywords: ['sign out', 'sign in', 'my events', 'signout', 'sign-up fields', 'note', 'change answers', 'edit registration', 'accept', 'late', 'decline', 'today', 'next event', 'more options', 'past events', 'attendance rate'],
    body: `Under "My attendance" you see your greeting at the top with your attendance rate and how often you were late. Below are the tiles "Current pieces" and "Report absence", if they are enabled for you.

Today's event (or the next one) has its own card. There you sign in or out directly with "Accept", "Late" or "Decline". You can tap the small markers such as "Run sheet", "Info", "Attachment", "Files" or "Route" directly to open the plan, the description, the attachment, the file storage or the navigation. Everything else, e.g. signing in with a note or sign-up fields, is under the link "More options". It only lists what is not already visible as a button or marker on the card. Tapping the card itself does not open a menu.

The upcoming events are grouped by month. Each event shows the date on the left, time and place below it and your [[Attendance status|attendance status]] on the right. Notes such as sign-up deadline, note, run sheet or info appear as small markers. Tap an event to change your status. If you sign out, you can optionally choose an [[Absence reason|absence reason]].

Under "Past" you see your rate, coloured dots for your recent events and the last three events. "Show all" expands the whole list.

If an event has sign-up fields (e.g. "Joining for dinner?"), the app asks for them when you sign in, even if you choose "Sign in with note": first you enter your note, then you fill in the sign-up fields.

If you are already signed in, tap the event and choose "Edit sign-up fields" to change your answers afterwards. This works as long as the event's sign-up deadline has not passed.`,
  },
  'self-pause': {
    title: 'Entering a planned absence',
    keywords: ['pause', 'enter holiday', 'plan absence', 'period', 'vacation'],
    body: `If you already know in advance that you cannot come for a period (e.g. holiday), you can enter it with a from/to date and a reason. Attendix automatically marks you as absent for all events affected.`,
  },
  'self-children': {
    title: 'Keeping attendance for my child',
    keywords: ['parents', 'sign in child', 'parent', 'all children', 'sign out children'],
    body: `As a [[Parent|parent]] you also see your children's events under "My attendance" and can keep their [[Attendance status|attendance status]] just like your own.

Each event is a card listing your children with their status. Tap a child to change only their status, or "All" to sign all children in or out at once. Today's event (or the next one) is at the top in its own card. For past events you see each child's status directly in the row.`,
  },
  'self-overview': {
    title: 'All my events across several instances',
    keywords: ['overview', 'all events', 'instances', 'chronological', 'by instance', 'several groups', 'total overview'],
    body: `If you are a member of several instances, you find all your events from all instances in one place under "Overview". At the top is your attendance rate across all instances.

In the "Chronological" view the next event has its own card. There you sign in or out directly with "Accept", "Late" or "Decline"; more actions are under "More options". Below follow the upcoming events grouped by month and the past events (the last three, the rest via "Show all"). A coloured dot with a name shows which instance an event belongs to.

In the "By instance" view you see the events per instance. Tap an upcoming event to change your [[Attendance status|attendance status]]. Markers such as "Info", "Attachment", "Files" or "Route" open the description, the attachment, the file storage or the navigation directly.`,
  },
};
