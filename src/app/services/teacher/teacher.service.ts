import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Teacher } from '../../utilities/interfaces';
import { pickTeacherFields } from '../../utilities/db-helpers';

@Injectable({
  providedIn: 'root'
})
export class TeacherService {

  async getTeachers(tenantId: number): Promise<Teacher[]> {
    const { data } = await supabase
      .from('teachers')
      .select('*')
      .eq('tenantId', tenantId)
      .order('name', {
        ascending: true,
      });

    return data;
  }

  async addTeacher(teacher: Teacher, tenantId: number): Promise<Teacher[]> {
    const dbFields = pickTeacherFields({ ...teacher, tenantId });
    const { data } = await supabase
      .from('teachers')
      .insert(dbFields as any)
      .select();

    return data;
  }

  async updateTeacher(teacher: Partial<Teacher>, id: number): Promise<Teacher[]> {
    const dbFields = pickTeacherFields(teacher);
    const { data } = await supabase
      .from('teachers')
      .update(dbFields as any)
      .match({ id });

    return data;
  }

  async deleteTeacher(id: number): Promise<void> {
    await supabase
      .from('teachers')
      .delete()
      .match({ id });
  }
}
