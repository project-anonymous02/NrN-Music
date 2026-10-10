import { describe, expect, it } from "vitest";
import {
  append,
  appendMany,
  buildOrder,
  clearQueue,
  currentTrack,
  emptyQueue,
  insertNext,
  moveItem,
  peekNext,
  playTracks,
  removeAt,
  stepBackward,
  stepForward,
  toggleShuffle,
  type QueueState,
} from "./queue";
import type { Track } from "../types";

const track = (id: string): Track => ({
  id,
  title: `Track ${id}`,
  artists: [{ name: "Artist", id: null }],
  album: null,
  duration: 200,
  thumbnails: [],
});

const ids = ["a", "b", "c", "d"].map(track);

describe("queue", () => {
  it("clamps the start index and reports an empty queue", () => {
    expect(playTracks(ids, 0).index).toBe(0);
    expect(playTracks(ids, 99).index).toBe(3);
    expect(playTracks(ids, -4).index).toBe(0);
    expect(playTracks([], 0).index).toBe(-1);
    expect(currentTrack(emptyQueue)).toBeNull();
  });

  it("builds a deterministic permutation for a fixed seed", () => {
    const first = buildOrder(6, () => 0.5);
    const second = buildOrder(6, () => 0.5);
    expect(first).toEqual(second);
    expect([...first].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("steps forward linearly and stops at the end", () => {
    const queue = playTracks(ids, 0);
    expect(stepForward(queue).index).toBe(1);
    const last = { ...queue, index: 3 };
    expect(stepForward(last)).toMatchObject({ ended: true, index: 3 });
  });

  it("wraps with repeat-all and repeats the same track with repeat-one", () => {
    const queue = playTracks(ids, 0);
    const all = { ...queue, repeat: "all" as const };
    expect(stepForward({ ...all, index: 3 }).index).toBe(0);

    const one = { ...queue, repeat: "one" as const, index: 2 };
    expect(stepForward(one, { autoAdvance: true })).toMatchObject({ index: 2, ended: false });
    expect(stepForward(one, { autoAdvance: false }).index).toBe(3);
  });

  it("follows the shuffle order and wraps back into it", () => {
    const shuffled = playTracks(ids, 0, true);
    expect(shuffled.order).toHaveLength(4);
    const atLast = { ...shuffled, index: shuffled.order[3] };
    expect(stepForward(atLast)).toMatchObject({ ended: true, index: atLast.index });

    const wrapped = stepForward({ ...atLast, repeat: "all" });
    expect(wrapped.index).toBe(shuffled.order[0]);
  });

  it("restarts a track only when the position is near the start", () => {
    const queue = playTracks(ids, 2);
    expect(stepBackward(queue, 12).index).toBe(2);
    expect(stepBackward(queue, 1).index).toBe(1);
    const first = playTracks(ids, 0);
    expect(stepBackward(first, 1).index).toBe(0);
    expect(stepBackward({ ...first, repeat: "all" }, 1).index).toBe(3);
  });

  it("toggling shuffle keeps the current track and resets the order", () => {
    const on = toggleShuffle(playTracks(ids, 2));
    expect(on.shuffle).toBe(true);
    expect(on.index).toBe(2);
    expect(on.order).toHaveLength(4);
    const off = toggleShuffle(on);
    expect(off.shuffle).toBe(false);
    expect(off.order).toEqual([]);
  });

  it("inserts and appends without losing the current index", () => {
    const queue = playTracks(ids.slice(0, 3), 1);
    const next = insertNext(queue, track("x"));
    expect(next.tracks.map((entry) => entry.id)).toEqual(["a", "b", "x", "c"]);
    expect(next.index).toBe(1);
    expect(next.tracks[next.index].id).toBe("b");

    const tail = append(queue, track("y"));
    expect(tail.tracks.at(-1)?.id).toBe("y");
    expect(tail.index).toBe(1);

    const many = appendMany(queue, [track("p"), track("q")]);
    expect(many.tracks).toHaveLength(5);
    expect(appendMany(queue, [])).toBe(queue);
  });

  it("starts a queue from an empty one when appending", () => {
    const started = append(emptyQueue, track("a"));
    expect(started.index).toBe(0);
    expect(started.tracks).toHaveLength(1);
  });

  it("removes tracks while keeping the current index coherent", () => {
    const queue = playTracks(ids, 2);
    expect(removeAt(queue, 0).index).toBe(1);
    expect(removeAt(queue, 2).index).toBe(2);
    expect(removeAt(queue, 3).index).toBe(2);
    expect(removeAt(queue, 99)).toBe(queue);
    expect(removeAt(playTracks(ids, 0), 0).index).toBe(0);
    expect(removeAt(playTracks([track("only")], 0), 0)).toEqual({
      ...emptyQueue,
      shuffle: false,
      repeat: "off",
    });
  });

  it("moves items and shifts the current index accordingly", () => {
    const queue = playTracks(ids, 2);
    const moved = moveItem(queue, 0, 3);
    expect(moved.tracks.map((entry) => entry.id)).toEqual(["b", "c", "d", "a"]);
    expect(moved.index).toBe(1);
    expect(moveItem(queue, 1, 1)).toBe(queue);
    expect(moveItem(queue, -1, 2)).toBe(queue);
  });

  it("clears the queue but keeps shuffle and repeat preferences", () => {
    const queue = { ...playTracks(ids, 1), shuffle: true, repeat: "all" as const };
    expect(clearQueue(queue)).toEqual({ ...emptyQueue, shuffle: true, repeat: "all" });
  });

  it("peekNext predicts the next track without mutating state", () => {
    const queue: QueueState = playTracks(ids, 0);
    expect(peekNext(queue)?.id).toBe("b");
    expect(queue.index).toBe(0);
  });
});
