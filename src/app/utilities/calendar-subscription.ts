import { Browser } from '@capacitor/browser';
import { AlertController, isPlatform } from '@ionic/angular/lazy';
import { translate } from '@jsverse/transloco';
import { environment } from 'src/environments/environment';
import { currentLanguage } from '../i18n/languages';
import { DbService } from '../services/db.service';
import { Role } from './constants';
import { Utils } from './Utils';

/**
 * Alert with the iCal link of the current instance (Einstellungen, Kalender in der Übersicht).
 * Admins and Verantwortliche get all Termine, everyone else their personal feed.
 */
export async function openCalendarSubscription(db: DbService, alertController: AlertController): Promise<void> {
  const isAdmin = [Role.ADMIN, Role.RESPONSIBLE].includes(db.tenantUser().role);
  let link = `${environment.apiUrl}/functions/v1/ical-tenant?tenantId=${db.tenant().id}`;
  let personal = false;
  if (!isAdmin) {
    const personId = await db.getPersonIdForTenant(db.tenant().id);
    if (personId) {
      link += `&personId=${personId}`;
      personal = true;
    }
  }
  // Calendar texts (status, reminders) in the app language; German is the server default.
  if (currentLanguage() !== 'de') {
    link += `&lang=${currentLanguage()}`;
  }
  const alert = await alertController.create({
    header: translate('settings.subscribeCalendar'),
    message: translate('settings.calendarMessage', { link }),
    // Personal feeds can leave out Termine you cancelled (default: shown with status).
    inputs: personal ? [{ type: 'checkbox', label: translate('settings.hideCancelled'), value: 'hideExcused' }] : [],
    buttons: [
      {
        text: translate('settings.copyLink'),
        handler: (values?: string[]) => {
          const finalLink = Array.isArray(values) && values.includes('hideExcused') ? `${link}&hideExcused=1` : link;
          navigator?.clipboard.writeText(finalLink);
          Utils.showToast(translate('settings.linkCopied'), 'success');
          return false;
        },
      },
      {
        text: translate('settings.openGuide'),
        handler: () => {
          Browser.open({ url: isPlatform('ios') ? 'https://support.apple.com/de-de/102301' : 'https://support.google.com/calendar/answer/37100?hl=de&co=GENIE.Platform%3DAndroid' });
        },
      },
      { text: translate('common.close'), role: 'cancel' },
    ],
  });
  await alert.present();
}
