import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';

@Injectable({
  providedIn: 'root'
})
export class LegalService {
  private cached: string | null = null;

  async getLegalContent(): Promise<string> {
    if (this.cached) return this.cached;

    const { data, error } = await supabase
      .from('legal_content')
      .select('content_html')
      .eq('id', 1)
      .single();

    if (error) throw error;

    this.cached = data.content_html;
    return this.cached;
  }
}
