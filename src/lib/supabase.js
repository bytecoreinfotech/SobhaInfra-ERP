import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('your-supabase-url')
);

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] Running in offline demo mode with in-memory state.\n' +
    'To connect live database, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Checks connection health to Supabase
 * @returns {Promise<boolean>}
 */
export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from('organizations').select('id').limit(1);
    return !error;
  } catch (err) {
    console.warn('[Supabase] Connection test failed:', err.message);
    return false;
  }
}
