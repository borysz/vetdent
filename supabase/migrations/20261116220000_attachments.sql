-- Attachments (PROJEKT_PROMPT 8.7): photos, X-rays and PDFs belonging to a visit,
-- optionally to one tooth or one quadrant.
--
-- The files live in a private storage bucket, one object per attachment at
-- "<organization id>/<attachment id>"; the metadata is an ordinary synchronised
-- record (attachments), created on the device with its final id. Order of
-- events on a device: the file is uploaded, then the record is marked
-- "uploaded"; the server then checks that the object really exists and takes
-- its size and type from the stored object, not from what the device says.
--
-- Rules, all enforced here and not in the application:
--   * only JPEG, PNG, WebP and PDF, at most 15 MB per file (bucket settings)
--   * upload and read only inside the organization's own folder, with the
--     attachments.upload / visits.read permission
--   * upload stops when the organization's storage allowance (plan) is used up
--   * no client can delete or overwrite an object other than its own folder's
--     (there is no delete policy: a removed attachment is hidden, its file is
--     kept until it is cleaned up server-side)
--   * the attachments of a final visit are locked, like its other content

-- ---------------------------------------------------------------------------
-- Storage allowance
-- ---------------------------------------------------------------------------

create function private.storage_limit_bytes(p_organization_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    case
      when s.status = 'trialing' then least(p.storage_gb, (select trial_storage_gb from public.billing_settings))
      else p.storage_gb
    end
  )::bigint * 1024 * 1024 * 1024
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = p_organization_id;
$$;

revoke execute on function private.storage_limit_bytes(uuid) from public;

-- ---------------------------------------------------------------------------
-- The metadata record
-- ---------------------------------------------------------------------------

create type public.attachment_kind as enum ('xray', 'before', 'after', 'other');

create sequence public.attachments_seq;

create table public.attachments (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  visit_id uuid not null references public.visits (id),
  -- Neither: the visit as a whole. At most one of the two.
  tooth smallint check (tooth is null or tooth between 101 and 411),
  quadrant smallint check (quadrant is null or quadrant between 1 and 4),
  kind public.attachment_kind not null,
  original_name text check (original_name is null or char_length(original_name) <= 200),
  -- The file is in the bucket. Never goes back to false.
  uploaded boolean not null default false,
  -- Taken from the stored object when it is marked uploaded.
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  rev integer not null default 1,
  field_revs jsonb not null default '{}'::jsonb,
  seq bigint not null default nextval('public.attachments_seq'),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint attachment_one_target check (tooth is null or quadrant is null)
);

create index attachments_organization_seq_idx on public.attachments (organization_id, seq);
create index attachments_visit_idx on public.attachments (visit_id);

alter table public.attachments enable row level security;
revoke all on table public.attachments from anon, authenticated;
grant all on table public.attachments to service_role;
grant select on table public.attachments to authenticated;

create policy "attachments: read with visits.read"
  on public.attachments for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('visits.read')));

alter table public.sync_conflicts drop constraint sync_conflicts_table_name_check;
alter table public.sync_conflicts add constraint sync_conflicts_table_name_check
  check (table_name in ('clients', 'patients', 'visits', 'visit_teeth', 'templates', 'attachments'));

-- What an organization has stored (files marked uploaded, not removed).
create function private.storage_used_bytes(p_organization_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(a.size_bytes), 0)::bigint
  from public.attachments a
  where a.organization_id = p_organization_id and a.uploaded and a.deleted_at is null;
$$;

revoke execute on function private.storage_used_bytes(uuid) from public;

