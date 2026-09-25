import { GETTING_STARTED_ARTICLES } from './articles/getting-started.articles';
import { ATTENDANCE_ARTICLES } from './articles/attendance.articles';
import { PEOPLE_ARTICLES } from './articles/people.articles';
import { PLANNING_ARTICLES } from './articles/planning.articles';
import { SONGS_ARTICLES } from './articles/songs.articles';
import { SELF_SERVICE_ARTICLES } from './articles/self-service.articles';
import { SETTINGS_ARTICLES } from './articles/settings.articles';
import { OTHER_FEATURES_ARTICLES } from './articles/other-features.articles';

export * from './types';
export { HELP_CATEGORIES } from './categories';
export { GLOSSARY } from './glossary';

export const HELP_ARTICLES = [
  ...GETTING_STARTED_ARTICLES,
  ...ATTENDANCE_ARTICLES,
  ...PEOPLE_ARTICLES,
  ...PLANNING_ARTICLES,
  ...SONGS_ARTICLES,
  ...SELF_SERVICE_ARTICLES,
  ...SETTINGS_ARTICLES,
  ...OTHER_FEATURES_ARTICLES,
];
