# RESEARCH.md — NrNMusic

Tanggal riset: 2026-10-10
Lingkungan: PRoot/Android, Node v24.18.1 (npm 11.6.2), Python 3.14.8 (venv), Chromium 152, git 2.54.

Semua klaim di dokumen ini **diverifikasi lewat panggilan API nyata dari lingkungan ini**, bukan dari ingatan.
Setiap bagian menyebutkan cara verifikasinya.

---

## 1. Kemampuan ytmusicapi yang sudah diverifikasi

Versi teruji: **ytmusicapi 1.12.3** (PyPI), repo resmi `sigma67/ytmusicapi`
(3.057 bintang, lisensi **MIT**, commit terakhir 2026-10-01 → aktif dipelihara).

Metode publik `YTMusic` yang ada di source (63 fungsi) — diverifikasi dengan
`inspect.getmembers(YTMusic)`, bukan tebakan:

```
search, get_search_suggestions, get_song, get_watch_playlist, get_lyrics,
get_song_credits, get_song_related, get_album, get_album_browse_id, get_artist,
get_artist_albums, get_channel, get_channel_episodes, get_charts, get_explore,
get_home, get_mood_categories, get_mood_playlists, get_playlist, get_podcast,
get_episode, get_episodes_playlist, get_tasteprofile, set_tasteprofile,
get_history, add_history_item, remove_history_items,
get_liked_songs, rate_song, edit_song_library_status,
get_library_songs/albums/artists/playlists/channels/podcasts/subscriptions,
create_playlist, edit_playlist, delete_playlist, add_playlist_items,
remove_playlist_items, rate_playlist, join_collaborative_playlist,
subscribe_artist(s), unsubscribe_artists,
upload_song, get_library_upload_*, delete_upload_entity,
get_account_info, get_user, get_user_playlists, get_user_videos,
as_mobile, get_basejs_url, get_signatureTimestamp
```

### Hasil pengujian nyata (tanpa autentikasi)

| Panggilan | Status | Latensi | Catatan verifikasi |
|---|---|---|---|
| `search(q, filter=songs)` | OK | 1.20s | 20 hasil; key: `videoId,title,artists,album,duration,duration_seconds,views,year,thumbnails,isExplicit,resultType,category` |
| `search` default | OK | 0.67s | campuran top/artist/album |
| `search` artists | OK | 0.41s | key: `artist,browseId,radioId,shuffleId,thumbnails` |
| `search` albums | OK | 0.66s | key: `browseId,playlistId,title,year,type,artists` |
| `search` playlists | OK | 0.57s | key: `browseId,title,author,itemCount` |
| `search` videos | OK | 0.53s | key: `videoId,title,duration_seconds,views` |
| `get_search_suggestions` | OK | 0.12s | 6 saran |
| `get_charts()` | OK | 0.26s | `{'artists','countries','videos'}` |
| `get_home(limit=2)` | OK | 0.58s | list section `{title, contents}` |
| `get_explore()` | OK | 0.54s | `{'moods_and_genres','new_releases','new_videos','trending'}` |
| `get_song(videoId)` | OK | 0.26s | **memuat `streamingData`, `videoDetails`, `microformat`, `playabilityStatus`** |
| `get_watch_playlist(videoId=)` | OK | 0.70s | `{'lyrics','playlistId','related','tracks'}` — 50 track |
| `get_lyrics(MPLYt…)` | OK | <0.5s | butuh **lyrics browseId dari `get_watch_playlist`**, bukan videoId |
| `get_lyrics(MPLYt…, timestamps=True)` | OK | <0.5s | timed lyrics tersedia (objek dataclass `LyricLine` — wajib di-serialisasi manual) |
| `get_song_related(related browseId)` | OK | <0.5s | 6 grup rekomendasi |
| `get_album(browseId)` | OK | 0.33s | 13 track; key: `tracks,audioPlaylistId,duration,year,thumbnails,related_recommendations` |
| `get_artist(channelId)` | OK | 0.38s | key: `name,channelId,subscribers,monthlyListeners,songs,albums,singles,videos,related,shuffleId,radioId,subscribed` |
| `get_artist_albums(channelId, params)` | OK | 0.38s | **`params` wajib diambil dari `get_artist()['albums']['params']`**, bukan string bebas |

**Kesalahan pengujian awal yang saya perbaiki (bukan bug library):**
`get_lyrics(videoId)` dan `get_song_related(videoId)` menghasilkan HTTP 400 karena
parameter yang benar adalah browseId (`MPLYt…` / `related`), bukan videoId.
Ini dicatat agar tidak diulang di kode produksi.

### Memerlukan autentikasi (gagal tanpa akun)

Terverifikasi menghasilkan `YTMusicUserError: Please provide authentication before using this function`:

