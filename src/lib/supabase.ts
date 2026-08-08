import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://yzyiddavkkglbznvrbjw.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eWlkZGF2a2tnbGJ6bnZyYmp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMDUyNjUsImV4cCI6MjEwMTU4MTI2NX0.BrOGGg71XBUdAO9yriFVZ_LGFoFzi7r9rYR-TaoNbFM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// Sign in anonymously so the client sends a proper JWT in the
// Authorization header — required by Storage API in recent versions.
supabase.auth.signInAnonymously().catch(() => {
  // Non-critical: storage uploads will work on retry once session is established.
});