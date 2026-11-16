-- Visits (treatment records, "kezelési lap"). Synchronised like clients and
-- patients: created on the device with their final id, sent as field changes,
-- merged field by field, deleted by tombstone.
--
-- On top of that a visit has a life cycle: draft -> final. Finalising and
-- reopening are NOT part of the sync protocol; they are separate functions that
-- only work online, check the clinical permission on the server and are written
-- to the audit log. A final visit cannot be edited: an edit that arrives for it
-- (from a device that was offline while it was finalised) is not applied, but
-- is kept in sync_conflicts, so nothing is lost silently.

create type public.visit_status as enum ('draft', 'final');

create sequence public.visits_seq;

create table public.visits (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid not null references public.patients (id),
  -- A) header
  visit_date date not null,
  veterinarian_name text check (veterinarian_name is null or char_length(veterinarian_name) <= 200),
  assistant_name text check (assistant_name is null or char_length(assistant_name) <= 200),
  asa_status smallint check (asa_status is null or asa_status between 1 and 5),
  -- Clinic-local wall-clock time, no zone: it is a fact about the day, not an instant.
  last_fed_at timestamp,
  blood_summary text check (blood_summary is null or char_length(blood_summary) <= 1000),
  weight_kg numeric(5, 2) check (weight_kg is null or (weight_kg > 0 and weight_kg <= 200)),
  -- B) history
  complaint_tags jsonb not null default '[]'::jsonb,
  complaint_notes text check (complaint_notes is null or char_length(complaint_notes) <= 2000),
  home_brushing text check (home_brushing is null or char_length(home_brushing) <= 200),
  diet_type text check (diet_type is null or char_length(diet_type) <= 200),
  -- D) procedure log
  anesthesia_blocks jsonb not null default '[]'::jsonb,
  sutures text check (sutures is null or char_length(sutures) <= 2000),
  -- E) aftercare
  medications jsonb not null default '[]'::jsonb,
  feeding_advice text check (feeding_advice is null or char_length(feeding_advice) <= 2000),
  follow_up_date date,
  -- Set on a device that cannot finalise (offline, or without the permission).
  ready_to_finalize boolean not null default false,
  -- Life cycle (changed only by finalize_visit / reopen_visit).
  status public.visit_status not null default 'draft',
  finalized_at timestamptz,
  finalized_by uuid references public.profiles (id) on delete set null,
  rev integer not null default 1,
  field_revs jsonb not null default '{}'::jsonb,
  seq bigint not null default nextval('public.visits_seq'),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index visits_organization_seq_idx on public.visits (organization_id, seq);
create index visits_patient_idx on public.visits (patient_id);

alter table public.visits enable row level security;
revoke all on table public.visits from anon, authenticated;
grant all on table public.visits to service_role;
grant select on table public.visits to authenticated;

create policy "visits: read with visits.read"
  on public.visits for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('visits.read')));

alter table public.sync_conflicts drop constraint sync_conflicts_table_name_check;
alter table public.sync_conflicts add constraint sync_conflicts_table_name_check
  check (table_name in ('clients', 'patients', 'visits'));

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------

