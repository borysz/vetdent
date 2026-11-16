-- Patients (the animals), synchronised exactly like clients: created on the
-- device with their final id, sent as field changes, merged field by field,
-- deleted by tombstone. Permissions are the same as for clients
-- (clients.write / clients.delete), as in the permission matrix.

create type public.species as enum ('dog', 'cat');
create type public.animal_sex as enum ('male', 'female', 'unknown');

create sequence public.patients_seq;

create table public.patients (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  species public.species not null,
  breed text check (breed is null or char_length(breed) <= 100),
  birth_date date check (birth_date is null or birth_date <= current_date),
  sex public.animal_sex not null default 'unknown',
  neutered boolean not null default false,
  weight_kg numeric(5, 2) check (weight_kg is null or (weight_kg > 0 and weight_kg <= 200)),
  microchip text check (microchip is null or microchip ~ '^[0-9A-Za-z]{9,20}$'),
  notes text check (notes is null or char_length(notes) <= 2000),
  rev integer not null default 1,
  field_revs jsonb not null default '{}'::jsonb,
  seq bigint not null default nextval('public.patients_seq'),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index patients_organization_seq_idx on public.patients (organization_id, seq);
create index patients_client_idx on public.patients (client_id);

alter table public.patients enable row level security;
revoke all on table public.patients from anon, authenticated;
grant all on table public.patients to service_role;
grant select on table public.patients to authenticated;

create policy "patients: members read"
  on public.patients for select to authenticated
  using (organization_id in (select private.my_organization_ids()));

alter table public.sync_conflicts drop constraint sync_conflicts_table_name_check;
alter table public.sync_conflicts add constraint sync_conflicts_table_name_check
  check (table_name in ('clients', 'patients'));

-- Returns the cleaned value as jsonb (SQL NULL = "no value"); raises
-- 'invalid_field' if the value is not acceptable.
create function private.clean_patient_field(p_field text, p_value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text;
  v_date date;
begin
  if p_field in ('neutered') then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_field'; end if;
    return p_value;
  end if;

  if p_field = 'weight_kg' then
    if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
    if jsonb_typeof(p_value) <> 'number' then raise exception 'invalid_field'; end if;
    if (p_value #>> '{}')::numeric <= 0 or (p_value #>> '{}')::numeric > 200 then raise exception 'invalid_field'; end if;
    return to_jsonb(round((p_value #>> '{}')::numeric, 2));
  end if;

  if p_value is null or jsonb_typeof(p_value) = 'null' then
    v_text := null;
  elsif jsonb_typeof(p_value) = 'string' then
    v_text := nullif(btrim(p_value #>> '{}'), '');
  else
    raise exception 'invalid_field';
  end if;

  if p_field = 'client_id' then
    if v_text is null or v_text !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_field'; end if;
    return to_jsonb(lower(v_text));
  elsif p_field = 'name' then
    if v_text is null or char_length(v_text) > 100 then raise exception 'invalid_field'; end if;
  elsif p_field = 'species' then
    if v_text not in ('dog', 'cat') then raise exception 'invalid_field'; end if;
  elsif p_field = 'sex' then
    if v_text not in ('male', 'female', 'unknown') then raise exception 'invalid_field'; end if;
  elsif p_field = 'breed' then
    if char_length(coalesce(v_text, '')) > 100 then raise exception 'invalid_field'; end if;
  elsif p_field = 'notes' then
    if char_length(coalesce(v_text, '')) > 2000 then raise exception 'invalid_field'; end if;
  elsif p_field = 'microchip' then
    if v_text is not null and v_text !~ '^[0-9A-Za-z]{9,20}$' then raise exception 'invalid_field'; end if;
  elsif p_field = 'birth_date' then
    if v_text is not null then
      if v_text !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_field'; end if;
      v_date := v_text::date;
      if v_date > current_date or v_date < date '1990-01-01' then raise exception 'invalid_field'; end if;
    end if;
  else
    raise exception 'invalid_field';
  end if;

  return case when v_text is null then null else to_jsonb(v_text) end;
end;
$$;

revoke execute on function private.clean_patient_field(text, jsonb) from public;

-- Same contract as sync_push_clients (see there). Extra rules: the owner (client)
-- must exist in the same organization, and the species cannot change afterwards.
create function public.sync_push_patients(p_organization_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields constant text[] := array[
    'client_id', 'name', 'species', 'breed', 'birth_date', 'sex', 'neutered', 'weight_kg', 'microchip', 'notes'
  ];
  v_results jsonb := '[]'::jsonb;
  v_change jsonb;
  v_id uuid;
  v_op text;
  v_base integer;
  v_in jsonb;
  v_row public.patients%rowtype;
  v_current jsonb;
  v_new jsonb;
  v_val jsonb;
  v_field text;
  v_changed boolean;
  v_conflicts integer;
  v_field_revs jsonb;
  v_rev integer;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 200 then
    raise exception 'invalid_batch';
  end if;

  perform private.require_permission(p_organization_id, 'clients.write');
  perform private.require_writable(p_organization_id);

  for v_change in select * from jsonb_array_elements(p_changes)
  loop
    v_conflicts := 0;
    begin
      v_id := (v_change ->> 'id')::uuid;
      v_op := coalesce(v_change ->> 'op', 'upsert');
      v_base := nullif(v_change ->> 'base_rev', '')::integer;
      v_in := coalesce(v_change -> 'fields', '{}'::jsonb);

      if v_op not in ('upsert', 'delete') or jsonb_typeof(v_in) <> 'object' then
        raise exception 'invalid_field';
      end if;

      select * into v_row from public.patients p where p.id = v_id for update;

      if found and v_row.organization_id <> p_organization_id then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
        continue;
      end if;

      if v_op = 'delete' then
        if not private.has_permission(p_organization_id, 'clients.delete') then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
          continue;
        end if;
        if not found or v_row.deleted_at is not null then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'unchanged', 'rev', v_row.rev);
          continue;
        end if;

        update public.patients p
        set deleted_at = now(), rev = p.rev + 1, seq = nextval('public.patients_seq'),
            updated_at = now(), updated_by = v_actor
        where p.id = v_id
        returning p.rev into v_rev;

        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', v_rev);
        continue;
      end if;

      -- upsert --------------------------------------------------------------
      if not found then
        v_new := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_in ? v_field then
            v_val := private.clean_patient_field(v_field, v_in -> v_field);
            v_new := v_new || jsonb_build_object(v_field, coalesce(v_val, 'null'::jsonb));
          end if;
        end loop;
        if coalesce(v_new ->> 'name', '') = '' or coalesce(v_new ->> 'species', '') = ''
           or coalesce(v_new ->> 'client_id', '') = '' then
          raise exception 'invalid_field';
        end if;

        -- The owner must be a (live) client of this very organization.
        if not exists (
          select 1 from public.clients c
          where c.id = (v_new ->> 'client_id')::uuid
            and c.organization_id = p_organization_id and c.deleted_at is null
        ) then
          raise exception 'invalid_field';
        end if;

        v_field_revs := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_new ? v_field then
            v_field_revs := v_field_revs || jsonb_build_object(v_field, 1);
          end if;
        end loop;

        insert into public.patients (
          id, organization_id, client_id, name, species, breed, birth_date, sex, neutered,
          weight_kg, microchip, notes, field_revs, created_by, updated_by
        )
        values (
          v_id, p_organization_id, (v_new ->> 'client_id')::uuid, v_new ->> 'name',
          (v_new ->> 'species')::public.species, v_new ->> 'breed', (v_new ->> 'birth_date')::date,
          coalesce((v_new ->> 'sex')::public.animal_sex, 'unknown'),
          coalesce((v_new ->> 'neutered')::boolean, false),
          (v_new ->> 'weight_kg')::numeric, v_new ->> 'microchip', v_new ->> 'notes',
          v_field_revs, v_actor, v_actor
        );

        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', 1);
        continue;
      end if;

      if v_row.deleted_at is not null then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'deleted', 'rev', v_row.rev);
        continue;
      end if;

      v_current := to_jsonb(v_row);
      v_new := v_current;
      v_field_revs := v_row.field_revs;
      v_changed := false;
      v_rev := v_row.rev + 1;

      foreach v_field in array v_fields loop
        continue when not (v_in ? v_field);

        v_val := private.clean_patient_field(v_field, v_in -> v_field);
        continue when v_val is not distinct from nullif(v_current -> v_field, 'null'::jsonb);

        -- The species fixes which teeth the animal has; it can never change.
        if v_field = 'species' then
          raise exception 'invalid_field';
        end if;
        if v_field = 'client_id' and not exists (
          select 1 from public.clients c
          where c.id = (v_val #>> '{}')::uuid
            and c.organization_id = p_organization_id and c.deleted_at is null
        ) then
          raise exception 'invalid_field';
        end if;

        if coalesce((v_row.field_revs ->> v_field)::integer, 0) > coalesce(v_base, 0) then
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'patients', v_id, v_field,
            nullif(v_current -> v_field, 'null'::jsonb), v_val, v_row.updated_by
          );
          v_conflicts := v_conflicts + 1;
        end if;

        v_new := jsonb_set(v_new, array[v_field], coalesce(v_val, 'null'::jsonb));
        v_field_revs := v_field_revs || jsonb_build_object(v_field, v_rev);
        v_changed := true;
      end loop;

      if not v_changed then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'unchanged', 'rev', v_row.rev);
        continue;
      end if;

      update public.patients p
      set client_id = (v_new ->> 'client_id')::uuid,
          name = v_new ->> 'name',
          breed = v_new ->> 'breed',
          birth_date = (v_new ->> 'birth_date')::date,
          sex = (v_new ->> 'sex')::public.animal_sex,
          neutered = (v_new ->> 'neutered')::boolean,
          weight_kg = (v_new ->> 'weight_kg')::numeric,
          microchip = v_new ->> 'microchip',
          notes = v_new ->> 'notes',
          field_revs = v_field_revs,
          rev = v_rev,
          seq = nextval('public.patients_seq'),
          updated_at = now(),
          updated_by = v_actor
      where p.id = v_id;

      v_results := v_results || jsonb_build_object(
        'id', v_id, 'status', 'applied', 'rev', v_rev, 'conflicts', v_conflicts);
    exception
      when raise_exception or invalid_text_representation or numeric_value_out_of_range
        or invalid_datetime_format or datetime_field_overflow or foreign_key_violation or check_violation then
        v_results := v_results || jsonb_build_object('id', v_change ->> 'id', 'status', 'invalid');
    end;
  end loop;

  return v_results;
end;
$$;

revoke execute on function public.sync_push_patients(uuid, jsonb) from public, anon;
grant execute on function public.sync_push_patients(uuid, jsonb) to authenticated;

-- A client that still has patients cannot be deleted by a device without
-- the patients being dealt with first: deleting a client tombstones the
-- client only; patients keep pointing at it and stay readable.
