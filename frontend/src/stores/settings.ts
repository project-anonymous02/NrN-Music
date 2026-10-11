import { create } from "zustand";
import { detectLanguage, type MessageKey } from "../i18n";
import { idbGet, idbSet, idbClear } from "../lib/db";
import { isGreen, onColor, parseHex } from "../lib/contrast";
import type { Lang } from "../types";

export type ThemeMode = "dark" | "light" | "system";
export type Density = "compact" | "comfortable" | "spacious";
export type QualityMode = "auto" | "high" | "compat";

export interface AnimationSettings {
  enabled: boolean;
  speed: number;
  spring: number;
  pageTransition: boolean;
  artworkAnimation: boolean;
  miniPlayerAnimation: boolean;
  sheetAnimation: boolean;
  reduceMotion: boolean;
  performanceMode: boolean;
}

export interface PlaybackSettings {
  autoplay: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  crossfade: number;
  speed: number;
  normalization: boolean;
  quality: QualityMode;
  sleepDefault: number;
  queueBehavior: "queue" | "replace";
  resumeSession: boolean;
}

export interface Settings {
  theme: ThemeMode;
  colors: {
    bg: string;
    surface1: string;
    surface2: string;
    surface3: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
    accent2: string;
  };
  radius: number;
  density: Density;
  spacing: number;
  artworkSize: number;
  fontScale: number;
  font: string;
  blur: boolean;
  transparency: number;
  visualIntensity: number;
  animation: AnimationSettings;
  playback: PlaybackSettings;
  language: Lang;
  privacy: {
    personalization: boolean;
    variation: number;
  };
}

export const defaultSettings: Settings = {
  theme: "dark",
  colors: {
    bg: "#000000",
    surface1: "#080a09",
    surface2: "#101312",
    surface3: "#191d1b",
    text: "#f4f6f5",
    textMuted: "#a3aba7",
    border: "#262b29",
    accent: "#ff5c35",
    accent2: "#4cc2ff",
  },
  radius: 14,
  density: "comfortable",
  spacing: 24,
  artworkSize: 40,
  fontScale: 100,
  font: "system",
  blur: true,
  transparency: 8,
  visualIntensity: 100,
  animation: {
    enabled: true,
    speed: 1,
    spring: 60,
    pageTransition: true,
    artworkAnimation: true,
    miniPlayerAnimation: true,
    sheetAnimation: true,
    reduceMotion: false,
    performanceMode: false,
  },
  playback: {
    autoplay: true,
    shuffle: false,
    repeat: "off",
    crossfade: 0,
    speed: 1,
    normalization: false,
    quality: "auto",
    sleepDefault: 0,
    queueBehavior: "queue",
    resumeSession: true,
  },
  language: "en",
  privacy: { personalization: true, variation: 15 },
};

export const PRESETS: { name: string; colors: Partial<Settings["colors"]> }[] = [
  { name: "Ember", colors: { accent: "#ff5c35", accent2: "#4cc2ff" } },
  { name: "Indigo", colors: { accent: "#6c7dff", accent2: "#ff8ab5" } },
  { name: "Sunset", colors: { accent: "#ffb020", accent2: "#ff5c8a" } },
  { name: "Ocean", colors: { accent: "#2fb6ff", accent2: "#b98cff" } },
  { name: "Rose", colors: { accent: "#ff5c7a", accent2: "#7ce0d3" } },
  { name: "Mono", colors: { accent: "#e8ece9", accent2: "#9aa3a0" } },
];

