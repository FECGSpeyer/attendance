import { HelpArticleTranslation } from '../types';

// Getting started, attendance and people.
export const BASICS_EN: Record<string, HelpArticleTranslation> = {
  'gs-overview': {
    title: 'What is Attendix?',
    keywords: ['start', 'introduction', 'overview', 'app'],
    body: `Attendix helps orchestras, choirs and similar groups record attendance, manage [[Piece|pieces]], plan rehearsals and performances and keep track of their members.

It works in the browser on a laptop just as well as an app on your smartphone. What you can see and do depends on your [[Role|role]] in the current [[Instance|instance]].

For the board or leadership team there is [[Team organisation]]: agenda in the run sheet, minutes and tasks, all directly on the event (see "What is team organisation?").`,
  },
  'gs-navigation': {
    title: 'How is the app structured?',
    keywords: ['tabs', 'navigation', 'menu', 'overview'],
    body: `At the bottom of the app you find different tabs depending on your [[Role|role]], e.g. Dashboard, Attendance, Members, Pieces and Settings.

- **Dashboard**: overview of upcoming events, birthdays and important notes (only for [[Administrator]] and [[Person in charge]]).
- **Attendance**: create events and keep the [[Attendance status|attendance status]] of members.
- **Members**: list of people with their [[Personal details|personal details]].
- **Pieces**: the club's sheet music library.
- **Settings**: club details, notifications, roles and help.

Members without management rights usually only see "My attendance" and "Pieces" instead.`,
  },
  'gs-switch-instance': {
    title: 'Switching between several instances',
    keywords: ['switch instance', 'switch club', 'several clubs'],
    body: `If your account is linked to several [[Instance|instances]] (e.g. because you are active in several clubs), you can switch at any time via "Switch instance" in the settings. All data shown (people, events, pieces) always refers only to the instance currently selected.`,
  },
  'att-list-layout': {
    title: 'Reading the event overview',
    keywords: ['event list', 'events overview', 'open run sheet', 'upcoming events', 'past events', 'next event', 'percent', 'average', 'month'],
    body: `Under "Events", conductors and helpers see today's event (or the next one) at the top as a large card, with the expected attendance and how many people are present, excused or absent. Tap the card to record attendance. If the event has a run sheet, open it via "Run sheet" right in the card; if the event is currently running, the plan starts in live mode. Before the first item nothing is highlighted yet; instead, the time until the start counts down next to "Start". The pencil at the top right takes you straight to the editor to change the plan. In the list of upcoming events, the plan icon also leads directly to the run sheet.

Below that, the upcoming events follow, grouped by month. The date is on the left; highlighted event types have a coloured date tile. On the right you see the attendance in percent: green from 75 %, yellow from 50 %, otherwise red.

Under "Past" you find the average and the last three events; "Show all" expands the whole list. Conductors can still delete an event by swiping left.`,
  },
  'att-mark-status': {
    title: 'Marking attendance',
    keywords: ['change status', 'present', 'absent', 'excused', 'late'],
    body: `Open an event in the "Attendance" area and tap the status next to a person to move it on. The [[Attendance status|attendance status]] changes in a fixed order, e.g. Neutral → Present → Excused → Late → Absent.

Which steps are part of the cycle can be configured per event type in the settings under "General" (e.g. without "Late" if that is not relevant for an instance).`,
  },
  'att-excuse-reason': {
    title: 'Excusing an absence with a reason',
    keywords: ['absence reason', 'ill', 'sick', 'excuse', 'choose reason'],
    body: `When setting the status "Excused" or "Late", you can pick an [[Absence reason|absence reason]] or [[Lateness reason|lateness reason]] from a predefined list (e.g. "Illness", "Holiday"). This list can be adjusted per instance in the settings.`,
  },
  'att-change-date': {
    title: 'Moving an event to another day',
    keywords: ['change date', 'move', 'reschedule', 'other day', 'move event', 'date', 'reset status'],
    body: `Open the event, expand **General** and tap **Date**. Pick the new day and confirm. For an event with an agenda you can also do this in team organisation on the **Topics** tab via **Change → Change date of this event**.

If people already have a status other than the default status of the type, Attendix asks: **Reset** sets everyone back to the default status, **Keep** leaves the existing responses in place.

Moving an event also does the following:
- The sign-up deadline and the deadlines of the [[Checklist|checklist]] move by the same number of days.
- The pieces of the event get the new date in the [[History|history]].
- Shifts are checked again for the new day, and absences entered for the new day excuse the people concerned.`,
  },
  'att-checklist': {
    title: 'Checklist for an event',
    keywords: ['tasks', 'todo', 'deadline', 'due'],
    body: `For every event you can add a [[Checklist|checklist]] with tasks, e.g. "Bring sheet music" or "Book the room". Each item can optionally get a deadline relative to the event (1 hour, 1 day, 2 days or 1 week before), so you get reminded in time.`,
  },
  'att-checklist-deadlines': {
    title: 'Spotting checklist deadlines',
    keywords: ['overdue', 'deadline passed', 'checklist red', 'warning'],
    body: `If a [[Checklist|checklist]] item has a deadline, Attendix shows both the exact time and a relative note (e.g. "in 3 hours") in the event. If the deadline has passed and the item is not done yet, it is highlighted in colour (yellow = due soon, red = overdue) so nothing gets forgotten.`,
  },
  'att-songs-plan': {
    title: 'Adding pieces to an event',
    keywords: ['choose pieces', 'programme', 'conductor', 'songs'],
    body: `In the event details you can add [[Piece|pieces]] that were played or are planned in the "Pieces" area and assign who leads them (conductor/choir leader). These entries automatically end up in the [[History|history]] and can be selected in the [[Run sheet|run sheet]].`,
  },
  'att-reminder': {
    title: 'Sending a reminder to members (ad-hoc reminder)',
    keywords: ['reminder', 'ad-hoc', 'adhoc', 'send notification', 'email', 'push', 'neutral', 'without status', 'no response', 'remind one person'],
    body: `In addition to the automatic event reminders, you can remind people of an event manually at any time. [[Helper|Helpers]] do not have this function.

**Remind everyone**
Open the event, tap the menu (⋮) and then "Send reminder". Subject and message are pre-filled with event type, date and time and can be changed freely. If there are still people without a status ("Neutral") in the event, **"Only people without status"** lets you remind just those who have not responded yet.

**Remind a single person**
In the event, swipe a person to the left, tap the three dots and choose "Send reminder". The reminder then only goes to this person.

**How the reminder is delivered**
- By push (or Telegram) to everyone with an app account who has enabled notifications and "Event reminders". [[Observer|Observers]] do not get it.
- By email to people of the event with a stored email address, except the [[Main group|main group]] and people who have left. Without "Only people without status", this only applies to people who already have a status. The email contains a link directly to the event.
- Anyone reminded by email who has an app account also sees the reminder in the bell.

For general messages not related to an event, use announcements instead (Settings → Communication → Announcements).`,
  },
  'att-options-menu': {
    title: 'Options and view in the event',
    keywords: ['menu', 'options', 'view', 'filter', 'sorting', 'pictures', 'sign-up fields', 'status filter', 'additional fields'],
    body: `The menu (⋮) at the top right of the event contains several sections:

**Status filter** – Shows only people with certain statuses (e.g. only absent people). Active filters are indicated by a coloured counter on the menu button.

**Sorting** – Sorts the list of people by an [[Additional field|additional field]] (person or sign-up fields), ascending or descending (↑ / ↓). Without active sorting, the default group order applies. The sorted field value and the group are shown as extra info under the name.

**View** – Controls what is visible in the event:
- *Show pictures* – Shows profile pictures next to the names.
- *Show sign-up fields* – Shows or hides the answers to sign-up fields under the names (only visible if the event type has sign-up fields).
- *Explicit status selection* – Switches to a mode in which each person shows a dropdown to choose the status, instead of moving the status on when tapped.`,
  },
  'people-add': {
    title: 'Adding a new person',
    keywords: ['add member', 'new person', 'create'],
    body: `Under "Members" you can add a new person with the plus icon: name, date of birth, contact details, [[Group|group]]/instrument and joining date. You can also fill in instance-specific [[Additional field|additional fields]].

Assign a [[Role|role]] right away (e.g. [[Member]] or [[Helper]]) so the person can log in and use the app accordingly.`,
  },
  'people-info-mail': {
    title: 'Which email does a newly added person get?',
    keywords: ['info mail', 'welcome mail', 'invitation', 'access', 'set password', 'create account', 'added notification'],
    body: `If you add a person with an email address and give them access to the app, they automatically get an email:

- **No Attendix account yet:** An account is created. The welcome email names the [[Instance|instance]] and the assigned [[Role|role]] and contains a button with which the person sets their password and logs in.
- **Already has an Attendix account:** The person gets an info email that they were added to your instance and logs in with their existing credentials. The new instance then appears in their instance selection.

If no email arrives, check the spam folder and the stored email address.`,
  },
  'people-roles': {
    title: 'Assigning and changing roles',
    keywords: ['assign role', 'rights', 'permissions', 'make admin'],
    body: `In a person's [[Personal details|personal details]], an [[Administrator]] or [[Person in charge]] sets the [[Role|role]]. The role controls what the person can see and edit, from [[Observer]] (read only) to [[Administrator]] (full access).

A person can have different roles in different [[Instance|instances]].`,
  },
  'people-pending': {
    title: 'Approving registrations',
    keywords: ['applicant', 'self-registration', 'unlock', 'approve'],
    body: `When someone registers themselves via a registration link, the person first appears as an [[Applicant|applicant]] on a waiting list. An [[Administrator]] or [[Person in charge]] checks the request and approves it with a suitable [[Role|role]] or declines it.`,
  },
  'people-pause-leave': {
    title: 'Pausing and leaving',
    keywords: ['pause', 'leave', 'archive', 'former members'],
    body: `If a person is temporarily not active (e.g. parental leave, injury), they can be paused without deleting their [[Personal details|personal details]]. If someone leaves the club for good, the person is marked as "left" and appears in the list of former members, but is kept for the history.`,
  },
  'people-church-overview': {
    title: 'Church overview',
    keywords: ['churches', 'count churches', 'origin', 'church statistics', 'bfecg'],
    body: `If your instance has an [[Additional field|additional field]] of the type "BFECG church", you find the church overview in the list of people (filter menu) and in an event (options menu). It shows how many people come from which church and how many are not assigned to any church.

In the list of people, the overview counts the people currently filtered; in an event, only those present (including late).`,
  },
};
