/**
 * The browser's speech recognition (Web Speech API), behind a small interface.
 * Not every browser has it (Chrome and Edge do; Firefox does not), and in
 * Chrome the recognition itself runs on the browser vendor's server, so it
 * needs a connection. The button says so plainly instead of failing silently.
 */

interface RecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

/** Translation keys under `dictation.errors`. */
export type DictationError = "unsupported" | "offline" | "denied" | "noSpeech" | "failed";

export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isSupported(): boolean {
  return recognitionConstructor() !== null;
}

export function errorOf(code: string): DictationError {
  if (code === "not-allowed" || code === "service-not-allowed") return "denied";
  if (code === "no-speech" || code === "aborted") return "noSpeech";
  if (code === "network") return "offline";
  return "failed";
}

export interface Session {
  stop(): void;
}

/**
 * Starts listening for one utterance in Hungarian. `onText` gets the
 * recognised text once, when the browser decides the speaker is done (or after
 * `stop`); `onError` is called instead if nothing usable came out.
 */
export function startListening(handlers: {
  onText: (text: string) => void;
  onError: (error: DictationError) => void;
  onEnd: () => void;
}): Session | null {
  const Constructor = recognitionConstructor();
  if (!Constructor) {
    handlers.onError("unsupported");
    return null;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    handlers.onError("offline");
    return null;
  }

  const recognition = new Constructor();
  recognition.lang = "hu-HU";
  recognition.continuous = false;
  recognition.interimResults = false;

  let text = "";
  let failed = false;
  recognition.onresult = (event) => {
    const parts: string[] = [];
    for (let index = 0; index < event.results.length; index += 1) parts.push(event.results[index][0].transcript);
    text = parts.join(" ").trim();
  };
  recognition.onerror = (event) => {
    failed = true;
    handlers.onError(errorOf(event.error));
  };
  recognition.onend = () => {
    if (text.length > 0) handlers.onText(text);
    else if (!failed) handlers.onError("noSpeech");
    handlers.onEnd();
  };

  try {
    recognition.start();
  } catch {
    handlers.onError("failed");
    return null;
  }
  return { stop: () => recognition.stop() };
}