- `get_liked_songs()`, `get_history()`, `get_library_playlists()`, `get_library_songs()`, …
- `rate_song`, `subscribe_artist`, `create_playlist`, `upload_song`, `add_playlist_items`
- `get_account_info`, `set_tasteprofile`

`setup_oauth(client_id, client_secret, filepath, open_browser=False)` tersedia, tetapi
**membutuhkan kredensial OAuth Google Cloud milik pengguna dan alur device-flow interaktif**.
Kredensial tersebut tidak tersedia di lingkungan ini dan tidak boleh saya karang.

> **Implikasi arsitektur:** semua fitur *library/favorit/playlist pribadi* NrNMusic
> disimpan **lokal (IndexedDB)** dan tidak diklaim tersinkron dengan akun YouTube Music.

---

## 2. Kelayakan pemutaran audio (temuan paling menentukan)

### 2.1 ytmusicapi bukan mesin pemutar

Diverifikasi dari source: **tidak ada satu pun method** pada `YTMusic` yang mengembalikan
URL audio siap putar (`grep "streamingData|playback"` di seluruh package tidak menemukan
fungsi pemutaran). README resmi juga tidak menyebut playback.

`get_song()` memang mengembalikan `streamingData`, tetapi isinya:

```
streamingData keys: ['expiresInSeconds', 'formats', 'adaptiveFormats', 'serverAbrStreamingUrl']
n formats: 17
itag=140 audio/mp4  codecs="mp4a.40.2"  AUDIO_QUALITY_MEDIUM  url=TIDAK ADA
itag=251 audio/webm  codecs="opus"       AUDIO_QUALITY_MEDIUM  url=TIDAK ADA
itag=249 audio/webm  codecs="opus"       AUDIO_QUALITY_LOW     url=TIDAK ADA
semua format: url = TIDAK ADA, hanya "signatureCipher"
```

Artinya URL diblokir **cipher tanda tangan** yang harus didekripsi dengan JavaScript
player YouTube (`base.js`, `signatureTimestamp=20732`, didapat via `get_basejs_url()`).
`serverAbrStreamingUrl` adalah endpoint SABR/ABR berbasis protobuf yang juga tidak
bisa dipakai langsung.

**Kesimpulan:** `ytmusicapi` = **API metadata**, bukan mesin streaming.

### 2.2 Pemecah masalah: yt-dlp (diverifikasi berfungsi)

```
yt-dlp 2026.08.19  (lisensi: Unlicense)
extract OK 2.68s  →  title: The Beginning, dur: 175, uploader: Flawed Mangoes
format 140 m4a mp4a.40.2 129.597 kbps  url=True
host: rr1---sn-uxa3vhnxa-jb3ee.googlevideo.com
Range GET bytes=0-2047 → HTTP 206, audio/mp4, 2841165 bytes total ✓
re-extract ulang → 2.83s  (berarti URL wajib di-cache)
```

Ini bukti empiris bahwa **streaming audio nyata dapat dilakukan** dari lingkungan ini:
CDN `googlevideo.com` merespons **HTTP 206 Partial Content** dengan `Accept-Ranges: bytes`,
sehingga `<audio>` element dapat melakukan seek.

### 2.3 Temuan kritis: TIDAK ADA header CORS

```
GET dengan Origin: http://localhost:5173
  status 206
  Access-Control-Allow-Origin : None
  Timing-Allow-Origin         : None
  Accept-Ranges               : bytes
  Content-Type                : audio/mp4
```

> **Browser tidak boleh mengambil audio langsung dari googlevideo.com.**
> Maka **backend proxy streaming wajib ada** — bukan pilihan gaya, tapi keharusan teknis.

`HEAD` ke URL yang sama menghasilkan **403** (hanya `GET` + `Range` yang didukung),
jadi proxy harus memakai GET dan meneruskan header `Range`.

### 2.4 Batas & risiko teknis pemutaran

| Risiko | Fakta verifikasi | Mitigasi |
|---|---|---|
| URL kedaluwarsa | `expiresInSeconds = 21540` (±6 jam) | cache URL + refresh saat 403/expire |
| Latensi resolve | ±2,7 s tiap extract | resolve saat user menekan play, prefetch antrean berikutnya, cache |
| Tidak ada CORS | terbukti di §2.3 | proxy streaming backend dengan dukungan Range |
| Codec browser | itag 140 = AAC (proprietary), itag 251 = Opus | pilih per `Accept`: chromium → opus, Safari/iOS → AAC |
| Region lock / konten tak tersedia | `playabilityStatus` ada di `get_song` | cek status, tampilkan error state |
| Chromium Alpine | build tanpa codec proprietary (kemungkinan AAC hilang) | default opus di Chromium; uji nyata di tahap pengujian |

---

## 3. Persyaratan autentikasi

