/** Run this SQL as the database owner in Supabase SQL Editor, never as an RPC. */
export function managerBootstrapSql(
  email: string,
  name: string,
  company = "Fast Ariam Equipamentos",
): string {
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
    throw new Error("Informe um e-mail válido.");
  if (name.trim().length < 3 || name.length > 120)
    throw new Error("Informe o nome completo do gestor.");
  if (!company.trim() || company.length > 200)
    throw new Error("Informe uma empresa válida.");
  const literal = (v: string) => "'" + v.replaceAll("'", "''") + "'";
  let delimiter = "$fasttrack$";
  let suffix = 0;
  while ([email, name, company].some((value) => value.includes(delimiter)))
    delimiter = `$fasttrack_${++suffix}$`;
  return `-- Execute no SQL Editor como proprietário do banco. Não contém senhas.\nDO ${delimiter}\nDECLARE\n  manager_email text := ${literal(email.trim().toLowerCase())};\n  manager_name text := ${literal(name.trim())};\n  company_name text := ${literal(company.trim())};\n  user_id uuid; company_id uuid; existing_role text;\nBEGIN\n  IF current_user NOT IN ('postgres', 'supabase_admin') THEN\n    RAISE EXCEPTION 'Execute apenas no SQL Editor com o papel postgres.';\n  END IF;\n  PERFORM pg_advisory_xact_lock(hashtext('fasttrack-bootstrap-manager'));\n  SELECT id INTO user_id FROM auth.users WHERE lower(email) = manager_email AND email_confirmed_at IS NOT NULL;\n  IF user_id IS NULL THEN RAISE EXCEPTION 'Primeiro crie e confirme este usuário em Authentication > Users.'; END IF;\n  SELECT tenant_id, role INTO company_id, existing_role FROM public.profiles WHERE id = user_id;\n  IF existing_role = 'gestor' THEN RAISE NOTICE 'Este usuário já é gestor; nenhum cadastro foi duplicado.'; RETURN; END IF;\n  IF existing_role IS NOT NULL THEN RAISE EXCEPTION 'O usuário já tem outro papel. Revise a conta antes de alterar privilégios.'; END IF;\n  INSERT INTO public.tenants(name) VALUES(company_name) RETURNING id INTO company_id;\n  UPDATE auth.users SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', company_id, 'role', 'gestor', 'name', manager_name) WHERE id = user_id;\n  INSERT INTO public.profiles(id, tenant_id, name, role) VALUES(user_id, company_id, manager_name, 'gestor');\n  INSERT INTO public.audit_log(tenant_id, actor_id, action, entity_id) VALUES(company_id, user_id, 'manager_provisioned', user_id);\nEND\n${delimiter};`;
}
