"use client";

import { SubmitButton } from "@/components/forms/submit-button";
import { signOutAction } from "@/lib/auth/actions";
import { clearCachedPages } from "@/lib/offline/service-worker";

/** The sign-out button; also drops the device's cached copies of the signed-in pages. */
export function SignOutForm({ label }: { label: string }) {
  return (
    <form action={signOutAction} onSubmit={() => void clearCachedPages()}>
      <SubmitButton variant="outline">{label}</SubmitButton>
    </form>
  );
}
