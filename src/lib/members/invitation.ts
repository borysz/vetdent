import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invitationTokenOf } from "./invitation-token";

/**
 * The e-mail address a still-open invitation was sent to. A person who
 * arrives from an invitation link signs up or in with exactly this address, so
 * the form fills it in and does not let it be changed. `null` for a link that
 * is not an invitation, or an invitation that is accepted, revoked or expired.
 */
export async function pendingInvitationEmail(next: string | null | undefined): Promise<string | null> {
  const token = invitationTokenOf(next);
  if (!token) return null;

  const supabase = await createSupabaseServerClient();
  const invitation = (await supabase.rpc("get_invitation", { p_token: token })).data?.[0];
  return invitation && invitation.state === "pending" ? invitation.email.toLowerCase() : null;
}
