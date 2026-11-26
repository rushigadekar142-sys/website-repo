import { supabase } from "/js/supabase/client.js";

export async function startGoogleLogin() {
  const redirectTo = new URL("/auth/callback.html", window.location.origin).href;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { prompt: "select_account" }
    }
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Google sign-in did not return an authorization URL. Check that Google is enabled in Supabase Auth.");
  return data;
}
