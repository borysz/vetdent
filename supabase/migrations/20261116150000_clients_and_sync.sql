-- Clients (gazdik) and the synchronisation protocol the offline layer uses.
--
-- Records are created on the device with their final id (a UUID), so a record
-- made offline never changes identity. Devices send *changes* (only the fields
-- they edited, plus the revision they started from); the server merges them
-- field by field:
--   * different fields edited on two devices  -> both edits are kept
--   * the same field edited on both           -> the later write wins, and
--                                                the overwritten value is kept
--                                                in sync_conflicts
-- Nothing is ever lost silently. Deleting is a tombstone (deleted_at), so
-- other devices learn about it.

create sequence public.clients_seq;

create table public.clients (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  phone text check (phone is null or char_length(phone) <= 50),
  email text check (email is null or char_length(email) <= 320),
  address text check (address is null or char_length(address) <= 300),
  notes text check (notes is null or char_length(notes) <= 2000),
  email_consent boolean not null default false,
  -- Incremented on every change; devices send the revision they based an edit on.
  rev integer not null default 1,
  -- Field name -> revision at which that field last changed.
  field_revs jsonb not null default '{}'::jsonb,
  -- Position in the change stream; devices pull "everything after my cursor".
  seq bigint not null default nextval('public.clients_seq'),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index clients_organization_seq_idx on public.clients (organization_id, seq);

alter table public.clients enable row level security;
revoke all on table public.clients from anon, authenticated;
grant all on table public.clients to service_role;
-- Reading is direct (members of the organization); every write goes through sync_push_clients.
grant select on table public.clients to authenticated;

create policy "clients: members read"
  on public.clients for select to authenticated
  using (organization_id in (select private.my_organization_ids()));

-- ---------------------------------------------------------------------------
-- Overwritten values
-- ---------------------------------------------------------------------------

create table public.sync_conflicts (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_name text not null check (table_name in ('clients')),
  record_id uuid not null,
  field text not null,
  -- What was on the server and has been replaced, and what replaced it.
  overwritten_value jsonb,
  applied_value jsonb,
  overwritten_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

create index sync_conflicts_open_idx on public.sync_conflicts (organization_id) where resolved_at is null;

alter table public.sync_conflicts enable row level security;
revoke all on table public.sync_conflicts from anon, authenticated;
grant all on table public.sync_conflicts to service_role;
grant select on table public.sync_conflicts to authenticated;

create policy "sync_conflicts: readable with clients.write"
  on public.sync_conflicts for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('clients.write')));

