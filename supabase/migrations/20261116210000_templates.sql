-- Templates (PROJEKT_PROMPT 8.8): saved packages the user loads with one tap.
--
--   treatment  findings, procedures, medications and texts, for chosen teeth
--              (payload, jsonb)
--   text       a reusable piece of text for one field of the visit (body)
--
-- Organization-wide templates (shared) are seen by every member and changed by
-- those who may edit the catalogue; a personal one is seen and changed only by
-- its owner. Synchronised like the other records, so a template can be loaded
-- (and a new one saved) offline. The plan must include the "templates" feature.

create type public.template_kind as enum ('treatment', 'text');

create sequence public.templates_seq;

create table public.templates (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.template_kind not null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  shared boolean not null default false,
  -- Null: for both species.
  species public.species,
  -- Text templates: the field of the visit it is meant for; null: any text field.
  text_target text check (text_target is null or text_target in ('feeding_advice', 'sutures', 'complaint_notes', 'general_note')),
  body text check (body is null or char_length(body) <= 4000),
  payload jsonb,
  rev integer not null default 1,
  field_revs jsonb not null default '{}'::jsonb,
  seq bigint not null default nextval('public.templates_seq'),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint template_shape check (
    (kind = 'text' and body is not null and payload is null)
    or (kind = 'treatment' and payload is not null and body is null)
  )
);

create index templates_organization_seq_idx on public.templates (organization_id, seq);

alter table public.templates enable row level security;
revoke all on table public.templates from anon, authenticated;
grant all on table public.templates to service_role;
grant select on table public.templates to authenticated;

create policy "templates: shared ones and own ones"
  on public.templates for select to authenticated
  using (
    organization_id in (select private.my_organization_ids())
    and (shared or created_by = (select auth.uid()))
  );

alter table public.sync_conflicts drop constraint sync_conflicts_table_name_check;
alter table public.sync_conflicts add constraint sync_conflicts_table_name_check
  check (table_name in ('clients', 'patients', 'visits', 'visit_teeth', 'templates'));

-- ---------------------------------------------------------------------------
-- Plan features
-- ---------------------------------------------------------------------------

-- Does the organization's plan include the feature (for example 'templates')?
create function private.has_feature(p_organization_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.organization_id = p_organization_id
      and p_feature = any (p.features)
  );
$$;

