import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormFieldProps extends Omit<React.ComponentProps<"input">, "id"> {
  label: string;
  /** Shown after the label, e.g. "nem kötelező". */
  labelSuffix?: string;
  hint?: string;
  error?: string;
}

/** A labelled input with its hint and error wired up for assistive technology. */
export function FormField({ label, labelSuffix, hint, error, ...inputProps }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {labelSuffix ? <span className="font-normal text-muted-foreground">({labelSuffix})</span> : null}
      </Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {hint && !error ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
