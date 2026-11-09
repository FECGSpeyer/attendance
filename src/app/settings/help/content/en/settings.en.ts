import { HelpArticleTranslation } from '../types';

// Settings and team organisation.
export const SETTINGS_EN: Record<string, HelpArticleTranslation> = {
  'settings-general': {
    title: 'Club details and event types',
    keywords: ['general', 'change name', 'season', 'event type'],
    body: `Under "Settings → General" you maintain the club name, season start, default rehearsal times and the event types (e.g. rehearsal, performance, work day) including their default [[Run sheet|run sheet]] and [[Attendance status|attendance status]] cycle.`,
  },
  'settings-roles': {
    title: 'Configuring role permissions',
    keywords: ['role permissions', 'set permissions', 'visibility', 'share file storage'],
    body: `Under "Settings → Roles & permissions" you define for each [[Role|role]] what it can see and edit, e.g. whether [[Helper|helpers]] may see notes about people or whether a [[Checklist|checklist]] is visible to [[Member|members]]. As [[Administrator]] you also share the file storage with all members there via "File storage for all members".`,
  },
  'settings-notifications': {
    title: 'Setting up notifications',
    keywords: ['push', 'telegram', 'email notification'],
    body: `Under "Notifications" you enable push, Telegram or email notifications for yourself, e.g. for birthdays, new sign-ins/sign-outs or [[Critical person|critical people]]. Telegram is connected via @attendix_bot.

The individual switches determine what you get push messages for, e.g. "Announcements" (messages from admins and people in charge), "Event reminders" (automatic and manually sent reminders of events), "Duties" (assignments and stand-in requests in [[Duty mode|duty mode]], only visible if there are duties) or "Task reminders".`,
  },
  'settings-language': {
    title: 'Changing the app language',
    keywords: ['language', 'english', 'german', 'deutsch', 'translation', 'russian', 'spanish', 'push', 'email', 'telegram', 'calendar'],
    body: `Under "Settings → System → Language" you choose the language in which you see Attendix. Everyone can set this for themselves. After switching, the app reloads briefly.

As long as you do not choose anything, Attendix follows the language of your device. If that is not available, the app stays in German.

The language is saved to your account. You also get push messages, Telegram messages and emails from Attendix in this language, on your other devices too. New calendar subscriptions (Settings → Subscribe to calendar) also show status and notes in your language.

Only the texts of the app are translated. Content you create yourselves, such as group names, event titles, pieces or announcements, stays the way you wrote it. The release notes under "What's new?" are only available in German.`,
  },
  'settings-switch-instance': {
    title: 'Switching, favouriting or deleting an instance',
    keywords: ['switch instance', 'delete instance', 'delete club', 'favourite', 'swipe'],
    body: `Via "Settings → Switch instance" you see all [[Instance|instances]] your account is linked to.

Swipe an instance entry to the left to show two actions:
- **Star**: mark the instance as favourite (preferred when the app opens).
- **Bin**: delete the instance for good.

Deleting is only possible as [[Administrator]] and must be confirmed by typing the full instance name, because it cannot be undone.`,
  },
  'settings-feedback': {
    title: 'Sending feedback',
    keywords: ['feedback', 'contact', 'report error', 'report bug'],
    body: `Can't find an answer to your question here, or want to report an error or submit an idea? Use "Settings → Give feedback".`,
  },
  'settings-critical-rules': {
    title: 'Rules for critical people',
    keywords: ['problem case', 'critical rule', 'threshold', 'unexcused'],
    body: `Under "Settings → General" you define when someone counts as a [[Critical person|critical person]]. A rule consists of:

- **Threshold type**: a fixed number (e.g. "3 days missed") or a percentage (e.g. "20 % absence").
- **Period**: the last X days, since the start of the season or all time.
- **Statuses counted**: which [[Attendance status|attendance status]] values count (e.g. only "Absent", or also "Late").
- **Event types**: which event types the rule applies to.

You can create several rules and decide whether one rule being met is enough ("Or") or all must be met at the same time ("And").`,
  },
  'settings-extra-fields': {
    title: 'Creating additional fields',
    keywords: ['create additional field', 'own field', 'custom field', 'organisation-wide', 'shared person data', 'order', 'sort', 'move', 'arrange chips'],
    body: `Under "Settings → General → Additional fields" you create your own [[Additional field|additional fields]] for people or for [[Piece|pieces]], configurable separately.

Available field types: text, multi-line text, number, date, yes/no and selection (with your own options). For each field you can set a default value and decide whether [[Member|members]] may see it or edit it themselves.

You decide the order of the fields: drag a field up or down by the handle on the right and then tap "Save". The fields appear in exactly this order everywhere in the app, i.e. as chips and as text under the name in the lists of people and pieces, in the detail views and when editing. Organisation-wide fields always come before the instance's fields and are sorted the same way under the organisation's "Additional person fields".

These fields only apply to the current [[Instance|instance]]. If the instance belongs to an [[Organisation|organisation]], [[Administrator|administrators]] can also create organisation-wide person fields under "Settings → Organisation → Additional person fields". Their values are the same in all instances of the organisation as soon as the person is clearly matched via their Attendix account or via "Link people". Changes in one instance are then also visible in the other instances.`,
  },
  'settings-registration-link': {
    title: 'Sharing a registration link',
    keywords: ['invitation link', 'sign-up link', 'enable self-registration', 'copy link'],
    body: `Under "Settings → General" you enable "Allow registration" so new people can register themselves via a link. Attendix creates an individual link (attendix.de/register/…) that you can copy and share, e.g. via WhatsApp or email.

You also define which details are asked for during registration (name, date of birth, photo, [[Group|group]], [[Additional field|additional fields]] …) and whether new registrations are approved automatically or wait for approval as [[Applicant|applicants]].`,
  },
  'settings-delete-account': {
    title: 'Deleting your account completely',
    keywords: ['delete account', 'remove account', 'delete data'],
    body: `"Settings → Delete account" removes your Attendix account **completely and across all [[Instance|instances]]**, not just from the instance currently open. Your profile, all memberships and all attendance data linked to you are deleted.

For safety you have to type in a confirmation code that is shown. The process cannot be undone afterwards.`,
  },
  'team-overview': {
    title: 'What is team organisation?',
    keywords: ['team organisation', 'board', 'leadership team', 'meeting', 'committee', 'overview'],
    body: `With [[Team organisation|team organisation]] you prepare meetings, write the minutes and keep track of tasks afterwards, for example for the board, the leadership team or the conductors' meeting.

It consists of four parts, all attached to the **event**:

- **Topics:** In the [[Topic store|topic store]] the lead collects what should be discussed. Members can suggest topics.
- **Agenda:** A topic gets on the agenda when you add it to an event's run sheet. There it becomes its own [[Agenda item|agenda item]] with time, duration and person responsible. So the run sheet *is* the agenda, and its PDF export is the invitation.
- **Minutes:** During the meeting you take notes for each item of the run sheet and record the outcome. After [[Publish minutes|publishing]], everyone in the [[Audience|audience]] can read them.
- **Tasks:** What needs to be done by when, you create directly in the minutes. Each person sees their own tasks and ticks them off.

Team organisation is only visible if it is switched on for at least one event type (see "Switching on team organisation"). You then find it under **More → Planning → Team organisation**.`,
  },
  'team-activate': {
    title: 'Switching on team organisation',
    keywords: ['activate', 'switch on', 'enable', 'enable minutes', 'enable agenda', 'event type', 'minutes & agenda', 'not visible', 'missing'],
    body: `Team organisation is switched on per event type. [[Administrator|Administrators]] and [[Person in charge|people in charge]] can do this.

1. Open **More → Settings → Attendance types** and tap the type you want to write minutes for, e.g. "Board meeting". Feel free to create a separate event type for this.
2. Switch on **"Minutes & agenda"**.
3. Set the **relevant groups**. They determine the [[Audience|audience]]: whoever is in these groups can read published minutes and suggest topics. Without groups, all members belong to it.
4. Optional: set the **default duration per topic** and whether **postponed topics** are suggested at the top when scheduling.
5. In the type's default run sheet, insert the **"Agenda"** marker at the place where new topics should go.

As soon as a type is switched on, **More → Planning → Team organisation** appears, for the lead the "My tasks" card on the dashboard, and the minutes card on events of this type. If you switch it off for all types again, team organisation disappears; the data is kept.`,
  },
  'team-prepare': {
    title: 'Collecting topics and preparing a meeting',
    keywords: ['topic', 'topics', 'topic store', 'agenda', 'agenda item', 'invitation', 'schedule', 'add', 'postponed', 'duration', 'remove', 'take out', 'change event', 'switch event', 'create event', 'ad hoc', 'create meeting'],
    body: `**Collecting topics:** Under **More → Planning → Team organisation → Topics** the lead creates new topics with **+**, with description, priority, person responsible and duration. This also works weeks before the meeting; a topic only belongs to an event once you schedule it.

**Adding topics to the run sheet:** There are four ways:

- Open the event and tap **"Add topics"** in the run sheet. Choose the topics and adjust the duration if needed. Postponed topics are at the top.
- Open a topic and tap **"Schedule"** to add it to one of the next events. If none fits, tap **"Create new event"** there: choose type and date, and the topic goes straight into the new event.
- On the **Topics** tab of team organisation, tap **"Add topics"** at the next event. With **"Change"** you choose a later event instead or move the event to another day. If none is coming up, create one ad hoc there with **"Create event"** (or "Change → Create new event"): choose the type (if several types have minutes), choose the date, done. The event is created as usual for all people of the type.
- During the meeting, add a new topic spontaneously in the minutes with **"+ Item"**.

Each topic becomes its own [[Agenda item|agenda item]] at the "Agenda" marker (without a marker at the end of the plan). The times of the following items shift by its duration.

**Taking a topic out of an event again:** If something has changed, tap the agenda item at the event on the **Topics** tab and then **"Remove from this event"**. Or open **"Add topics"** and untick a topic that is already in the run sheet. The topic stays in the topic store and can be scheduled again later. The bin in a topic's detail view, on the other hand, deletes it completely.

**Sending the invitation:** Share the run sheet as usual as PDF or via Telegram. The topics appear there as "Item 1, Item 2, …" with time and person responsible.

**History of a topic:** In a topic's detail view you see in which meetings it was on the agenda and with what outcome.`,
  },
  'team-protocol': {
    title: 'Writing and publishing minutes',
    keywords: ['minutes', 'notes', 'topic done', 'finish', 'live', 'meeting', 'discussed', 'decided', 'postponed', 'outcome', 'publish', 'release', 'tablet', 'laptop', 'pdf', 'general notes', 'column width', 'columns', 'adjust width'],
    body: `Minutes are written by [[Administrator|administrators]] and [[Person in charge|people in charge]]. Open the event and tap **"Start meeting & take minutes"** in the minutes card.

**Structure:** The minutes have exactly one section per item of the run sheet, in the same order. For each [[Agenda item|agenda item]] you record the outcome: **Discussed**, **Decided** or **Postponed**. Postponed topics are suggested again at the next event of the same type. Tap the outlined field to write notes. To format (bold, heading, list), select text and a small toolbar appears.

**Notes:**
- *For an item:* directly in the respective section.
- *General* (e.g. "Paul is coming later"): on the phone via the **"Notes"** button at the bottom, on tablet and laptop in the right column, which is always visible.

**Tablet and laptop:** From a certain width you see the agenda on the left, the selected item in the middle and the general notes on the right. You can adjust the width of the left and right columns: drag the dividing line between two columns with the mouse or your finger. Double-clicking the line resets the width. The app remembers your setting on this device. With **Ctrl/⌘ + ↓** you jump to the next item.

**Live:** While the meeting is running, the minutes show which item is due according to the run sheet and how much time is left.

**Saving:** Everything is saved automatically, section by section. Several people can write in different sections at the same time.

**Publishing:** Tap **"Publish"**. After that, everyone in the [[Audience|audience]] of the event type can read the minutes. Those present and people with tasks from the meeting are notified and, if desired, also get the minutes as PDF. In the publish window you also see all open topics that were **decided** or **discussed**: decided ones are already preselected to be ticked off as done, discussed ones are not. Adjust the ticks before publishing. You can keep editing published minutes; they then show "changed on …".

Those present are taken from the event's attendance.`,
  },
  'team-tasks': {
    title: 'Assigning and completing tasks',
    keywords: ['task', 'tasks', 'to-do', 'todo', 'assign', 'responsible', 'due', 'due date', 'reminder', 'overdue', 'tick off', 'done', 'my tasks'],
    body: `**Creating tasks** is up to the lead: in the minutes with **"Task"** at an item, in a topic or under **More → Planning → Team organisation → Tasks** with **+**. A task can be assigned to any active person of the instance, with a due date and priority (Low, Medium or High).

**Notifications:** The person responsible gets a message when a task is assigned to them, a reminder two days before it is due, and a one-off message when the task is overdue. You can switch this off in the notification settings under "Tasks".

**Seeing your own tasks:**
- *Lead:* **"My tasks"** card on the dashboard.
- *Members:* **"My tasks"** block at the top of "My events" and under **More → Planning → My tasks**.

**Completing:** Tap the circle in front of the task. Members can only change the status of their tasks; title, due date and person are changed by the lead.

**Overview for the lead:** Under Team organisation → Tasks, all tasks are grouped by due date (overdue, this week, later, no date) and can be filtered by person. Completed tasks are hidden after 30 days; "Show older completed" brings them back.`,
  },
  'team-suggest': {
    title: 'Suggesting topics',
    keywords: ['suggestion', 'suggest', 'suggest topic', 'idea', 'concern', 'submit', 'member'],
    body: `Everyone in the [[Audience|audience]] of an event type with "Minutes & agenda" can suggest topics, but not [[Parent|parents]] and [[Applicant|applicants]].

1. Open **More → Planning → Suggest topic**.
2. Enter a title and optionally a short description and send the suggestion.

The lead sees new suggestions in team organisation under **Topics** and can accept or decline them, with a short reason if they like. You get a message about the decision and can see the status ("Waiting", "Accepted", "Declined") in your list at any time. Accepted suggestions end up in the [[Topic store|topic store]].`,
  },
  'team-visibility': {
    title: 'Who sees what in team organisation?',
    keywords: ['rights', 'permission', 'visible', 'read', 'audience', 'who can', 'members', 'lead', 'groups'],
    body: `- **Lead** ([[Administrator|administrators]] and [[Person in charge|people in charge]]): sees and edits all topics, agendas, minutes (including drafts) and tasks.
- **[[Audience]] of an event type:** reads the published minutes of this type, can suggest topics and sees their own suggestions.
- **Every person with a task:** sees their own tasks and can tick them off, even outside the audience.
- **[[Parent|Parents]] and [[Applicant|applicants]]** do not see team organisation.

The audience results from the **relevant groups** of the event type. If the type has no groups, all members belong to it. There is no separate role permission for this.

Drafts are only visible to the lead; the audience only sees the minutes after they are published.`,
  },
  'team-meetings-migration': {
    title: 'Meetings and minutes',
    keywords: ['meetings', 'old meetings', 'migration', 'where are', 'earlier minutes', 'meeting event', 'event type meeting'],
    body: `There used to be a "Meetings" area in the settings with free-form notes. You now take minutes of new meetings with team organisation: the minutes are attached to the event and take over the agenda from the run sheet.

Meetings that were already migrated can be found as minutes under **More → Planning → Team organisation → Minutes**; their notes are there under "General notes". Each migrated meeting is attached to its own event of the type **"Meeting"** on the same day. We created this type in instances without a minutes type; only the main group is relevant there, and the run sheet already contains the placeholder for the agenda. You can adjust it under **More → Settings → Attendance types**. The old "Meetings" area no longer exists.`,
  },
};
