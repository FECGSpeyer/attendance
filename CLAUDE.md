# Projekt-Hinweise für Claude

## Release-Ablauf nach jeder Feature-Entwicklung

Nach Abschluss eines Features oder Fixes immer:

1. **Patch-Version erhöhen** (z. B. 4.10.0 → 4.10.1) in allen Dateien:
   - `package.json` → `"version"`
   - `android/app/build.gradle` → `versionName` und `versionCode` (+1)
   - `ios/App/App.xcodeproj/project.pbxproj` → `MARKETING_VERSION` und `CURRENT_PROJECT_VERSION` (+1) im App-Target (nicht die Einträge mit `1.0`/`1`)
2. **`version-history.json` aktualisieren**: neuen Eintrag oben in `versions` einfügen, Datum im Format `T.M.JJJJ` (z. B. `11.10.2026`), Änderungen auf Deutsch mit passendem Emoji am Anfang.
3. **Direkt auf `main` committen und pushen** (kein Feature-Branch, kein Pull Request).

## Hilfe-Sektion immer mitpflegen

Jedes neue oder geänderte Feature, das Nutzer in der App bemerken, muss im selben Commit auch in der In-App-Hilfe nachgezogen werden:

- Artikel liegen in `src/app/settings/help/content/articles/*.articles.ts` (Kategorien in `categories.ts`, Begriffe in `glossary.ts`).
- Bestehenden Artikel anpassen oder einen neuen anlegen (eindeutige `id`, passende `categoryId`, `keywords` mit Synonymen für die Suche).
- Text auf Deutsch, in Du-Form, aus Sicht der Nutzer: wo man die Funktion findet, wer sie nutzen darf, was passiert.
- Reine Bugfixes ohne sichtbare Verhaltensänderung brauchen keinen Hilfetext; ändert der Fix aber beschriebenes Verhalten, den Artikel korrigieren.

## Prüfen vor dem Push

- Keinen Prod-Build (`ng build`) ausführen – nicht nötig.
