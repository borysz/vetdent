"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { suggestTarget, targetOptions, type DictationTarget } from "@/domain/dictation/triadan";
import type { Species } from "@/domain/teeth/catalog";
import { startListening, type DictationError, type Session } from "@/lib/dictation/speech";

interface DictationProps {
  /** Where the confirmed text goes. `target` is `null` when the caller offers no choice (a single field). */
  onAccept: (text: string, target: DictationTarget | null) => void;
  /** With a species the confirmation lets the user choose the tooth (or the general note). */
  species?: Species;
  selectedTeeth?: readonly number[];
  /** A round button that stays on screen, instead of a small one beside a field. */
  floating?: boolean;
  /** A round button that sits in a bar the caller provides (it stays in view with the bar); messages appear under the bar. */
  bar?: boolean;
  label?: string;
}

const targetValue = (target: DictationTarget) => (target.kind === "general" ? "general" : String(target.tooth));

/**
 * The microphone: listen, show what was understood, and only after the user
 * confirms (and possibly corrects the text or the place) pass it on.
 */
export function Dictation({ onAccept, species, selectedTeeth = [], floating = false, bar = false, label }: DictationProps) {
  const t = useTranslations("dictation");
  const session = useRef<Session | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<DictationError | null>(null);
  const [heard, setHeard] = useState(false);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<DictationTarget>({ kind: "general" });

  // The confirmation is a modal dialog; it opens when something was heard.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (heard && !element.open) element.showModal();
    if (!heard && element.open) element.close();
  }, [heard]);

  function start() {
    setProblem(null);
    setListening(true);
    session.current = startListening({
      onText: (result) => {
        setText(result);
        setTarget(species ? suggestTarget(result, species, selectedTeeth) : { kind: "general" });
        setHeard(true);
      },
      onError: (error) => setProblem(error),
      onEnd: () => {
        setListening(false);
        session.current = null;
      },
    });
    if (!session.current) setListening(false);
  }

  const options = species && heard ? targetOptions(text, species, selectedTeeth) : [];
  const buttonClass = floating
    ? "fixed bottom-24 right-4 z-20 size-14 rounded-full shadow-lg"
    : bar
      ? "size-touch shrink-0 rounded-full"
      : "min-h-touch min-w-touch";
  const bubble = floating
    ? "fixed bottom-40 right-4 z-20 max-w-64 rounded-lg border bg-card p-2 shadow"
    : bar
      ? "fixed right-4 top-24 z-30 max-w-64 rounded-lg border bg-card p-2 shadow"
      : "";

  return (
    <>
      <div className={floating || bar ? "contents" : "inline-flex flex-col items-start gap-1"}>
        <Button
          type="button"
          variant={listening ? "destructive" : "outline"}
          aria-label={listening ? t("stop") : (label ?? t("start"))}
          aria-pressed={listening}
          title={listening ? t("stop") : (label ?? t("start"))}
          className={buttonClass}
          onClick={listening ? () => session.current?.stop() : start}
        >
          <span aria-hidden="true">{listening ? "■" : "🎤"}</span>
        </Button>
        {problem ? (
          <p role="alert" className={`text-sm text-destructive ${bubble}`}>
            {t(`errors.${problem}`)}
          </p>
        ) : null}
        {listening ? (
          <p role="status" className={`text-sm ${bubble}`}>
            {t("listening")}
          </p>
        ) : null}
      </div>

      <dialog
        ref={dialog}
        onClose={() => setHeard(false)}
        aria-labelledby="dictation-title"
        className="m-auto w-[min(100%-1.5rem,36rem)] rounded-2xl border bg-card p-5 text-card-foreground backdrop:bg-black/40"
      >
        <div className="flex flex-col gap-4">
          <h2 id="dictation-title" className="text-xl font-semibold">
            {t("confirmTitle")}
          </h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dictation-text">{t("text")}</Label>
            <textarea
              id="dictation-text"
              rows={4}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (species) setTarget(suggestTarget(event.target.value, species, selectedTeeth));
              }}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          {species ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="dictation-target">{t("target")}</Label>
              <select
                id="dictation-target"
                value={targetValue(target)}
                onChange={(event) =>
                  setTarget(event.target.value === "general" ? { kind: "general" } : { kind: "tooth", tooth: Number(event.target.value) })
                }
                className="h-touch w-full rounded-lg border border-input bg-card px-3 text-base"
              >
                {options.map((option) => (
                  <option key={targetValue(option)} value={targetValue(option)}>
                    {option.kind === "general" ? t("general") : t("tooth", { number: option.tooth })}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={text.trim().length === 0}
              onClick={() => {
                onAccept(text.trim(), species ? target : null);
                setHeard(false);
              }}
            >
              {t("accept")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setHeard(false);
                start();
              }}
            >
              {t("again")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setHeard(false)}>
              {t("discard")}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
