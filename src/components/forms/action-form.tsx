"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/forms";

interface ActionFormProps extends Omit<React.ComponentProps<"form">, "action"> {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** Asked before submitting; the action only runs if the user confirms. */
  confirmMessage?: string;
}

/**
 * A small form around a Server Action (one button, a few hidden fields) that
 * shows the action's error or success message underneath.
 */
export function ActionForm({ action, confirmMessage, children, className, ...props }: ActionFormProps) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      {...props}
    >
      {children}
      {state.status === "error" && state.message ? (
        <p role="alert" className="basis-full text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p role="status" className="basis-full text-sm text-success">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
