import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Form-level error. Announced to screen readers when it appears. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Confirmation shown in place of a form after it succeeded. */
export function FormSuccess({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Alert className="border-success/40 bg-success-soft text-foreground">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-foreground">{children}</AlertDescription>
    </Alert>
  );
}
