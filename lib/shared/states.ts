export const SUPPORTED_STATES = [
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "MA", name: "Massachusetts" },
  { code: "RI", name: "Rhode Island" },
] as const;

export type SupportedStateCode = typeof SUPPORTED_STATES[number]["code"];

export const SUPPORTED_STATE_CODES: readonly SupportedStateCode[] =
  SUPPORTED_STATES.map((s) => s.code);

export function isSupportedStateCode(value: string): value is SupportedStateCode {
  return (SUPPORTED_STATE_CODES as readonly string[]).includes(value);
}

export function stateNameFromCode(code: string): string | undefined {
  return SUPPORTED_STATES.find((s) => s.code === code)?.name;
}

export function stateCodeFromName(name: string): SupportedStateCode | undefined {
  return SUPPORTED_STATES.find((s) => s.name === name)?.code;
}

export function normalizeStateInput(input: unknown): SupportedStateCode | "" {
  if (typeof input !== "string") return "";
  const raw = input.trim();
  if (raw === "") return "";
  const upper = raw.toUpperCase();
  if (isSupportedStateCode(upper)) return upper;
  const fromName = stateCodeFromName(raw);
  return fromName ?? "";
}
