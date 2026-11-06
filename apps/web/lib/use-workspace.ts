"use client";
import { useCallback, useEffect, useState } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  routeSelection,
  type Profile,
  type Role,
  type Route,
} from "@fasttrack/core";
import { configured, supabase } from "./supabase";
import { useInterfacesPreview } from "./interfaces-preview";
export function useWorkspace(role: Role) {
  const preview = useInterfacesPreview();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null),
    [routes, setRoutes] = useState<Route[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (preview || !configured) {
      setProfile(null);
      setRoutes([]);
      setError("");
      setLoading(false);
      return;
    }
    try {
      const db = supabase();
      const {
        data: { user },
        error: authError,
      } = await db.auth.getUser();
      if (authError || !user) {
        router.replace("/login");
        return;
      }
      const { data: p, error: pe } = await db
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (pe || !p)
        throw new Error(
          "Sua conta ainda não possui um perfil. Solicite o cadastro ao gestor.",
        );
      if (p.role !== role) {
        router.replace(p.role === "gestor" ? "/gestao" : "/motorista");
        return;
      }
      setProfile(p as Profile);
      const { data, error: e } = await db
        .from("routes")
        .select(routeSelection)
        .order("created_at", { ascending: false });
      if (e) throw e;
      setRoutes((data ?? []) as unknown as Route[]);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [role, router, preview]);
  useEffect(() => {
    void reload();
    if (preview || !configured) return;
    const db = supabase();
    const channel = db
      .channel("workspace")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "routes" },
        () => void reload(),
      )
      .subscribe();
    const timer = setInterval(() => void reload(), 30000);
    const auth = db.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      void db.removeChannel(channel);
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
  }, [reload, router, preview]);
  return { profile, routes, loading, error, reload };
}
