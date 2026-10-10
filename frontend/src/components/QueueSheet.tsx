import { ArrowDown, ArrowUp, Shuffle, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useT } from "../hooks/useT";
import { artistNames, bestThumb } from "../lib/format";
import { usePlayer } from "../stores/player";
import { Sheet } from "./Sheet";

export function QueueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const queue = usePlayer((state) => state.queue);
  const moveQueueItem = usePlayer((state) => state.moveQueueItem);
  const dequeue = usePlayer((state) => state.dequeue);
  const clear = usePlayer((state) => state.clear);
  const playList = usePlayer((state) => state.playList);
  const setShuffle = usePlayer((state) => state.setShuffle);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title={t("player.queue")}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => setShuffle()}>
          <Shuffle size={16} /> {t("player.shuffle")}
        </button>
        <button type="button" className="btn danger" onClick={() => (confirmClear ? clear() : setConfirmClear(true))}>
          <Trash2 size={16} /> {confirmClear ? t("player.clearQueueConfirm") : t("player.clearQueue")}
        </button>
      </div>

      {queue.tracks.length === 0 && <p className="page-subtitle">{t("player.empty")}</p>}

      <div className="list">
        {queue.tracks.map((track, index) => {
          const isCurrent = index === queue.index;
          return (
            <div key={`${track.id}-${index}`} className={`queue-item${isCurrent ? " current" : ""}`}>
              <button
                type="button"
                className="track-main"
                style={{ textAlign: "left" }}
                onClick={() => playList(queue.tracks, index)}
              >
                <span className="track-title">{track.title}</span>
                <span className="track-meta">{artistNames(track.artists)}</span>
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                {bestThumb(track.thumbnails, 120) && (
                  <img src={bestThumb(track.thumbnails, 120)} alt="" className="track-thumb" style={{ width: 32, height: 32 }} />
                )}
                <button
                  type="button"
                  className="icon-btn ghost"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveQueueItem(index, index - 1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn ghost"
                  aria-label="Move down"
                  disabled={index === queue.tracks.length - 1}
                  onClick={() => moveQueueItem(index, index + 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button type="button" className="icon-btn ghost" aria-label={t("player.removeFromQueue")} onClick={() => dequeue(index)}>
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
