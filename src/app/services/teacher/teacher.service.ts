import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Teacher } from '../../utilities/interfaces';

@Injectable({
  providedIn: 'root'
})
export class TeacherService {

  async getTeachers(tenantId: number): Promise<Teacher[]> {
    const { data } = await supabase
      .from('teachers')
      .select('*')
      .eq('tenantId', tenantId)
      .order("name", {
        ascending: true,
      });

    return data;
  }

  async addTeacher(teacher: Teacher, tenantId: number): Promise<Teacher[]> {
    const { data } = await supabase
      .from('teachers')
      .insert({
        ...teacher,
        tenantId,
      })
      .select();

    return data;
  }

  async updateTeacher(teacher: Partial<Teacher>, id: number): Promise<Teacher[]> {
    delete (teacher as any).insNames;
    delete (teacher as any).playerCount;

    const { data } = await supabase
      .from('teachers')
      .update(teacher)
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
