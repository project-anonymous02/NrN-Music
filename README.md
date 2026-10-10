# NrNMusic

Pemutar musik bergaya Spotify di atas metadata YouTube Music: cari lagu, buka album/artis/playlist, putar audio, atur antrean, lirik, dan riwayat — semuanya tersimpan lokal di perangkat kamu. Tanpa akun, tanpa iklan, tanpa server sendiri untuk konten.

- Riset empiris: [`RESEARCH.md`](RESEARCH.md) — setiap klaim diverifikasi lewat panggilan API nyata.
- Perencanaan & arsitektur: [`PLAN.md`](PLAN.md).
- Kontrak API internal yang diimplementasikan: [`docs/API.md`](docs/API.md).
- Riwayat versi: [`CHANGELOG.md`](CHANGELOG.md).

## Stack

| Lapisan | Teknologi |
| --- | --- |
| Frontend | React 19, TypeScript 5.7, Vite 6, Zustand, React Router 7, lucide-react |
| Backend | Python 3.14, FastAPI, uvicorn, ytmusicapi (metadata), yt-dlp (resolve stream) |
| Data | IndexedDB (riwayat, favorit, antrean), localStorage (pengaturan), cache TTL/LRU di memori |
| Tes | pytest (32), Vitest (52), `tsc -b`, E2E headless Chromium via CDP |

## Struktur

```
NrNMusic/
├── RESEARCH.md  PLAN.md  CHANGELOG.md
├── docs/API.md                 ← kontrak endpoint
├── backend/app/                ← FastAPI: routers, services, cache, errors
├── frontend/src/               ← SPA: pages, components, stores, i18n, lib
├── scripts/e2e_smoke.py        ← E2E (server + Chromium dalam satu proses)
└── artifacts/                  ← screenshot hasil E2E
```

## Prasyarat

- Python 3.11+ dengan `venv` (`pip install -r backend/requirements.txt` atau pakai venv yang sudah ada).
- Node.js 18+ dan npm.
- Koneksi internet (semua metadata & audio datang dari YouTube Music).
- Opsional untuk E2E: binary Chromium/Chrome di `PATH`.

## Menjalankan

### 1. Backend

```bash
cd backend
pip install -r requirements.txt          # fastapi uvicorn ytmusicapi yt-dlp httpx
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Docs interaktif: <http://127.0.0.1:8000/api/docs>. Cek kesehatan: `curl http://127.0.0.1:8000/api/health`.

### 2. Frontend (dev)

```bash
cd frontend
npm install
npm run dev            # http://127.0.0.1:5173, /api di-proxy ke :8000
```

Ganti target API dengan `VITE_API_TARGET=http://127.0.0.1:9000 npm run dev`.

### 3. Build produksi (satu origin)

```bash
cd frontend && npm ci && npm run build    # hasil di frontend/dist
cd ../backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Backend menyajikan `frontend/dist` beserta fallback SPA, jadi cukup satu port. Contoh di balik nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Range $http_range;      # wajib untuk audio streaming
    proxy_buffering off;                     # jangan buffer body stream
}
```

## Konfigurasi

Salin `.env.example` ke `backend/.env`. Variabel penting:

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `PROXY_STREAM` | `1` | `1` = audio lewat backend (wajib untuk browser, CORS CDN kosong); `0` = `302` ke googlevideo |
| `STREAM_CACHE_TTL` | `1800` | masa simpan URL audio (~6 jam masa berlaku upstream) |
| `METADATA_CACHE_TTL` | `300` | cache metadata |
| `RATE_LIMIT_PER_MINUTE` | `240` | pembatas per IP (`0` = mati) |
| `YT_REGION` / `YT_LANGUAGE` | `US` / `en` | locale YouTube Music |
| `CORS_ORIGINS` | Vite dev | hanya perlu saat frontend beda port |

## Pengujian

```bash
# Backend (32 tes; tambahkan -m live untuk memanggil YouTube sungguhan)
cd backend && pytest

# Frontend (52 tes) + tipe + build
cd frontend && npm run typecheck && npm run test && npm run build

# E2E: server nyata + Chromium headless, memverifikasi playback audio sungguhan
python scripts/e2e_smoke.py --shots artifacts
```

Semua perintah dijalankan di foreground (tanpa `nohup`/proses latar belakang yang tersembunyi).

## Batasan yang disengaja

- **Metadata saja dari ytmusicapi** — tidak ada endpoint resmi untuk audio; stream di-resolve `yt-dlp` lalu di-proxy. URL kedaluwarsa ±6 jam, jadi selalu di-cache dan di-resolve ulang saat mendekati kedaluwarsa.
- **Tanpa transkoding** — `ffmpeg` tidak diasumsikan tersedia; kualitas mengikuti apa yang disediakan CDN (`auto`/`m4a`/`webm`).
- **Akun YouTube Music tidak wajib** — like, playlist, dan riwayat disimpan lokal (IndexedDB). Login OAuth YouTube Music (jika dipakai) bersifat opsional dan tidak pernah dikirim ke server mana pun.
- **Konten mengikuti ketersediaan YouTube Music** — lagu yang diblokir wilayah/privat akan menghasilkan `502 stream_upstream_error`.
- **Tanpa penyalinan kode dari repo inspirasi** (lisensi AGPL) — hanya ide UI/UX yang dirujuk.

## Masalah umum

| Gejala | Penyebab / solusi |
| --- | --- |
| Audio tidak jalan, console: `ERR_CONTENT_LENGTH_MISMATCH` | proxy menutup koneksi sebelum body selesai — dicegah oleh `tests/test_stream_regression.py` |
| CORS error saat memutar audio | `PROXY_STREAM=0` sementara CDN tidak mengirim `Access-Control-Allow-Origin`; kembalikan ke `1` |
| `403` dari stream | `HEAD` dilarang CDN; hanya `GET` + `Range`. Jangan pakai klien yang mengirim `HEAD` |
| `/album/...` di-reload → 404 | fallback SPA aktif hanya jika `frontend/dist` sudah dibuild |
| `node_modules` hilang / ESM error | jalankan ulang `npm install` (folder ini bisa terhapus oleh pembersih) |

## Atribusi & lisensi dependensi

- [ytmusicapi](https://github.com/sigma67/ytmusicapi) — MIT
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — Unlicense
- [FastAPI](https://github.com/fastapi/fastapi) / uvicorn — MIT
- React, Vite, Zustand — MIT

Kode di repo ini ditulis dari nol untuk proyek NrNMusic; tidak ada salinan dari repository pihak ketiga yang berlisensi AGPL.
