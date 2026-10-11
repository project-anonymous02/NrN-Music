import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useT } from "../hooks/useT";
import { LOCALES } from "../i18n";
import { estimateStorage } from "../lib/db";
import { createLocalBackup, importLocalBackup } from "../lib/backup";
import { formatBytes } from "../lib/format";
import { getApiBase, setApiBase } from "../lib/api";
import {
  PRESETS,
  defaultSettings,
  useSettings,
  validateSettings,
  type Settings,
} from "../stores/settings";
import { useLibrary } from "../stores/library";
import { useHistory } from "../stores/history";
import { useUi } from "../stores/ui";

function Row({ label, desc, children }: { label: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <div className="setting-label">{label}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

function Slider({
  value,
  min,
  max,
  step = 1,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  onChange: (next: number) => void;
}) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ width: 140 }}
    />
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Row label={label}>
      <div className="color-row">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
        />
        <input
          type="text"
          aria-label={label}
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="hex-input"
        />
      </div>
    </Row>
  );
}

export function SettingsPage() {
  const t = useT();
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const reset = useSettings((state) => state.reset);
  const importSettings = useSettings((state) => state.importData);
  const exportSettings = useSettings((state) => state.exportData);

  const library = useLibrary();
  const history = useHistory();
  const toast = useUi((state) => state.toast);

  const settingsFile = useRef<HTMLInputElement>(null);
  const libraryFile = useRef<HTMLInputElement>(null);
  const backupFile = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [serverDraft, setServerDraft] = useState(getApiBase());
  const [serverSaved, setServerSaved] = useState(getApiBase());

  useEffect(() => {
    void estimateStorage().then(setStorage);
  }, []);

  const warnings = validateSettings(settings);

  const setAnimation = (patch: Partial<Settings["animation"]>) => update({ animation: patch });
  const setPlayback = (patch: Partial<Settings["playback"]>) => update({ playback: patch });
  const setColor = (key: keyof Settings["colors"], value: string) =>
    update({ colors: { ...settings.colors, [key]: value } });

  const download = (name: string, payload: string) => {
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
    toast(t("settings.exported"));
  };

  const readImport = (file: File, apply: (raw: string) => { ok: boolean }) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = apply(String(reader.result ?? ""));
      toast(result.ok ? t("settings.imported") : t("settings.importInvalid"), result.ok ? "info" : "error");
    };
    reader.readAsText(file);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">{t("settings.title")}</h1>
      </header>

      {warnings.length > 0 && (
        <div className="notice warn" role="status">
          <AlertTriangle size={16} />
          <div>
            {warnings.map((warning) => (
              <div key={warning.key}>{t(warning.key, { ratio: warning.ratio.toFixed(1) })}</div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ appearance */}
      <section className="settings-group">
        <h3>{t("settings.appearance")}</h3>
        <ColorField label={t("settings.primaryAccent")} value={settings.colors.accent} onChange={(v) => setColor("accent", v)} />
        <ColorField label={t("settings.secondaryAccent")} value={settings.colors.accent2} onChange={(v) => setColor("accent2", v)} />
        <ColorField label={t("settings.textColors")} value={settings.colors.text} onChange={(v) => setColor("text", v)} />
        <Row label={t("settings.presets")}>
          <div className="color-row">
            {PRESETS.map((preset) => {
              const active = preset.colors.accent === settings.colors.accent && preset.colors.accent2 === settings.colors.accent2;
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={`swatch${active ? " active" : ""}`}
                  aria-label={preset.name}
                  title={preset.name}
                  style={{ background: preset.colors.accent }}
                  onClick={() => update({ colors: { ...settings.colors, ...preset.colors } })}
                />
              );
            })}
          </div>
        </Row>
        <Row label={t("settings.radius")}>
          <Slider label={t("settings.radius")} value={settings.radius} min={0} max={28} onChange={(v) => update({ radius: v })} />
        </Row>
        <Row label={t("settings.density")}>
          <select
            aria-label={t("settings.density")}
            value={settings.density}
            onChange={(event) => update({ density: event.target.value as Settings["density"] })}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </Row>
        <Row label={t("settings.spacing")}>
          <Slider label={t("settings.spacing")} value={settings.spacing} min={12} max={40} onChange={(v) => update({ spacing: v })} />
        </Row>
        <Row label={t("settings.artworkSize")}>
          <Slider label={t("settings.artworkSize")} value={settings.artworkSize} min={32} max={72} onChange={(v) => update({ artworkSize: v })} />
        </Row>
        <Row label={t("settings.typography")}>
          <Slider label={t("settings.typography")} value={settings.fontScale} min={85} max={135} step={5} onChange={(v) => update({ fontScale: v })} />
        </Row>
        <Row label={t("settings.blur")}>
          <Toggle label={t("settings.blur")} checked={settings.blur} onChange={(v) => update({ blur: v })} />
        </Row>
        <Row label={t("settings.transparency")}>
          <Slider label={t("settings.transparency")} value={settings.transparency} min={0} max={60} onChange={(v) => update({ transparency: v })} />
        </Row>
        <Row label={t("settings.visualIntensity")}>
          <Slider label={t("settings.visualIntensity")} value={settings.visualIntensity} min={0} max={150} onChange={(v) => update({ visualIntensity: v })} />
        </Row>
      </section>

      {/* ------------------------------------------------------------ animation */}
      <section className="settings-group">
        <h3>{t("settings.animation")}</h3>
        <Row label={t("settings.animEnable")}>
          <Toggle label={t("settings.animEnable")} checked={settings.animation.enabled} onChange={(v) => setAnimation({ enabled: v })} />
        </Row>
        <Row label={t("settings.animSpeed")}>
          <Slider label={t("settings.animSpeed")} value={settings.animation.speed} min={0.5} max={2} step={0.1} onChange={(v) => setAnimation({ speed: v })} />
        </Row>
        <Row label={t("settings.springIntensity")}>
          <Slider label={t("settings.springIntensity")} value={settings.animation.spring} min={0} max={100} onChange={(v) => setAnimation({ spring: v })} />
        </Row>
        <Row label={t("settings.pageTransition")}>
          <Toggle label={t("settings.pageTransition")} checked={settings.animation.pageTransition} onChange={(v) => setAnimation({ pageTransition: v })} />
        </Row>
        <Row label={t("settings.artworkAnimation")}>
          <Toggle label={t("settings.artworkAnimation")} checked={settings.animation.artworkAnimation} onChange={(v) => setAnimation({ artworkAnimation: v })} />
        </Row>
        <Row label={t("settings.miniPlayerAnimation")}>
          <Toggle label={t("settings.miniPlayerAnimation")} checked={settings.animation.miniPlayerAnimation} onChange={(v) => setAnimation({ miniPlayerAnimation: v })} />
        </Row>
        <Row label={t("settings.sheetAnimation")}>
          <Toggle label={t("settings.sheetAnimation")} checked={settings.animation.sheetAnimation} onChange={(v) => setAnimation({ sheetAnimation: v })} />
        </Row>
        <Row label={t("settings.reduceMotion")}>
          <Toggle label={t("settings.reduceMotion")} checked={settings.animation.reduceMotion} onChange={(v) => setAnimation({ reduceMotion: v })} />
        </Row>
        <Row label={t("settings.performanceMode")} desc={t("settings.reduceMotion")}>
          <Toggle label={t("settings.performanceMode")} checked={settings.animation.performanceMode} onChange={(v) => setAnimation({ performanceMode: v })} />
        </Row>
      </section>

      {/* ------------------------------------------------------------- playback */}
      <section className="settings-group">
        <h3>{t("settings.playback")}</h3>
        <Row label={t("settings.autoplay")}>
          <Toggle label={t("settings.autoplay")} checked={settings.playback.autoplay} onChange={(v) => setPlayback({ autoplay: v })} />
        </Row>
        <Row label={t("settings.defaultShuffle")}>
          <Toggle label={t("settings.defaultShuffle")} checked={settings.playback.shuffle} onChange={(v) => setPlayback({ shuffle: v })} />
        </Row>
        <Row label={t("settings.defaultRepeat")}>
          <select
            aria-label={t("settings.defaultRepeat")}
            value={settings.playback.repeat}
            onChange={(event) => setPlayback({ repeat: event.target.value as Settings["playback"]["repeat"] })}
          >
            <option value="off">{t("player.repeatOff")}</option>
            <option value="all">{t("player.repeatAll")}</option>
            <option value="one">{t("player.repeatOne")}</option>
          </select>
        </Row>
        <Row label={t("settings.speed")}>
          <Slider label={t("settings.speed")} value={settings.playback.speed} min={0.5} max={2} step={0.05} onChange={(v) => setPlayback({ speed: v })} />
        </Row>
        <Row label={t("settings.audioQuality")}>
          <select
            aria-label={t("settings.audioQuality")}
            value={settings.playback.quality}
            onChange={(event) => setPlayback({ quality: event.target.value as Settings["playback"]["quality"] })}
          >
            <option value="auto">{t("settings.qualityAuto")}</option>
            <option value="high">{t("settings.qualityHigh")}</option>
            <option value="compat">{t("settings.qualityCompat")}</option>
          </select>
        </Row>
        <Row label={t("settings.sleepDefault")} desc={t("settings.minutes", { count: settings.playback.sleepDefault })}>
          <Slider label={t("settings.sleepDefault")} value={settings.playback.sleepDefault} min={0} max={120} step={15} onChange={(v) => setPlayback({ sleepDefault: v })} />
        </Row>
        <Row label={t("settings.resumeSession")}>
          <Toggle label={t("settings.resumeSession")} checked={settings.playback.resumeSession} onChange={(v) => setPlayback({ resumeSession: v })} />
        </Row>
      </section>

      {/* ------------------------------------------------------------- language */}
      <section className="settings-group">
        <h3>{t("settings.language")}</h3>
        <Row label={t("settings.languageLabel")} desc={t("settings.languageDesc")}>
          <select
            aria-label={t("settings.languageLabel")}
            value={settings.language}
            onChange={(event) => update({ language: event.target.value as Settings["language"] })}
          >
            {LOCALES.map((locale) => (
              <option key={locale.value} value={locale.value}>
                {locale.label}
              </option>
            ))}
          </select>
        </Row>
      </section>

      {/* -------------------------------------------------------- recommendations */}
      <section className="settings-group">
        <h3>{t("settings.general")}</h3>
        <Row label={t("settings.personalization")} desc={t("settings.personalizationDesc")}>
          <Toggle
            label={t("settings.personalization")}
            checked={settings.privacy.personalization}
            onChange={(v) => update({ privacy: { ...settings.privacy, personalization: v } })}
          />
        </Row>
        <Row label={t("settings.variation")} desc={t("settings.variationDesc")}>
          <Slider
            label={t("settings.variation")}
            value={settings.privacy.variation}
            min={0}
            max={60}
            onChange={(v) => update({ privacy: { ...settings.privacy, variation: v } })}
          />
        </Row>
      </section>

      {/* ------------------------------------------------------- storage & data */}
      <section className="settings-group">
        <h3>{t("settings.storage")}</h3>
        <Row
          label={t("settings.storageUsage")}
          desc={storage ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}` : t("loading")}
        />
        <Row label={t("settings.cache")} desc={t("trackCount", { count: library.cached.length })}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              library.clearCache();
              toast(t("settings.cacheCleared"));
            }}
          >
            {t("settings.clearCache")}
          </button>
        </Row>
        <Row label={t("settings.history")} desc={t("trackCount", { count: history.plays.length })}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              history.clearPlays();
              history.clearSearches();
              toast(t("settings.resetHistory"));
            }}
          >
            {t("settings.clearHistory")}
          </button>
        </Row>
        <Row label={t("settings.playlists")} desc={t("trackCount", { count: library.playlists.reduce((sum, playlist) => sum + playlist.tracks.length, 0) })} />
        <Row label={t("settings.downloads")} desc={t("settings.downloadsDesc")} />
        <Row label={t("settings.privacy")} desc={t("settings.privacyDesc")} />
      </section>

      <section className="settings-group">
        <h3>{t("settings.data")}</h3>
        <Row label={t("settings.fullBackup")} desc={t("settings.fullBackupDesc")}>
          <div className="setting-actions">
            <button type="button" className="btn" onClick={() => download("nrnmusic-backup.json", createLocalBackup())}>
              {t("settings.exportBackup")}
            </button>
            <button type="button" className="btn" onClick={() => backupFile.current?.click()}>
              {t("settings.importBackup")}
            </button>
            <input
              ref={backupFile}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readImport(file, importLocalBackup);
                event.target.value = "";
              }}
            />
          </div>
        </Row>
        <Row label={t("settings.exportSettings")}>
          <button type="button" className="btn" onClick={() => download("nrnmusic-settings.json", exportSettings())}>
            {t("settings.exportSettings")}
          </button>
        </Row>
        <Row label={t("settings.importSettings")}>
          <button type="button" className="btn" onClick={() => settingsFile.current?.click()}>
            {t("settings.importSettings")}
          </button>
          <input
            ref={settingsFile}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readImport(file, importSettings);
              event.target.value = "";
            }}
          />
        </Row>
        <Row label={t("settings.exportLibrary")}>
          <button type="button" className="btn" onClick={() => download("nrnmusic-library.json", library.exportData())}>
            {t("settings.exportLibrary")}
          </button>
        </Row>
        <Row label={t("settings.importLibrary")}>
          <button type="button" className="btn" onClick={() => libraryFile.current?.click()}>
            {t("settings.importLibrary")}
          </button>
          <input
            ref={libraryFile}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readImport(file, library.importData);
              event.target.value = "";
            }}
          />
        </Row>
        <Row label={t("settings.resetSettings")}>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (!window.confirm(t("settings.confirmReset"))) return;
              reset();
              toast(t("settings.resetSettings"));
            }}
          >
            {t("settings.resetDefaults")}
          </button>
        </Row>
        <Row label={t("settings.resetRecommendations")}>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              history.clearPlays();
              update({ privacy: { ...defaultSettings.privacy } });
              toast(t("settings.resetRecommendations"));
            }}
          >
            {t("settings.resetRecommendations")}
          </button>
        </Row>
      </section>

      {/* ---------------------------------------------------------------- server */}
      <section className="settings-group">
        <h3>{t("settings.server")}</h3>
        <Row label={t("settings.apiBase")} desc={t("settings.apiBaseHint")}>
          <input
            className="hex-input"
            type="url"
            inputMode="url"
            placeholder="http://192.168.1.10:8000"
            aria-label={t("settings.apiBase")}
            value={serverDraft}
            onChange={(event) => setServerDraft(event.target.value)}
            style={{ width: "min(320px, 46vw)" }}
          />
        </Row>
        <Row label={t("settings.apiBaseSave")} desc={serverSaved || t("settings.apiBaseSameOrigin")}>
          <div className="list-manage-buttons">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setApiBase(serverDraft);
                setServerSaved(getApiBase());
                toast(t("settings.apiBaseSaved"));
              }}
            >
              {t("settings.apiBaseSave")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setServerDraft("");
                setApiBase("");
                setServerSaved("");
              }}
            >
              {t("settings.apiBaseReset")}
            </button>
          </div>
        </Row>
      </section>

      {/* ---------------------------------------------------------------- about */}
      <section className="settings-group">
        <h3>{t("settings.about")}</h3>
        <Row label={t("settings.version")} desc="1.0.0" />
        <Row label={t("settings.dependencies")} desc="React · Vite · Zustand · FastAPI · ytmusicapi · yt-dlp" />
        <Row label={t("settings.licenses")} desc="ytmusicapi: MIT · yt-dlp: Unlicense · React: MIT" />
        <Row label={t("app.name")} desc={t("settings.aboutBody")} />
        <Row label={t("settings.aboutSource")} desc={t("settings.aboutSource")} />
      </section>
    </div>
  );
}
