begin;
alter table public.routes add column if not exists archived_at timestamptz;
alter table public.routes add column if not exists management_version integer not null default 0;
alter table public.routes drop constraint if exists routes_tenant_id_code_key;
create unique index if not exists routes_live_code_unique_idx on public.routes(tenant_id,code) where archived_at is null;
drop policy if exists route_read on public.routes;
create policy route_read on public.routes for select to authenticated using(archived_at is null and tenant_id=public.my_tenant() and (public.is_manager() or driver_id=auth.uid()));
create or replace function public.can_read_route(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.routes where id=rid and archived_at is null and tenant_id=public.my_tenant() and (public.is_manager() or driver_id=auth.uid()))
$$;

create or replace function public.update_route(p_route_id uuid, p_version integer, payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.routes; d public.deliveries; s public.stops; item jsonb; n integer; idx integer:=0;
begin
 if not public.is_manager() then raise exception 'Acesso exclusivo do gestor'; end if;
 select * into r from public.routes where id=p_route_id and tenant_id=public.my_tenant() and archived_at is null for update;
 if not found then raise exception 'Rota não encontrada'; end if;
 if r.management_version is distinct from p_version then raise exception 'A rota foi alterada. Atualize a lista antes de editar'; end if;
 if r.status='concluida' then raise exception 'Rotas concluídas não podem ser editadas'; end if;
 if length(trim(payload->>'code')) not between 2 and 60 or payload->>'code' is null then raise exception 'Identificação inválida'; end if;
 if not exists(select 1 from public.profiles where id=(payload->>'driver_id')::uuid and tenant_id=r.tenant_id and role='motorista') then raise exception 'Motorista inválido'; end if;
 if not exists(select 1 from public.vehicles where id=(payload->>'vehicle_id')::uuid and tenant_id=r.tenant_id) then raise exception 'Veículo inválido'; end if;
 if (r.status='ativa' or exists(select 1 from public.deliveries where route_id=r.id and status<>'pendente')) and r.driver_id is distinct from (payload->>'driver_id')::uuid then raise exception 'Não é permitido trocar motorista após o check-in'; end if;
 if jsonb_typeof(payload->'deliveries') is distinct from 'array' then raise exception 'Entregas inválidas'; end if;
 select count(*) into n from public.deliveries where route_id=r.id;
 if jsonb_array_length(payload->'deliveries')<>n or (select count(distinct value->>'id') from jsonb_array_elements(payload->'deliveries'))<>n then raise exception 'Mantenha as entregas originais ao editar'; end if;
 for item in select value from jsonb_array_elements(payload->'deliveries') loop
  select * into d from public.deliveries where id=(item->>'id')::uuid and route_id=r.id for update;
  if not found then raise exception 'Entrega não pertence à rota'; end if;
  select * into s from public.stops where id=d.stop_id;
  idx:=idx+1;
  if s.sequence<>idx then raise exception 'Mantenha a ordem original das entregas'; end if;
  if not exists(select 1 from public.clients where id=(item->>'client_id')::uuid and tenant_id=r.tenant_id) then raise exception 'Cliente inválido'; end if;
  if not exists(select 1 from public.fiscal_documents where delivery_id=d.id and code=item->>'fiscal_code') then raise exception 'O documento fiscal original deve ser preservado'; end if;
  if d.status<>'pendente' and (d.client_id is distinct from (item->>'client_id')::uuid or d.cargo_code is distinct from item->>'cargo_code') then raise exception 'Cliente e código da carga confirmada devem ser preservados'; end if;
  if not ((item->>'weight_kg')::numeric>0 and (item->>'weight_kg')::numeric<1e12) or (item->>'weight_kg') is null or (item->>'volume_m3' is not null and not ((item->>'volume_m3')::numeric>0 and (item->>'volume_m3')::numeric<1e12)) then raise exception 'Peso ou volume inválido'; end if;
  if d.status='concluida' then
   if d.client_id is distinct from (item->>'client_id')::uuid or d.cargo_code is distinct from item->>'cargo_code' or d.description is distinct from item->>'description' or d.weight_kg is distinct from (item->>'weight_kg')::numeric or d.volume_m3 is distinct from (item->>'volume_m3')::numeric or s.address is distinct from item->'destination'->>'address' or s.latitude is distinct from (item->'destination'->>'latitude')::float8 or s.longitude is distinct from (item->'destination'->>'longitude')::float8 then raise exception 'Entregas concluídas devem ser preservadas'; end if;
  else
   if length(trim(item->>'cargo_code')) not between 1 and 80 or item->>'cargo_code' is null or length(trim(item->>'description')) not between 1 and 500 or item->>'description' is null then raise exception 'Dados da carga inválidos'; end if;
   if length(trim(item->'destination'->>'address'))<5 or item->'destination'->>'address' is null then raise exception 'Endereço inválido'; end if;
   update public.stops set address=item->'destination'->>'address',latitude=(item->'destination'->>'latitude')::float8,longitude=(item->'destination'->>'longitude')::float8 where id=s.id;
   update public.deliveries set client_id=(item->>'client_id')::uuid,cargo_code=item->>'cargo_code',description=item->>'description',weight_kg=(item->>'weight_kg')::numeric,volume_m3=(item->>'volume_m3')::numeric where id=d.id;
  end if;
 end loop;
 if length(trim(payload->'origin'->>'address'))<5 or payload->'origin'->>'address' is null then raise exception 'Origem inválida'; end if;
 update public.routes set code=trim(payload->>'code'),driver_id=(payload->>'driver_id')::uuid,vehicle_id=(payload->>'vehicle_id')::uuid,origin=payload->'origin'->>'address',origin_lat=(payload->'origin'->>'latitude')::float8,origin_lng=(payload->'origin'->>'longitude')::float8,destination=payload->'deliveries'->-1->'destination'->>'address',scheduled_at=(payload->>'scheduled_at')::timestamptz,management_version=management_version+1 where id=r.id;
 insert into public.audit_log(tenant_id,actor_id,action,entity_id) values(r.tenant_id,auth.uid(),'route_updated',r.id);
end $$;

create or replace function public.archive_routes(p_routes jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; r public.routes; n integer:=0;
begin
 if not public.is_manager() then raise exception 'Acesso exclusivo do gestor'; end if;
 if jsonb_typeof(p_routes) is distinct from 'array' or jsonb_array_length(p_routes) not between 1 and 100 then raise exception 'Selecione de 1 a 100 rotas'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_routes))<>jsonb_array_length(p_routes) then raise exception 'Rotas duplicadas'; end if;
 for item in select value from jsonb_array_elements(p_routes) order by value->>'id' loop
  select * into r from public.routes where id=(item->>'id')::uuid and tenant_id=public.my_tenant() and archived_at is null for update;
  if not found then raise exception 'Rota não encontrada'; end if;
  if r.management_version is distinct from (item->>'version')::integer then raise exception 'A rota foi alterada. Atualize a lista antes de excluir'; end if;
  update public.routes set archived_at=now(),status='concluida',completed_at=coalesce(completed_at,now()),management_version=management_version+1 where id=r.id;
  insert into public.audit_log(tenant_id,actor_id,action,entity_id) values(r.tenant_id,auth.uid(),'route_archived',r.id);
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.update_route(uuid,integer,jsonb),public.archive_routes(jsonb) from public,anon,authenticated;
grant execute on function public.update_route(uuid,integer,jsonb),public.archive_routes(jsonb) to authenticated;

