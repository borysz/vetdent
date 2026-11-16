-- The dental chart of a visit: one record per tooth (visit_teeth). Findings and
-- procedures are lists (jsonb); pocket depths are six measuring points.
--
-- A tooth record is created on the device with an id derived from the visit
-- and the tooth number, so two devices that both start charting tooth 104 in
-- the same visit create the SAME record and their edits merge field by field.
-- (visit_id, tooth) is also unique, as a second line of defence.
--
-- Synchronised like the rest. Records are never deleted: clearing a tooth
-- empties its lists. A tooth of a final visit is not edited: the edit is kept
-- in sync_conflicts and answered as "locked", as for the visit itself.

create sequence public.visit_teeth_seq;

create table public.visit_teeth (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  visit_id uuid not null references public.visits (id),
  tooth smallint not null check (tooth between 101 and 411),
  findings jsonb not null default '[]'::jsonb,
  procedures jsonb not null default '[]'::jsonb,
  -- Empty, or six entries (mm 0–12 or null): mb, b, db, ml, l, dl.
  pockets jsonb not null default '[]'::jsonb,
  note text check (note is null or char_length(note) <= 1000),
  rev integer not null default 1,
  field_revs jsonb not null default '{}'::jsonb,
  seq bigint not null default nextval('public.visit_teeth_seq'),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (visit_id, tooth)
);

create index visit_teeth_organization_seq_idx on public.visit_teeth (organization_id, seq);

alter table public.visit_teeth enable row level security;
revoke all on table public.visit_teeth from anon, authenticated;
grant all on table public.visit_teeth to service_role;
grant select on table public.visit_teeth to authenticated;

create policy "visit_teeth: read with visits.read"
  on public.visit_teeth for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('visits.read')));

alter table public.sync_conflicts drop constraint sync_conflicts_table_name_check;
alter table public.sync_conflicts add constraint sync_conflicts_table_name_check
  check (table_name in ('clients', 'patients', 'visits', 'visit_teeth'));

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------

-- Does this tooth exist in the species (modified Triadan, permanent teeth)?
-- Dog: upper 01–10, lower 01–11. Cat: upper 01–04 and 06–09, lower 01–04 and 07–09.
create function private.tooth_exists(p_species public.species, p_tooth integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tooth not between 101 and 411 or p_tooth % 100 = 0 then false
    when p_species = 'dog' then
      case when p_tooth / 100 in (1, 2) then p_tooth % 100 between 1 and 10 else p_tooth % 100 between 1 and 11 end
    else
      case when p_tooth / 100 in (1, 2) then p_tooth % 100 in (1, 2, 3, 4, 6, 7, 8, 9)
           else p_tooth % 100 in (1, 2, 3, 4, 7, 8, 9) end
  end;
$$;

revoke execute on function private.tooth_exists(public.species, integer) from public;

-- A list of { code, level } findings: known codes and grades, one per code,
-- resorptive lesions only for cats.
create function private.valid_findings(p_list jsonb, p_species public.species)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    '0:', 'T:1', 'T:2', 'T:3', 'G:1', 'G:2', 'PD:1', 'PD:2', 'PD:3', 'PD:4', 'Mob:1', 'Mob:2', 'Mob:3',
    'Fur:1', 'Fur:2', 'Fur:3', 'FX:C', 'FX:NC', 'FX:R', 'RES:1', 'RES:2', 'RES:3', 'RES:4', 'RES:5',
    'M:missing', 'M:prev', 'M:imp'
  ];
  v_item jsonb;
  v_key text;
  v_seen text[] := array[]::text[];
begin
  if jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > 9 then return false; end if;

  for v_item in select * from jsonb_array_elements(p_list) loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    for v_key in select * from jsonb_object_keys(v_item) loop
      if v_key not in ('code', 'level') then return false; end if;
    end loop;
    if jsonb_typeof(v_item -> 'code') <> 'string' or jsonb_typeof(v_item -> 'level') <> 'string' then return false; end if;
    if not ((v_item ->> 'code') || ':' || (v_item ->> 'level') = any (v_allowed)) then return false; end if;
    if (v_item ->> 'code') = any (v_seen) then return false; end if;
    if (v_item ->> 'code') = 'RES' and p_species <> 'cat' then return false; end if;
    v_seen := v_seen || (v_item ->> 'code');
  end loop;

  return true;
end;
$$;

revoke execute on function private.valid_findings(jsonb, public.species) from public;

