/**
 * Contrast validation for the theming engine.
 *
 * Settings lets users pick arbitrary colours; without a guard it becomes easy
 * to produce an unreadable interface, so the panel warns (WCAG AA: 4.5:1 for
 * body text, 3:1 for large text and UI borders).
 */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(input: string): Rgb | null {
  const value = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = value.split("");
    return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16) };
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }
  return null;
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(a: string, b: string): number {
  const colorA = parseHex(a);
  const colorB = parseHex(b);
  if (!colorA || !colorB) return 1;
  const lumA = luminance(colorA);
  const lumB = luminance(colorB);
  const light = Math.max(lumA, lumB);
  const dark = Math.min(lumA, lumB);
  return (light + 0.05) / (dark + 0.05);
}

export interface ContrastReport {
  ratio: number;
  readable: boolean;
  largeOnly: boolean;
}

export function checkContrast(foreground: string, background: string): ContrastReport {
  const ratio = contrastRatio(foreground, background);
  return { ratio, readable: ratio >= 4.5, largeOnly: ratio >= 3 && ratio < 4.5 };
}

/** Pick black or white text for an accent colour so labels stay legible. */
export function onColor(background: string): string {
  return contrastRatio("#000000", background) >= contrastRatio("#ffffff", background) ? "#000000" : "#ffffff";
}

export function isGreen(hex: string): boolean {
  const color = parseHex(hex);
  if (!color) return false;
  const { r, g, b } = color;
  return g > 90 && g > r * 1.25 && g > b * 1.25;
}
