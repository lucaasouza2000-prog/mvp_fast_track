begin;
create table public.tenants (id uuid primary key default gen_random_uuid(), name text not null);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 tenant_id uuid not null references public.tenants(id), name text not null,
 role text not null check (role in ('gestor','motorista')), phone text,
 unique(id,tenant_id)
);
create table public.drivers (
 id uuid primary key, tenant_id uuid not null, created_at timestamptz not null default now(),
 foreign key(id,tenant_id) references public.profiles(id,tenant_id) on delete cascade
);
create table public.vehicles (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), plate text not null, description text not null default '', unique(id,tenant_id), unique(tenant_id,plate));
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), name text not null, unique(id,tenant_id));
create table public.routes (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), code text not null,
 driver_id uuid not null, vehicle_id uuid not null,
 origin text not null, origin_lat double precision not null check(origin_lat between -90 and 90), origin_lng double precision not null check(origin_lng between -180 and 180), destination text not null,
 scheduled_at timestamptz, status text not null default 'planejada' check(status in ('planejada','ativa','concluida')),
 created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
 unique(id,tenant_id), unique(tenant_id,code),
 constraint routes_driver_id_fkey foreign key(driver_id,tenant_id) references public.profiles(id,tenant_id),
 foreign key(vehicle_id,tenant_id) references public.vehicles(id,tenant_id)
);
create table public.stops (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, route_id uuid not null, sequence integer not null check(sequence>0),
 address text not null, latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
 unique(id,route_id,tenant_id), unique(route_id,sequence), foreign key(route_id,tenant_id) references public.routes(id,tenant_id)
);
create table public.deliveries (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, route_id uuid not null, stop_id uuid not null, client_id uuid not null,
 cargo_code text not null, description text not null, weight_kg numeric not null check(weight_kg>0), volume_m3 numeric check(volume_m3>0),
 status text not null default 'pendente' check(status in ('pendente','em_transporte','concluida')),
 checked_in_at timestamptz, checked_out_at timestamptz,
 unique(id,tenant_id), unique(route_id,cargo_code),
 foreign key(route_id,tenant_id) references public.routes(id,tenant_id),
 foreign key(stop_id,route_id,tenant_id) references public.stops(id,route_id,tenant_id),
 foreign key(client_id,tenant_id) references public.clients(id,tenant_id)
);
create table public.fiscal_documents (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, delivery_id uuid not null,
 code text not null, unique(delivery_id,code),
 foreign key(delivery_id,tenant_id) references public.deliveries(id,tenant_id)
);
create table public.operational_events (
 id uuid primary key, tenant_id uuid not null references public.tenants(id), driver_id uuid not null references public.profiles(id),
 route_id uuid not null references public.routes(id), delivery_id uuid not null references public.deliveries(id),
 kind text not null check(kind in ('check_in','check_out')), code text not null,
 captured_at timestamptz not null, received_at timestamptz not null default now(),
 unique(delivery_id,kind)
);
create table public.positions (
 id uuid primary key, tenant_id uuid not null references public.tenants(id), route_id uuid not null references public.routes(id), driver_id uuid not null references public.profiles(id),
 latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
 accuracy double precision check(accuracy>=0), captured_at timestamptz not null, received_at timestamptz not null default now()
);
create table public.audit_log (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), actor_id uuid not null, action text not null, entity_id uuid not null, created_at timestamptz not null default now());
create index routes_driver_idx on public.routes(driver_id,status);
create index deliveries_route_idx on public.deliveries(route_id);
create index deliveries_client_idx on public.deliveries(client_id);
create index fiscal_code_idx on public.fiscal_documents(code);
create index positions_route_time_idx on public.positions(route_id,captured_at desc);
create index events_route_idx on public.operational_events(route_id,captured_at);
create index profiles_tenant_idx on public.profiles(tenant_id);

create function public.my_tenant() returns uuid language sql stable security definer set search_path = '' as $$ select tenant_id from public.profiles where id=auth.uid() $$;
create function public.is_manager() returns boolean language sql stable security definer set search_path = '' as $$ select coalesce((select role='gestor' from public.profiles where id=auth.uid()),false) $$;
create function public.can_read_route(rid uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.routes where id=rid and tenant_id=public.my_tenant() and (public.is_manager() or driver_id=auth.uid())) $$;

-- Only the trusted admin API sets app_metadata. User-editable user_metadata is never read.
create function public.provision_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.raw_app_meta_data->>'tenant_id' is not null then
  if new.raw_app_meta_data->>'role' not in ('gestor','motorista') then raise exception 'Papel inválido'; end if;
  insert into public.profiles(id,tenant_id,name,role,phone) values(new.id,(new.raw_app_meta_data->>'tenant_id')::uuid,coalesce(new.raw_app_meta_data->>'name',new.email),new.raw_app_meta_data->>'role',new.raw_app_meta_data->>'phone');
  if new.raw_app_meta_data->>'role'='motorista' then insert into public.drivers(id,tenant_id) values(new.id,(new.raw_app_meta_data->>'tenant_id')::uuid); end if;
 end if;
 return new;
