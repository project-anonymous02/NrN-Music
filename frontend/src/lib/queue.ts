import type { RepeatMode, Track } from "../types";

export interface QueueState {
  tracks: Track[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Deterministic shuffle order; empty when shuffle is off. */
  order: number[];
}

export const emptyQueue: QueueState = { tracks: [], index: -1, shuffle: false, repeat: "off", order: [] };

export function currentTrack(queue: QueueState): Track | null {
  return queue.tracks[queue.index] ?? null;
}

/** Fisher–Yates driven by an injectable RNG so tests stay deterministic. */
export function buildOrder(length: number, seed?: () => number): number[] {
  const random = seed ?? Math.random;
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function playTracks(tracks: Track[], startIndex = 0, shuffle = false): QueueState {
  const safeTracks = tracks.filter(Boolean);
  const index = Math.min(Math.max(startIndex, 0), Math.max(safeTracks.length - 1, 0));
  return {
    tracks: safeTracks,
    index: safeTracks.length ? index : -1,
    shuffle,
    repeat: "off",
    order: shuffle ? buildOrder(safeTracks.length) : [],
  };
}

export function toggleShuffle(queue: QueueState): QueueState {
  const shuffle = !queue.shuffle;
  return { ...queue, shuffle, order: shuffle ? buildOrder(queue.tracks.length) : [] };
}

/**
 * Position of the *n*-th track to play under shuffle: the current one stays
 * put, the remainder follows the pre-computed order.
 */
export function shufflePosition(queue: QueueState, absoluteIndex: number): number {
  if (!queue.shuffle || queue.order.length !== queue.tracks.length) return absoluteIndex;
  const position = queue.order.indexOf(absoluteIndex);
  return position === -1 ? queue.order.indexOf(queue.index) : position;
}

export interface StepResult {
  queue: QueueState;
  index: number;
  ended: boolean;
}

/** Advance the queue honouring repeat-all / repeat-one and shuffle order. */
export function stepForward(queue: QueueState, opts: { autoAdvance?: boolean } = {}): StepResult {
  const { tracks, index, repeat } = queue;
  if (tracks.length === 0) return { queue, index: -1, ended: true };
  if (repeat === "one" && opts.autoAdvance) return { queue, index, ended: false };

  const position = shufflePosition(queue, index);
  const nextPosition = position + 1;

  if (queue.shuffle && nextPosition < queue.order.length) {
    return { queue, index: queue.order[nextPosition], ended: false };
  }
  if (nextPosition < tracks.length) {
    const nextIndex = queue.shuffle ? queue.order[nextPosition] ?? nextPosition : nextPosition;
    return { queue, index: nextIndex, ended: false };
  }
  if (repeat === "all") {
    const wrapped = queue.shuffle ? queue.order[0] ?? 0 : 0;
    return { queue, index: wrapped, ended: false };
  }
  return { queue, index, ended: true };
}

export function stepBackward(queue: QueueState, positionSeconds: number, restartThreshold = 3): StepResult {
  if (queue.tracks.length === 0) return { queue, index: -1, ended: false };
  if (positionSeconds > restartThreshold) return { queue, index: queue.index, ended: false };

  const position = shufflePosition(queue, queue.index);
  if (position <= 0) {
    if (queue.repeat === "all") {
      const wrapped = queue.shuffle ? queue.order[queue.order.length - 1] ?? queue.tracks.length - 1 : queue.tracks.length - 1;
      return { queue, index: wrapped, ended: false };
    }
    return { queue, index: queue.index, ended: false };
  }
  const previous = queue.shuffle ? queue.order[position - 1] ?? position - 1 : position - 1;
  return { queue, index: previous, ended: false };
}

export function insertNext(queue: QueueState, track: Track): QueueState {
  if (queue.tracks.length === 0) return playTracks([track], 0, queue.shuffle);
  const tracks = [...queue.tracks];
  tracks.splice(queue.index + 1, 0, track);
  return { ...queue, tracks, order: queue.shuffle ? buildOrder(tracks.length) : [] };
}

export function append(queue: QueueState, track: Track): QueueState {
  if (queue.tracks.length === 0) return playTracks([track], 0, queue.shuffle);
  const tracks = [...queue.tracks, track];
  return { ...queue, tracks, order: queue.shuffle ? buildOrder(tracks.length) : [] };
}

export function appendMany(queue: QueueState, incoming: Track[]): QueueState {
  if (incoming.length === 0) return queue;
  if (queue.tracks.length === 0) return playTracks(incoming, 0, queue.shuffle);
  const tracks = [...queue.tracks, ...incoming];
  return { ...queue, tracks, order: queue.shuffle ? buildOrder(tracks.length) : [] };
}

export function removeAt(queue: QueueState, index: number): QueueState {
  if (index < 0 || index >= queue.tracks.length) return queue;
  const tracks = queue.tracks.filter((_, position) => position !== index);
  if (tracks.length === 0) return { ...emptyQueue, shuffle: queue.shuffle, repeat: queue.repeat };
  const nextIndex = index < queue.index ? queue.index - 1 : index === queue.index ? Math.min(queue.index, tracks.length - 1) : queue.index;
  return { ...queue, tracks, index: nextIndex, order: queue.shuffle ? buildOrder(tracks.length) : [] };
}

export function moveItem(queue: QueueState, from: number, to: number): QueueState {
  if (from === to || from < 0 || to < 0 || from >= queue.tracks.length || to >= queue.tracks.length) return queue;
  const tracks = [...queue.tracks];
  const [item] = tracks.splice(from, 1);
  tracks.splice(to, 0, item);
  let index = queue.index;
  if (queue.index === from) index = to;
  else if (from < queue.index && to >= queue.index) index -= 1;
  else if (from > queue.index && to <= queue.index) index += 1;
  return { ...queue, tracks, index, order: queue.shuffle ? buildOrder(tracks.length) : [] };
}

export function clearQueue(queue: QueueState): QueueState {
  return { ...emptyQueue, shuffle: queue.shuffle, repeat: queue.repeat };
}

/** Pure "what comes next" helper used by the player and by unit tests. */
export function peekNext(queue: QueueState): Track | null {
  const result = stepForward(queue, { autoAdvance: true });
  return queue.tracks[result.index] ?? null;
}
