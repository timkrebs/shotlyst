import { en } from "@/messages/en";

// The film vocabulary lives here once and feeds both the UI and, later, the
// AI prompts. Values are what the database stores; labels come from the
// message file.

export const VOCAB = {
  shotSize: Object.keys(en.vocab.shotSize),
  cameraMovement: Object.keys(en.vocab.cameraMovement),
  cameraAngle: Object.keys(en.vocab.cameraAngle),
  intExt: Object.keys(en.vocab.intExt),
  dayNight: Object.keys(en.vocab.dayNight),
  frameRate: Object.keys(en.vocab.frameRate),
  shotStatus: Object.keys(en.vocab.shotStatus),
} as const satisfies Record<keyof typeof en.vocab, string[]>;

export type VocabKind = keyof typeof VOCAB;

// The label of a stored value; an unknown value is shown as it is.
export function vocabLabel(kind: VocabKind, value: string | null | undefined): string {
  if (!value) return "";
  const labels: Record<string, string> = en.vocab[kind];
  return labels[value] ?? value;
}

export function vocabOptions(kind: VocabKind): { value: string; label: string }[] {
  return VOCAB[kind].map((value) => ({ value, label: vocabLabel(kind, value) }));
}
