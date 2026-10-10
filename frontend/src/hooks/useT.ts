import { useMemo } from "react";
import { translate, type MessageKey } from "../i18n";
import { useSettings } from "../stores/settings";

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Single translation hook so no component hardcodes user facing copy. */
export function useT(): Translate {
  const language = useSettings((state) => state.settings.language);
  return useMemo(() => (key: MessageKey, vars?: Record<string, string | number>) => translate(language, key, vars), [language]);
}