function merge(base: Settings, patch: DeepPartial<Settings>): Settings {
  const colors = { ...base.colors, ...(patch.colors ?? {}) };
  if (isGreen(colors.accent)) colors.accent = defaultSettings.colors.accent;
  if (isGreen(colors.accent2)) colors.accent2 = defaultSettings.colors.accent2;
  const out: Settings = {
    ...base,
    ...patch,
    theme: "dark",
    colors: { ...colors, bg: "#000000" },
    animation: { ...base.animation, ...(patch.animation ?? {}) },
    playback: { ...base.playback, ...(patch.playback ?? {}) },
    privacy: { ...base.privacy, ...(patch.privacy ?? {}) },
  };
  return out;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface ContrastWarning {
  key: MessageKey;
  ratio: number;
}

/** Guards against unreadable combinations produced by the colour pickers. */
export function validateSettings(settings: Settings): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  const { text, bg, accent, surface2 } = settings.colors;
  const ratio = (a: string, b: string) => {
    const colorA = parseHex(a);
    const colorB = parseHex(b);
    if (!colorA || !colorB) return 21;
    const lum = (c: typeof colorA) => {
      const chan = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
    };
    const l1 = lum(colorA);
    const l2 = lum(colorB);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  if (ratio(text, bg) < 4.5) warnings.push({ key: "settings.contrastWarning", ratio: ratio(text, bg) });
  if (ratio(text, surface2) < 4.5) warnings.push({ key: "settings.contrastWarning", ratio: ratio(text, surface2) });
  if (ratio(accent, bg) < 3) warnings.push({ key: "settings.contrastWarning", ratio: ratio(accent, bg) });
  if (isGreen(accent)) warnings.push({ key: "settings.greenWarning", ratio: 1 });
  return warnings;
}

const DENSITY_ROW: Record<Density, number> = { compact: 46, comfortable: 56, spacious: 66 };

/** Writes the settings onto :root so every component reacts without prop drilling. */
export function applySettings(settings: Settings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { colors } = settings;

  root.dataset.theme = "dark";
  root.dataset.reduceMotion = settings.animation.reduceMotion || !settings.animation.enabled || settings.animation.performanceMode ? "1" : "0";
  root.dataset.pageTransition = settings.animation.pageTransition ? "1" : "0";

  const style = root.style;
  style.setProperty("--bg", "#000000");
  style.setProperty("--surface-1", colors.surface1);
  style.setProperty("--surface-2", colors.surface2);
  style.setProperty("--surface-3", colors.surface3);
  style.setProperty("--text", colors.text);
  style.setProperty("--text-muted", colors.textMuted);
  style.setProperty("--border", colors.border);
  style.setProperty("--accent", colors.accent);
  style.setProperty("--accent-2", colors.accent2);
  style.setProperty("--text-on-accent", onColor(colors.accent));
  style.setProperty("--accent-soft", hexToRgba(colors.accent, 0.16));
  style.setProperty("--accent-soft-2", hexToRgba(colors.accent2, 0.14));
  style.setProperty("--radius-md", `${settings.radius}px`);
  style.setProperty("--card-shape", `${settings.radius}px`);
  style.setProperty("--content-gap", `${settings.spacing}px`);
  style.setProperty("--row-height", `${DENSITY_ROW[settings.density]}px`);
  style.setProperty("--art-size", `${settings.artworkSize}px`);
  style.setProperty("--motion-duration", String(settings.animation.enabled ? 1 / settings.animation.speed : 0.01));
  style.setProperty("--blur-strength", settings.blur ? `${14 * (settings.visualIntensity / 100)}px` : "0px");
  style.setProperty("--font-scale", String(settings.fontScale / 100));
  style.setProperty("font-size", `${(settings.fontScale / 100) * 16}px`);
  if (settings.font !== "system") style.setProperty("--font-sans", settings.font);
  else style.removeProperty("--font-sans");

  const opacity = (100 - settings.transparency) / 100;
  style.setProperty("--surface-overlay", hexToRgba(colors.surface2, opacity));
}

function hexToRgba(hex: string, alpha: number): string {
  const parsed = parseHex(hex);
  if (!parsed) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

interface SettingsState {
  settings: Settings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: DeepPartial<Settings>) => void;
  reset: () => void;
  exportData: () => string;
  importData: (raw: string) => { ok: boolean; reason?: string };
  clearAll: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave(settings: Settings): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void idbSet("settings", "current", settings), 180);
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  hydrated: false,

  hydrate: async () => {
    const stored = await idbGet<Settings>("settings", "current");
    const base = stored ? merge(defaultSettings, stored as DeepPartial<Settings>) : defaultSettings;
    if (!stored) base.language = detectLanguage();
    applySettings(base);
    set({ settings: base, hydrated: true });
  },

  update: (patch) => {
    const next = merge(get().settings, patch);
    applySettings(next);
    set({ settings: next });
    scheduleSave(next);
  },

  reset: () => {
    const language = get().settings.language;
    const next = { ...defaultSettings, language };
    applySettings(next);
    set({ settings: next });
    scheduleSave(next);
  },

  exportData: () => JSON.stringify({ app: "NrNMusic", kind: "settings", version: 1, settings: get().settings }, null, 2),

  importData: (raw) => {
    try {
      const parsed = JSON.parse(raw) as { app?: string; kind?: string; settings?: DeepPartial<Settings> };
      if (parsed.app !== "NrNMusic" || parsed.kind !== "settings" || !parsed.settings) {
        return { ok: false, reason: "invalid" };
      }
      const next = merge(defaultSettings, parsed.settings);
      applySettings(next);
      set({ settings: next });
      scheduleSave(next);
      return { ok: true };
    } catch {
      return { ok: false, reason: "parse" };
    }
  },

  clearAll: async () => {
    await idbClear("settings");
    get().reset();
  },
}));
