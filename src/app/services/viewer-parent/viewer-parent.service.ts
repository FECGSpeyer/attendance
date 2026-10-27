import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Viewer, Parent } from '../../utilities/interfaces';
import { Role, SupabaseTable } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';
import { translate } from '@jsverse/transloco';

@Injectable({
  providedIn: 'root'
})
export class ViewerParentService {

  async getViewers(tenantId: number): Promise<Viewer[]> {
    const { data, error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .select('*')
      .eq('tenantId', tenantId);

    if (error) {
      Utils.showToast(translate('svc.loadViewersFailed'), 'danger');
      throw error;
    }

    return data;
  }

  async createViewer(viewer: Partial<Viewer>, tenantId: number, appId: string): Promise<void> {
    const { error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .insert({
        ...viewer,
        tenantId,
        appId
      });

    if (error) {
      throw new Error(translate('db.addViewerFailed'));
    }
  }

  async deleteViewer(viewer: Viewer): Promise<void> {
    const { error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .delete()
      .match({ id: viewer.id });

    if (error) {
      Utils.showToast(translate('db.deleteViewerFailed'), 'danger');
      throw error;
    }
  }

  async getParents(tenantId: number): Promise<Parent[]> {
    const { data, error } = await supabase
      .from('parents')
      .select('*')
      .eq('tenantId', tenantId);

    if (error) {
      Utils.showToast(translate('svc.loadParentsFailed'), 'danger');
      throw error;
    }

    return data;
  }

  async createParent(parent: Partial<Parent>, tenantId: number, appId: string): Promise<Parent> {
    const { error, data } = await supabase
      .from('parents')
      .insert({
        ...parent,
        tenantId,
        appId
      })
      .select()
      .single();

    if (error) {
      throw new Error(translate('db.addParentFailed'));
    }

    return data;
  }

  async deleteParent(parent: Parent): Promise<void> {
    const { error } = await supabase
      .from('parents')
      .delete()
      .match({ id: parent.id });

    if (error) {
      Utils.showToast(translate('db.deleteParentFailed'), 'danger');
      throw error;
    }
  }
}