| Kebutuhan | Status |
|---|---|
| Pencarian, metadata, chart, home, lyrics, related | **Tanpa autentikasi** — terverifikasi |
| Streaming audio | Tanpa akun, cukup yt-dlp (butuh cookie/PO token di masa depan jika Google memperketat) |
| Liked songs, riwayat, playlist YT Music, follow artis, uploads | **Butuh OAuth + kredensial pengguna** → tidak diimplementasikan sebagai fitur akun; disimpan lokal |
| Cookie/header sensitif | Tidak disimpan di frontend; `oauth.json` masuk `.gitignore` |

---

## 4. Kelayakan sistem pemutaran audio — kesimpulan

**LAYAK, dengan arsitektur berikut (sudah diverifikasi tiap komponennya):**

```
Browser <audio>  →  GET /api/stream/{videoId}  (backend, dukung Range)
                        │
                        ├─ cache URL (TTL < 6 jam)
                        ├─ yt-dlp resolve  (±2,7 s sekali)
                        └─ teruskan byte dari googlevideo.com (HTTP 206)
```

Tidak ada penghindaran perlindungan akses; hanya meneruskan permintaan biasa
dengan `Range` seperti yang dilakukan browser mana pun, dan mematuhi kewajiban
lisensi/ToS di §8.

---

## 5. Teknologi yang direkomendasikan

| Lapisan | Pilihan | Alasan (berbasis riset) |
|---|---|---|
| Frontend | **React 19 + TypeScript + Vite** | registry npm terjangkau (200), tipe aman, build cepat |
| State | **Zustand** | store player/queue global; kecil, tanpa boilerplate Context |
| Styling | **CSS modern + design tokens (CSS variables)** | persyaratan kustomisasi menyeluruh di Settings |
| Ikon | **Lucide** (`lucide-react`) | tersedia di registry, lisensi ISC |
| Animasi | **Motion** (`motion/react`) | spring terkontrol + `prefers-reduced-motion` |
| Backend | **FastAPI + uvicorn** | Python 3.14 tersedia; ytmusicapi asli Python |
| Metadata | **ytmusicapi 1.12.3** | terverifikasi di §1 |
| Resolver stream | **yt-dlp 2026.08.19** | satu-satunya jalur yang terbukti bekerja (§2.2) |
| Cache | in-process TTL LRU | tidak butuh Redis untuk skala lokal |
| Test | **Vitest** (unit) + **Playwright** (E2E, pakai Chromium sistem) | chromium 152 sudah ada |

**Alternatif yang dipertimbangkan dan ditolak:**

- *Node.js penuh dengan `YouTube.js` (LuanRT/YouTube.js, 5,3k ★, MIT)* — layak, tetapi
  ytmusicapi sudah teruji dan prompt mengarahkan ke Python/FastAPI. Tidak ada bukti
  keunggulan yang cukup untuk mengganti.
- *Backendless / ambil data langsung dari browser* — **ditolak tegas**: tidak ada CORS (§2.3).
- *Serverless (Vercel)* — **ditolak**: resolve stream butuh 2–3 detik + cache hangat +
  proxy byte streaming; cold start dan batas durasi eksekusi tidak cocok.

---

## 6. Referensi repository & dokumentasi

| Sumber | Data verifikasi | Relevansi |
|---|---|---|
| `sigma67/ytmusicapi` | 3.057 ★, MIT, aktif 2026-10-01 | sumber metadata utama |
| ytmusicapi.readthedocs.io | diakses 2026-10-10 | dokumentasi resmi |
| `LuanRT/YouTube.js` | 5.372 ★, MIT, aktif 2026-10-07 | alternatif InnerTube (ditinjau, tidak dipakai) |
| `nukeop/nuclear` | 18.641 ★, **AGPL-3.0** | inspirasi fitur; **larangan menyalin kode** (copyleft) |
| `amll-dev/applemusic-like-lyrics` | 2.161 ★, AGPL-3.0 | inspirasi UI lirik saja, tanpa kode |
| `usr-wwelsh/omniMux` | 2 ★, MIT, FastAPI+ytmusicapi+Svelte PWA | arsitektur serupa; terlalu kecil untuk jadi acuan |
| `tombulled/innertube` | 508 ★ | referensi pemahaman protokol |
| yt-dlp / PyPI | Unlicense | resolver stream |

---

## 7. Risiko teknis dan batasan platform

1. **Bukan API resmi** — `ytmusicapi` dan yt-dlp meniru klien YouTube Music.
   YouTube dapat mengubah protokol kapan saja → semua pemanggilan wajib dibungkus
   error handling + fallback, tanpa asumsi struktur JSON di luar yang sudah diverifikasi.
2. **Tidak ada jaminan permanensi stream** — URL ~6 jam; kasus gagal harus terlihat
   sebagai *error state* di UI, bukan pemutar yang membisu.
