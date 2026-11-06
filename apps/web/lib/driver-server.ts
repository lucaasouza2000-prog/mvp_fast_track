import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { serverSupabase } from "./server";
import type { Profile } from "@fasttrack/core";
import type { DriverDirectory } from "./driver-directory";
export async function driverManagerContext() {
  const db = await serverSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json(
        { error: "Sua sessão expirou. Entre novamente." },
        { status: 401 },
      ),
    };
  const { data: profile, error } = await db
    .from("profiles")
    .select("tenant_id,role")
    .eq("id", user.id)
    .single();
  if (error || profile?.role !== "gestor")
    return {
      error: NextResponse.json(
        { error: "Acesso exclusivo do gestor." },
        { status: 403 },
      ),
    };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return {
      error: NextResponse.json(
        {
          error:
            "Configure SUPABASE_SERVICE_ROLE_KEY no servidor Vercel para acessar os cadastros de motoristas.",
        },
        { status: 503 },
      ),
    };
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return { admin, tenant: profile.tenant_id as string, actor: user.id };
}
export function driverDirectory(admin: SupabaseClient): DriverDirectory {
  return {
    async getProfile(id) {
      const { data, error } = await admin
        .from("profiles")
        .select("id,tenant_id,name,role,phone")
        .eq("id", id)
        .maybeSingle();
      if (error)
        throw new Error("Não foi possível consultar o perfil do motorista.");
      return data as Profile | null;
    },
    async insertProfile(profile) {
      const { error } = await admin.from("profiles").insert(profile);
      if (error && error.code !== "23505")
        throw new Error(
          "Não foi possível vincular o perfil do motorista à empresa.",
        );
    },
    async getDriver(id) {
      const { data, error } = await admin
        .from("drivers")
        .select("id,tenant_id")
        .eq("id", id)
        .maybeSingle();
      if (error)
        throw new Error(
          "Não foi possível consultar o cadastro operacional do motorista.",
        );
      return data;
    },
    async insertDriver(id, tenant) {
      const { error } = await admin
        .from("drivers")
        .insert({ id, tenant_id: tenant });
      if (error && error.code !== "23505")
        throw new Error(
          "Não foi possível confirmar o cadastro operacional do motorista.",
        );
    },
    async audit(tenant, actor, id, action) {
      const { error } = await admin
        .from("audit_log")
        .insert({ tenant_id: tenant, actor_id: actor, entity_id: id, action });
      if (error)
        throw new Error(
          "O vínculo foi salvo, mas a auditoria não pôde ser confirmada. Atualize a lista para verificar.",
        );
    },
    async accounts(page, perPage) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error)
        throw new Error("Não foi possível conferir as contas da empresa.");
      return {
        users: data.users,
        nextPage: data.users.length === perPage ? page + 1 : null,
      };
    },
    async profiles(tenant) {
      const { data, error } = await admin
        .from("profiles")
        .select("id,tenant_id,name,role,phone")
        .eq("tenant_id", tenant)
        .eq("role", "motorista")
        .order("name");
      if (error)
        throw new Error(
          "Não foi possível carregar os motoristas da sua empresa.",
        );
      return (data ?? []) as Profile[];
    },
  };
}
