import { isDevMode } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { AppTranslocoLoader } from './transloco-loader';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './languages';

export function provideAppI18n() {
  return [
    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LANGUAGES],
        defaultLang: DEFAULT_LANGUAGE,
        fallbackLang: DEFAULT_LANGUAGE,
        missingHandler: {
          useFallbackTranslation: true,
          logMissingKey: isDevMode(),
        },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: AppTranslocoLoader,
    }),
    // ICU MessageFormat for plurals ({count, plural, one {…} other {…}}),
    // which Russian needs with its one/few/many forms.
    provideTranslocoMessageformat(),
  ];
}
