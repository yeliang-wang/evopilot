import { createHash } from "node:crypto";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function safeFileName(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "item";
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return uniqueStrings(value.map(String));
  if (typeof value === "string") {
    return uniqueStrings(value.split(/\r?\n|,/).map((item) => item.trim()));
  }
  return fallback;
}

export function normalizeStringRecord(value: unknown): Record<string, string> {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, String(item ?? "")]));
}

export function recordObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function digestText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function digestObject(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error("No JSON object found in LLM response.");
}

export function incrementSemverPatch(version: string): string {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) return `${version}.1`;
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}${match[4] ?? ""}`;
}
