import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

// Translations are bundled as lazy chunks instead of fetched from /assets, so
// they work offline, inside the native apps and with OTA live updates.
const LOADERS: Record<string, () => Promise<{ default: Translation }>> = {
  de: () => import('../../i18n/de.json'),
  en: () => import('../../i18n/en.json'),
  ru: () => import('../../i18n/ru.json'),
  es: () => import('../../i18n/es.json'),
};

@Injectable({ providedIn: 'root' })
export class AppTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string): Promise<Translation> {
    const load = LOADERS[lang] ?? LOADERS['de'];
    return load().then((m) => m.default);
  }
}
