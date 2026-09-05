-- MI M² EN BANCARIA — esquema de producción para Supabase/Postgres
create extension if not exists pgcrypto;

create table if not exists public.m2_units (
  id integer primary key check (id between 1 and 600),
  status text not null default 'available' check (status in ('available','reserved','acquired','blocked')),
  public_name text,
  blocked_reason text,
  acquired_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.m2_units(id)
select g from generate_series(1,600) g
on conflict (id) do nothing;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  buyer_first_name text not null,
  buyer_last_name text not null,
  division text not null,
  email text not null,
  public_mode text not null check (public_mode in ('nombre','familia','anonimo','honor')),
  public_name text not null,
  honor_text text,
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','expired','cancelled')),
  mp_preference_id text,
  mp_payment_id text,
  external_reference text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  voucher_code text,
  voucher_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reservation_units (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  m2_id integer not null references public.m2_units(id),
  primary key (reservation_id, m2_id)
);

create index if not exists reservations_status_idx on public.reservations(status);
create index if not exists reservations_expires_idx on public.reservations(expires_at);
create index if not exists reservation_units_m2_idx on public.reservation_units(m2_id);

-- RLS: el frontend público NO puede escribir. Las API usan service role.
alter table public.m2_units enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_units enable row level security;

create or replace function public.reserve_units(
  p_unit_ids integer[],
  p_first_name text,
  p_last_name text,
  p_division text,
  p_email text,
  p_public_mode text,
  p_public_name text,
  p_honor_text text,
  p_external_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r_id uuid := gen_random_uuid();
  unit_id integer;
  n integer;
  v_amount integer;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  if coalesce(array_length(p_unit_ids,1),0) < 1 then
    raise exception 'Debe seleccionar al menos un m²';
  end if;
  if coalesce(array_length(p_unit_ids,1),0) > 600 then
    raise exception 'Selección inválida';
  end if;

  -- Libera reservas vencidas antes de intentar tomar nuevas unidades.
  update public.m2_units u
  set status='available', updated_at=now()
  where u.status='reserved'
    and exists (
      select 1 from public.reservation_units ru
      join public.reservations r on r.id=ru.reservation_id
      where ru.m2_id=u.id and r.status='pending' and r.expires_at < now()
    );
  update public.reservations set status='expired'
  where status='pending' and expires_at < now();

  -- Bloqueo ordenado para evitar carreras entre compradores.
  for unit_id in select unnest(p_unit_ids) order by 1 loop
    perform 1 from public.m2_units where id=unit_id and status='available' for update;
    if not found then
      raise exception 'El m² % ya no está disponible', unit_id;
    end if;
  end loop;

  n := array_length(p_unit_ids,1);
  v_amount := n * 10000;

  insert into public.reservations(
    id,buyer_first_name,buyer_last_name,division,email,public_mode,public_name,honor_text,
    amount,status,external_reference,expires_at
  ) values (
    r_id,p_first_name,p_last_name,p_division,p_email,p_public_mode,p_public_name,p_honor_text,
    v_amount,'pending',p_external_reference,v_expires
  );

  foreach unit_id in array p_unit_ids loop
    insert into public.reservation_units(reservation_id,m2_id) values(r_id,unit_id);
    update public.m2_units set status='reserved', updated_at=now() where id=unit_id;
  end loop;

  return jsonb_build_object('reservation_id',r_id,'expires_at',v_expires,'amount',v_amount);
end;
$$;

create or replace function public.expire_reservations()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare c integer;
begin
  with expired as (
    update public.reservations
    set status='expired'
    where status='pending' and expires_at < now()
    returning id
  )
  update public.m2_units u
  set status='available', updated_at=now()
  where u.status='reserved' and exists (
    select 1 from public.reservation_units ru
    join public.reservations r on r.id=ru.reservation_id
    where ru.m2_id=u.id and r.status='expired'
  );
  get diagnostics c = row_count;
  return c;
end;
$$;

-- Para el webhook: marca la reserva como pagada y sus m² como adquiridos.
create or replace function public.mark_reservation_paid(
  p_reservation_id uuid,
  p_payment_id text,
  p_paid_at timestamptz,
  p_voucher_code text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id=p_reservation_id for update;
  if not found then raise exception 'Reserva inexistente'; end if;
  if r.status='paid' then return jsonb_build_object('ok',true,'already_paid',true); end if;
  if r.status <> 'pending' then raise exception 'Reserva no está pendiente'; end if;
  if r.expires_at < now() then raise exception 'Reserva vencida'; end if;

  update public.reservations set status='paid', mp_payment_id=p_payment_id, paid_at=p_paid_at, voucher_code=p_voucher_code where id=r.id;
  update public.m2_units u set status='acquired', public_name=r.public_name, acquired_at=p_paid_at, updated_at=now()
  where exists(select 1 from public.reservation_units ru where ru.reservation_id=r.id and ru.m2_id=u.id);
  return jsonb_build_object('ok',true,'already_paid',false);
end;
$$;

create or replace function public.cancel_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.reservations set status='cancelled' where id=p_reservation_id and status='pending';
  update public.m2_units u set status='available', updated_at=now()
  where u.status='reserved' and exists(select 1 from public.reservation_units ru where ru.reservation_id=p_reservation_id and ru.m2_id=u.id);
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.reserve_units(integer[],text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.reserve_units(integer[],text,text,text,text,text,text,text,text) to service_role;
revoke all on function public.expire_reservations() from public, anon, authenticated;
grant execute on function public.expire_reservations() to service_role;
revoke all on function public.mark_reservation_paid(uuid,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.mark_reservation_paid(uuid,text,timestamptz,text) to service_role;
revoke all on function public.cancel_reservation(uuid) from public, anon, authenticated;
grant execute on function public.cancel_reservation(uuid) to service_role;
