# Person-Attendance Duplicate Prevention

## Problem
Beim Reaktivieren von pausierten Personen konnten diese mehrfach in der selben Anwesenheit erscheinen.

## Lösung

### 1. Application-Level Fix
- **Datei**: `src/app/services/db.service.ts`
  - `addPlayerToUpcomingAttendances()`: Prüft nun vor dem Hinzufügen, ob die Person bereits in der Anwesenheit vorhanden ist
  - `addPlayerToAttendancesByDate()`: Gleiche Prüfung für historische Anwesenheiten

### 2. Database-Level Fix
- **Datei**: `supabase/sql/add_unique_constraint_person_attendance.sql`
  - Fügt einen UNIQUE constraint auf `(attendance_id, person_id)` in der `person_attendances` Tabelle hinzu
  - Entfernt automatisch existierende Duplikate vor dem Hinzufügen des Constraints (behält jeweils den ersten Eintrag basierend auf ID)

### 3. Error Handling
- **Datei**: `src/app/services/attendance/attendance.service.ts`
  - `addPersonAttendances()`: Fängt Duplicate-Key-Errors (PostgreSQL error code 23505) ab und ignoriert sie
  - Dies ist ein zusätzlicher Fallback-Mechanismus

## Migration ausführen

Die SQL-Migration muss in Supabase ausgeführt werden:

```bash
# Via Supabase Dashboard
# 1. Öffne Supabase Dashboard
# 2. Gehe zu SQL Editor
# 3. Füge den Inhalt von supabase/sql/add_unique_constraint_person_attendance.sql ein
# 4. Führe das Script aus
```

## Testing

Nach der Migration sollten folgende Szenarien getestet werden:

1. **Pausierte Person reaktivieren**
   - Person pausieren
   - Person reaktivieren
   - Prüfen, dass die Person nur 1x in zukünftigen Anwesenheiten vorkommt

2. **Automatische Reaktivierung**
   - Person mit Enddatum pausieren
   - Warten bis Enddatum erreicht ist
   - Prüfen, dass die automatische Reaktivierung keine Duplikate erzeugt

3. **Neue Person zu Anwesenheiten hinzufügen**
   - Neue Person anlegen
   - Prüfen, dass sie korrekt zu Anwesenheiten hinzugefügt wird
