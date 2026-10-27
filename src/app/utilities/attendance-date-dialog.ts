import { AlertController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import type { DbService } from '../services/db.service';
import { changeAttendanceDate, createAttendanceForType, hasNonDefaultStatus, personsForAttendanceType } from './attendance-create';
import { Attendance, AttendanceType } from './interfaces';
import { Utils } from './Utils';
import { translate } from '@jsverse/transloco';
import { currentLanguage } from '../i18n/languages';

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
    header: translate('dateDialog.changeDate'),
    message: translate('dateDialog.moveTo'),
    inputs: [{ name: 'date', type: 'date', value: dayjs(att.date).format('YYYY-MM-DD') }],
    buttons: [
      { text: translate('common.cancel'), role: 'cancel' },
      { text: translate('common.next'), role: 'confirm' },
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
    Utils.showToast(translate('dateDialog.loadFailed'), 'danger');
    return null;
  } finally {
    await loading.dismiss();
  }

  let reset = false;
  const type = db.attendanceTypes().find(t => t.id === current.type_id);
  if (hasNonDefaultStatus(current, type)) {
    const resetAlert = await alertController.create({
      header: translate('dateDialog.resetStatus'),
      message: translate('dateDialog.resetStatusMessage', { status: Utils.getAttendanceStatusDescription(type.default_status) }),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('dateDialog.keep'), role: 'keep' },
        { text: translate('dateDialog.reset'), role: 'reset' },
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
    Utils.showToast(translate('dateDialog.moved', { date: dayjs(value).locale(currentLanguage()).format('dd, DD.MM.YYYY') }), 'success');
    return updated;
  } catch (error) {
    console.error('Change date error:', error);
    Utils.showToast(translate('dateDialog.changeFailed'), 'danger');
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
    Utils.showToast(translate('dateDialog.noProtocolType'), 'warning');
    return null;
  }

  let type: AttendanceType | undefined = types[0];
  if (types.length > 1) {
    const typeAlert = await alertController.create({
      header: translate('dateDialog.whichType'),
      inputs: types.map((t, i) => ({ type: 'radio' as const, label: t.name, value: t.id, checked: i === 0 })),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('common.next'), role: 'confirm' },
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
    message: translate('dateDialog.whichDay'),
    inputs: [{ name: 'date', type: 'date', value: dayjs().format('YYYY-MM-DD'), min: dayjs().format('YYYY-MM-DD') }],
    buttons: [
      { text: translate('common.cancel'), role: 'cancel' },
      { text: translate('common.create'), role: 'confirm' },
    ],
  });
  await dateAlert.present();
  const dateResult = await dateAlert.onDidDismiss();
  const value: string = dateResult.data?.values?.date ?? '';
  if (dateResult.role !== 'confirm' || !value) return null;
  if (dayjs(value).isBefore(dayjs(), 'day')) {
    Utils.showToast(translate('dateDialog.fromToday'), 'warning');
    return null;
  }
  const date = dayjs(value).toISOString();

  const loading = await Utils.getLoadingElement();
  await loading.present();
  try {
    const [persons, absences, unavailability] = await Promise.all([
      personsForAttendanceType(db, type),
      db.getPlayerAbsencesForTenant().catch(() => []),
      db.dutySvc.getUnavailabilityForTenant(db.tenant().id),
    ]);
    const id = await createAttendanceForType(db, type, { date }, persons, absences, unavailability);
    const created = await db.getAttendanceById(id);
    Utils.showToast(translate('dateDialog.created', { date: dayjs(date).format('DD.MM.') }), 'success');
    return created;
  } catch (error) {
    console.error('Ad hoc attendance error:', error);
    Utils.showToast(translate('dateDialog.createFailed'), 'danger');
    return null;
  } finally {
    await loading.dismiss();
  }
}
