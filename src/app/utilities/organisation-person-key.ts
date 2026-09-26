import { Person } from './interfaces';

export function getOrganisationPersonKey(
  person: Pick<Person, 'global_person_id' | 'appId'>,
): string | null {
  if (person.global_person_id) {
    return `global:${person.global_person_id}`;
  }
  if (person.appId) {
    return `app:${person.appId}`;
  }
  return null;
}