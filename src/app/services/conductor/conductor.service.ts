import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Person } from '../../utilities/interfaces';
import { DEFAULT_IMAGE } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class ConductorService {

  async getConductors(mainGroupId: number, tenantId: number, all: boolean = false): Promise<Person[]> {
    if (!mainGroupId) {
      throw new Error("Hauptgruppe nicht gefunden");
    }

    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('instrument', mainGroupId)
      .is('pending', false)
      .eq('tenantId', tenantId)
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Hauptgruppen-Personen", "danger");
      throw new Error("Fehler beim Laden der Personen");
    }

    return (all ? data : data.filter((c: any) => !c.left) as unknown as Person[])
      .map((con: any) => ({ ...con, img: con.img || DEFAULT_IMAGE }));
  }
}
