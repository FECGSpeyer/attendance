# Projekt-Hinweise für Claude

## Release-Ablauf nach jeder Feature-Entwicklung

Nach Abschluss eines Features oder Fixes immer:

1. **Patch-Version erhöhen** (z. B. 4.10.0 → 4.10.1) in allen Dateien:
   - `package.json` → `"version"`
   - `android/app/build.gradle` → `versionName` und `versionCode` (+1)
   - `ios/App/App.xcodeproj/project.pbxproj` → `MARKETING_VERSION` und `CURRENT_PROJECT_VERSION` (+1) im App-Target (nicht die Einträge mit `1.0`/`1`)
2. **`version-history.json` aktualisieren**: neuen Eintrag oben in `versions` einfügen, Datum im Format `T.M.JJJJ` (z. B. `11.10.2026`), Änderungen auf Deutsch mit passendem Emoji am Anfang.
3. **Direkt auf `main` committen und pushen** (kein Feature-Branch, kein Pull Request).