create or replace function public.record_operation(p_event jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.routes; d public.deliveries; existing public.operational_events; t timestamptz:=(p_event->>'captured_at')::timestamptz; kind text:=p_event->>'kind';
begin
 select * into r from public.routes where id=(p_event->>'route_id')::uuid for update;
 if r.driver_id is distinct from auth.uid() or r.tenant_id is distinct from public.my_tenant() then raise exception 'Rota não atribuída'; end if;
 if r.archived_at is not null then return; end if;
 select * into existing from public.operational_events where id=(p_event->>'id')::uuid;
 if found then
  if existing.driver_id=auth.uid() and existing.route_id=r.id and existing.delivery_id=(p_event->>'delivery_id')::uuid and existing.kind=kind and existing.code=p_event->>'code' and existing.captured_at=t then return; end if;
  raise exception 'Identificador já utilizado';
 end if;
 select * into d from public.deliveries where id=(p_event->>'delivery_id')::uuid and route_id=r.id for update;
 if not found then raise exception 'Entrega não pertence à rota'; end if;
 if t is null or t>now()+interval '5 minutes' or t<r.created_at then raise exception 'Horário de captura inválido'; end if;
 if not exists(select 1 from public.fiscal_documents where delivery_id=d.id and code=p_event->>'code') then raise exception 'Documento não pertence à entrega'; end if;
 if kind='check_in' then
  if d.status<>'pendente' then raise exception 'Check-in já registrado'; end if;
  update public.deliveries set status='em_transporte',checked_in_at=t where id=d.id;
 elsif kind='check_out' then
  if d.status<>'em_transporte' or t<d.checked_in_at then raise exception 'Check-in correspondente não encontrado ou horário inválido'; end if;
  update public.deliveries set status='concluida',checked_out_at=t where id=d.id;
 else raise exception 'Operação inválida'; end if;
 insert into public.operational_events(id,tenant_id,driver_id,route_id,delivery_id,kind,code,captured_at) values((p_event->>'id')::uuid,r.tenant_id,auth.uid(),r.id,d.id,kind,p_event->>'code',t);
 if not exists(select 1 from public.deliveries where route_id=r.id and status<>'concluida') then
  update public.routes set status='concluida',completed_at=now() where id=r.id;
  insert into public.audit_log(tenant_id,actor_id,action,entity_id) values(r.tenant_id,auth.uid(),'route_completed',r.id);
 end if;
end $$;

create or replace function public.record_position(p_position jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.routes; existing public.positions; t timestamptz:=(p_position->>'captured_at')::timestamptz;
begin
 select * into r from public.routes where id=(p_position->>'route_id')::uuid for share;
 if r.driver_id is distinct from auth.uid() or r.tenant_id is distinct from public.my_tenant() then raise exception 'Rota não atribuída'; end if;
 if (p_position->>'driver_id')::uuid is distinct from auth.uid() then raise exception 'Motorista inválido'; end if;
 if r.archived_at is not null then return; end if;
 select * into existing from public.positions where id=(p_position->>'id')::uuid;
 if found then
  if existing.driver_id=auth.uid() and existing.route_id=r.id and existing.captured_at=t and existing.latitude=(p_position->>'latitude')::float8 and existing.longitude=(p_position->>'longitude')::float8 and existing.accuracy is not distinct from (p_position->>'accuracy')::float8 then return; end if;
  raise exception 'Identificador já utilizado';
 end if;
 if r.started_at is null or t is null or t<r.started_at or t>now()+interval '5 minutes' or (r.completed_at is not null and t>r.completed_at) then raise exception 'Posição fora do período da rota ativa'; end if;
 insert into public.positions(id,tenant_id,route_id,driver_id,latitude,longitude,accuracy,captured_at)
 values((p_position->>'id')::uuid,r.tenant_id,r.id,auth.uid(),(p_position->>'latitude')::float8,(p_position->>'longitude')::float8,(p_position->>'accuracy')::float8,t);
end $$;

notify pgrst, 'reload schema';
commit;
