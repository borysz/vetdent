import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";
import { acceptInvitationAction } from "@/lib/members/actions";
import { invitationPath, routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invitation");
  return { title: t("title"), robots: { index: false } };
}

export default async function InvitationPage({ params }: PageProps<"/meghivo/[token]">) {
  const t = await getTranslations();

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8 sm:px-6 sm:py-14">
      <Link href={routes.home} className="mb-8 text-2xl font-semibold tracking-tight text-primary">
        {t("app.name")}
      </Link>
      <main className="w-full max-w-md">
        <AuthCard title={t("invitation.title")}>
          {/* The token and the session are only known at request time. */}
          <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
            <Invitation params={params} />
          </Suspense>
        </AuthCard>
      </main>
    </div>
  );
}

async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  // An invitation's state changes over time: always resolve it per request.
  await connection();
  const { token } = await params;
  const t = await getTranslations();

  const supabase = await createSupabaseServerClient();
  const invitation = /^[0-9a-f]{64}$/.test(token)
    ? (await supabase.rpc("get_invitation", { p_token: token })).data?.[0]
    : undefined;

  if (!invitation) {
    return <p className="text-lg">{t("invitation.states.notFound")}</p>;
  }
  if (invitation.state === "accepted" || invitation.state === "revoked" || invitation.state === "expired") {
    return <p className="text-lg">{t(`invitation.states.${invitation.state}`)}</p>;
  }

  const user = await getCurrentUser();
  const next = invitationPath(token);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">
        {t("invitation.pending", {
          organization: invitation.organization_name,
          role: t(`roles.${invitation.role}`),
        })}
      </p>
      <p className="text-muted-foreground">{t("invitation.forEmail", { email: invitation.email })}</p>

      {!user ? (
        <>
          <p>{t("invitation.needAccount")}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`${routes.login}?next=${encodeURIComponent(next)}`}
              className={buttonVariants({ size: "lg" })}
            >
              {t("home.login")}
            </Link>
            <Link
              href={`${routes.signUp}?next=${encodeURIComponent(next)}`}
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              {t("home.signUp")}
            </Link>
          </div>
        </>
      ) : user.email.toLowerCase() === invitation.email ? (
        <ActionForm action={acceptInvitationAction} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <SubmitButton size="lg">{t("invitation.accept")}</SubmitButton>
        </ActionForm>
      ) : (
        <>
          <p>{t("invitation.wrongAccount", { current: user.email })}</p>
          <form action={signOutAction}>
            <SubmitButton variant="outline">{t("auth.logout")}</SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
