/** Formatting helpers shared across the UI. */

export function formatTime(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) return "0:00";
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationLabel(totalSeconds: number | null | undefined): string {
  if (!totalSeconds) return "0 min";
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function artistNames(artists: { name: string }[] | undefined | null): string {
  if (!artists || artists.length === 0) return "";
  return artists.map((artist) => artist.name).join(", ");
}

export function bestThumb(
  thumbnails: { url: string; width?: number | null }[] | undefined | null,
  minSize = 300,
): string | undefined {
  if (!thumbnails || thumbnails.length === 0) return undefined;
  const sorted = [...thumbnails].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return sorted.find((thumb) => (thumb.width ?? 0) >= minSize)?.url ?? sorted[sorted.length - 1]?.url;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 280): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as T;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
