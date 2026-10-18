import { AlertController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import type { DbService } from '../services/db.service';
import { changeAttendanceDate, createAttendanceForType, hasNonDefaultStatus, personsForAttendanceType } from './attendance-create';
import { Attendance, AttendanceType } from './interfaces';
import { Utils } from './Utils';

/**
 * "Datum ändern": asks for the new day and, when not everybody is on the
 * default status, whether all statuses should be reset. Returns the updated
 * Termin, or null when cancelled or failed.
 */
export async function promptAttendanceDateChange(
  alertController: AlertController,
  db: DbService,
  att: Attendance,
): Promise<Attendance | null> {
  const dateAlert = await alertController.create({
    header: 'Datum ändern',
    message: 'Auf welchen Tag soll der Termin verschoben werden?',
    inputs: [{ name: 'date', type: 'date', value: dayjs(att.date).format('YYYY-MM-DD') }],
    buttons: [
      { text: 'Abbrechen', role: 'cancel' },
      { text: 'Weiter', role: 'confirm' },
    ],
  });
  await dateAlert.present();
  const dateResult = await dateAlert.onDidDismiss();
  const value: string = dateResult.data?.values?.date ?? '';
  if (dateResult.role !== 'confirm' || !value) return null;
  if (dayjs(value).isSame(dayjs(att.date), 'day')) return null;

  const loading = await Utils.getLoadingElement();
  await loading.present();
  let current: Attendance;
  try {
    // The persons are needed to know whether anybody deviates from the default.
    current = await db.getAttendanceById(att.id);
  } catch (error) {
    console.error('Load attendance error:', error);
    Utils.showToast('Termin konnte nicht geladen werden', 'danger');
    return null;
  } finally {
    await loading.dismiss();
  }

  let reset = false;
  const type = db.attendanceTypes().find(t => t.id === current.type_id);
  if (hasNonDefaultStatus(current, type)) {
    const resetAlert = await alertController.create({
      header: 'Status zurücksetzen?',
      message: `Nicht alle stehen auf „${Utils.getAttendanceStatusDescription(type.default_status)}“. Sollen mit der Verschiebung alle auf den Standardstatus zurückgesetzt werden? Abwesenheiten am neuen Tag werden danach wieder eingetragen.`,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Behalten', role: 'keep' },
        { text: 'Zurücksetzen', role: 'reset' },
      ],
    });
    await resetAlert.present();
    const { role } = await resetAlert.onDidDismiss();
    if (role !== 'keep' && role !== 'reset') return null;
    reset = role === 'reset';
  }

  const saving = await Utils.getLoadingElement();
  await saving.present();
  try {
    const updated = await changeAttendanceDate(db, current, dayjs(value).toISOString(), reset);
    Utils.showToast(`Termin auf ${dayjs(value).locale('de').format('dd, DD.MM.YYYY')} verschoben`, 'success');
    return updated;
  } catch (error) {
    console.error('Change date error:', error);
    Utils.showToast('Datum konnte nicht geändert werden', 'danger');
    return null;
  } finally {
    await saving.dismiss();
  }
}

/** Protocol-enabled types a Termin can be created for ad hoc. */
export function protocolAttendanceTypes(db: DbService): AttendanceType[] {
  return db.attendanceTypes()
    .filter(t => t.enable_protocol && t.visible !== false)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/**
 * "Neuen Termin anlegen" for the Teamorganisation: asks for the type (only
 * when several types have protocol & agenda) and the day, then creates the
 * Termin with its persons. Returns the new Termin, or null when cancelled or failed.
 */
export async function promptCreateProtocolAttendance(
  alertController: AlertController,
  db: DbService,
): Promise<Attendance | null> {
  const types = protocolAttendanceTypes(db);
  if (!types.length) {
    Utils.showToast('Kein Termintyp mit Protokoll & Tagesordnung vorhanden', 'warning');
    return null;
  }

  let type: AttendanceType | undefined = types[0];
  if (types.length > 1) {
    const typeAlert = await alertController.create({
      header: 'Welcher Termintyp?',
      inputs: types.map((t, i) => ({ type: 'radio' as const, label: t.name, value: t.id, checked: i === 0 })),
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Weiter', role: 'confirm' },
      ],
    });
    await typeAlert.present();
    const { role, data } = await typeAlert.onDidDismiss();
    if (role !== 'confirm') return null;
    type = types.find(t => t.id === data?.values);
    if (!type) return null;
  }

  const dateAlert = await alertController.create({
    header: `${type.name} anlegen`,
    message: 'An welchem Tag findet der Termin statt?',
    inputs: [{ name: 'date', type: 'date', value: dayjs().format('YYYY-MM-DD'), min: dayjs().format('YYYY-MM-DD') }],
    buttons: [
      { text: 'Abbrechen', role: 'cancel' },
      { text: 'Anlegen', role: 'confirm' },
    ],
  });
  await dateAlert.present();
  const dateResult = await dateAlert.onDidDismiss();
  const value: string = dateResult.data?.values?.date ?? '';
  if (dateResult.role !== 'confirm' || !value) return null;
  if (dayjs(value).isBefore(dayjs(), 'day')) {
    Utils.showToast('Bitte ein Datum ab heute wählen', 'warning');
    return null;
  }
  const date = dayjs(value).toISOString();

  const loading = await Utils.getLoadingElement();
  await loading.present();
  try {
    const [persons, absences] = await Promise.all([
      personsForAttendanceType(db, type),
      db.getPlayerAbsencesForTenant().catch(() => []),
    ]);
    const id = await createAttendanceForType(db, type, { date }, persons, absences);
    const created = await db.getAttendanceById(id);
    Utils.showToast(`Termin am ${dayjs(date).format('DD.MM.')} angelegt`, 'success');
    return created;
  } catch (error) {
    console.error('Ad hoc attendance error:', error);
    Utils.showToast('Termin konnte nicht angelegt werden', 'danger');
    return null;
  } finally {
    await loading.dismiss();
  }
}