revoke execute on function private.has_feature(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------

-- The payload of a treatment template: { teeth: [...], texts: {...}, medications: [...] }.
-- A tooth entry has a Triadan number (or null: "the teeth chosen when it is loaded"),
-- findings and procedures. Resorptive lesions are accepted here (species is checked
-- when the template is loaded onto an animal).
create function private.valid_template_payload(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_entry jsonb;
  v_text_key text;
  v_tooth jsonb;
begin
  if jsonb_typeof(p_payload) <> 'object' then return false; end if;
  for v_key in select * from jsonb_object_keys(p_payload) loop
    if v_key not in ('teeth', 'texts', 'medications') then return false; end if;
  end loop;

  if p_payload ? 'teeth' then
    if jsonb_typeof(p_payload -> 'teeth') <> 'array' or jsonb_array_length(p_payload -> 'teeth') > 42 then return false; end if;
    for v_entry in select * from jsonb_array_elements(p_payload -> 'teeth') loop
      if jsonb_typeof(v_entry) <> 'object' then return false; end if;
      for v_key in select * from jsonb_object_keys(v_entry) loop
        if v_key not in ('tooth', 'findings', 'procedures') then return false; end if;
      end loop;
      v_tooth := v_entry -> 'tooth';
      if v_tooth is not null and jsonb_typeof(v_tooth) <> 'null' then
        if jsonb_typeof(v_tooth) <> 'number' or (v_tooth #>> '{}')::numeric <> trunc((v_tooth #>> '{}')::numeric)
           or (v_tooth #>> '{}')::numeric not between 101 and 411 then
          return false;
        end if;
      end if;
      if not private.valid_findings(coalesce(v_entry -> 'findings', '[]'::jsonb), 'cat') then return false; end if;
      if not private.valid_procedures(coalesce(v_entry -> 'procedures', '[]'::jsonb)) then return false; end if;
      if not private.tooth_marks_consistent(coalesce(v_entry -> 'findings', '[]'::jsonb), coalesce(v_entry -> 'procedures', '[]'::jsonb)) then
        return false;
      end if;
    end loop;
  end if;

  if p_payload ? 'texts' then
    if jsonb_typeof(p_payload -> 'texts') <> 'object' then return false; end if;
    for v_text_key in select * from jsonb_object_keys(p_payload -> 'texts') loop
      if v_text_key not in ('feeding_advice', 'sutures', 'complaint_notes', 'general_note') then return false; end if;
      if jsonb_typeof(p_payload -> 'texts' -> v_text_key) <> 'string' or char_length(p_payload -> 'texts' ->> v_text_key) > 2000 then
        return false;
      end if;
    end loop;
  end if;

  if p_payload ? 'medications' then
    if not private.valid_object_list(p_payload -> 'medications', array['name', 'dose', 'frequency', 'duration'], 'name', 20, 200) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke execute on function private.valid_template_payload(jsonb) from public;

-- Returns the cleaned value as jsonb (SQL NULL = "no value"); raises
-- 'invalid_field' if the value is not acceptable.
create function private.clean_template_field(p_field text, p_value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text;
  v_payload jsonb;
begin
  if p_field = 'shared' then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_field'; end if;
    return p_value;
  end if;

  if p_value is null or jsonb_typeof(p_value) = 'null' then
    v_text := null;
  elsif jsonb_typeof(p_value) = 'string' then
    v_text := nullif(btrim(p_value #>> '{}'), '');
  else
    raise exception 'invalid_field';
  end if;

  if p_field = 'kind' then
    if v_text not in ('treatment', 'text') then raise exception 'invalid_field'; end if;
  elsif p_field = 'name' then
    if v_text is null or char_length(v_text) > 100 then raise exception 'invalid_field'; end if;
  elsif p_field = 'species' then
    if v_text is not null and v_text not in ('dog', 'cat') then raise exception 'invalid_field'; end if;
  elsif p_field = 'text_target' then
    if v_text is not null and v_text not in ('feeding_advice', 'sutures', 'complaint_notes', 'general_note') then
      raise exception 'invalid_field';
    end if;
  elsif p_field = 'body' then
    if char_length(coalesce(v_text, '')) > 4000 then raise exception 'invalid_field'; end if;
  elsif p_field = 'payload' then
    if v_text is null then return null; end if;
    v_payload := v_text::jsonb;
    if not private.valid_template_payload(v_payload) then raise exception 'invalid_field'; end if;
    return v_payload;
  else
    raise exception 'invalid_field';
  end if;

  return case when v_text is null then null else to_jsonb(v_text) end;
end;
$$;

revoke execute on function private.clean_template_field(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Synchronisation
-- ---------------------------------------------------------------------------

-- Same contract as the other sync_push_* functions. Extra rules: needs the
-- "templates" feature of the plan and templates.manage_own; a shared template
-- also needs catalog.manage (to create it, change it or make a template shared
-- or personal); a personal one is only changed by its owner; the kind cannot
-- change afterwards; a text template has a body and no payload, a treatment
-- template the other way round.
create function public.sync_push_templates(p_organization_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields constant text[] := array['kind', 'name', 'shared', 'species', 'text_target', 'body', 'payload'];
  v_results jsonb := '[]'::jsonb;
  v_change jsonb;
  v_id uuid;
  v_op text;
  v_base integer;
  v_in jsonb;
  v_row public.templates%rowtype;
  v_exists boolean;
  v_current jsonb;
  v_new jsonb;
  v_val jsonb;
  v_field text;
  v_changed boolean;
  v_conflicts integer;
  v_field_revs jsonb;
  v_rev integer;
  v_can_share boolean;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 100 then
    raise exception 'invalid_batch';
  end if;

  perform private.require_permission(p_organization_id, 'templates.manage_own');
  perform private.require_writable(p_organization_id);
  if not private.has_feature(p_organization_id, 'templates') then
    raise exception 'feature_unavailable' using errcode = '42501';
  end if;
  v_can_share := private.has_permission(p_organization_id, 'catalog.manage');

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

      select * into v_row from public.templates t where t.id = v_id for update;
      v_exists := found;

      if v_exists and v_row.organization_id <> p_organization_id then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
        continue;
      end if;

      -- Who may change an existing template: its owner, or (if shared) someone who edits the catalogue.
      if v_exists and not (
        (v_row.shared and v_can_share) or (not v_row.shared and v_row.created_by = v_actor)
      ) then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
        continue;
      end if;

      if v_op = 'delete' then
        if not v_exists or v_row.deleted_at is not null then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'unchanged', 'rev', v_row.rev);
          continue;
        end if;
        update public.templates t
        set deleted_at = now(), rev = t.rev + 1, seq = nextval('public.templates_seq'),
            updated_at = now(), updated_by = v_actor
        where t.id = v_id
        returning t.rev into v_rev;
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', v_rev);
        continue;
      end if;

      -- create ----------------------------------------------------------------
      if not v_exists then
        v_new := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_in ? v_field then
            v_val := private.clean_template_field(v_field, v_in -> v_field);
            v_new := v_new || jsonb_build_object(v_field, coalesce(v_val, 'null'::jsonb));
          end if;
        end loop;
        if not (v_new ? 'kind') or coalesce(v_new ->> 'name', '') = '' then
          raise exception 'invalid_field';
        end if;
        if coalesce((v_new ->> 'shared')::boolean, false) and not v_can_share then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
          continue;
        end if;
        if (v_new ->> 'kind' = 'text' and (coalesce(v_new ->> 'body', '') = '' or coalesce(v_new -> 'payload', 'null'::jsonb) <> 'null'::jsonb))
           or (v_new ->> 'kind' = 'treatment' and (coalesce(v_new -> 'payload', 'null'::jsonb) = 'null'::jsonb or coalesce(v_new ->> 'body', '') <> '')) then
          raise exception 'invalid_field';
        end if;

        v_field_revs := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_new ? v_field then
            v_field_revs := v_field_revs || jsonb_build_object(v_field, 1);
          end if;
        end loop;

        insert into public.templates (
          id, organization_id, kind, name, shared, species, text_target, body, payload,
          field_revs, created_by, updated_by
        )
        values (
          v_id, p_organization_id, (v_new ->> 'kind')::public.template_kind, v_new ->> 'name',
          coalesce((v_new ->> 'shared')::boolean, false), (v_new ->> 'species')::public.species,
          v_new ->> 'text_target', v_new ->> 'body',
          case when coalesce(v_new -> 'payload', 'null'::jsonb) = 'null'::jsonb then null else v_new -> 'payload' end,
          v_field_revs, v_actor, v_actor
        );

        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', 1);
        continue;
      end if;

      -- update ----------------------------------------------------------------
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

        v_val := private.clean_template_field(v_field, v_in -> v_field);
        continue when v_val is not distinct from nullif(v_current -> v_field, 'null'::jsonb);

        if v_field = 'kind' then
          raise exception 'invalid_field';
        end if;
        -- Making a template shared, or personal again, is a catalogue right.
        if v_field = 'shared' and not v_can_share then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
          v_changed := false;
          v_conflicts := -1;
          exit;
        end if;

        if coalesce((v_row.field_revs ->> v_field)::integer, 0) > coalesce(v_base, 0) then
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'templates', v_id, v_field,
            nullif(v_current -> v_field, 'null'::jsonb), v_val, v_row.updated_by
          );
          v_conflicts := v_conflicts + 1;
        end if;

        v_new := jsonb_set(v_new, array[v_field], coalesce(v_val, 'null'::jsonb));
        v_field_revs := v_field_revs || jsonb_build_object(v_field, v_rev);
        v_changed := true;
      end loop;

      -- A refused change to `shared` has already been answered.
      if v_conflicts = -1 then
        continue;
      end if;

      if not v_changed then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'unchanged', 'rev', v_row.rev);
        continue;
      end if;

      if (v_new ->> 'kind' = 'text' and (coalesce(v_new ->> 'body', '') = '' or coalesce(v_new -> 'payload', 'null'::jsonb) <> 'null'::jsonb))
         or (v_new ->> 'kind' = 'treatment' and (coalesce(v_new -> 'payload', 'null'::jsonb) = 'null'::jsonb or coalesce(v_new ->> 'body', '') <> '')) then
        raise exception 'invalid_field';
      end if;

      update public.templates t
      set name = v_new ->> 'name',
          shared = (v_new ->> 'shared')::boolean,
          species = (v_new ->> 'species')::public.species,
          text_target = v_new ->> 'text_target',
          body = v_new ->> 'body',
          payload = case when coalesce(v_new -> 'payload', 'null'::jsonb) = 'null'::jsonb then null else v_new -> 'payload' end,
          field_revs = v_field_revs,
          rev = v_rev,
          seq = nextval('public.templates_seq'),
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

revoke execute on function public.sync_push_templates(uuid, jsonb) from public, anon;
grant execute on function public.sync_push_templates(uuid, jsonb) to authenticated;
