import { supabase } from "/js/supabase/client.js";

export async function startGoogleLogin(returnTo = "/") {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL(returnTo, window.location.origin).href }
  });
  if (error) throw error;
}
