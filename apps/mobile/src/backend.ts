import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { createSecureSessionStorage } from "./secure-session";
const storage = createSecureSessionStorage(SecureStore);
const timedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const original = init?.signal;
  if (original?.aborted) controller.abort();
  original?.addEventListener("abort", cancel);
  const timer = setTimeout(cancel, 25_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    original?.removeEventListener("abort", cancel);
  }
};
export const configured =
  !!process.env.EXPO_PUBLIC_SUPABASE_URL &&
  !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const backend = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "unconfigured",
  {
    global: { fetch: timedFetch },
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
