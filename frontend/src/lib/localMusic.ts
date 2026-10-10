import { idbDelete, idbGet, idbSet } from "./db";

/**
 * Locally imported audio files.
 *
 * Files live in IndexedDB as Blob values (structured clone keeps the bytes),
 * and play back through an object URL. Metadata reading is deliberately
 * conservative: browsers cannot parse ID3 without a dependency, so we read what
 * the file itself reports (duration, via the media element) and use the file
 * name as the title rather than inventing tags.
 */

export interface LocalTrack {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: number;
  duration?: number | null;
}

const INDEX_KEY = "index";
const AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm", "audio/wav", "audio/flac", "audio/x-m4a"];

function readableName(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim();
}

async function readIndex(): Promise<LocalTrack[]> {
  return (await idbGet<LocalTrack[]>("local", INDEX_KEY)) ?? [];
}

async function writeIndex(tracks: LocalTrack[]): Promise<void> {
  await idbSet("local", INDEX_KEY, tracks);
}

export async function listLocalTracks(): Promise<LocalTrack[]> {
  return readIndex();
}

export async function importLocalFile(file: File): Promise<LocalTrack> {
  const isAudio = file.type ? AUDIO_TYPES.includes(file.type) : /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i.test(file.name);
  if (!isAudio) throw new Error("unsupported");

  const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  await idbSet("local", id, file);
  const track: LocalTrack = {
    id,
    name: readableName(file.name) || file.name,
    size: file.size,
    type: file.type || "audio/*",
    addedAt: Date.now(),
    duration: null,
  };
  const index = await readIndex();
  await writeIndex([track, ...index]);
  return track;
}

export async function getLocalFile(id: string): Promise<File | undefined> {
  return idbGet<File>("local", id);
}

export async function removeLocalFile(id: string): Promise<void> {
  await idbDelete("local", id);
  const index = await readIndex();
  await writeIndex(index.filter((track) => track.id !== id));
}

export async function clearLocalFiles(): Promise<void> {
  const index = await readIndex();
  for (const track of index) await idbDelete("local", track.id);
  await writeIndex([]);
}

/** Resolve a playable URL for a local file; callers must revoke when done. */
export async function localObjectUrl(id: string): Promise<string | null> {
  const file = await getLocalFile(id);
  if (!file || typeof URL === "undefined" || !URL.createObjectURL) return null;
  return URL.createObjectURL(file);
}

export function localToTrack(track: LocalTrack): {
  id: string;
  title: string;
  artists: { name: string; id: null }[];
  album: null;
  duration: number | null;
  thumbnails: never[];
  source: string;
} {
  return {
    id: track.id,
    title: track.name,
    artists: [{ name: "Local file", id: null }],
    album: null,
    duration: track.duration ?? null,
    thumbnails: [],
    source: "local",
  };
}
