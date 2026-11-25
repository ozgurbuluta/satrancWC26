/** Shared validation for persisted preferences and engine requests. */
export const engineLineCount = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : 3;
