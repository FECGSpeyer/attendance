import { HelpArticleTranslation } from '../types';

// Duty roster.
export const DUTY_EN: Record<string, HelpArticleTranslation> = {
  'duty-setup': {
    title: 'Setting up a duty roster',
    keywords: ['duty roster', 'duty', 'duties', 'duty mode', 'duty roster view', 'my duties', 'view', 'sound engineering', 'tech', 'sound', 'projector', 'stewards', 'kitchen duty', 'staffing', 'assign', 'shift plan', 'event type', 'people needed'],
    body: `[[Duty mode]] turns an event type into a duty roster, e.g. for sound engineering. Not everyone comes, only as many people as are needed.

How to switch it on (as [[Administrator]] or [[Person in charge]]):

1. Open **More → Settings → Attendance types** and tap the type, e.g. "Sound". Feel free to create a separate event type for this.
2. Under **Relevant groups** or via an additional field, define who belongs to the duty team. The easiest is a yes/no additional field "Sound", because each person only has one main group.
3. Under **Duty roster**, switch on **Duty mode**.
4. Set how many people are normally **needed**, whether people may **sign up themselves**, after how many days people are **reminded of unconfirmed duties**, whether the **group is notified when someone drops out** and from when an **urgent** message goes out.

**Creating events:** When creating several events you set per weekday how many people are needed, e.g. 1 on Wednesdays and Fridays, 2 on Sundays. You can change the number on each event later with + and −.

**Duty roster view:** If duties are the norm for you, "My events" can be geared entirely to the duty roster. With the first event type in duty mode the app asks about this; later you switch it under **More → Settings** in the "Attendance" area with **"Duty roster view for My events"**. The switch only appears if there is at least one event type in duty mode. People in the duty team then see their numbers at the top (duties this month, to confirm, open in the team) instead of the attendance rate, then "Please confirm", the next duty with team, the open duties right on the page and their further duties. Other events are collapsed under "More events". Anyone who is not in a duty team sees the normal view.

**What changes:** Everyone in the duty team is listed in the event, but at first only as a [[Stand-in|stand-in]]. Only those assigned see the duty under "My events" and count towards the attendance rate. In the event list a badge such as "1/2" shows how full a duty is: green = staffed and confirmed, yellow = partly or not yet confirmed, red = nobody assigned.`,
  },
  'duty-assign': {
    title: 'Assigning people and confirming duties',
    keywords: ['assign', 'allocate', 'confirm', 'accept', "can't", 'decline', 'requested', 'confirmed', 'push', 'reminder', 'unconfirmed', 'remove', 'staffing', 'duty', 'admin', 'lead', 'no push', 'notification'],
    body: `**Assigning (lead):** Open the event. In the **Staffing** area you see who is assigned and who is still available. Tap **"Assign person"** or **"Assign"** next to a person. The list is sorted by the number of duties in the month so you distribute fairly. Anyone who has declined or is [[Regularly unavailable|regularly unavailable]] is listed under "Can't".

Assigned people immediately get a push message and are **requested** at first. With the × next to the name you remove someone again.

**Assignment and attendance are linked:** If you mark someone as present or late in the attendance list, the person is automatically assigned and confirmed. If you set a confirmed duty back to neutral, it is requested again. A sign-out keeps the assignment and counts as "can't".

**Confirming (members):** Under **My events**, "Please confirm" appears at the top. Tap **"Confirm"** and your duty is **confirmed**. With **"Can't"** you decline like for a normal event, with a reason. You can also simply accept as usual; that also counts as confirmation.

**Confirming (admins and responsible persons):** If you are assigned yourself, **Events** shows **"Your duties: please confirm"** at the top with **"Confirm"** and **"Can't"**. You find the same buttons in the event under **Staffing** next to your name. A push message about your duty opens the event directly.

If you have not answered after the set number of days, you get one reminder. If you later decline a confirmed duty, it is a normal sign-out with a reason; the lead is informed as usual.

**Not getting push messages?** Under **Notifications**, **"Enable notifications"** and **"Push notifications"** must be switched on, and the app must be allowed to send notifications on your phone.

If you don't want duty messages, switch off **"Duties"** under **Notifications**. You still get urgent requests.`,
  },
  'duty-open': {
    title: 'Taking over open duties and standing in',
    keywords: ['open duties', 'take over', 'stand in', 'sign up myself', 'stand-in', 'substitute', 'understaffed', 'drop out', 'urgent', 'who can', 'staffed again'],
    body: `**Open duties:** If you belong to a duty team, you see the **"Open duties"** tile under **My events** (in the duty roster view they are right on the page, urgent ones at the top). It lists all duties that still need someone. With **"I'll take it"** (in the duty roster view **"Take over"**) you sign up, provided the lead allows signing up yourself. If two people tap at the same time, the first gets the place; the other sees a note.

**When someone drops out:** If an assigned person declines and the duty becomes understaffed, all [[Stand-in|stand-ins]] get a message "Can you stand in?". Tapping it opens the open duties.

**Urgent:** If a duty is still not full shortly before (depending on the setting, e.g. 24 hours), a one-off urgent message goes to all stand-ins and the lead. On the iPhone it also comes through in Focus mode.

**Staffed again:** As soon as someone stands in and the duty is full, the others get an all-clear so nobody comes for nothing.`,
  },
  'duty-unavailable': {
    title: 'Entering regular unavailability',
    keywords: ['regularly unavailable', 'availability', 'weekday', 'always', 'every wednesday', "children's hour", 'not available', 'permanent', 'absence', 'recurring', 'rule'],
    body: `If you generally can't make certain weekdays, e.g. Wednesdays because of children's hour, enter this once as a rule instead of declining each event separately.

**Where:** Under **My events → Open duties → Regularly unavailable**, in the duty roster view directly at the bottom of the page. The lead finds the same for a person under **Absences → Regularly unavailable**.

**How:** Tap **"Add rule"**, choose the weekdays, the event types (without a selection the rule applies to all), optionally a reason and an end date, and save.

**What happens:** New events on these days are entered for you as excused automatically, with the note "Regularly unavailable". For duties you are then not assigned and are skipped in automatic distribution. If there are already planned events that match, the app asks whether they should be adjusted too. Events you have already answered yourself or are assigned to stay unchanged.

If you delete a rule, sign-outs already entered remain.`,
  },
  'duty-distribute': {
    title: 'Distributing duties fairly and automatically',
    keywords: ['distribute', 'automatic', 'fair', 'random', 'create duty roster', 'plan month', 'suggestion', 'swap', 'maximum'],
    body: `Instead of staffing each duty individually, the app can make a suggestion for a whole period. [[Administrator|Administrators]] and [[Person in charge|people in charge]] can do this.

1. Under **Events**, tap the **Distribute duties** icon at the top (two crossed arrows).
2. Choose the **period** (the next month is preset), the event types and the rules: **at most how many duties per person** and **not twice on the same day**.
3. Tap **"Calculate suggestion"**.

Whoever has had the fewest duties so far goes first; in case of a tie, chance decides. Anyone who has declined or is regularly unavailable is not assigned. Existing assignments stay; only open places are filled.

**Adjusting the suggestion:** Tap a name to swap it or leave the place open, or tap "open" to choose someone yourself. The icon at the top right rolls the dice again. At the bottom you see how many duties each person would have in the period.

**Saving:** Everyone newly assigned gets a push message and confirms as usual.`,
  },
};