create function private.valid_procedures(p_list jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_allowed constant text[] := array['U:', 'POL:', 'EXT:S', 'EXT:SURG', 'ENDO:closed', 'ENDO:open', 'RX:'];
  v_item jsonb;
  v_key text;
  v_seen text[] := array[]::text[];
begin
  if jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > 5 then return false; end if;

  for v_item in select * from jsonb_array_elements(p_list) loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    for v_key in select * from jsonb_object_keys(v_item) loop
      if v_key not in ('code', 'level', 'state') then return false; end if;
    end loop;
    if jsonb_typeof(v_item -> 'code') <> 'string' or jsonb_typeof(v_item -> 'level') <> 'string'
       or jsonb_typeof(v_item -> 'state') <> 'string' then
      return false;
    end if;
    if not ((v_item ->> 'code') || ':' || (v_item ->> 'level') = any (v_allowed)) then return false; end if;
    if (v_item ->> 'state') not in ('planned', 'done') then return false; end if;
    if (v_item ->> 'code') = any (v_seen) then return false; end if;
    v_seen := v_seen || (v_item ->> 'code');
  end loop;

  return true;
end;
$$;

revoke execute on function private.valid_procedures(jsonb) from public;

-- Rules across the two lists: "healthy" excludes every other finding, and a
-- missing tooth carries no other finding and no procedure.
create function private.tooth_marks_consistent(p_findings jsonb, p_procedures jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when exists (select 1 from jsonb_array_elements(p_findings) f where f ->> 'code' = 'M') then
      jsonb_array_length(p_findings) = 1 and jsonb_array_length(p_procedures) = 0
    when exists (select 1 from jsonb_array_elements(p_findings) f where f ->> 'code' = '0') then
      jsonb_array_length(p_findings) = 1
    else true
  end;
$$;

revoke execute on function private.tooth_marks_consistent(jsonb, jsonb) from public;

-- Returns the cleaned value as jsonb (SQL NULL = "no value"); raises
-- 'invalid_field' if the value is not acceptable. The lists and the pocket
-- depths travel as JSON text (the sync protocol only carries scalars).
create function private.clean_visit_tooth_field(p_field text, p_value jsonb, p_species public.species)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text;
  v_list jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    v_text := null;
  elsif jsonb_typeof(p_value) = 'string' then
    v_text := nullif(btrim(p_value #>> '{}'), '');
  elsif p_field = 'tooth' and jsonb_typeof(p_value) = 'number' then
    if (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) then raise exception 'invalid_field'; end if;
    return p_value;
  else
    raise exception 'invalid_field';
  end if;

  if p_field = 'visit_id' then
    if v_text is null or v_text !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_field'; end if;
    return to_jsonb(lower(v_text));
  elsif p_field = 'tooth' then
    if v_text is null or v_text !~ '^[0-9]{3}$' then raise exception 'invalid_field'; end if;
    return to_jsonb(v_text::integer);
  elsif p_field = 'findings' then
    v_list := coalesce(v_text, '[]')::jsonb;
    if not private.valid_findings(v_list, p_species) then raise exception 'invalid_field'; end if;
    return v_list;
  elsif p_field = 'procedures' then
    v_list := coalesce(v_text, '[]')::jsonb;
    if not private.valid_procedures(v_list) then raise exception 'invalid_field'; end if;
    return v_list;
  elsif p_field = 'pockets' then
    v_list := coalesce(v_text, '[]')::jsonb;
    if jsonb_typeof(v_list) <> 'array' then raise exception 'invalid_field'; end if;
    if jsonb_array_length(v_list) not in (0, 6) then raise exception 'invalid_field'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_list) e
      where jsonb_typeof(e) <> 'null'
        and (jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
             or (e #>> '{}')::numeric not between 0 and 12)
    ) then
      raise exception 'invalid_field';
    end if;
    return v_list;
  elsif p_field = 'note' then
    if char_length(coalesce(v_text, '')) > 1000 then raise exception 'invalid_field'; end if;
    return case when v_text is null then null else to_jsonb(v_text) end;
  end if;

  raise exception 'invalid_field';
end;
$$;

revoke execute on function private.clean_visit_tooth_field(text, jsonb, public.species) from public;

-- ---------------------------------------------------------------------------
-- Synchronisation
-- ---------------------------------------------------------------------------

-- Same contract as sync_push_visits, with these differences: no delete
-- (clearing a tooth empties its lists); the visit and the tooth cannot change
-- after creation; the tooth must exist in the patient's species; and an edit to
-- a tooth of a final visit is answered as "locked" and kept in sync_conflicts.
create function public.sync_push_visit_teeth(p_organization_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields constant text[] := array['visit_id', 'tooth', 'findings', 'procedures', 'pockets', 'note'];
  v_results jsonb := '[]'::jsonb;
  v_change jsonb;
  v_id uuid;
  v_op text;
  v_base integer;
  v_in jsonb;
  v_row public.visit_teeth%rowtype;
  v_visit public.visits%rowtype;
  v_species public.species;
  v_current jsonb;
  v_new jsonb;
  v_val jsonb;
  v_field text;
  v_changed boolean;
  v_conflicts integer;
  v_field_revs jsonb;
  v_rev integer;
  v_visit_id uuid;
  v_exists boolean;
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

      if v_op <> 'upsert' or jsonb_typeof(v_in) <> 'object' then
        raise exception 'invalid_field';
      end if;

      select * into v_row from public.visit_teeth t where t.id = v_id for update;
      -- `found` is overwritten by every later select, so it is kept here.
      v_exists := found;

      if v_exists and v_row.organization_id <> p_organization_id then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
        continue;
      end if;

      -- The visit this tooth belongs to (for a new record: the one named in the change).
      if v_exists then
        v_visit_id := v_row.visit_id;
      else
        v_visit_id := (v_in ->> 'visit_id')::uuid;
      end if;

      select * into v_visit from public.visits v
      where v.id = v_visit_id and v.organization_id = p_organization_id and v.deleted_at is null;
      if not found then
        raise exception 'invalid_field';
      end if;
      select p.species into v_species from public.patients p where p.id = v_visit.patient_id;

      -- A final visit is not edited. What the device wanted to write is kept.
      if v_visit.status = 'final' then
        foreach v_field in array v_fields loop
          continue when not (v_in ? v_field) or v_field in ('visit_id', 'tooth');
          v_val := private.clean_visit_tooth_field(v_field, v_in -> v_field, v_species);
          continue when v_exists and v_val is not distinct from nullif(to_jsonb(v_row) -> v_field, 'null'::jsonb);
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'visit_teeth', v_id, v_field, v_val,
            case when v_exists then nullif(to_jsonb(v_row) -> v_field, 'null'::jsonb) else null end, v_actor
          );
          v_conflicts := v_conflicts + 1;
        end loop;
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'locked', 'conflicts', v_conflicts);
        continue;
      end if;

      -- create ----------------------------------------------------------------
      if not v_exists then
        v_new := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_in ? v_field then
            v_val := private.clean_visit_tooth_field(v_field, v_in -> v_field, v_species);
            v_new := v_new || jsonb_build_object(v_field, coalesce(v_val, 'null'::jsonb));
          end if;
        end loop;
        if not (v_new ? 'visit_id') or not (v_new ? 'tooth') then
          raise exception 'invalid_field';
        end if;
        if not private.tooth_exists(v_species, (v_new ->> 'tooth')::integer) then
          raise exception 'invalid_field';
        end if;
        if not private.tooth_marks_consistent(
          coalesce(v_new -> 'findings', '[]'::jsonb), coalesce(v_new -> 'procedures', '[]'::jsonb)
        ) then
          raise exception 'invalid_field';
        end if;

        v_field_revs := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_new ? v_field then
            v_field_revs := v_field_revs || jsonb_build_object(v_field, 1);
          end if;
        end loop;

        insert into public.visit_teeth (
          id, organization_id, visit_id, tooth, findings, procedures, pockets, note,
          field_revs, created_by, updated_by
        )
        values (
          v_id, p_organization_id, v_visit_id, (v_new ->> 'tooth')::smallint,
          coalesce(v_new -> 'findings', '[]'::jsonb), coalesce(v_new -> 'procedures', '[]'::jsonb),
          coalesce(v_new -> 'pockets', '[]'::jsonb), v_new ->> 'note',
          v_field_revs, v_actor, v_actor
        );

        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', 1);
        continue;
      end if;

      -- update ----------------------------------------------------------------
      v_current := to_jsonb(v_row);
      v_new := v_current;
      v_field_revs := v_row.field_revs;
      v_changed := false;
      v_rev := v_row.rev + 1;

      foreach v_field in array v_fields loop
        continue when not (v_in ? v_field);

        v_val := private.clean_visit_tooth_field(v_field, v_in -> v_field, v_species);
        continue when v_val is not distinct from nullif(v_current -> v_field, 'null'::jsonb);

        -- The visit and the tooth are fixed once the record exists.
        if v_field in ('visit_id', 'tooth') then
          raise exception 'invalid_field';
        end if;

        if coalesce((v_row.field_revs ->> v_field)::integer, 0) > coalesce(v_base, 0) then
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'visit_teeth', v_id, v_field,
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

      if not private.tooth_marks_consistent(v_new -> 'findings', v_new -> 'procedures') then
        raise exception 'invalid_field';
      end if;

      update public.visit_teeth t
      set findings = v_new -> 'findings',
          procedures = v_new -> 'procedures',
          pockets = v_new -> 'pockets',
          note = v_new ->> 'note',
          field_revs = v_field_revs,
          rev = v_rev,
          seq = nextval('public.visit_teeth_seq'),
          updated_at = now(),
          updated_by = v_actor
      where t.id = v_id;

      v_results := v_results || jsonb_build_object(
        'id', v_id, 'status', 'applied', 'rev', v_rev, 'conflicts', v_conflicts);
    exception
      when raise_exception or invalid_text_representation or numeric_value_out_of_range
        or invalid_datetime_format or datetime_field_overflow or foreign_key_violation or check_violation
        or datatype_mismatch or unique_violation then
        v_results := v_results || jsonb_build_object('id', v_change ->> 'id', 'status', 'invalid');
    end;
  end loop;

  return v_results;
end;
$$;

revoke execute on function public.sync_push_visit_teeth(uuid, jsonb) from public, anon;
grant execute on function public.sync_push_visit_teeth(uuid, jsonb) to authenticated;