end $$;
create trigger provision_profile after insert on auth.users for each row execute function public.provision_profile();

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.clients enable row level security;
alter table public.vehicles enable row level security;
alter table public.routes enable row level security;
alter table public.stops enable row level security;
alter table public.deliveries enable row level security;
alter table public.fiscal_documents enable row level security;
alter table public.operational_events enable row level security;
alter table public.positions enable row level security;
alter table public.audit_log enable row level security;
create policy tenant_read on public.tenants for select to authenticated using(id=public.my_tenant());
create policy profile_read on public.profiles for select to authenticated using(tenant_id=public.my_tenant() and (id=auth.uid() or public.is_manager()));
create policy driver_read on public.drivers for select to authenticated using(tenant_id=public.my_tenant() and (id=auth.uid() or public.is_manager()));
create policy vehicle_read on public.vehicles for select to authenticated using(tenant_id=public.my_tenant() and (public.is_manager() or exists(select 1 from public.routes r where r.vehicle_id=vehicles.id and r.driver_id=auth.uid())));
create policy vehicle_create on public.vehicles for insert to authenticated with check(tenant_id=public.my_tenant() and public.is_manager());
create policy client_read on public.clients for select to authenticated using(tenant_id=public.my_tenant() and (public.is_manager() or exists(select 1 from public.deliveries d join public.routes r on r.id=d.route_id where d.client_id=clients.id and r.driver_id=auth.uid())));
create policy client_create on public.clients for insert to authenticated with check(tenant_id=public.my_tenant() and public.is_manager());
create policy route_read on public.routes for select to authenticated using(tenant_id=public.my_tenant() and (public.is_manager() or driver_id=auth.uid()));
create policy stop_read on public.stops for select to authenticated using(public.can_read_route(route_id));
create policy delivery_read on public.deliveries for select to authenticated using(public.can_read_route(route_id));
create policy document_read on public.fiscal_documents for select to authenticated using(exists(select 1 from public.deliveries d where d.id=delivery_id and public.can_read_route(d.route_id)));
create policy event_read on public.operational_events for select to authenticated using(public.can_read_route(route_id));
create policy position_read on public.positions for select to authenticated using(public.can_read_route(route_id));
create policy audit_read on public.audit_log for select to authenticated using(tenant_id=public.my_tenant() and public.is_manager());

create function public.assert_fiscal(code text) returns void language plpgsql immutable set search_path='' as $$
declare total integer:=0; w integer:=2; dv integer; i integer;
begin
 if code !~ '^[A-Z0-9][A-Z0-9./_-]{0,79}$' then raise exception 'Formato fiscal inválido'; end if;
 if code ~ '^\d{44}$' then
  for i in reverse 43..1 loop total:=total+substr(code,i,1)::integer*w; w:=case when w=9 then 2 else w+1 end; end loop;
  dv:=11-total%11; if dv>=10 then dv:=0; end if;
  if dv<>substr(code,44,1)::integer then raise exception 'Dígito verificador inválido'; end if;
 elsif code ~ '^\d{44,}$' then raise exception 'Chave fiscal inválida';
 end if;
