import { createClient, SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';
import { Database } from '../../utilities/supabase';

const options: SupabaseClientOptions<any> = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
};

export const supabase = createClient<Database>(environment.apiUrl, environment.apiKey, options);

export const attendanceSelect: string = `*, persons:person_attendances(
  *, person:person_id(
    firstName, lastName, img, instrument(id, name), joined, appId, additional_fields
  )
)`;

export function getSupabase(): SupabaseClient {
  return supabase;
}
