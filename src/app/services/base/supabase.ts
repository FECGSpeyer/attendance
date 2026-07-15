import { createClient, SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';
import { Database } from '../../utilities/supabase';

const options: SupabaseClientOptions<any> = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // We process every auth link shape ourselves in AppComponent.handleAuthUrl
    // (token_hash → verifyOtp, code → exchangeCodeForSession, access_token →
    // setSession). Auto-detection is therefore redundant and can race our own
    // handling for the single-use token, so we disable it.
    detectSessionInUrl: false,
  }
};

export const supabase = createClient<Database>(environment.apiUrl, environment.apiKey, options);

export const attendanceSelect = `*, persons:person_attendances(
  *, person:person_id(
    firstName, lastName, img, instrument(id, name), joined, appId, additional_fields
  )
)`;

export function getSupabase(): SupabaseClient {
  return supabase;
}
