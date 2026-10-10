import { Search as SearchIcon, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MediaCard } from "../components/MediaCard";
import { EmptyState, ErrorState, SkeletonRows } from "../components/States";
import { TrackRow } from "../components/TrackRow";
import { useT } from "../hooks/useT";
import { api, type SearchResponse, type Suggestion } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useHistory } from "../stores/history";
import type { AlbumItem, ArtistItem, PlaylistItem, Track } from "../types";

const FILTERS: { value: string; key: "filter.all" | "filter.songs" | "filter.artists" | "filter.albums" | "filter.playlists" }[] = [
  { value: "all", key: "filter.all" },
  { value: "songs", key: "filter.songs" },
  { value: "artists", key: "filter.artists" },
  { value: "albums", key: "filter.albums" },
  { value: "playlists", key: "filter.playlists" },
];

export function SearchPage() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [filter, setFilter] = useState("all");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searches = useHistory((state) => state.searches);
  const recordSearch = useHistory((state) => state.recordSearch);
  const clearSearches = useHistory((state) => state.clearSearches);

  const debouncedQuery = useDebounced(query, 320);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    api
      .suggest(debouncedQuery.trim())
      .then((result) => !cancelled && setSuggestions(result.suggestions))
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const { data, loading, error, reload } = useAsync<SearchResponse | null>(
    async () => (submitted.trim() ? api.search(submitted.trim(), filter, 24) : null),
    [submitted, filter],
  );

  const results = data?.results ?? [];
  const tracks = useMemo(
    () => results.filter((entry) => entry.kind === "track").map((entry) => entry.item as Track),
    [results],
  );

  const runSearch = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setSubmitted(trimmed);
    recordSearch(trimmed);
    inputRef.current?.blur();
  };

  const showSuggest = focused && query.trim().length > 0 && suggestions.length > 0 && submitted !== query.trim();

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">{t("search.title")}</h1>
      </header>

      <form
        className="search-bar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch(query);
        }}
      >
        <SearchIcon size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={t("search.placeholder")}
          aria-label={t("search.title")}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          enterKeyHint="search"
        />
        {query && (
          <button
            type="button"
            className="icon-btn ghost"
            aria-label="Clear"
            onClick={() => {
              setQuery("");
              setSubmitted("");
              inputRef.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
      </form>

      {showSuggest && (
        <section className="section" style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2 className="section-title">{t("search.suggestions")}</h2>
          </div>
          <div className="list">
            {suggestions.slice(0, 6).map((suggestion, index) => (
              <button key={`${suggestion.text}-${index}`} type="button" className="sheet-item" onClick={() => runSearch(suggestion.text)}>
                <SearchIcon size={16} />
                {suggestion.text}
              </button>
            ))}
          </div>
        </section>
      )}

      {!submitted && (
        <section className="section" style={{ marginTop: 20 }}>
          {searches.length > 0 && (
            <div className="section-head">
              <h2 className="section-title">{t("search.recent")}</h2>
              <button type="button" className="section-hint" onClick={clearSearches}>
                <Trash2 size={12} /> {t("search.clearHistory")}
              </button>
            </div>
          )}
          {searches.length === 0 ? (
            <EmptyState title={t("search.empty.title")} body={t("search.empty.body")} icon={<SearchIcon size={34} />} />
          ) : (
            <div className="chip-row">
              {searches.map((entry) => (
                <button key={entry} type="button" className="chip" onClick={() => runSearch(entry)}>
                  {entry}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {submitted && (
        <>
          <div className="chip-row" style={{ margin: "16px 0" }}>
            {FILTERS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={`chip${filter === entry.value ? " active" : ""}`}
                aria-pressed={filter === entry.value}
                onClick={() => setFilter(entry.value)}
              >
                {t(entry.key)}
              </button>
            ))}
          </div>

          {loading && <SkeletonRows count={6} />}
          {error && <ErrorState title={t("search.error")} body={error.message} onRetry={reload} />}

          {!loading && !error && results.length === 0 && (
            <EmptyState title={t("search.noResults")} body={t("search.noResultsBody")} />
          )}

          {!loading && !error && tracks.length > 0 && (filter === "all" || filter === "songs") && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">{t("filter.songs")}</h2>
                <span className="section-hint">{tracks.length}</span>
              </div>
              <div className="list">
                {tracks.map((track) => (
                  <TrackRow key={track.id} track={track} tracks={tracks} />
                ))}
              </div>
            </section>
          )}

          {!loading && !error && results.some((entry) => entry.kind === "artist") && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">{t("filter.artists")}</h2>
              </div>
              <div className="h-scroll">
                {results
                  .filter((entry) => entry.kind === "artist")
                  .map((entry) => (
                    <MediaCard key={(entry.item as ArtistItem).id} kind="artist" item={entry.item as ArtistItem} />
                  ))}
              </div>
            </section>
          )}

          {!loading && !error && results.some((entry) => entry.kind === "album") && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">{t("filter.albums")}</h2>
              </div>
              <div className="h-scroll">
                {results
                  .filter((entry) => entry.kind === "album")
                  .map((entry, index) => (
                    <MediaCard key={(entry.item as AlbumItem).id ?? index} kind="album" item={entry.item as AlbumItem} />
                  ))}
              </div>
            </section>
          )}

          {!loading && !error && results.some((entry) => entry.kind === "playlist") && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">{t("filter.playlists")}</h2>
              </div>
              <div className="h-scroll">
                {results
                  .filter((entry) => entry.kind === "playlist")
                  .map((entry, index) => (
                    <MediaCard key={(entry.item as PlaylistItem).id ?? index} kind="playlist" item={entry.item as PlaylistItem} />
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
