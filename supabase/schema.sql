-- ════════════════════════════════════════════════════════════════════
--  Plataforma GTC · Detecta Clínica — Base de datos en Supabase
--  Ejecutar UNA vez en: Supabase → SQL Editor → New query → Run
--  Es seguro volver a ejecutarlo: usa "if not exists" / "or replace".
-- ════════════════════════════════════════════════════════════════════

-- ───────── Perfiles (un registro por usuario de la plataforma) ─────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  name        text not null,
  cargo       text not null default '',
  role        text not null check (role in ('jefe','da','dm','gg','gtc','analista','procesos','colaborador')),
  area        text not null default '',
  firma       text,                       -- firma guardada (imagen PNG en base64)
  must_change boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Rol del usuario conectado (para las reglas de acceso)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select name from public.profiles where id = auth.uid()
$$;

-- ───────── Expedientes (requerimiento → perfil → entrevistas) ─────────
create table if not exists public.cases (
  id          text primary key,
  created_by  uuid not null references public.profiles (id),
  data        jsonb not null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id),
  motivo      text generated always as (data #>> '{forms,RQ,data,motivo}') stored,
  categoria   text generated always as (data #>> '{forms,RQ,data,categoria}') stored,
  grupo       text generated always as (data #>> '{forms,RQ,data,grupo_ocupacional}') stored,
  gtc_firmado boolean generated always as ((data #> '{forms,RQ,signatures,gtc}') is not null) stored
);

-- ───────── Movimientos internos (GTC.PRS.03) ─────────
create table if not exists public.movimientos (
  id          text primary key,
  created_by  uuid not null references public.profiles (id),
  caso_id     text references public.cases (id),
  data        jsonb not null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id),
  colaborador text generated always as (data #>> '{form,data,colaborador}') stored
);

-- ───────── Bitácora inalterable (la escribe solo el servidor) ─────────
create table if not exists public.audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  entity     text not null,
  entity_id  text not null,
  action     text not null,
  detail     jsonb
);

-- ───────── Parámetros generales ─────────
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);
insert into public.settings (key, value) values ('DM_FIRMA_TODO_ASISTENCIAL', 'false') on conflict do nothing;

-- ───────── Correlativos RQ-2026-0001 / MOV-2026-0001 ─────────
create table if not exists public.counters (
  kind text not null,
  year integer not null,
  n    integer not null default 0,
  primary key (kind, year)
);

drop function if exists public.next_code(text);
create or replace function public.next_code(p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare y integer := extract(year from now() at time zone 'America/Lima'); v integer;
begin
  if p_kind not in ('RQ','MOV') then raise exception 'Tipo de correlativo no válido'; end if;
  if public.my_role() is null then raise exception 'Usuario no autorizado'; end if;
  insert into public.counters as c (kind, year, n) values (p_kind, y, 1)
  on conflict (kind, year) do update set n = c.n + 1
  returning c.n into v;
  return p_kind || '-' || y || '-' || lpad(v::text, 4, '0');
end $$;

-- ════════════════════════════════════════════════════════════════════
--  Protección de firmas (se ejecuta en el servidor en cada guardado)
--  · Una firma ya registrada no se puede alterar.
--  · Solo se puede borrar cuando el documento se devuelve con una observación.
--  · Una firma nueva queda a nombre del usuario conectado, con la hora del servidor.
--  · Control de versión: si dos personas guardan a la vez, la segunda recibe un aviso.
-- ════════════════════════════════════════════════════════════════════
create or replace function public._guard_form(old_form jsonb, new_form jsonb, path text[], entity text, entity_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k text; s jsonb; os jsonb; uid text := auth.uid()::text;
  me public.profiles%rowtype;
  old_obs integer := coalesce(jsonb_array_length(old_form -> 'observaciones'), 0);
  new_obs integer := coalesce(jsonb_array_length(new_form -> 'observaciones'), 0);
  result jsonb := new_form;
begin
  select * into me from public.profiles where id = auth.uid();
  -- Firmas existentes
  for k, os in select * from jsonb_each(coalesce(old_form -> 'signatures', '{}'::jsonb)) loop
    s := new_form -> 'signatures' -> k;
    if s is null then
      if new_obs <= old_obs then
        raise exception 'firma_protegida: no se puede retirar la firma "%" sin registrar una observación', k;
      end if;
    elsif s <> os then
      raise exception 'firma_protegida: la firma "%" ya registrada no se puede modificar', k;
    end if;
  end loop;
  -- Firmas nuevas
  for k, s in select * from jsonb_each(coalesce(new_form -> 'signatures', '{}'::jsonb)) loop
    if old_form -> 'signatures' -> k is null then
      if (s ->> 'userId') = uid then
        s := s || jsonb_build_object('name', me.name, 'cargo', me.cargo, 'role', me.role);
      elsif (s ->> 'userId') <> ('tablet:' || uid) then
        raise exception 'firma_ajena: solo puedes firmar con tu propio usuario';
      end if;
      s := s || jsonb_build_object('at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'server', true);
      result := jsonb_set(result, array['signatures', k], s, true);
      insert into public.audit_log (user_id, entity, entity_id, action, detail)
      values (auth.uid(), entity, entity_id, 'firma',
              jsonb_build_object('documento', array_to_string(path, '/'), 'casillero', k, 'decision', s -> 'decision', 'huella', s -> 'hash', 'firmante', s -> 'name'));
    end if;
  end loop;
  return result;
end $$;

create or replace function public._guard_entity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text; f jsonb; olddata jsonb; newdata jsonb; ent text := tg_table_name;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado'; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.version := 1;
    olddata := '{}'::jsonb;
  else
    if new.id <> old.id or new.created_by <> old.created_by then raise exception 'No se puede cambiar el código ni el autor'; end if;
    if new.version <> old.version then
      raise exception 'conflicto_version: otra persona guardó este documento mientras lo editabas';
    end if;
    new.version := old.version + 1;
    olddata := old.data;
  end if;
  newdata := new.data;
  if ent = 'cases' then
    for k, f in select * from jsonb_each(coalesce(newdata -> 'forms', '{}'::jsonb)) loop
      newdata := jsonb_set(newdata, array['forms', k],
        public._guard_form(coalesce(olddata -> 'forms' -> k, '{}'::jsonb), f, array['forms', k], ent, new.id));
    end loop;
    for k, f in select * from jsonb_each(coalesce(newdata -> 'fichas', '{}'::jsonb)) loop
      newdata := jsonb_set(newdata, array['fichas', k],
        public._guard_form(coalesce(olddata -> 'fichas' -> k, '{}'::jsonb), f, array['fichas', k], ent, new.id));
    end loop;
    -- Formularios o fichas con firmas que desaparecen por completo
    for k, f in select * from jsonb_each(coalesce(olddata -> 'forms', '{}'::jsonb)) loop
      if newdata -> 'forms' -> k is null and coalesce(f -> 'signatures', '{}'::jsonb) <> '{}'::jsonb then
        raise exception 'firma_protegida: el formulario % tiene firmas y no se puede eliminar', k;
      end if;
    end loop;
    for k, f in select * from jsonb_each(coalesce(olddata -> 'fichas', '{}'::jsonb)) loop
      if newdata -> 'fichas' -> k is null and coalesce(f -> 'signatures', '{}'::jsonb) <> '{}'::jsonb then
        raise exception 'firma_protegida: la ficha de % tiene firmas y no se puede eliminar', k;
      end if;
    end loop;
    -- Un proceso cerrado no se reabre
    if tg_op = 'UPDATE' and old.data ? 'seleccionado' and (old.data -> 'seleccionado') <> 'null'::jsonb
       and (newdata -> 'seleccionado') is distinct from (old.data -> 'seleccionado') then
      raise exception 'proceso_cerrado: el proceso ya se cerró con un candidato seleccionado';
    end if;
  else
    newdata := jsonb_set(newdata, '{form}',
      public._guard_form(coalesce(olddata -> 'form', '{}'::jsonb), coalesce(newdata -> 'form', '{}'::jsonb), array['form'], ent, new.id));
  end if;
  new.data := newdata;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    insert into public.audit_log (user_id, entity, entity_id, action) values (auth.uid(), ent, new.id, 'creacion');
  end if;
  return new;
end $$;

drop trigger if exists cases_guard on public.cases;
create trigger cases_guard before insert or update on public.cases
  for each row execute function public._guard_entity();
drop trigger if exists movimientos_guard on public.movimientos;
create trigger movimientos_guard before insert or update on public.movimientos
  for each row execute function public._guard_entity();

-- Los usuarios no pueden cambiar su propio rol, usuario ni estado
create or replace function public._guard_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  -- Solo aplica a usuarios de la plataforma; la función de administración usa la clave de servicio.
  if current_user in ('authenticated', 'anon') then
    if new.role <> old.role or new.username <> old.username or new.active <> old.active or new.id <> old.id
       or new.name <> old.name or new.cargo <> old.cargo or new.area <> old.area then
      raise exception 'Solo la Jefatura de GTC puede cambiar nombre, cargo, rol, usuario o estado de una cuenta';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public._guard_profile();

-- ════════════════════════════════════════════════════════════════════
--  Reglas de acceso (Row Level Security)
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles    enable row level security;
alter table public.cases       enable row level security;
alter table public.movimientos enable row level security;
alter table public.audit_log   enable row level security;
alter table public.settings    enable row level security;
alter table public.counters    enable row level security;

-- Perfiles: todos los usuarios activos ven la lista (nombres y cargos); cada uno edita solo su firma
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.my_role() is not null);
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Expedientes: cada rol ve solo lo que le corresponde según PRC-GTC-01/02
create or replace function public.can_see_case(c public.cases) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'gtc' then true
    when 'analista' then true
    when 'jefe' then c.created_by = auth.uid()
    when 'da' then c.motivo in ('ampliacion','puesto_nuevo') or c.grupo in ('coord','jefe','da','dm')
    when 'gg' then c.motivo in ('ampliacion','puesto_nuevo') or c.grupo in ('coord','jefe','da','dm')
    when 'dm' then c.motivo in ('ampliacion','puesto_nuevo') or c.grupo in ('coord','jefe','da','dm') or c.categoria = 'Asistencial'
    when 'procesos' then c.motivo = 'puesto_nuevo' and c.gtc_firmado
    else false end
$$;

drop policy if exists cases_read on public.cases;
create policy cases_read on public.cases for select to authenticated using (public.can_see_case(cases));
drop policy if exists cases_insert on public.cases;
create policy cases_insert on public.cases for insert to authenticated with check (public.my_role() = 'jefe');
drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases for update to authenticated using (public.can_see_case(cases)) with check (public.can_see_case(cases));
-- Sin política de borrado: nadie puede eliminar expedientes desde la plataforma.

-- Movimientos internos
create or replace function public.can_see_mov(m public.movimientos) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'gtc' then true
    when 'analista' then true
    when 'jefe' then true          -- las jefaturas firman como jefe actual o jefe de la nueva posición
    when 'da' then true
    when 'gg' then true
    when 'colaborador' then lower(coalesce(m.colaborador, '')) = lower(coalesce(public.my_name(), '-'))
    else false end
$$;
drop policy if exists movs_read on public.movimientos;
create policy movs_read on public.movimientos for select to authenticated using (public.can_see_mov(movimientos));
drop policy if exists movs_insert on public.movimientos;
create policy movs_insert on public.movimientos for insert to authenticated with check (public.my_role() in ('gtc','analista','jefe'));
drop policy if exists movs_update on public.movimientos;
create policy movs_update on public.movimientos for update to authenticated using (public.can_see_mov(movimientos)) with check (public.can_see_mov(movimientos));

-- Bitácora: solo GTC la consulta; nadie la modifica (la escriben los disparadores)
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.my_role() = 'gtc');

-- Parámetros: todos leen, solo la Jefatura de GTC modifica
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (public.my_role() is not null);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for update to authenticated using (public.my_role() = 'gtc') with check (public.my_role() = 'gtc');

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.cases, public.movimientos to authenticated;
grant select on public.audit_log to authenticated;
grant select, update on public.settings to authenticated;
grant execute on function public.next_code(text) to authenticated;
revoke all on public.counters from anon, authenticated;
revoke all on public.cases, public.movimientos, public.profiles, public.audit_log, public.settings from anon;

-- Actualización en vivo entre computadoras
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cases; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.movimientos; exception when duplicate_object then null; end;
  end if;
end $$;
