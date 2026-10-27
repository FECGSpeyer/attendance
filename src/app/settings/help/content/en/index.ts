import { HelpTranslation } from '../types';
import { BASICS_EN } from './basics.en';
import { DUTY_EN } from './duty.en';
import { GLOSSARY_EN } from './glossary.en';
import { OTHER_EN } from './other.en';
import { PLANNING_EN } from './planning.en';
import { SETTINGS_EN } from './settings.en';

export const HELP_EN: HelpTranslation = {
  categories: {
    'getting-started': 'Getting started',
    'attendance': 'Attendance',
    'people': 'People',
    'planning': 'Run sheet',
    'songs': 'Pieces',
    'self-service': 'My attendance',
    'settings': 'Settings',
    'team': 'Team organisation',
    'duty': 'Duty roster',
    'other': 'More features',
  },
  articles: {
    ...BASICS_EN,
    ...PLANNING_EN,
    ...SETTINGS_EN,
    ...DUTY_EN,
    ...OTHER_EN,
  },
  glossary: GLOSSARY_EN,
};
