import { describe, expect, it } from 'vitest';
import { getOrganisationPersonKey } from './organisation-person-key';

describe('getOrganisationPersonKey', () => {
  it('prefers the global person id', () => {
    expect(getOrganisationPersonKey({ global_person_id: 'person-id', appId: 'user-id' }))
      .toBe('global:person-id');
  });

  it('uses the app id when no global person id exists', () => {
    expect(getOrganisationPersonKey({ global_person_id: null, appId: 'user-id' }))
      .toBe('app:user-id');
  });

  it('returns null without a cross-tenant identity', () => {
    expect(getOrganisationPersonKey({ global_person_id: null, appId: undefined }))
      .toBeNull();
  });
});