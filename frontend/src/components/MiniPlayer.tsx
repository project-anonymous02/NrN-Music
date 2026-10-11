import { ChevronUp, Pause, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useT } from "../hooks/useT";
import { bestThumb } from "../lib/format";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";

export function MiniPlayer() {
  const t = useT();
  const track = usePlayer((state) => state.queue.tracks[state.queue.index]);
  const status = usePlayer((state) => state.status);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const toggle = usePlayer((state) => state.toggle);
  const openFull = usePlayer((state) => state.openFull);
  const error = usePlayer((state) => state.error);
  const animation = useSettings((state) => state.settings.animation);
  const animate = animation.enabled && animation.miniPlayerAnimation && !animation.reduceMotion && !animation.performanceMode;

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const playing = status === "playing" || status === "waiting" || status === "loading";

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          className="mini-player"
          initial={animate ? { y: 80, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          exit={animate ? { y: 80, opacity: 0 } : { opacity: 0 }}
          transition={animate ? { type: "spring", stiffness: 380 * animation.speed, damping: 34 } : { duration: 0 }}
          role="region"
          aria-label={t("player.openFull")}
        >
          <button
            type="button"
            className="mini-main"
            onClick={openFull}
            style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center", minWidth: 0 }}
          >
            {bestThumb(track.thumbnails, 120) ? (
              <img className="mini-art" src={bestThumb(track.thumbnails, 120)} alt="" />
            ) : (
              <span className="mini-art" />
            )}
            <span style={{ minWidth: 0 }}>
              <span className="mini-title">{track.title}</span>
              <span className="mini-sub">
                {error ? t("player.error") : status === "waiting" ? t("player.buffering") : track.artists[0]?.name}
              </span>
            </span>
          </button>

          <div className="mini-actions">
            <button
              type="button"
              className="icon-btn ghost"
              aria-label={playing ? t("player.pause") : t("player.play")}
              onClick={toggle}
            >
              {playing ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
            </button>
            <button type="button" className="icon-btn ghost" aria-label={t("player.openFull")} onClick={openFull}>
              <ChevronUp size={20} />
            </button>
          </div>

          <span className="mini-progress" style={{ width: `${progress}%` }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
