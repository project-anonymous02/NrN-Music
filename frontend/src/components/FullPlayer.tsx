import {
  ChevronDown,
  Disc3,
  Heart,
  ListMusic,
  MoreHorizontal,
  Music4,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  Gauge,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useT } from "../hooks/useT";
import { audioEngine } from "../lib/audio";
import { artistNames, bestThumb, formatTime } from "../lib/format";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";
import { QueueSheet } from "./QueueSheet";
import { Sheet } from "./Sheet";

type Panel = "none" | "queue" | "lyrics" | "details" | "menu" | "speed" | "sleep";

export function FullPlayer() {
  const t = useT();
  const open = usePlayer((state) => state.fullOpen);
  const close = usePlayer((state) => state.closeFull);
  const track = usePlayer((state) => state.queue.tracks[state.queue.index]);
  const status = usePlayer((state) => state.status);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const error = usePlayer((state) => state.error);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const seek = usePlayer((state) => state.seek);
  const shuffle = usePlayer((state) => state.queue.shuffle);
  const setShuffle = usePlayer((state) => state.setShuffle);
  const repeat = usePlayer((state) => state.queue.repeat);
  const cycleRepeat = usePlayer((state) => state.cycleRepeat);
  const setRepeat = usePlayer((state) => state.setRepeat);
  const setQueueOpen = useUi((state) => state.setQueueOpen);
  const queueOpen = useUi((state) => state.queueOpen);
  const openMenu = useUi((state) => state.openMenu);
  const toast = useUi((state) => state.toast);

  const liked = useLibrary((state) => (track ? state.liked.some((entry) => entry.id === track.id) : false));
  const toggleLike = useLibrary((state) => state.toggleLike);

  const lyrics = usePlayer((state) => state.lyrics);
  const loadLyrics = usePlayer((state) => state.loadLyrics);
  const sleepTimer = usePlayer((state) => state.sleepTimer);
  const setSleepTimer = usePlayer((state) => state.setSleepTimer);
  const cancelSleepTimer = usePlayer((state) => state.cancelSleepTimer);

  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const animatePlayer = settings.animation.enabled && !settings.animation.reduceMotion && !settings.animation.performanceMode;
  const animateArtwork = animatePlayer && settings.animation.artworkAnimation;

  const [panel, setPanel] = useState<Panel>("none");
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    if (!open) setPanel("none");
  }, [open]);

  useEffect(() => {
    if (panel === "lyrics" && !lyrics.data && !lyrics.loading) void loadLyrics();
  }, [panel, lyrics.data, lyrics.loading, loadLyrics]);

  if (!track) return null;

  const playing = status === "playing" || status === "waiting" || status === "loading";
  const art = bestThumb(track.thumbnails, 600);
  const displayPosition = scrub ?? position;
  const repeatIcon = repeat === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />;
  const sleepChoices = Array.from(new Set([settings.playback.sleepDefault, 5, 15, 30, 60])).filter((minutes) => minutes > 0);

  const share = async () => {
    const url = `https://music.youtube.com/watch?v=${track.id}`;
    try {
      if (navigator.share) await navigator.share({ title: track.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast(t("action.copied"));
      }
    } catch {
      toast(t("error.generic"), "error");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="full-player"
          initial={animatePlayer ? { y: "100%" } : false}
          animate={{ y: 0 }}
          exit={animatePlayer ? { y: "100%" } : { opacity: 0 }}
          transition={animatePlayer ? { type: "spring", stiffness: 320 * settings.animation.speed, damping: 36 } : { duration: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={t("player.openFull")}
        >
          <div className="full-player-head">
            <button type="button" className="icon-btn ghost" aria-label={t("player.close")} onClick={close}>
              <ChevronDown size={22} />
            </button>
            <span className="section-hint">{track.album?.name ?? t("app.name")}</span>
            <button type="button" className="icon-btn ghost" aria-label={t("menu.viewDetails")} onClick={() => setPanel("menu")}>
              <MoreHorizontal size={22} />
            </button>
          </div>

          <motion.img
            className="full-art"
            src={art ?? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"}
            alt=""
            key={track.id}
            initial={animateArtwork ? { scale: 0.94, opacity: 0.4 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={animateArtwork ? { type: "spring", stiffness: 260 * settings.animation.speed, damping: 28 } : { duration: 0 }}
          />

          <div className="full-meta">
            <div style={{ minWidth: 0 }}>
              <h1 className="full-title">{track.title}</h1>
              <p className="full-artist">{artistNames(track.artists) || track.album?.name}</p>
            </div>
            <button
              type="button"
              className="icon-btn ghost"
              aria-label={liked ? t("player.unlike") : t("player.like")}
              aria-pressed={liked}
              onClick={() => toggleLike(track)}
              style={{ color: liked ? "var(--accent)" : undefined }}
            >
              <Heart size={24} fill={liked ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="slider-row" style={{ marginTop: 18 }}>
            <span>{formatTime(displayPosition)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(duration))}
              step={1}
              value={Math.floor(displayPosition)}
              aria-label={t("player.openFull")}
              onChange={(event) => setScrub(Number(event.target.value))}
              onPointerUp={() => {
                if (scrub !== null) {
                  seek(scrub);
                  setScrub(null);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  if (scrub !== null) {
                    seek(scrub);
                    setScrub(null);
                  }
                }
              }}
            />
            <span>{formatTime(duration)}</span>
          </div>

          {error && (
            <div className="state" style={{ padding: "12px 0" }}>
              <p style={{ color: "#ff9d90" }}>{error}</p>
              <button type="button" className="btn" onClick={() => toggle()}>
                {t("player.retry")}
              </button>
            </div>
          )}

          <div className="full-controls">
            <button
              type="button"
              className={`transport${shuffle ? " on" : ""}`}
              aria-label={t("player.shuffle")}
              aria-pressed={shuffle}
              onClick={() => setShuffle()}
            >
              <Shuffle size={24} />
            </button>
            <button type="button" className="transport" aria-label={t("player.previous")} onClick={() => previous()}>
              <SkipBack size={30} fill="currentColor" />
            </button>
            <button type="button" className="play-btn" aria-label={playing ? t("player.pause") : t("player.play")} onClick={toggle}>
              {playing ? <Pause size={30} /> : <Play size={30} fill="currentColor" style={{ marginLeft: 3 }} />}
            </button>
            <button type="button" className="transport" aria-label={t("player.next")} onClick={() => next(false)}>
              <SkipForward size={30} fill="currentColor" />
            </button>
            <button
              type="button"
              className={`transport${repeat !== "off" ? " on" : ""}`}
              aria-label={`${t("player.repeat")} (${repeat})`}
              onClick={cycleRepeat}
              onContextMenu={(event) => {
                event.preventDefault();
                setRepeat(repeat === "all" ? "off" : "all");
              }}
            >
              {repeatIcon}
            </button>
          </div>

          <div className="secondary-controls">
            <button type="button" className="icon-btn ghost" aria-label={t("player.lyrics")} onClick={() => setPanel("lyrics")}>
              <Music4 size={20} />
            </button>
            <button type="button" className="icon-btn ghost" aria-label={t("player.queue")} onClick={() => setQueueOpen(true)}>
              <ListMusic size={20} />
            </button>
            <button type="button" className="icon-btn ghost" aria-label={t("player.speed")} onClick={() => setPanel("speed")}>
              <Gauge size={20} />
            </button>
            <button
              type="button"
              className={`icon-btn ghost${sleepTimer ? " accent" : ""}`}
              aria-label={t("player.sleepTimer")}
              onClick={() => setPanel("sleep")}
            >
              <Timer size={20} />
            </button>
            <button type="button" className="icon-btn ghost" aria-label={t("player.share")} onClick={share}>
              <Share2 size={20} />
            </button>
            <button
              type="button"
              className="icon-btn ghost"
              aria-label={t("menu.viewDetails")}
              onClick={() => openMenu({ track, albumId: track.album?.id ?? null, artistId: track.artists[0]?.id ?? null })}
            >
              <Disc3 size={20} />
            </button>
          </div>

          <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} />

          <Sheet open={panel === "lyrics"} onClose={() => setPanel("none")} title={t("player.lyrics")}>
            {lyrics.loading && <p className="page-subtitle">{t("loading")}</p>}
            {!lyrics.loading && !lyrics.data && (
              <div className="state">
                <h3>{t("player.noLyrics")}</h3>
                <p>{lyrics.error || t("player.noLyricsBody")}</p>
                <button type="button" className="btn" onClick={() => void loadLyrics(true)}>
                  {t("error.retry")}
                </button>
              </div>
            )}
            {lyrics.data && <div className="lyrics-body">{lyrics.data.text}</div>}
          </Sheet>

          <Sheet open={panel === "speed"} onClose={() => setPanel("none")} title={t("player.speed")}>
            <div className="list">
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className="sheet-item"
                  onClick={() => {
                    audioEngine.setRate(rate);
                    update({ playback: { speed: rate } });
                    setPanel("none");
                  }}
                >
                  <Gauge size={18} />
                  {rate.toFixed(2).replace(/0$/, "")}×
                  {settings.playback.speed === rate && <span className="muted">✓</span>}
                </button>
              ))}
            </div>
          </Sheet>

          <Sheet open={panel === "sleep"} onClose={() => setPanel("none")} title={t("player.sleepTimer")}>
            <div className="list">
              {sleepChoices.map((minutes) => (
                <button key={minutes} type="button" className="sheet-item" onClick={() => { setSleepTimer(minutes); setPanel("none"); }}>
                  <Timer size={18} />
                  {minutes} min
                </button>
              ))}
              {sleepTimer && (
                <button type="button" className="sheet-item danger" onClick={() => { cancelSleepTimer(); setPanel("none"); }}>
                  <Timer size={18} />
                  {t("library.cancel")} ({formatTime((sleepTimer.endsAt - Date.now()) / 1000)})
                </button>
              )}
            </div>
          </Sheet>

          <Sheet open={panel === "menu"} onClose={() => setPanel("none")} title={t("menu.viewDetails")}>
            <div className="list">
              <div className="sheet-item">
                <Music4 size={18} />
                <span>{track.title}</span>
                <span className="muted">{formatTime(duration)}</span>
              </div>
              <div className="sheet-item">
                <Disc3 size={18} />
                <span>{track.album?.name ?? "—"}</span>
              </div>
              <div className="sheet-item">
                <Share2 size={18} />
                <span>{track.id}</span>
                <span className="muted">videoId</span>
              </div>
            </div>
          </Sheet>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
