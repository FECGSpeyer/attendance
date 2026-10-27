# Projekt-Hinweise für Claude

## Release-Ablauf nach jeder Feature-Entwicklung

Nach Abschluss eines Features oder Fixes immer:

1. **Patch-Version erhöhen** (z. B. 4.10.0 → 4.10.1) in allen Dateien:
   - `package.json` → `"version"`
   - `android/app/build.gradle` → `versionName` und `versionCode` (+1)
   - `ios/App/App.xcodeproj/project.pbxproj` → `MARKETING_VERSION` und `CURRENT_PROJECT_VERSION` (+1) im App-Target (nicht die Einträge mit `1.0`/`1`)
     sowie dieselben Werte im Target `AttendixLiveActivity` (Widget Extension, muss zur App passen)
2. **`version-history.json` aktualisieren**: neuen Eintrag oben in `versions` einfügen, Datum im Format `T.M.JJJJ` (z. B. `11.10.2026`), Änderungen auf Deutsch mit passendem Emoji am Anfang.
3. **Direkt auf `main` committen und pushen** (kein Feature-Branch, kein Pull Request).

## Hilfe-Sektion immer mitpflegen

Jedes neue oder geänderte Feature, das Nutzer in der App bemerken, muss im selben Commit auch in der In-App-Hilfe nachgezogen werden:

- Artikel liegen in `src/app/settings/help/content/articles/*.articles.ts` (Kategorien in `categories.ts`, Begriffe in `glossary.ts`).
- Bestehenden Artikel anpassen oder einen neuen anlegen (eindeutige `id`, passende `categoryId`, `keywords` mit Synonymen für die Suche).
- Text auf Deutsch, in Du-Form, aus Sicht der Nutzer: wo man die Funktion findet, wer sie nutzen darf, was passiert.
- Reine Bugfixes ohne sichtbare Verhaltensänderung brauchen keinen Hilfetext; ändert der Fix aber beschriebenes Verhalten, den Artikel korrigieren.

## Übersetzungen immer mitpflegen

Die App wird mehrsprachig (de, en, ru, es; Konzept: `plans/mehrsprachigkeit-konzept.md` im Projektordner). Jedes neue oder geänderte Feature muss im selben Commit die Übersetzungen mitbringen:

- Keine neuen fest eingebauten Texte in Templates oder TS. Texte kommen als Schlüssel in `src/i18n/de.json` und **gleichzeitig** in `en.json`, `ru.json`, `es.json` (Transloco, `| transloco` bzw. `TranslocoService.translate`).
- Parameter und Plural im ICU-Format: `{name}`, `{count, plural, one {# Termin} other {# Termine}}`. Russisch braucht `one`/`few`/`many`/`other`.
- Datum und Zahlen über `LocaleService` (`dayjsLocale`, `intlLocale`), nie fest `'de'` oder `'de-DE'`.
- Hilfe-Artikel und serverseitige Texte (Push, E-Mail, Kalender) ebenfalls in allen Sprachen, sobald die jeweilige Infrastruktur da ist.
- Nutzerinhalte (Gruppennamen, Termintitel, Werke) werden nicht übersetzt.
- `src/app/i18n/translations.spec.ts` prüft, dass alle Sprachen dieselben Schlüssel und gültige ICU-Texte haben, und muss grün bleiben.
- Solange Teile der App noch nicht umgestellt sind (Phase 2), neue Texte trotzdem schon als Schlüssel anlegen.

## Prüfen vor dem Push

- Keinen Prod-Build (`ng build`) ausführen – nicht nötig.