3. **Ketergantungan jaringan** — lingkungan ini terbukti bisa mencapai
   `music.youtube.com`, `www.youtube.com`, dan `googlevideo.com`; IP datacenter bisa
   kena rate-limit suatu saat → perlu retry/backoff.
4. **Lisensi konten** — kemampuan teknis mengambil stream ≠ izin mendistribusikan.
   NrNMusic hanya **merelay** aliran ke satu klien, tidak menyimpan/mendistribusikan
   file, dan mencantumkan disclaimer di README.
5. **`AGPL`** pada repo inspirasi → dilarang menyalin kode; hanya ide antarmuka.
6. **Chromium tanpa codec proprietary** → kemungkinan AAC tidak bisa diputar di
   lingkungan uji; harus diverifikasi di tahap pengujian, dan memilih format sesuai UA.
7. **OAuth tidak bisa diotomasi** → fitur akun YouTube Music ditunda sampai pengguna
   menyediakan `client_id`/`client_secret`.
8. **Tidak ada ffmpeg** di lingkungan → hanya format audio *pre-muxed* (m4a/opus)
   yang boleh dipakai; dilarang memilih format video yang butuh penggabungan.

---

## 8. Pertimbangan legalitas dan lisensi

- Lisensi NrNMusic: **MIT** untuk kode sendiri; dependensi wajib kompatibel
  (MIT/ISC/Apache-2.0/Unlicense). **AGPL dilarang** menjadi dependensi runtime.
- Ketentuan YouTube/Google: penggunaan tidak resmi berisiko melanggar ToS.
  NrNMusic harus: (a) tidak mengklaim afiliasi, (b) tidak memakai logo Spotify/YouTube
  sebagai identitas, (c) tidak menyimpan atau mendistribusikan rekaman audio,
  (d) mencantumkan disclaimer di README dan layar About.
- Privasi: tanpa akun, tanpa analitik pihak ketiga, tanpa token di source code;
  `.env.example` hanya berisi variabel non-sensitif.

---

## 9. Fitur yang bisa langsung diimplementasikan

Terverifikasi bekerja hari ini:

1. Pencarian lagu/artis/album/playlist/video + saran (§1).
2. Detail album, artis, playlist publik, chart, home, explore (§1).
3. Streaming audio + seek + pergantian lagu (§2.2–2.4).
4. Lirik biasa & lirik tersinkronisasi (§1) — dengan penanganan objek `LyricLine`.
5. Rekomendasi "related"/radio dari `get_watch_playlist` dan `get_song_related` (§1).
6. Antrean pemutaran (`get_watch_playlist` memberi 50 track) → dasar autoplay/radio.
7. Semua fitur lokal: playlist buatan sendiri, liked, riwayat, pencarian, queue,
   settings, theme, i18n (Indonesia/Inggris), export/import JSON.
8. Rekomendasi berbasis sinyal pemutaran lokal (frequency, completion, skip, like).

---

## 10. Fitur yang memerlukan alternatif atau layanan tambahan

| Fitur | Status | Alternatif |
|---|---|---|
| Liked Songs / riwayat / playlist di akun YT Music | butuh OAuth + kredensial | disimpan lokal di IndexedDB (dengan label jelas) |
| Follow artis tersinkron | butuh OAuth | status follow lokal |
| Upload musik milik pengguna | butuh akun + hak unggah | impor file lokal via browser (metadata dibaca lokal) |
| Unduhan offline | dibatasi storage browser (OPFS/IndexedDB) | dibedakan dari cache, dengan batasan disebutkan apa adanya |
| Crossfade / normalization | butuh Web Audio API | Web Audio `GainNode` untuk crossfade bila diaktifkan; normalisasi hanya jika data loudness tersedia (`loudnessDb` ada di respons) |
| Equalizer | Web Audio BiquadFilter | dapat diimplementasikan lokal, tanpa sumber eksternal |
| Lirik untuk semua lagu | tidak selalu tersedia | tampilkan "Lyrics not available", **tidak mengarang** |
| Background playback tanpa batas | tergantung platform | gunakan Media Session API; **jangan menjanjikan** |
| Collaborative filtering | butuh basis data pengguna banyak | mulai dari content-based + riwayat lokal |

---

## Metode verifikasi (reproduksi)

```bash
python3 -m venv .venv
.venv/bin/pip install ytmusicapi yt-dlp
.venv/bin/python -c "from ytmusicapi import YTMusic; print(YTMusic().search('flawed mangoes', filter='songs')[0])"
.venv/bin/python -c "from yt_dlp import YoutubeDL; print(YoutubeDL({'format':'bestaudio'})\
  .extract_info('https://www.youtube.com/watch?v=Yjbepc8pECI', download=False)['url'][:80])"
```

Kesimpulan: **riset selesai** — sumber utama benar-benar diperiksa dan diuji langsung.
