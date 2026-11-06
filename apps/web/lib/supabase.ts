"use client";
import { createBrowserClient } from "@supabase/ssr";
export const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let instance: ReturnType<typeof createBrowserClient> | undefined;
export function supabase() {
  if (!configured)
    throw new Error("Configure as variáveis públicas do Supabase.");
  return (instance ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}
