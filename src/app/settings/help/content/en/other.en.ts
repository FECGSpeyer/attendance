import { HelpArticleTranslation } from '../types';

// Other features.
export const OTHER_EN: Record<string, HelpArticleTranslation> = {
  'other-dashboard': {
    title: 'Dashboard',
    keywords: ['overview', 'tiles', 'start page', 'birthday', 'birthdays', 'archived'],
    body: `The dashboard shows [[Administrator|administrators]] and [[Person in charge|people in charge]] an overview with birthdays, the next event, member changes, absences, [[Critical person|critical people]] and current pieces.

The **Birthdays** card lists the birthdays of the last and next 14 days. Archived people do not appear there.`,
  },
  'other-messages': {
    title: 'Writing and sending announcements',
    keywords: ['announcement', 'message', 'circular', 'info to everyone', 'read', 'read receipt', 'newsletter', 'broadcast', 'formatting', 'bold', 'insert link'],
    body: `With announcements, [[Administrator|administrators]] and [[Person in charge|people in charge]] send a formatted message to the members of their instance, e.g. "Saturday's rehearsal is cancelled". You find them under Settings → Communication → Announcements.

**Writing a new announcement**
1. Tap the plus icon.
2. Enter a title and write the text. With the toolbar above the text field you format bold, italic, underlined and struck through, and insert headings, bullet points, numbered lists and links.
3. Choose the recipients: all active [[Member|members]] (including the [[Main group|main group]]) or "Only certain groups". Below you see how many people will get the announcement and through which channels.
4. Tap Send and confirm. A sent announcement can no longer be edited.

**How it is delivered**
- By push (or Telegram) if the person has enabled notifications and the "Announcements" switch.
- By email to everyone with a stored email address.
- Also in the app's notification centre (bell).

**Who has read it?**
Tap an announcement in the list. The overview shows how many people have read it in the app and to how many push and email were delivered. Below, it says for each person whether they have read it, whether push or email arrived and whether the email was opened. "Email opened" is an estimate, because some mail apps preload or block images.

**Deleting**
A deleted announcement disappears from the app for all recipients. Emails already sent remain.

For a reminder about a specific event, use "Send reminder" in the event instead.`,
  },
  'other-messages-receive': {
    title: 'Receiving and reading announcements',
    keywords: ['announcement', 'message received', 'bell', 'notification centre', 'unread', 'turn off push announcements'],
    body: `When [[Administrator|administrators]] or [[Person in charge|people in charge]] send an announcement, you get a push or Telegram message and, if your email address is stored, an email.

If you tap the push message or the entry in the bell (notification centre), the announcement opens in the app and is marked as read. You also find earlier announcements there.

You switch push messages for announcements on or off in the notifications with the "Announcements" switch. The email and the entry in the bell still arrive.`,
  },
  'other-auto-messages': {
    title: 'Automatic messages after an event',
    keywords: ['automatic', 'automatic message', 'follow up', 'unexcused', 'did not cancel', 'absent', 'missed', 'late', 'no reply', 'rule', 'reminder after event', 'in a row', 'skip', 'check replies', 'add reason'],
    body: `With automatic messages, [[Member|members]] get a message by themselves after an event, e.g. when they were absent without cancelling. [[Administrator|Administrators]] and [[Person in charge|people in charge]] set this up under Settings → Communication → Automatic messages. Nothing happens as long as no rule is switched on.

**Creating a rule**
1. Tap "New rule" or start from a template.
2. Choose when it is sent: absent without excuse, late without notice or no reply.
3. Choose how often: every time, only from a certain number in a row or from a number within a period.
4. Optionally limit it to event types and groups and set the wait after the event ends (default: 2 hours).
5. Use a template or write your own text. Placeholders like {vorname}, {termin} and {datum} are filled in for every person. Every member gets the template in their app language, your own text exactly as you write it.
6. Choose the channels (push/Telegram, email) and whether members may reply.
7. Tap "Preview with the last events". You see who would have been contacted for the last events. Only then switch it on.

**When is something sent?**
Only when attendance was really taken for the event and the wait is over. People who cancelled, paused or left never get a message. Each person gets at most one message per rule and event. Events before switching on are not sent afterwards.

**On the event**
At the top of the event you see when the message goes out. With "Skip this time" nobody gets the message for this event. After sending you see how many people it went to and who read it. With "Message the unexcused" you send a prefilled announcement to all unexcused people of this event, even without a rule.

**Checking replies**
When a member replies with a reason or "I was there", it appears in the event under "Replies". With "Excuse" or "Mark present" you change the status, with "Reject" it stays. The person is notified either way. In the rule you can choose that a reason excuses right away. "I was there" is always checked.

**Copy and history**
Optionally, admins and people in charge or section leaders (only for their group) get one summary per event. Under "History" of a rule you see how many people were contacted, how many read and replied, and why an event was skipped.`,
  },
  'other-auto-messages-reply': {
    title: 'Replying to an automatic message',
    keywords: ['add reason', 'excuse afterwards', 'i was there', 'wrongly marked', 'unexcused', 'sick', 'reply', 'automatic message'],
    body: `If you missed an event without cancelling, your instance can send you a message automatically. You also find it in the notification centre (bell).

The message shows the event and your status. Below there are two buttons:
- **Add reason:** Choose a reason (e.g. sick) and optionally add a few words. The reason is then a note on the event. Depending on the setting you are excused right away, or the people in charge confirm it.
- **I was there:** The people in charge get a notice and can mark you as present.

While your reply is still being checked you can change it. You are notified as soon as it is accepted or rejected. You can reply up to 7 days after the event.`,
  },
  'other-history': {
    title: 'History',
    keywords: ['pieces played', 'performance history'],
    body: `The [[History|history]] lists chronologically which [[Piece|piece]] was played at which event under whose lead. Useful to see when a piece was last rehearsed.`,
  },
  'other-export': {
    title: 'Export',
    keywords: ['csv', 'excel', 'pdf export', 'export data'],
    body: `Via "Export" you can export lists of people or attendance as PDF, Excel or CSV with columns of your choice.`,
  },
  'other-stats': {
    title: 'Statistics',
    keywords: ['analysis', 'charts', 'attendance rate'],
    body: `The statistics page shows attendance trends, the distribution of [[Attendance status|attendance statuses]], age distribution and further analyses over a period of your choice. For [[Additional field|additional fields]] with fixed options you can also see how the answers are distributed.`,
  },
  'other-stats-fields': {
    title: 'Statistics for additional fields',
    keywords: ['analyse additional fields', 'distribution', 'percent', 'pie chart', 'select field', 'yes no', 'church distribution', 'options'],
    body: `In the statistics you will find the "Additional fields" section. For every [[Additional field|additional field]] of type select, yes/no or church, it shows how many people have which option, as a chart and as a list with count and percentage.

How to use it:
- Pick the field you want to analyse at the top.
- Use "Group" to limit the analysis to one [[Group|group]].
- Turn on "Include paused people" to count paused people as well. People who have left are never counted.
- With "All groups" a second chart shows the distribution per group in percent.

If a person has no value for the field yet, the field's default value counts, just as it is shown in the people list. Organisation-wide additional fields are included too.`,
  },
  'other-instruments': {
    title: 'Instruments/groups',
    keywords: ['manage voices', 'sections', 'categories'],
    body: `Here you manage the club's [[Group|groups]]/voices, their categories and the order in which they are shown.`,
  },
  'other-main-group': {
    title: 'What is the main group for?',
    keywords: ['main group', 'leadership group', 'board', 'conductors group'],
    body: `Every instance has a [[Main group|main group]], a special [[Group|group]] for people in leading roles (e.g. conductors, choir leaders, board), which is created during the initial setup.

Special features:
- It cannot be deleted.
- Members of this group automatically get the [[Role|role]] [[Person in charge]] with extended rights.
- It does not appear in the instrument lists for [[Piece|pieces]] or sheet music parts, as it does not represent a voice of its own.

You add further groups (e.g. soprano, violins) under "Instruments/groups".`,
  },
  'other-teachers': {
    title: 'Teachers',
    keywords: ['instrument teachers', 'lessons'],
    body: `Under "Teachers" you can create instrument teachers and link them to the [[Member|members]] they teach.`,
  },
  'other-org-plans': {
    title: 'Organisation plans',
    keywords: ['org plans', 'shared planning'],
    body: `If your instance is part of an [[Organisation|organisation]], "Organisation plans" shows a shared overview of all [[Run sheet|run sheets]] across several instances.`,
  },
  'other-org-settings': {
    title: 'Organisation settings',
    keywords: ['link organisation', 'share pieces', 'additional person fields', 'shared person data'],
    body: `Here you link your instance to an [[Organisation|organisation]] and define, for example, which instance the shared piece library comes from.

Under "Additional person fields", [[Administrator|administrators]] can create fields that are available in all instances of the organisation. The values are stored organisation-wide per person. Attendix recognises the same person either via their shared Attendix account or via the "Link people" function. If a value is changed in one instance, it therefore also appears in all other instances the same person is assigned to.

Instance-specific [[Additional field|additional fields]] remain alongside and still only apply in their instance. People without an account and without an organisation-wide link cannot get a shared value across instances.`,
  },
  'other-shared-plan': {
    title: 'Shared and public plans',
    keywords: ['plan link', 'public link', 'public planning'],
    body: `Via a shared link, people without an Attendix account can also view a [[Run sheet|run sheet]] or follow it live. At "attendix.de/planung" you can even create and share an ad-hoc run sheet without logging in at all.`,
  },
  'other-registration': {
    title: 'Login and registration',
    keywords: ['login', 'create account', 'invitation link'],
    body: `New people can register themselves via a registration link provided by the instance and then appear as [[Applicant|applicants]] until an administrator approves the registration.`,
  },
  'other-shifts': {
    title: 'Shift plans',
    keywords: ['shift', 'work schedule', 'rotating duty', 'excuse automatically'],
    body: `For members who work shifts (e.g. in emergency services or care), you can create [[Shift plan|shift plans]] under "Settings → General → Shifts": recurring work/free time blocks with start, duration and number of repetitions. If a shift plan is assigned to a person, Attendix automatically excuses them for all upcoming events that fall into their working time, without them having to sign out manually.`,
  },
  'other-handover': {
    title: 'Handing over people',
    keywords: ['handover', 'transfer member', 'move between instances'],
    body: `[[Handover]] moves individual people from your instance to another instance of the same [[Organisation|organisation]], e.g. when someone moves from a junior choir to the main choir. You choose the people and the target instance, map their current [[Group|group]] to a matching group in the target instance and decide whether the person should also remain in the original instance.`,
  },
  'other-teams': {
    title: 'Microsoft Teams integration',
    keywords: ['teams tab', 'microsoft teams', 'channel'],
    body: `Attendix can be added as a tab in a Microsoft Teams channel. When adding the tab, the person setting it up chooses the instance; after that the tab shows this instance's data directly in the Teams channel.`,
  },
  'other-files': {
    title: 'File storage',
    keywords: ['files', 'folder', 'upload', 'recordings', 'documents', 'direct link', 'share link', 'share', 'all members', 'storage', 'storage space', 'limit', 'full', 'gb', 'more storage', 'request'],
    body: `In the file storage your instance keeps shared files in folders, e.g. recordings, documents or pictures. You find it under Settings → File storage.

**Who can see it?** Every instance has file storage. [[Administrator|Administrators]], [[Person in charge|people in charge]] and helpers always see it. An [[Administrator]] can also share it with all members under Settings → Roles & permissions with "File storage for all members". [[Applicant|Applicants]] never have access.

**Storage space:** Each instance has a storage limit, 5 GB by default. Administrators and people in charge see at the top of the file storage how much of it is used. From 80 % usage, "Request more storage" appears there. This sends a request to the Attendix admin, optionally with a message on how much you need. If the free space is not enough for an upload, it is not started, and you can request more storage directly from the note or delete files you no longer need.

- **Uploading and creating folders** is for [[Administrator|administrators]] and [[Person in charge|people in charge]]. You find both in the menu (three dots at the top right).
- **Sorting** by name, date changed or file size, ascending or descending, also via the menu.
- **Sharing a link:** Via "Share link to this folder" or by sharing a file you get a direct link. Whoever opens it lands directly in this folder or file in the app after logging in.
- **Folder on the event:** For an event you can set a folder under "Folder in file storage" (e.g. the recordings of this event). Members then jump directly into this folder from their sign-in page and the overview.

You play audio files directly in the built-in audio player (see "Audio player"); pictures open in full-screen view (see "Viewing and zooming pictures").`,
  },
  'other-image-viewer': {
    title: 'Viewing and zooming pictures',
    keywords: ['picture', 'photo', 'passport photo', 'profile picture', 'remove picture', 'delete picture', 'remove profile picture', 'zoom', 'enlarge', 'zoom in', 'full screen', 'picture preview', 'pinch', 'double tap'],
    body: `Pictures from the file storage and photos (in your profile under Settings or on a person's page) open in a full-screen view.

- **Zooming:** Spread the picture with two fingers. It zooms exactly at the point between your fingers. On a computer you zoom with the mouse wheel or trackpad.
- **Double-tapping** (double-click on a computer) enlarges exactly the point tapped. Double-tap again to return to the whole picture.
- **Moving:** When the picture is enlarged, drag it around with one finger.
- **Zoom bar:** At the bottom you find − and +. Tap the percentage to see the whole picture again.
- **Closing:** Swipe the picture down or up (works as long as it is not enlarged), or tap the X at the top right. On a computer the Esc key also works.
- **Tapping once** hides the title and bars so you can see the picture without distraction. Tap again to bring them back.

If you may edit the person, you also find "Replace" and "Remove" at the bottom of the photo.

You change your own photo under Settings in your profile details: tap "Photo" and choose "View photo", "Replace photo" or "Remove photo". After removing it you see the default picture again.`,
  },
  'other-audio-player': {
    title: 'Audio player',
    keywords: ['audio', 'play', 'listen to recording', 'mp3', 'lock screen', 'background', 'keep playing', 'playlist', 'listen to music', 'cover', 'logo', 'branding', 'next track', 'fast forward'],
    body: `If you tap an audio file in the file storage, the audio player opens at the bottom of the screen.

- With **Next/Previous** you switch to the next or previous audio file in the same folder. When a track ends, the next one starts automatically.
- In the app, playback continues **in the background**, even if you leave the app or lock the screen.
- On the **lock screen**, in the control centre (iOS) or in the notification (Android) you see the current track (with the logo from your group's or organisation's branding as cover, without branding with the Attendix logo) and can control play/pause and seeking. If there are more audio files in the folder, **Next/Previous** jumps to the next or previous track there; for a single file the iPhone shows 10 seconds forward/back instead.

Background playback and lock screen controls need a current version of the app. In the browser it depends on what the browser and device support.`,
  },
  'other-print': {
    title: 'Printing sheet music and files',
    keywords: ['print', 'printout', 'printer', 'airprint', 'print sheet music', 'print pdf', 'music folder'],
    body: `There is a printer icon in several places, e.g. at a [[Piece|piece]] (file menu), at the current pieces, in the group directory and in "My attendance" at the current pieces. All print buttons work the same way:

- **In the app (iOS/Android):** The device's print dialog opens, where you choose the printer and pages.
- **In the browser on a computer:** The browser's print dialog opens directly, without a new window or popup.
- **In the browser on a phone:** The share menu opens. There you find "Print" (iOS) or can save the PDF or open it in another app.

If several files are printed, Attendix combines them into one PDF.`,
  },
  'calendar-subscription': {
    title: 'Subscribing to events in your calendar',
    keywords: ['calendar', 'subscription', 'subscribe', 'ical', 'ics', 'google calendar', 'apple calendar', 'outlook', 'sync', 'hide cancelled', 'duties in calendar'],
    body: `Under **More → Analytics & data → Subscribe to calendar** you get a link that you add to your calendar app (Apple, Google, Outlook). New and changed events then appear automatically.

As a member you get your personal calendar, administrators get all events of the instance. In the personal calendar your status appears after each event, e.g. "Accepted" or "Excused". If you tick **"Hide cancelled events"** when copying, events you have declined are left out completely.

**Duties:** Of events in [[Duty mode|duty mode]], only those you are assigned to or have signed up for yourself are included. Duties not yet confirmed carry the note "please confirm". If you decline a duty, it disappears from the calendar.`,
  },
};
