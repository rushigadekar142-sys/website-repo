import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://zrkflcbcmqpxbvyklome.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uMlVD7-Y-mkHpzxT5XwXuw_4Nnr_dvP";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce"
  }
});
