import { Injectable, inject } from '@angular/core';
import { Group, GroupCategory, Teacher } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { supabase } from '../base/supabase';
import { pickGroupFields, pickTeacherFields } from '../../utilities/db-helpers';
import { TrackingEvent, TrackingService } from '../tracking/tracking.service';

@Injectable({
  providedIn: 'root'
})
export class GroupService {

  private tracking = inject(TrackingService);

  constructor() {}

  async getGroups(tenantId: number): Promise<Group[]> {
    const { data } = await supabase
      .from('instruments')
      .select('*, categoryData:category(*)')
      .eq('tenantId', tenantId)
      .order('category')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    return data as any;
  }

  getMainGroup(groups: Group[]): Group | undefined {
    return groups.find((inst: Group) => inst.maingroup);
  }

  async addGroup(name: string, tenantId: number, maingroup: boolean = false): Promise<Group[]> {
    const { data } = await supabase
      .from('instruments')
      .insert({
        name,
        tuning: 'C',
        clefs: ['g'],
        tenantId,
        maingroup,
      })
      .select();

    this.tracking.track(TrackingEvent.InstrumentAdded, { maingroup });
    return data;
  }

  async updateGroup(updates: Partial<Group>, id: number): Promise<Group[]> {
    const dbFields = pickGroupFields(updates);
    const { data, error } = await supabase
      .from('instruments')
      .update(dbFields as any)
      .match({ id })
      .select();

    if (error) {
      if (error.code === '23505') {
        Utils.showToast('Es kann nur eine Hauptgruppe existieren', 'danger');
      } else {
        Utils.showToast('Fehler beim updaten des Instruments', 'danger');
      }
      throw new Error('Fehler beim updaten des Instruments');
    }

    this.tracking.track(TrackingEvent.InstrumentUpdated);
    return data;
  }

  async removeGroup(id: number): Promise<Group[]> {
    const { data } = await supabase
      .from('instruments')
      .delete()
      .match({ id })
      .select();

    this.tracking.track(TrackingEvent.InstrumentRemoved);
    return data;
  }

  // Group Categories
  async getGroupCategories(tenantId: number): Promise<GroupCategory[]> {
    const { data } = await supabase
      .from('group_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('index', { ascending: true });

    return data;
  }

  async addGroupCategory(category: Partial<GroupCategory>, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('group_categories')
      .insert({ ...category, tenant_id: tenantId } as GroupCategory)
      .select();

    if (error) {
      throw new Error('Fehler beim hinzufügen der Gruppenkategorie');
    }
  }

  async updateGroupCategory(category: Partial<GroupCategory>, id: string): Promise<GroupCategory[]> {
    const { data } = await supabase
      .from('group_categories')
      .update(category)
      .match({ id });

    return data;
  }

  async removeGroupCategory(id: string): Promise<void> {
    await supabase
      .from('group_categories')
      .delete()
      .match({ id });
  }

  // Teachers
  async getTeachers(tenantId: number): Promise<Teacher[]> {
    const { data } = await supabase
      .from('teachers')
      .select('*')
      .eq('tenantId', tenantId)
      .order('name', { ascending: true });

    return data;
  }

  async addTeacher(teacher: Teacher, tenantId: number): Promise<Teacher[]> {
    const dbFields = pickTeacherFields({ ...teacher, tenantId });
    const { data } = await supabase
      .from('teachers')
      .insert(dbFields as any)
      .select();

    this.tracking.track(TrackingEvent.TeacherAdded);
    return data;
  }

  async updateTeacher(teacher: Partial<Teacher>, id: number): Promise<Teacher[]> {
    const dbFields = pickTeacherFields(teacher);
    const { data } = await supabase
      .from('teachers')
      .update(dbFields as any)
      .match({ id });

    this.tracking.track(TrackingEvent.TeacherUpdated);
    return data;
  }
}
