-- A general note on the visit (PROJEKT_PROMPT 8.6: "a lap szintjén általános
-- megjegyzés"), also the place a dictated text goes when it names no tooth.

alter table public.visits
  add column general_note text check (general_note is null or char_length(general_note) <= 2000);

create or replace function private.clean_visit_field(p_field text, p_value jsonb)
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
  elsif p_field in ('complaint_notes', 'sutures', 'feeding_advice', 'general_note') then
    if char_length(coalesce(v_text, '')) > 2000 then raise exception 'invalid_field'; end if;
  else
    raise exception 'invalid_field';
  end if;

  return case when v_text is null then null else to_jsonb(v_text) end;
end;
$$;


create or replace function public.sync_push_visits(p_organization_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields constant text[] := array[
    'patient_id', 'visit_date', 'veterinarian_name', 'assistant_name', 'asa_status', 'last_fed_at',
    'blood_summary', 'weight_kg', 'complaint_tags', 'complaint_notes', 'home_brushing', 'diet_type',
    'anesthesia_blocks', 'sutures', 'medications', 'feeding_advice', 'follow_up_date', 'ready_to_finalize',
    'general_note'
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
          general_note, field_revs, created_by, updated_by
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
          v_new ->> 'general_note', v_field_revs, v_actor, v_actor
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
          'id', v_id, 'status', 'locked', 'rev', v_row.rev, 'conflicts', v_conflicts);
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
          general_note = v_new ->> 'general_note',
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

