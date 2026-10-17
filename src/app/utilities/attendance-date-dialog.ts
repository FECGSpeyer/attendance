import { AlertController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import type { DbService } from '../services/db.service';
import { changeAttendanceDate, hasNonDefaultStatus } from './attendance-create';
import { Attendance } from './interfaces';
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
