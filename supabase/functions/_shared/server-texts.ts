// supabase/functions/_shared/server-texts.ts
// Texts for push, Telegram, email and calendar per language (see i18n.ts).
// Keep the keys of all languages in sync; German is the fallback.

type Texts = Record<string, string>;

const de: Texts = {
  // Roles (Role enum in src/app/utilities/constants.ts)
  'role.1': 'Admin',
  'role.2': 'Mitglied',
  'role.3': 'Beobachter',
  'role.4': 'Helfer',
  'role.5': 'Verantwortlicher',
  'role.6': 'Elternteil',
  'role.7': 'Bewerber',
  'role.8': 'Stimmführer',
  'role.9': 'Stimmführer & Helfer',
  'role.99': 'Mitglied',

  // Email layout
  'email.buttonFallback': 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:',
  'email.hello': 'Hallo,',
  'email.helloName': 'Hallo {name},',
  'email.instance': 'Instanz: <strong>{tenant}</strong>',
  'email.role': 'Rolle: <strong>{role}</strong>',
  'email.toApp': 'Zur App',
  'email.openInApp': 'In der App öffnen',
  'email.addedPreheader': 'Du wurdest zur Instanz {tenant} hinzugefügt.',

  'email.register.subject': 'Dein Zugang zur Attendix-App',
  'email.register.title': 'Attendix - Dein Zugang',
  'email.register.heading': 'Willkommen bei Attendix',
  'email.register.text': 'du wurdest zu einer Attendix-Instanz hinzugefügt. Dafür wurde ein Attendix-Account mit der E-Mail-Adresse <strong>{email}</strong> angelegt. Klicke auf den Button, um dein Passwort festzulegen und dich anzumelden.',
  'email.register.button': 'Passwort festlegen',
  'email.register.footnote': 'Dieser Link ist aus Sicherheitsgründen nur begrenzte Zeit gültig. Ist er abgelaufen, kannst du auf der Anmeldeseite über „Passwort vergessen“ jederzeit einen neuen Link anfordern.',

  'email.inform.subject': 'Du wurdest zu einer Attendix-Instanz hinzugefügt',
  'email.inform.title': 'Attendix - Neue Instanz',
  'email.inform.heading': 'Neue Instanz',
  'email.inform.text': 'du wurdest zu einer Attendix-Instanz hinzugefügt. Du kannst die Instanz einfach im Tab „Mehr“ wechseln.',

  'email.approve.subject': "Deine Registrierung bei der Attendix Instanz '{tenant}' wurde genehmigt",
  'email.approve.title': 'Attendix - Registrierung genehmigt',
  'email.approve.preheader': 'Deine Registrierung bei {tenant} wurde genehmigt.',
  'email.approve.heading': 'Registrierung genehmigt',
  'email.approve.text': 'deine Registrierung wurde genehmigt! Logge dich jetzt ein, um Zugriff zur Instanz zu erhalten.',

  'email.reject.subject': "Deine Registrierung bei der Attendix Instanz '{tenant}' wurde abgelehnt!",
  'email.reject.title': 'Attendix - Registrierung abgelehnt',
  'email.reject.preheader': 'Deine Registrierung bei {tenant} wurde abgelehnt.',
  'email.reject.heading': 'Registrierung abgelehnt',
  'email.reject.text': 'deine Registrierung wurde leider abgelehnt. Bitte kontaktiere den Administrator für weitere Informationen. Dein Account bei Attendix bleibt bestehen.',

  'email.message.from': 'Mitteilung von {sender} · {tenant}',
  'email.message.fromTenant': 'Mitteilung · {tenant}',
  'email.message.footnote': 'Du erhältst diese E-Mail, weil du Mitglied in „{tenant}“ bist.',
  'telegram.openInApp': 'In der App öffnen: {url}',
  'qp.untilSuffix': ' (bis {date})',
  'qp.paused': '{name} hat sich selbst pausiert{until}.',
  'qp.reasonInline': ' Grund: {reason}',
  'qp.reasonLine': '\nGrund: {reason}',
  'qp.noteInline': ' Notiz: {notes}',
  'qp.noteLine': '\nNotiz: {notes}',
  'qp.byParent': '\n(von Elternteil abgemeldet)',
  'qp.lecture': ' (Vortrag)',
  'qp.signin': '{name} hat sich für den {date} angemeldet.',
  'qp.late': '{name} kommt am {date} zu spät.',
  'qp.onTime': '{name} kommt am {date} doch pünktlich.',
  'qp.noteUpdate': '{name} hat die Notiz für den {date} angepasst: {reason}',
  'qp.signout': '{name} hat sich für den {date} abgemeldet.',
  'qp.openAttendance': 'Anwesenheit öffnen',
};

