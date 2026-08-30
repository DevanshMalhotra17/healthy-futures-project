import * as Speech from "expo-speech";

// Spoken replies use expo-speech, which ships inside Expo Go. Speech-to-text
// needs a native recognizer that Expo Go does not bundle, so it is resolved at
// runtime: present in a dev/production build, absent in Expo Go. The UI reads
// `isSpeechRecognitionAvailable()` and falls back to the keyboard.
type RecognitionModule = {
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: () => Promise<{ granted: boolean }>;
    start: (options: Record<string, unknown>) => void;
    stop: () => void;
  };
  addSpeechRecognitionListener: (
    event: string,
    handler: (payload: any) => void
  ) => { remove: () => void };
};

let recognition: RecognitionModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  recognition = require("@jamsch/expo-speech-recognition") as RecognitionModule;
} catch {
  recognition = null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return recognition !== null;
}

export type ListenHandlers = {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
};

// Resolves once the recognizer is running; call the returned stop() to finish.
export async function startListening(
  handlers: ListenHandlers
): Promise<() => void> {
  if (!recognition) {
    handlers.onError("Voice input needs a full build of the app.");
    return () => {};
  }

  const { ExpoSpeechRecognitionModule, addSpeechRecognitionListener } = recognition;
  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!permission.granted) {
    handlers.onError("Microphone access is needed to talk to the assistant.");
    return () => {};
  }

  const subscriptions = [
    addSpeechRecognitionListener("result", (event: any) => {
      const transcript: string = event?.results?.[0]?.transcript ?? "";
      if (!transcript) return;
      if (event?.isFinal) handlers.onFinal(transcript);
      else handlers.onPartial?.(transcript);
    }),
    addSpeechRecognitionListener("error", (event: any) => {
      // "no-speech" just means the user stayed quiet; not worth surfacing.
      if (event?.error === "no-speech") handlers.onError("");
      else handlers.onError("Didn't catch that — try again.");
    }),
  ];

  ExpoSpeechRecognitionModule.start({
    lang: "en-US",
    interimResults: true,
    continuous: false,
  });

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // already stopped
    }
    subscriptions.forEach((s) => s.remove());
  };
}

// Reading a reply aloud. Strips markdown so the voice doesn't say "asterisk".
export function speak(text: string, onDone?: () => void): void {
  const spoken = text
    .replace(/[*_#`>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Speech.maxSpeechInputLength);
  if (!spoken) {
    onDone?.();
    return;
  }
  Speech.speak(spoken, {
    language: "en-US",
    rate: 0.98,
    onDone,
    onError: () => onDone?.(),
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}