-- True if p_list is an array of at most p_max objects, each with only the
-- given keys, string values of at most p_len characters, and a non-empty
-- value for p_required (if given).
create function private.valid_object_list(
  p_list jsonb, p_keys text[], p_required text, p_max integer, p_len integer
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_key text;
begin
  if jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > p_max then return false; end if;

  for v_item in select * from jsonb_array_elements(p_list) loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    for v_key in select * from jsonb_object_keys(v_item) loop
      if not (v_key = any (p_keys)) then return false; end if;
      if jsonb_typeof(v_item -> v_key) <> 'string' or char_length(v_item ->> v_key) > p_len then return false; end if;
    end loop;
    if p_required is not null and btrim(coalesce(v_item ->> p_required, '')) = '' then return false; end if;
  end loop;

  return true;
end;
$$;

revoke execute on function private.valid_object_list(jsonb, text[], text, integer, integer) from public;

-- Returns the cleaned value as jsonb (SQL NULL = "no value"); raises
-- 'invalid_field' if the value is not acceptable. The three list fields travel
-- as JSON text (the sync protocol only carries scalars) and are stored as jsonb.
create function private.clean_visit_field(p_field text, p_value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text;
  v_date date;
  v_list jsonb;
  v_ts timestamp;
begin
  if p_field = 'ready_to_finalize' then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_field'; end if;
    return p_value;
  end if;

  if p_field = 'weight_kg' then
    if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
    if jsonb_typeof(p_value) <> 'number' then raise exception 'invalid_field'; end if;
    if (p_value #>> '{}')::numeric <= 0 or (p_value #>> '{}')::numeric > 200 then raise exception 'invalid_field'; end if;
    return to_jsonb(round((p_value #>> '{}')::numeric, 2));
  end if;

  if p_field = 'asa_status' then
    if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 5
       or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) then
      raise exception 'invalid_field';
    end if;
    return p_value;
  end if;

  if p_value is null or jsonb_typeof(p_value) = 'null' then
    v_text := null;
  elsif jsonb_typeof(p_value) = 'string' then
    v_text := nullif(btrim(p_value #>> '{}'), '');
  else
    raise exception 'invalid_field';
  end if;

  if p_field in ('complaint_tags', 'anesthesia_blocks', 'medications') then
    v_list := coalesce(v_text, '[]')::jsonb;
    if p_field = 'complaint_tags' then
      if jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) > 10
         or exists (
           select 1 from jsonb_array_elements(v_list) t
           where jsonb_typeof(t) <> 'string'
             or (t #>> '{}') not in ('halitosis', 'tartar', 'drooling', 'eating_difficulty', 'pain')
         ) then
        raise exception 'invalid_field';
      end if;
    elsif p_field = 'anesthesia_blocks' then
      if not private.valid_object_list(v_list, array['nerve', 'side', 'agent', 'dose'], 'nerve', 20, 100) then
        raise exception 'invalid_field';
      end if;
    else
      if not private.valid_object_list(v_list, array['name', 'dose', 'frequency', 'duration'], 'name', 20, 200) then
        raise exception 'invalid_field';
      end if;
    end if;
    return v_list;
  end if;

  if p_field = 'patient_id' then
    if v_text is null or v_text !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_field'; end if;
    return to_jsonb(lower(v_text));
  elsif p_field = 'visit_date' then
    if v_text is null or v_text !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_field'; end if;
    v_date := v_text::date;
    if v_date < date '2000-01-01' or v_date > current_date + 1 then raise exception 'invalid_field'; end if;
  elsif p_field = 'follow_up_date' then
    if v_text is not null then
      if v_text !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_field'; end if;
      v_date := v_text::date;
      if v_date < date '2000-01-01' or v_date > current_date + 730 then raise exception 'invalid_field'; end if;
    end if;
  elsif p_field = 'last_fed_at' then
    if v_text is not null then
      if v_text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then raise exception 'invalid_field'; end if;
      v_ts := v_text::timestamp;
      if v_ts < timestamp '2000-01-01' or v_ts > now()::timestamp + interval '1 day' then raise exception 'invalid_field'; end if;
      return to_jsonb(to_char(v_ts, 'YYYY-MM-DD"T"HH24:MI:SS'));
    end if;
  elsif p_field in ('veterinarian_name', 'assistant_name', 'home_brushing', 'diet_type') then
    if char_length(coalesce(v_text, '')) > 200 then raise exception 'invalid_field'; end if;
  elsif p_field = 'blood_summary' then
    if char_length(coalesce(v_text, '')) > 1000 then raise exception 'invalid_field'; end if;
  elsif p_field in ('complaint_notes', 'sutures', 'feeding_advice') then
    if char_length(coalesce(v_text, '')) > 2000 then raise exception 'invalid_field'; end if;
  else
    raise exception 'invalid_field';
  end if;

  return case when v_text is null then null else to_jsonb(v_text) end;
end;
$$;

revoke execute on function private.clean_visit_field(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Synchronisation
-- ---------------------------------------------------------------------------

-- Same contract as sync_push_clients / sync_push_patients. Extra rules: the
-- patient must exist (live) in the same organization and cannot change
-- afterwards; a final visit is not edited (the edit is kept in sync_conflicts
-- and answered as "unchanged"); only a draft can be deleted.
create function public.sync_push_visits(p_organization_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields constant text[] := array[
    'patient_id', 'visit_date', 'veterinarian_name', 'assistant_name', 'asa_status', 'last_fed_at',
    'blood_summary', 'weight_kg', 'complaint_tags', 'complaint_notes', 'home_brushing', 'diet_type',
    'anesthesia_blocks', 'sutures', 'medications', 'feeding_advice', 'follow_up_date', 'ready_to_finalize'
  ];
  v_results jsonb := '[]'::jsonb;
  v_change jsonb;
  v_id uuid;
  v_op text;
  v_base integer;
  v_in jsonb;
  v_row public.visits%rowtype;
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

  perform private.require_permission(p_organization_id, 'visits.write');
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

      select * into v_row from public.visits v where v.id = v_id for update;

      if found and v_row.organization_id <> p_organization_id then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
        continue;
      end if;

      if v_op = 'delete' then
        if not found or v_row.deleted_at is not null then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'unchanged', 'rev', v_row.rev);
          continue;
        end if;
        -- A finalised visit is part of the medical record and is not deleted from a device.
        if v_row.status = 'final' then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
          continue;
        end if;

        update public.visits v
        set deleted_at = now(), rev = v.rev + 1, seq = nextval('public.visits_seq'),
            updated_at = now(), updated_by = v_actor
        where v.id = v_id
        returning v.rev into v_rev;

        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', v_rev);
        continue;
      end if;

      -- upsert --------------------------------------------------------------
      if not found then
        v_new := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_in ? v_field then
            v_val := private.clean_visit_field(v_field, v_in -> v_field);
            v_new := v_new || jsonb_build_object(v_field, coalesce(v_val, 'null'::jsonb));
          end if;
        end loop;
        if coalesce(v_new ->> 'patient_id', '') = '' or coalesce(v_new ->> 'visit_date', '') = '' then
          raise exception 'invalid_field';
        end if;

        if not exists (
          select 1 from public.patients p
          where p.id = (v_new ->> 'patient_id')::uuid
            and p.organization_id = p_organization_id and p.deleted_at is null
        ) then
          raise exception 'invalid_field';
        end if;

        v_field_revs := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_new ? v_field then
            v_field_revs := v_field_revs || jsonb_build_object(v_field, 1);
          end if;
        end loop;

        insert into public.visits (
          id, organization_id, patient_id, visit_date, veterinarian_name, assistant_name, asa_status,
          last_fed_at, blood_summary, weight_kg, complaint_tags, complaint_notes, home_brushing, diet_type,
          anesthesia_blocks, sutures, medications, feeding_advice, follow_up_date, ready_to_finalize,
          field_revs, created_by, updated_by
        )
        values (
          v_id, p_organization_id, (v_new ->> 'patient_id')::uuid, (v_new ->> 'visit_date')::date,
          v_new ->> 'veterinarian_name', v_new ->> 'assistant_name', (v_new ->> 'asa_status')::smallint,
          (v_new ->> 'last_fed_at')::timestamp, v_new ->> 'blood_summary', (v_new ->> 'weight_kg')::numeric,
          coalesce(v_new -> 'complaint_tags', '[]'::jsonb), v_new ->> 'complaint_notes',
          v_new ->> 'home_brushing', v_new ->> 'diet_type',
          coalesce(v_new -> 'anesthesia_blocks', '[]'::jsonb), v_new ->> 'sutures',
          coalesce(v_new -> 'medications', '[]'::jsonb), v_new ->> 'feeding_advice',
          (v_new ->> 'follow_up_date')::date, coalesce((v_new ->> 'ready_to_finalize')::boolean, false),
          v_field_revs, v_actor, v_actor
        );

        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', 1);
        continue;
      end if;

      if v_row.deleted_at is not null then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'deleted', 'rev', v_row.rev);
        continue;
      end if;

      -- A finalised visit is not edited. What the device wanted to write is
      -- kept, so a person can look at it and, if needed, reopen the visit.
      if v_row.status = 'final' then
        v_current := to_jsonb(v_row);
        foreach v_field in array v_fields loop
          continue when not (v_in ? v_field);
          v_val := private.clean_visit_field(v_field, v_in -> v_field);
          continue when v_val is not distinct from nullif(v_current -> v_field, 'null'::jsonb);
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'visits', v_id, v_field, v_val, nullif(v_current -> v_field, 'null'::jsonb), v_actor
          );
          v_conflicts := v_conflicts + 1;
        end loop;
        v_results := v_results || jsonb_build_object(
          'id', v_id, 'status', 'unchanged', 'rev', v_row.rev, 'conflicts', v_conflicts);
        continue;
      end if;

      v_current := to_jsonb(v_row);
      v_new := v_current;
      v_field_revs := v_row.field_revs;
      v_changed := false;
      v_rev := v_row.rev + 1;

      foreach v_field in array v_fields loop
        continue when not (v_in ? v_field);

        v_val := private.clean_visit_field(v_field, v_in -> v_field);
        continue when v_val is not distinct from nullif(v_current -> v_field, 'null'::jsonb);

        if v_field = 'patient_id' then
          raise exception 'invalid_field';
        end if;
        -- The date is required; clearing it is not an edit.
        if v_field = 'visit_date' and v_val is null then
          raise exception 'invalid_field';
        end if;

        if coalesce((v_row.field_revs ->> v_field)::integer, 0) > coalesce(v_base, 0) then
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'visits', v_id, v_field,
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

      update public.visits v
      set visit_date = (v_new ->> 'visit_date')::date,
          veterinarian_name = v_new ->> 'veterinarian_name',
          assistant_name = v_new ->> 'assistant_name',
          asa_status = (v_new ->> 'asa_status')::smallint,
          last_fed_at = (v_new ->> 'last_fed_at')::timestamp,
          blood_summary = v_new ->> 'blood_summary',
          weight_kg = (v_new ->> 'weight_kg')::numeric,
          complaint_tags = coalesce(v_new -> 'complaint_tags', '[]'::jsonb),
          complaint_notes = v_new ->> 'complaint_notes',
          home_brushing = v_new ->> 'home_brushing',
          diet_type = v_new ->> 'diet_type',
          anesthesia_blocks = coalesce(v_new -> 'anesthesia_blocks', '[]'::jsonb),
          sutures = v_new ->> 'sutures',
          medications = coalesce(v_new -> 'medications', '[]'::jsonb),
          feeding_advice = v_new ->> 'feeding_advice',
          follow_up_date = (v_new ->> 'follow_up_date')::date,
          ready_to_finalize = (v_new ->> 'ready_to_finalize')::boolean,
          field_revs = v_field_revs,
          rev = v_rev,
          seq = nextval('public.visits_seq'),
          updated_at = now(),
          updated_by = v_actor
      where v.id = v_id;

      v_results := v_results || jsonb_build_object(
        'id', v_id, 'status', 'applied', 'rev', v_rev, 'conflicts', v_conflicts);
    exception
      when raise_exception or invalid_text_representation or numeric_value_out_of_range
        or invalid_datetime_format or datetime_field_overflow or foreign_key_violation or check_violation
        or datatype_mismatch then
        v_results := v_results || jsonb_build_object('id', v_change ->> 'id', 'status', 'invalid');
    end;
  end loop;

  return v_results;
end;
$$;

revoke execute on function public.sync_push_visits(uuid, jsonb) from public, anon;
grant execute on function public.sync_push_visits(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Finalising and reopening (online only, clinical permission, audited)
-- ---------------------------------------------------------------------------

-- Raises 'visit_not_found', 'already_final' or 'missing_required' (date,
-- treating vet and ASA status must be filled in).
create function public.finalize_visit(p_organization_id uuid, p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.visits%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform private.require_permission(p_organization_id, 'visits.finalize');
  perform private.require_writable(p_organization_id);

  select * into v_row from public.visits v
  where v.id = p_visit_id and v.organization_id = p_organization_id and v.deleted_at is null
  for update;
  if not found then raise exception 'visit_not_found'; end if;
  if v_row.status = 'final' then raise exception 'already_final'; end if;

  if btrim(coalesce(v_row.veterinarian_name, '')) = '' or v_row.asa_status is null then
    raise exception 'missing_required';
  end if;

  update public.visits v
  set status = 'final', finalized_at = now(), finalized_by = v_actor,
      ready_to_finalize = false, rev = v.rev + 1, seq = nextval('public.visits_seq'),
      updated_at = now(), updated_by = v_actor
  where v.id = p_visit_id;

  perform private.audit(p_organization_id, 'visit.finalized', 'visit', p_visit_id::text,
    jsonb_build_object('patient_id', v_row.patient_id, 'visit_date', v_row.visit_date));
end;
$$;

revoke execute on function public.finalize_visit(uuid, uuid) from public, anon;
grant execute on function public.finalize_visit(uuid, uuid) to authenticated;

-- Raises 'visit_not_found', 'not_final' or 'reason_required' (3 to 500 characters).
create function public.reopen_visit(p_organization_id uuid, p_visit_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.visits%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform private.require_permission(p_organization_id, 'visits.reopen');
  perform private.require_writable(p_organization_id);

  if char_length(v_reason) not between 3 and 500 then raise exception 'reason_required'; end if;

  select * into v_row from public.visits v
  where v.id = p_visit_id and v.organization_id = p_organization_id and v.deleted_at is null
  for update;
  if not found then raise exception 'visit_not_found'; end if;
  if v_row.status <> 'final' then raise exception 'not_final'; end if;

  update public.visits v
  set status = 'draft', finalized_at = null, finalized_by = null,
      rev = v.rev + 1, seq = nextval('public.visits_seq'), updated_at = now(), updated_by = v_actor
  where v.id = p_visit_id;

  perform private.audit(p_organization_id, 'visit.reopened', 'visit', p_visit_id::text,
    jsonb_build_object('patient_id', v_row.patient_id, 'visit_date', v_row.visit_date, 'reason', v_reason));
end;
$$;

revoke execute on function public.reopen_visit(uuid, uuid, text) from public, anon;
grant execute on function public.reopen_visit(uuid, uuid, text) to authenticated;
