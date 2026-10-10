import { describe, expect, it } from "vitest";
import { detectLanguage, LOCALES, translate, type MessageKey } from "./index";
import { en } from "./en";
import { id } from "./id";

describe("translations", () => {
  it("keeps both dictionaries complete", () => {
    const englishKeys = Object.keys(en) as MessageKey[];
    expect(englishKeys.length).toBeGreaterThan(100);
    for (const key of englishKeys) {
      expect(id[key], `missing Indonesian translation for ${key}`).toBeTypeOf("string");
      expect((id[key] as string).length).toBeGreaterThan(0);
    }
    expect(Object.keys(id)).toHaveLength(englishKeys.length);
  });

  it("interpolates named placeholders", () => {
    expect(translate("en", "trackCount", { count: 3 })).toBe("3 tracks");
    expect(translate("id", "trackCount", { count: 3 })).toBe("3 lagu");
    expect(translate("id", "reason.becauseYouLike", { name: "Sheila on 7" })).toContain("Sheila on 7");
  });

  it("leaves unknown placeholders untouched and falls back for bad languages", () => {
    expect(translate("en", "trackCount", { other: 1 })).toBe("{count} tracks");
    const broken = "xx" as unknown as "en";
    expect(translate(broken, "nav.home")).toBe(en["nav.home"]);
  });

  it("exposes exactly the supported locales", () => {
    expect(LOCALES.map((locale) => locale.value)).toEqual(["en", "id"]);
  });

  it("detects the browser language", () => {
    expect(detectLanguage()).toMatch(/^(en|id)$/);
  });
});