create function public.resolve_sync_conflict(p_conflict_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select c.organization_id into v_org
  from public.sync_conflicts c
  where c.id = p_conflict_id and c.resolved_at is null;

  if v_org is null or not private.has_permission(v_org, 'clients.write') then
    raise exception 'conflict_not_found';
  end if;

  update public.sync_conflicts c
  set resolved_at = now(), resolved_by = auth.uid()
  where c.id = p_conflict_id;
end;
$$;

revoke execute on function public.resolve_sync_conflict(bigint) from public, anon;
grant execute on function public.resolve_sync_conflict(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Field validation
-- ---------------------------------------------------------------------------

-- Returns the cleaned value as jsonb (SQL NULL = "no value"); raises
-- 'invalid_field' if the value is not acceptable.
create function private.clean_client_field(p_field text, p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_field = 'email_consent' then
    if jsonb_typeof(p_value) <> 'boolean' then
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

  if p_field = 'full_name' then
    if v_text is null or char_length(v_text) > 200 then raise exception 'invalid_field'; end if;
  elsif p_field = 'phone' then
    if char_length(coalesce(v_text, '')) > 50 then raise exception 'invalid_field'; end if;
  elsif p_field = 'email' then
    v_text := lower(v_text);
    if v_text is not null and (char_length(v_text) > 320 or v_text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      raise exception 'invalid_field';
    end if;
  elsif p_field = 'address' then
    if char_length(coalesce(v_text, '')) > 300 then raise exception 'invalid_field'; end if;
  elsif p_field = 'notes' then
    if char_length(coalesce(v_text, '')) > 2000 then raise exception 'invalid_field'; end if;
  else
    raise exception 'invalid_field';
  end if;

  return case when v_text is null then null else to_jsonb(v_text) end;
end;
$$;

revoke execute on function private.clean_client_field(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Push
-- ---------------------------------------------------------------------------

-- p_changes: [{ "id": uuid, "op": "upsert" | "delete", "base_rev": int | null, "fields": { ... } }]
-- Returns one result per change, in order:
--   { "id", "status": "applied" | "unchanged" | "invalid" | "forbidden" | "deleted", "rev", "conflicts": n }
-- Whole-batch problems (not signed in, no access, read-only mode) raise instead.
create function public.sync_push_clients(p_organization_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields constant text[] := array['full_name', 'phone', 'email', 'address', 'notes', 'email_consent'];
  v_results jsonb := '[]'::jsonb;
  v_change jsonb;
  v_id uuid;
  v_op text;
  v_base integer;
  v_in jsonb;
  v_row public.clients%rowtype;
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

      select * into v_row from public.clients c where c.id = v_id for update;

      -- An id that belongs to another organization is refused without saying so.
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

        update public.clients c
        set deleted_at = now(), rev = c.rev + 1, seq = nextval('public.clients_seq'),
            updated_at = now(), updated_by = v_actor
        where c.id = v_id
        returning c.rev into v_rev;

        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', v_rev);
        continue;
      end if;

      -- upsert --------------------------------------------------------------
      if not found then
        v_new := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_in ? v_field then
            v_val := private.clean_client_field(v_field, v_in -> v_field);
            v_new := v_new || jsonb_build_object(v_field, coalesce(v_val, 'null'::jsonb));
          end if;
        end loop;
        if coalesce(v_new ->> 'full_name', '') = '' then
          raise exception 'invalid_field';
        end if;

        v_field_revs := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_new ? v_field then
            v_field_revs := v_field_revs || jsonb_build_object(v_field, 1);
          end if;
        end loop;

        insert into public.clients (
          id, organization_id, full_name, phone, email, address, notes, email_consent,
          field_revs, created_by, updated_by
        )
        values (
          v_id, p_organization_id, v_new ->> 'full_name', v_new ->> 'phone', v_new ->> 'email',
          v_new ->> 'address', v_new ->> 'notes', coalesce((v_new ->> 'email_consent')::boolean, false),
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

        v_val := private.clean_client_field(v_field, v_in -> v_field);
        continue when v_val is not distinct from nullif(v_current -> v_field, 'null'::jsonb);

        -- Someone changed this very field after the revision this edit started from.
        if coalesce((v_row.field_revs ->> v_field)::integer, 0) > coalesce(v_base, 0) then
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'clients', v_id, v_field,
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

      update public.clients c
      set full_name = v_new ->> 'full_name',
          phone = v_new ->> 'phone',
          email = v_new ->> 'email',
          address = v_new ->> 'address',
          notes = v_new ->> 'notes',
          email_consent = (v_new ->> 'email_consent')::boolean,
          field_revs = v_field_revs,
          rev = v_rev,
          seq = nextval('public.clients_seq'),
          updated_at = now(),
          updated_by = v_actor
      where c.id = v_id;

      v_results := v_results || jsonb_build_object(
        'id', v_id, 'status', 'applied', 'rev', v_rev, 'conflicts', v_conflicts);
    exception
      when raise_exception or invalid_text_representation or numeric_value_out_of_range then
        v_results := v_results || jsonb_build_object('id', v_change ->> 'id', 'status', 'invalid');
    end;
  end loop;

  return v_results;
end;
$$;

revoke execute on function public.sync_push_clients(uuid, jsonb) from public, anon;
grant execute on function public.sync_push_clients(uuid, jsonb) to authenticated;
