# NrN Music

**NrNMusic** adalah pemutar musik Android gratis yang dibuat oleh Nata. Cari dan dengarkan musik, atur antrean, dan simpan koleksi pribadi langsung di perangkat.

**Tidak perlu login NrNMusic, server sendiri, atau memasukkan URL backend untuk mulai menggunakan aplikasi.**

## Fitur

- Cari lagu dan telusuri album, artis, serta playlist.
- Putar musik dengan kontrol antrean dan pemutar latar belakang.
- Simpan lagu favorit, playlist, dan preferensi di perangkat.
- Gunakan lirik jika tersedia dari penyedia lirik.
- Nikmati antarmuka Android native dengan Jetpack Compose.

Ketersediaan lagu, stream, dan lirik bergantung pada layanan sumbernya serta koneksi internet.

## Unduh dan pasang APK

1. Buka tab [Actions](https://github.com/project-anonymous02/NrN-Music/actions).
2. Pilih workflow yang berhasil, lalu unduh artifact **`NrNMusic-debug-apk`**.
3. Ekstrak file ZIP artifact, lalu pasang file `.apk` di dalamnya.
4. Jika diminta, izinkan pemasangan aplikasi dari sumber tersebut di pengaturan Android.

APK mendukung Android **8.0 (API 26) atau lebih baru**. File artifact Actions berbentuk ZIP; ekstrak ZIP terlebih dahulu sebelum memasang APK.

## Build APK sendiri

Persyaratan:

- JDK 21
- Android SDK Platform 37.0
- Koneksi internet untuk mengunduh dependency saat build

```bash
git clone https://github.com/project-anonymous02/NrN-Music.git
cd NrN-Music/native-android
./gradlew :app:assembleFossDebug
```

GitHub Actions juga membangun APK secara otomatis setiap ada push ke branch `main`. Hasilnya tersedia sebagai artifact **`NrNMusic-debug-apk`** pada run Actions yang berhasil.

APK dari Actions adalah build debug untuk dicoba dan ditinjau, bukan rilis bertanda tangan distribusi.

## Cara kerja dan batasan

Aplikasi Android mengambil katalog dan stream musik melalui protokol InnerTube yang digunakan oleh YouTube Music. Aplikasi ini tidak memakai backend NrNMusic untuk pencarian atau pemutaran musik.

Protokol tersebut bukan API resmi yang dijamin stabil. YouTube dapat mengubah atau membatasi layanannya, sehingga pencarian maupun pemutaran lagu tertentu mungkin sewaktu-waktu tidak tersedia. Penggunaan internet diperlukan untuk mencari dan memutar musik. Beberapa fitur opsional dari komponen upstream mungkin memiliki persyaratan akun layanan tersendiri.

Data library dan preferensi NrNMusic disimpan secara lokal dan tidak otomatis tersinkronisasi ke perangkat lain.

## Versi web

Repository ini juga menyertakan frontend web dan backend FastAPI. Keduanya merupakan bagian terpisah dan **tidak diperlukan oleh APK Android**. Versi web memerlukan backend sendiri untuk menyediakan layanan API dan stream.

## Tentang proyek

**Made by Nata**  
**Project Nata**

Yap, benar—**Nur Rasa Natakusuma**. NrNMusic adalah proyek pribadi yang dikembangkan oleh Nata.

Aplikasi Android ini merupakan fork dan modifikasi dari [Metrolist](https://github.com/MetrolistGroup/Metrolist), serta menggunakan InnerTubeX. Kode Android turunan dan InnerTubeX dilisensikan di bawah **GNU GPL-3.0**. Lihat [LICENSE](native-android/LICENSE) dan [FORK_NOTICE.md](native-android/FORK_NOTICE.md) untuk informasi lisensi dan atribusi.

NrNMusic tidak berafiliasi dengan, didukung oleh, atau disponsori oleh YouTube maupun Google.
