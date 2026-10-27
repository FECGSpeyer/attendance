import { Injectable, inject } from '@angular/core';
import { Network } from '@capacitor/network';
import { Storage } from '@ionic/storage-angular';
import { supabase } from '../base/supabase';
import { Person } from '../../utilities/interfaces';
import { DEFAULT_IMAGE } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';
import { translate } from '@jsverse/transloco';

@Injectable({
  providedIn: 'root'
})
export class ConductorService {

  private storage = inject(Storage);

  async getConductors(mainGroupId: number, tenantId: number, all: boolean = false): Promise<Person[]> {
    if (!mainGroupId) {
      throw new Error(translate('db.mainGroupNotFound'));
    }

    const cacheKey = `offline_conductors_v1_${tenantId}`;
    const { connected } = await Network.getStatus();

    if (!connected) {
      const cached = await this.storage.get(cacheKey);
      const data: Person[] = (cached ?? []) as Person[];
      return all ? data : data.filter((c: any) => !c.left);
    }

    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('instrument', mainGroupId)
      .is('pending', false)
      .eq('tenantId', tenantId)
      .order('lastName');

    if (error) {
      Utils.showToast(translate('svc.loadMainGroupPeopleFailed'), 'danger');
      throw new Error(translate('db.loadPeopleFailed'));
    }

    const result = (all ? data : data.filter((c: any) => !c.left) as unknown as Person[])
      .map((con: any) => ({ ...con, img: con.img || DEFAULT_IMAGE }));

    void this.storage.set(cacheKey, result);
    return result;
  }
}
