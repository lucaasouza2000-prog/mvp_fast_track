import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
const storage = {
  async getItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.count`));
    if (!count) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(`${key}.${i}`),
      ),
    );
    return chunks.some((x) => x === null) ? null : chunks.join("");
  },
  async setItem(key: string, value: string) {
    const old = Number(await SecureStore.getItemAsync(`${key}.count`));
    const chunks = value.match(/[\s\S]{1,1800}/g) ?? [];
    for (let i = 0; i < chunks.length; i++)
      await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
    await SecureStore.setItemAsync(`${key}.count`, String(chunks.length));
    for (let i = chunks.length; i < old; i++)
      await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.count`));
    await SecureStore.deleteItemAsync(`${key}.count`);
    for (let i = 0; i < count; i++)
      await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
};
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