end $$;
create function public.create_route(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid:=public.my_tenant(); rid uuid:=gen_random_uuid(); sid uuid; did uuid; item jsonb; seq integer:=0;
begin
 if not public.is_manager() then raise exception 'Acesso exclusivo do gestor'; end if;
 if jsonb_typeof(payload->'deliveries') is distinct from 'array' or jsonb_array_length(payload->'deliveries') not between 1 and 100 then raise exception 'Informe de 1 a 100 entregas'; end if;
 if not exists(select 1 from public.profiles where id=(payload->>'driver_id')::uuid and tenant_id=tid and role='motorista') then raise exception 'Motorista inválido'; end if;
 if length(payload->>'code') not between 2 and 60 then raise exception 'Identificação inválida'; end if;
 insert into public.routes(id,tenant_id,code,driver_id,vehicle_id,origin,origin_lat,origin_lng,destination,scheduled_at)
 values(rid,tid,payload->>'code',(payload->>'driver_id')::uuid,(payload->>'vehicle_id')::uuid,payload->'origin'->>'address',(payload->'origin'->>'latitude')::float8,(payload->'origin'->>'longitude')::float8,payload->'deliveries'->-1->'destination'->>'address',(payload->>'scheduled_at')::timestamptz);
 for item in select * from jsonb_array_elements(payload->'deliveries') loop
  perform public.assert_fiscal(item->>'fiscal_code');
  sid:=gen_random_uuid(); did:=gen_random_uuid(); seq:=seq+1;
  insert into public.stops(id,tenant_id,route_id,sequence,address,latitude,longitude) values(sid,tid,rid,seq,item->'destination'->>'address',(item->'destination'->>'latitude')::float8,(item->'destination'->>'longitude')::float8);
  insert into public.deliveries(id,tenant_id,route_id,stop_id,client_id,cargo_code,description,weight_kg,volume_m3) values(did,tid,rid,sid,(item->>'client_id')::uuid,item->>'cargo_code',item->>'description',(item->>'weight_kg')::numeric,(item->>'volume_m3')::numeric);
  insert into public.fiscal_documents(tenant_id,delivery_id,code) values(tid,did,item->>'fiscal_code');
 end loop;
 insert into public.audit_log(tenant_id,actor_id,action,entity_id) values(tid,auth.uid(),'route_created',rid);
 return rid;
end $$;
create function public.start_route(p_route_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.routes;
begin
 select * into r from public.routes where id=p_route_id for update;
 if r.driver_id is distinct from auth.uid() or r.tenant_id is distinct from public.my_tenant() then raise exception 'Rota não atribuída'; end if;
 if r.status='ativa' then return; end if;
 if r.status<>'planejada' then raise exception 'Rota já concluída'; end if;
 if exists(select 1 from public.routes where driver_id=auth.uid() and status='ativa' and id<>p_route_id) then raise exception 'Finalize a rota ativa antes de iniciar outra'; end if;
 if not exists(select 1 from public.deliveries where route_id=p_route_id and status='em_transporte') then raise exception 'Confirme pelo menos uma carga antes de iniciar'; end if;
 update public.routes set status='ativa',started_at=now() where id=p_route_id;
 insert into public.audit_log(tenant_id,actor_id,action,entity_id) values(r.tenant_id,auth.uid(),'route_started',r.id);
end $$;
-- A driver can only have one active native tracking session.
create unique index one_active_route_per_driver on public.routes(driver_id) where status='ativa';
create function public.record_operation(p_event jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.routes; d public.deliveries; existing public.operational_events; t timestamptz:=(p_event->>'captured_at')::timestamptz; kind text:=p_event->>'kind';
begin
 select * into r from public.routes where id=(p_event->>'route_id')::uuid for update;
 if r.driver_id is distinct from auth.uid() or r.tenant_id is distinct from public.my_tenant() then raise exception 'Rota não atribuída'; end if;
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
create function public.record_position(p_position jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.routes; existing public.positions; t timestamptz:=(p_position->>'captured_at')::timestamptz;
begin
 select * into r from public.routes where id=(p_position->>'route_id')::uuid for share;
 if r.driver_id is distinct from auth.uid() or r.tenant_id is distinct from public.my_tenant() then raise exception 'Rota não atribuída'; end if;
 if (p_position->>'driver_id')::uuid is distinct from auth.uid() then raise exception 'Motorista inválido'; end if;
 select * into existing from public.positions where id=(p_position->>'id')::uuid;
 if found then
  if existing.driver_id=auth.uid() and existing.route_id=r.id and existing.captured_at=t and existing.latitude=(p_position->>'latitude')::float8 and existing.longitude=(p_position->>'longitude')::float8 and existing.accuracy is not distinct from (p_position->>'accuracy')::float8 then return; end if;
  raise exception 'Identificador já utilizado';
 end if;
 if r.started_at is null or t is null or t<r.started_at or t>now()+interval '5 minutes' or (r.completed_at is not null and t>r.completed_at) then raise exception 'Posição fora do período da rota ativa'; end if;
 insert into public.positions(id,tenant_id,route_id,driver_id,latitude,longitude,accuracy,captured_at)
 values((p_position->>'id')::uuid,r.tenant_id,r.id,auth.uid(),(p_position->>'latitude')::float8,(p_position->>'longitude')::float8,(p_position->>'accuracy')::float8,t);
end $$;
-- No client receives direct write privileges for routes, roles, events or GPS.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.tenants,public.profiles,public.drivers,public.vehicles,public.clients,public.routes,public.stops,public.deliveries,public.fiscal_documents,public.operational_events,public.positions,public.audit_log to authenticated;
grant insert on public.clients,public.vehicles to authenticated;
revoke all on function public.provision_profile(),public.assert_fiscal(text),public.my_tenant(),public.is_manager(),public.can_read_route(uuid),public.create_route(jsonb),public.start_route(uuid),public.record_operation(jsonb),public.record_position(jsonb) from public,anon,authenticated;
grant execute on function public.my_tenant(),public.is_manager(),public.can_read_route(uuid),public.create_route(jsonb),public.start_route(uuid),public.record_operation(jsonb),public.record_position(jsonb) to authenticated;
alter publication supabase_realtime add table public.positions,public.routes,public.deliveries,public.operational_events;
commit;