-- Used and allowed storage, for the members of the organization.
create function public.my_storage_usage(p_organization_id uuid)
returns table (used_bytes bigint, limit_bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select private.storage_used_bytes(p_organization_id), private.storage_limit_bytes(p_organization_id)
  where p_organization_id in (select private.my_organization_ids());
$$;

revoke execute on function public.my_storage_usage(uuid) from public, anon;
grant execute on function public.my_storage_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The bucket and its policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The organization an object path belongs to: the first folder, if it is a uuid.
create function private.attachment_path_organization(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return split_part(p_name, '/', 1)::uuid;
end;
$$;

revoke execute on function private.attachment_path_organization(text) from public;

create function private.can_upload_attachment(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization uuid := private.attachment_path_organization(p_name);
begin
  if v_organization is null then return false; end if;
  return private.has_permission(v_organization, 'attachments.upload')
    and coalesce(private.organization_access(v_organization), 'read_only') = 'full'
    and private.storage_used_bytes(v_organization) < coalesce(private.storage_limit_bytes(v_organization), 0);
end;
$$;

create function private.can_read_attachment(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization uuid := private.attachment_path_organization(p_name);
begin
  return v_organization is not null and private.has_permission(v_organization, 'visits.read');
end;
$$;

revoke execute on function private.can_upload_attachment(text) from public;
revoke execute on function private.can_read_attachment(text) from public;

create policy "attachments objects: read"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.can_read_attachment(name));

create policy "attachments objects: upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and private.can_upload_attachment(name));

-- A repeated upload of the same file (the device retrying) may replace the object.
create policy "attachments objects: replace own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and private.can_upload_attachment(name))
  with check (bucket_id = 'attachments' and private.can_upload_attachment(name));

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------

create function private.clean_attachment_field(p_field text, p_value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_field = 'uploaded' then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_field'; end if;
    return p_value;
  end if;

  if p_field in ('tooth', 'quadrant') then
    if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) then
      raise exception 'invalid_field';
    end if;
    if p_field = 'tooth' and (p_value #>> '{}')::numeric not between 101 and 411 then raise exception 'invalid_field'; end if;
    if p_field = 'quadrant' and (p_value #>> '{}')::numeric not between 1 and 4 then raise exception 'invalid_field'; end if;
    return p_value;
  end if;

  if p_value is null or jsonb_typeof(p_value) = 'null' then
    v_text := null;
  elsif jsonb_typeof(p_value) = 'string' then
    v_text := nullif(btrim(p_value #>> '{}'), '');
  else
    raise exception 'invalid_field';
  end if;

  if p_field = 'visit_id' then
    if v_text is null or v_text !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_field'; end if;
    return to_jsonb(lower(v_text));
  elsif p_field = 'kind' then
    if v_text not in ('xray', 'before', 'after', 'other') then raise exception 'invalid_field'; end if;
  elsif p_field = 'original_name' then
    if char_length(coalesce(v_text, '')) > 200 then raise exception 'invalid_field'; end if;
  else
    raise exception 'invalid_field';
  end if;

  return case when v_text is null then null else to_jsonb(v_text) end;
end;
$$;

revoke execute on function private.clean_attachment_field(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Synchronisation
-- ---------------------------------------------------------------------------

-- Same contract as the other sync_push_* functions. Extra rules: the visit must
-- exist in the organization; a record of a final visit is locked (the edit is
-- kept in sync_conflicts and answered "locked"); the visit cannot change; a
-- record becomes "uploaded" only if the file really is in the bucket, and its
-- size and type are then taken from the stored file; "uploaded" never goes back.
create function public.sync_push_attachments(p_organization_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields constant text[] := array['visit_id', 'tooth', 'quadrant', 'kind', 'original_name', 'uploaded'];
  v_results jsonb := '[]'::jsonb;
  v_change jsonb;
  v_id uuid;
  v_op text;
  v_base integer;
  v_in jsonb;
  v_row public.attachments%rowtype;
  v_exists boolean;
  v_visit public.visits%rowtype;
  v_current jsonb;
  v_new jsonb;
  v_val jsonb;
  v_field text;
  v_changed boolean;
  v_conflicts integer;
  v_field_revs jsonb;
  v_rev integer;
  v_visit_id uuid;
  v_object jsonb;
  v_mime text;
  v_size bigint;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 100 then
    raise exception 'invalid_batch';
  end if;

  perform private.require_permission(p_organization_id, 'attachments.upload');
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

      select * into v_row from public.attachments a where a.id = v_id for update;
      v_exists := found;

      if v_exists and v_row.organization_id <> p_organization_id then
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
        continue;
      end if;

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

      if v_visit.status = 'final' then
        if v_op = 'delete' then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'forbidden');
          continue;
        end if;
        foreach v_field in array v_fields loop
          continue when not (v_in ? v_field) or v_field = 'visit_id';
          v_val := private.clean_attachment_field(v_field, v_in -> v_field);
          continue when v_exists and v_val is not distinct from nullif(to_jsonb(v_row) -> v_field, 'null'::jsonb);
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'attachments', v_id, v_field, v_val,
            case when v_exists then nullif(to_jsonb(v_row) -> v_field, 'null'::jsonb) else null end, v_actor
          );
          v_conflicts := v_conflicts + 1;
        end loop;
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'locked', 'conflicts', v_conflicts);
        continue;
      end if;

      if v_op = 'delete' then
        if not v_exists or v_row.deleted_at is not null then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'unchanged', 'rev', v_row.rev);
          continue;
        end if;
        update public.attachments a
        set deleted_at = now(), rev = a.rev + 1, seq = nextval('public.attachments_seq'),
            updated_at = now(), updated_by = v_actor
        where a.id = v_id
        returning a.rev into v_rev;
        v_results := v_results || jsonb_build_object('id', v_id, 'status', 'applied', 'rev', v_rev);
        continue;
      end if;

      -- create ----------------------------------------------------------------
      if not v_exists then
        v_new := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_in ? v_field then
            v_val := private.clean_attachment_field(v_field, v_in -> v_field);
            v_new := v_new || jsonb_build_object(v_field, coalesce(v_val, 'null'::jsonb));
          end if;
        end loop;
        if not (v_new ? 'visit_id') or not (v_new ? 'kind') then
          raise exception 'invalid_field';
        end if;
        if coalesce(v_new -> 'tooth', 'null'::jsonb) <> 'null'::jsonb and coalesce(v_new -> 'quadrant', 'null'::jsonb) <> 'null'::jsonb then
          raise exception 'invalid_field';
        end if;
        if coalesce(v_new -> 'tooth', 'null'::jsonb) <> 'null'::jsonb and not exists (
          select 1 from public.patients p
          where p.id = v_visit.patient_id and private.tooth_exists(p.species, (v_new ->> 'tooth')::integer)
        ) then
          raise exception 'invalid_field';
        end if;

        v_mime := null;
        v_size := null;
        if coalesce((v_new ->> 'uploaded')::boolean, false) then
          select o.metadata into v_object from storage.objects o
          where o.bucket_id = 'attachments' and o.name = p_organization_id::text || '/' || v_id::text;
          if v_object is null then raise exception 'invalid_field'; end if;
          v_mime := v_object ->> 'mimetype';
          v_size := (v_object ->> 'size')::bigint;
        end if;

        v_field_revs := '{}'::jsonb;
        foreach v_field in array v_fields loop
          if v_new ? v_field then
            v_field_revs := v_field_revs || jsonb_build_object(v_field, 1);
          end if;
        end loop;

        insert into public.attachments (
          id, organization_id, visit_id, tooth, quadrant, kind, original_name, uploaded,
          mime_type, size_bytes, field_revs, created_by, updated_by
        )
        values (
          v_id, p_organization_id, v_visit_id, (v_new ->> 'tooth')::smallint, (v_new ->> 'quadrant')::smallint,
          (v_new ->> 'kind')::public.attachment_kind, v_new ->> 'original_name',
          coalesce((v_new ->> 'uploaded')::boolean, false), v_mime, v_size, v_field_revs, v_actor, v_actor
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
      v_mime := v_row.mime_type;
      v_size := v_row.size_bytes;

      foreach v_field in array v_fields loop
        continue when not (v_in ? v_field);

        v_val := private.clean_attachment_field(v_field, v_in -> v_field);
        continue when v_val is not distinct from nullif(v_current -> v_field, 'null'::jsonb);

        if v_field = 'visit_id' then
          raise exception 'invalid_field';
        end if;
        -- "Uploaded" only ever goes from false to true, and only for a file that is really there.
        if v_field = 'uploaded' then
          if v_val is distinct from 'true'::jsonb then raise exception 'invalid_field'; end if;
          select o.metadata into v_object from storage.objects o
          where o.bucket_id = 'attachments' and o.name = p_organization_id::text || '/' || v_id::text;
          if v_object is null then raise exception 'invalid_field'; end if;
          v_mime := v_object ->> 'mimetype';
          v_size := (v_object ->> 'size')::bigint;
        end if;

        if coalesce((v_row.field_revs ->> v_field)::integer, 0) > coalesce(v_base, 0) then
          insert into public.sync_conflicts (
            organization_id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by
          )
          values (
            p_organization_id, 'attachments', v_id, v_field,
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

      if coalesce(v_new -> 'tooth', 'null'::jsonb) <> 'null'::jsonb and coalesce(v_new -> 'quadrant', 'null'::jsonb) <> 'null'::jsonb then
        raise exception 'invalid_field';
      end if;
      if coalesce(v_new -> 'tooth', 'null'::jsonb) <> 'null'::jsonb and not exists (
        select 1 from public.patients p
        where p.id = v_visit.patient_id and private.tooth_exists(p.species, (v_new ->> 'tooth')::integer)
      ) then
        raise exception 'invalid_field';
      end if;

      update public.attachments a
      set tooth = (v_new ->> 'tooth')::smallint,
          quadrant = (v_new ->> 'quadrant')::smallint,
          kind = (v_new ->> 'kind')::public.attachment_kind,
          original_name = v_new ->> 'original_name',
          uploaded = (v_new ->> 'uploaded')::boolean,
          mime_type = v_mime,
          size_bytes = v_size,
          field_revs = v_field_revs,
          rev = v_rev,
          seq = nextval('public.attachments_seq'),
          updated_at = now(),
          updated_by = v_actor
      where a.id = v_id;

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

revoke execute on function public.sync_push_attachments(uuid, jsonb) from public, anon;
grant execute on function public.sync_push_attachments(uuid, jsonb) to authenticated;
