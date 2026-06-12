import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = ws;
}

export function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
