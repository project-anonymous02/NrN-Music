# PLAN.md — NrNMusic

Dokumen ini menyusul `RESEARCH.md`. Semua keputusan teknis di sini merujuk pada
hasil verifikasi empiris di dokumen riset, bukan asumsi.

---

## 1. Arsitektur sistem

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (React + TS + Vite)                                │
│  Home / Search / Library / Settings / Player / Queue         │
│  Zustand stores · CSS design tokens · IndexedDB persistence  │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTP JSON (same-origin via Vite proxy saat dev)
┌───────────────▼──────────────────────────────────────────────┐
│  Backend (FastAPI + uvicorn, Python 3.14)                    │
│  ├── routers: search · catalog · lyrics · stream · health    │
│  ├── services/ytmusic.py   → ytmusicapi (metadata)           │
│  ├── services/stream.py    → yt-dlp (resolve URL audio)      │
│  └── services/cache.py     → TTL LRU in-process              │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS (server-side)
        music.youtube.com / googlevideo.com
```

**Mengapa backend wajib (bukan pilihan gaya):** di riset dibuktikan respons
`googlevideo.com` **tidak menyertakan `Access-Control-Allow-Origin`**, sehingga
browser tidak boleh meminta audio langsung. Proxy juga menyembunyikan ketidakstabilan
URL kedaluwarsa (±6 jam) di balik satu endpoint yang stabil.

---

## 2. Struktur direktori

```
NrNMusic/
├── README.md  PLAN.md  RESEARCH.md  CHANGELOG.md
├── .env.example  .gitignore
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py  main.py  config.py  errors.py
│   │   ├── cache.py  schemas.py
│   │   ├── services/ (__init__, ytmusic.py, stream.py)
│   │   └── routers/ (__init__, health, search, catalog, lyrics, stream)
│   └── tests/ (pytest)
├── frontend/
│   ├── package.json  vite.config.ts  tsconfig.json  index.html
│   ├── src/
│   │   ├── main.tsx  App.tsx
│   │   ├── styles/ (tokens.css, global.css)
│   │   ├── lib/ (api.ts, db.ts, format.ts, contrast.ts)
│   │   ├── i18n/ (index.ts, en.ts, id.ts)
│   │   ├── stores/ (player, library, settings, ui, history)
│   │   ├── components/ (player, nav, list, sheet, skeleton, …)
│   │   └── pages/ (Home, Search, Library, Settings, Artist, Album, Playlist)
│   └── src/**/*.test.ts(x)   → Vitest
├── e2e/ (Playwright, Chromium sistem)
└── docs/API.md
```

---

## 3. Teknologi dan alasan

| Pilihan | Alasan | Alternatif yang ditolak |
|---|---|---|
| React + TS + Vite | kebutuhan UI kompleks + type safety; registry terjangkau | vanilla JS (tak terukur), Next.js (butuh SSR/edge yang tidak perlu) |
| Zustand | satu store global untuk player/queue; ~1 kB | Redux (boilerplate), Context murni (rerender mahal) |
| CSS variables + tokens | seluruh Settings harus mengubah UI secara langsung | CSS-in-JS runtime (boros di perangkat mobile) |
| Motion (framer-motion) | spring terkontrol + dukungan reduced-motion | CSS-only (tidak cukup untuk gestur/sheet) |
| FastAPI | ytmusicapi asli Python; validasi skema otomatis | Node (harus ganti library metadata) |
| ytmusicapi + yt-dlp | keduanya teruji berfungsi di §RESEARCH | menulis InnerTube client sendiri (rapuh) |
| In-process TTL cache | skala lokal, tanpa dependensi berat | Redis (tidak tersedia, tidak perlu) |
| IndexedDB (via helper ringan) | data kompleks: playlist, riwayat, riwayat pencarian | localStorage (limit 5 MB, sinkron/blokir) |

---

## 4. Pembagian frontend dan backend

**Backend bertanggung jawab atas:** semua panggilan YouTube Music, resolve stream,
proxy byte audio dengan dukungan `Range`, cache, validasi query, pemetaan error
ke HTTP status yang benar, rate limiting sederhana.

**Frontend bertanggung jawab atas:** seluruh state pemutar & antrean, library lokal,
riwayat, rekomendasi berbasis sinyal lokal, settings/design tokens, i18n,
animasi, aksesibilitas, dan render.

**Kontrak:** frontend tidak pernah menyentuh domain Google; hanya memanggil `/api/*`.

---

## 5. Desain API internal (diimplementasikan, lihat `docs/API.md`)

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/health` | status backend + versi dependensi |
| GET | `/api/search?q&type&limit` | `type` = `songs\|artists\|albums\|playlists\|videos\|all` |
| GET | `/api/suggest?q` | saran pencarian |
| GET | `/api/song/{videoId}` | detail lagu + info playability |
| GET | `/api/album/{browseId}` | album + daftar lagu |
| GET | `/api/artist/{channelId}` | artis + top songs/albums/related |
| GET | `/api/playlist/{playlistId}` | playlist publik |
| GET | `/api/charts` | chart per wilayah |
| GET | `/api/home` | section beranda |
| GET | `/api/watch/{videoId}` | lyrics browseId + related + tracks (dasar radio/autoplay) |
| GET | `/api/lyrics/{browseId}` | lirik biasa/tersinkronisasi (`timed=1`) |
| GET | `/api/stream/{videoId}` | **proxy audio**, dukung `Range`; `?redirect=1` → 302 |
| GET | `/api/stream/{videoId}/meta` | format/duckiness info untuk pemilih codec |

Ketentuan: tidak ada endpoint fiktif; setiap endpoint diuji ada isinya.

---

## 6. Skema penyimpanan data (frontend, IndexedDB)

| Store | Key | Isi |
|---|---|---|
| `settings` | `current` | tema, warna aksen, radius, density, animasi, bahasa, preferensi playback |
| `library` | `tracks` | liked songs, downloaded, cached |
| `library` | `playlists` | playlist buatan user + urutan lagu |
| `library` | `artists` / `albums` | follow & save (lokal) |
| `history` | `plays` | videoId, ts, durasi didengar, selesai/skip, sumber |
| `history` | `searches` | riwayat pencarian |
| `queue` | `state` | antrean, index, shuffle/repeat (restorasi sesi) |
| `meta` | `cache` | cache metadata untuk offline-halus |

**Batasan yang dinyatakan apa adanya:** unduhan audio dibatasi kuota storage browser
(umumnya ~60% dari disk per origin) dan **tidak sama** dengan cache; keduanya dibedakan
di UI dan di dokumentasi.

---

## 7. Autentikasi

- **Tanpa akun untuk pengguna**: aplikasi berjalan penuh tanpa login.
- **Tanpa kredensial di source code**: `.env.example` hanya `YT_REGION`, `CORS_ORIGINS`,
  `LOG_LEVEL`, `CACHE_TTL`.
- Fitur akun YouTube Music (liked/riwayat/playlist server) **tidak diaktifkan** karena
  membutuhkan OAuth milik pengguna; diketahui dari riset §3. Jika suatu saat tersedia,
  token disimpan di `oauth.json` yang masuk `.gitignore`, bukan di frontend.

---

## 8. Sistem pemutaran audio

1. User menekan play → frontend `GET /api/stream/{videoId}/meta`.
2. Backend resolve via yt-dlp (cache; miss pertama ±2,7 s) → `audio/mp4` atau `audio/webm`.
3. Frontend menyetel `<audio src=/api/stream/{videoId}>`.
4. Backend meneruskan `GET` + `Range` ke googlevideo → membalas `206` + `Content-Range`.
5. Pada 403/expired → resolve ulang otomatis, frontend diberi sinyal `X-Stream-Refreshed`.
6. `ended` → lanjut antrean; error → state error yang bisa dicoba ulang.

Media Session API dipakai untuk kontrol sistem; **tidak ada klaim background playback
tanpa batas** — perilaku platform dicatat di README.

---

## 9. Sistem rekomendasi

Sinyal lokal (semua dari riwayat nyata pengguna):
frekuensi play, durasi didengar, persentase selesai, replay, skip, like, artis/album
yang disimpan, riwayat pencarian.

Pendekatan bertahap:
1. **Content-based**: skor kemiripan dari tag implisit (artis/album durasi kategori) + `related`/`radio` dari API.
2. **Analisis riwayat**: bobot sinyal (skip negatif, selesai positif).
3. **Eksplorasi**: 20% rekomendasi acak dari chart/explore untuk mencegah gelembung.
4. **Label alasan** nyata: *"Because you like Instrumental Music"* dihasilkan dari
   data, bukan string hiasan.
5. **Kontrol pengguna**: matikan personalisasi, atur variasi, hapus data.

Kata "AI/ML" **tidak dipakai** di UI karena tidak ada model yang dilatih.

---

## 10. Rencana implementasi per fase

**Fase 1 — Fondasi & design system**: struktur repo, tokens, tema gelap absolut
`#000000` + permukaan `#080A09`/`#101312`/`#191D1B`, tanpa aksen hijau, tipografi,
komponen dasar (Button, Sheet, Skeleton), backend hidup + `/api/health`.

**Fase 2 — Navigasi & halaman utama**: bottom nav (Home/Search/Library), Settings
di kanan atas Home, empty state "Let's discover your first music", section penemuan
terhubung API nyata (bukan data palsu).

**Fase 3 — Integrasi ytmusicapi**: seluruh endpoint §5 + cache + error mapping + uji.

**Fase 4 — Pemutar & queue**: mini-player, full-screen player, seek, shuffle/repeat,
queue (add/play next/remove/reorder/clear/shuffle), Media Session, persistensi sesi.

**Fase 5 — Artis, album, playlist, lirik**: halaman detail + menu tiga titik kontekstual
(per-objek, bukan satu menu untuk semua).

**Fase 6 — Koleksi lokal**: liked, playlist buatan, impor file lokal, unduhan vs cache,
riwayat, export/import JSON tervalidasi.

**Fase 7 — Personalisasi**: mesin skor + label alasan + kontrol privasi.

**Fase 8 — Settings lengkap**: Appearance, Animation, Playback, Language (en/id),
Library & Storage, Data Management, General + validasi kontras.

**Fase 9 — Animasi & aksesibilitas**: spring, bottom sheet, transisi artwork,
safe-area, reduced-motion, keyboard.

**Fase 10 — Pengujian, audit, dokumentasi**: Vitest, pytest, Playwright (Chromium
sistem), audit secret, README sesuai implementasi, siap push (tanpa push).

---

## 11. Strategi pengujian

| Level | Alat | Cakupan |
|---|---|---|
| Unit (backend) | pytest | cache TTL, pemetaan error, validasi query, parser |
| Unit (frontend) | Vitest | reducer player/queue, skor rekomendasi, i18n, kontras warna |
| Integration | pytest + kontrak API | setiap endpoint benar-benar ada & berbentuk |
| E2E | Playwright + Chromium 152 | cari lagu → putar → seek → queue → ganti halaman |
| Manual | browser | responsivitas mobile/desktop, animasi |

Pengujian nyata yang **wajib** sebelum menyatakan suatu fitur selesai:
stream benar-benar mengeluarkan byte audio (`206`), `<audio>` benar-benar `playing`,
dan seek benar-benar memindahkan `currentTime`.

---

## 12. Strategi penanganan error

- Backend: exception handler terpusat → `{error:{code,message,retryable}}`;
  `502` untuk kegagalan upstream, `504` timeout, `429` rate limit, `404` konten tak ada.
- Frontend: setiap permintaan punya state `idle/loading/empty/error` dengan tombol coba lagi.
- Stream gagal → auto-retry 1× (resolve ulang), lalu tampilkan error playback.
- Semua pesan diterjemahkan (en/id), tanpa menampilkan stack trace ke pengguna.

---

## 13. Strategi deployment

Fase awal: **lokal saja** (sesuai aturan prompt — tanpa Git remote/GitHub).

- Backend: `uvicorn app.main:app --host 127.0.0.1 --port 8000`
- Frontend dev: `vite` dengan proxy `/api` → backend
- Produksi lokal: `vite build` → frontend disajikan FastAPI sebagai static files
  (satu port, tanpa CORS eksternal).
- Hosting publik (Vercel/dst.) **belum** dipilih: proxy streaming tidak cocok untuk
  serverless (lihat RESEARCH §5) → didokumentasikan sebagai risiko, bukan dijanjikan.

---

## 14. Risiko dan solusi

| Risiko | Solusi |
|---|---|
| Protokol YouTube berubah | semua akses lewat satu `services/ytmusic.py`; error terpetakan; uji reguler |
| URL stream kadaluarsa | cache + refresh otomatis (§8) |
| Resolusi lambat (2,7 s) | prefetch antrean berikutnya + skeleton di player |
| Tidak ada CORS | proxy streaming (bukan retry di sisi browser) |
| Chromium tanpa AAC | pilih Opus untuk Chromium, AAC untuk Safari/iOS |
| Perubahan warna bikin teks tak terbaca | validasi kontras WCAG + peringatan di Settings |
| Animasi mengorbankan performa | mode Performance/Reduce Motion + `content-visibility` |
| Secret masuk repo | `.gitignore` ketat + pemeriksaan di Tahap 9 |

---

## 15. Kriteria keberhasilan per fase

Setiap fase dinyatakan selesai hanya bila seluruh poin terpenuhi:

1. **Fase 1**: build frontend sukses, `/api/health` 200, tokens diterapkan, tema default
   hitam mutlak tanpa hijau, tanpa tombol mati.
2. **Fase 2**: 3 navigasi berfungsi, section Home berisi data dari API (bukan mock).
3. **Fase 3**: seluruh endpoint lolos pytest + ada fixture respons nyata.
4. **Fase 4**: audio benar-benar terdengar/terukur `playing`, seek bekerja, queue
   konsisten antarhalaman, sesi dipulihkan setelah reload.
5. **Fase 5**: halaman artis/album/playlist terisi API; menu tiga titik berbeda per objek.
6. **Fase 6**: library bertahan setelah reload; export→import sukses dan input divalidasi.
7. **Fase 7**: rekomendasi berubah setelah pola dengar diubah; label alasan nyata.
8. **Fase 8**: setiap toggle Settings benar-benar mengubah UI/ perilaku.
9. **Fase 9**: lint/typecheck/test hijau; tidak ada secret; reduced-motion dihormati.
10. **Fase 10**: dokumentasi = implementasi; `git status` bersih; siap di-push **ketika
    diperintahkan**.

---

## 16. Status

- [x] Riset (RESEARCH.md)
- [x] Perencanaan (dokumen ini)
- [ ] Fase 1–10 implementasi