const en: Texts = {
  'role.1': 'Admin',
  'role.2': 'Member',
  'role.3': 'Observer',
  'role.4': 'Helper',
  'role.5': 'Person in charge',
  'role.6': 'Parent',
  'role.7': 'Applicant',
  'role.8': 'Section leader',
  'role.9': 'Section leader & helper',
  'role.99': 'Member',

  'email.buttonFallback': "If the button doesn't work, copy this link into your browser:",
  'email.hello': 'Hello,',
  'email.helloName': 'Hello {name},',
  'email.instance': 'Instance: <strong>{tenant}</strong>',
  'email.role': 'Role: <strong>{role}</strong>',
  'email.toApp': 'Open the app',
  'email.openInApp': 'Open in the app',
  'email.addedPreheader': 'You were added to the instance {tenant}.',

  'email.register.subject': 'Your access to the Attendix app',
  'email.register.title': 'Attendix - Your access',
  'email.register.heading': 'Welcome to Attendix',
  'email.register.text': 'you were added to an Attendix instance. An Attendix account was created for this with the email address <strong>{email}</strong>. Click the button to set your password and log in.',
  'email.register.button': 'Set password',
  'email.register.footnote': 'For security reasons this link is only valid for a limited time. If it has expired, you can request a new link at any time via "Forgot password" on the login page.',

  'email.inform.subject': 'You were added to an Attendix instance',
  'email.inform.title': 'Attendix - New instance',
  'email.inform.heading': 'New instance',
  'email.inform.text': 'you were added to an Attendix instance. You can simply switch instance in the "More" tab.',

  'email.approve.subject': "Your registration for the Attendix instance '{tenant}' was approved",
  'email.approve.title': 'Attendix - Registration approved',
  'email.approve.preheader': 'Your registration for {tenant} was approved.',
  'email.approve.heading': 'Registration approved',
  'email.approve.text': 'your registration was approved! Log in now to get access to the instance.',

  'email.reject.subject': "Your registration for the Attendix instance '{tenant}' was declined",
  'email.reject.title': 'Attendix - Registration declined',
  'email.reject.preheader': 'Your registration for {tenant} was declined.',
  'email.reject.heading': 'Registration declined',
  'email.reject.text': 'unfortunately your registration was declined. Please contact the administrator for more information. Your Attendix account remains.',

  'email.message.from': 'Announcement from {sender} · {tenant}',
  'email.message.fromTenant': 'Announcement · {tenant}',
  'email.message.footnote': 'You are receiving this email because you are a member of "{tenant}".',
  'telegram.openInApp': 'Open in the app: {url}',
  'qp.untilSuffix': ' (until {date})',
  'qp.paused': '{name} paused themselves{until}.',
  'qp.reasonInline': ' Reason: {reason}',
  'qp.reasonLine': '\nReason: {reason}',
  'qp.noteInline': ' Note: {notes}',
  'qp.noteLine': '\nNote: {notes}',
  'qp.byParent': '\n(signed out by a parent)',
  'qp.lecture': ' (performance)',
  'qp.signin': '{name} signed in for {date}.',
  'qp.late': '{name} will be late on {date}.',
  'qp.onTime': '{name} will be on time on {date} after all.',
  'qp.noteUpdate': '{name} changed the note for {date}: {reason}',
  'qp.signout': '{name} signed out for {date}.',
  'qp.openAttendance': 'Open attendance',
};

export const SERVER_TEXTS: Record<string, Texts> = { de, en };
