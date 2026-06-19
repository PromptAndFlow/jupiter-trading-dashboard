import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// If no Supabase keys are provided (e.g. open-source local usage or Vercel demo),
// export a dummy client that silently ignores database calls so the app doesn't crash.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => {},
      },
      from: () => ({
        select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
        upsert: async () => ({ error: null }),
        insert: async () => ({ error: null }),
        delete: () => ({ eq: async () => ({ error: null }), in: async () => ({ error: null }) })
      })
    };
