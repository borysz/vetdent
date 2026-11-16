-- The storage policies call these two helpers as the signed-in user, so that
-- role needs to be allowed to run them (they check the permission themselves
-- and run with the rights of their owner). Missing in the previous migration.

grant execute on function private.can_read_attachment(text) to authenticated;
grant execute on function private.can_upload_attachment(text) to authenticated;
