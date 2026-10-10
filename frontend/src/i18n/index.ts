import { en, type MessageKey } from "./en";
import { id } from "./id";
import type { Lang } from "../types";

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, id };

export type { MessageKey };

/**
 * Translate a key. Interpolation uses ``{name}`` placeholders, which keeps every
 * user facing string in one place instead of scattering literal copy across
 * components.
 */
export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const dictionary = dictionaries[lang] ?? dictionaries.en;
  const template = dictionary[key] ?? dictionaries.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export const LOCALES: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "id", label: "Bahasa Indonesia" },
];

export function detectLanguage(): Lang {
  if (typeof navigator === "undefined") return "en";
  const preferred = navigator.languages ?? [navigator.language];
  for (const entry of preferred) {
    if (entry?.toLowerCase().startsWith("id")) return "id";
    if (entry?.toLowerCase().startsWith("en")) return "en";
  }
  return "en";
}
