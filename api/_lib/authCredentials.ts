export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePassword(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
