# Arsitektur Aplikasi Upload File

Status: rancangan implementasi, belum kode atau deployment yang telah diuji.
Acuan: [01-daftar-fitur.md](01-daftar-fitur.md).

## Keputusan desain terbaru — acuan sebelum development

Pengguna memilih **B / Dua panel** dan menetapkan **tanpa login**: langsung ke halaman upload, tanpa akun, avatar, maupun logout. Ketentuan password/sesi/login dalam rancangan awal di bawah ini tidak lagi menjadi acuan produk. Lihat `03-keputusan-desain.md` dan `design/b-final/README.md` untuk arah terbaru.

Tanpa login bukan berarti boleh terbuka ke internet. Pembatasan jaringan/perangkat serta transport aman perlu ditetapkan saat deployment; belum ada layanan yang dibuka oleh pekerjaan desain ini.

## 1. Keputusan inti

Bangun **satu aplikasi pada host yang sama dengan Hermes**, diakses melalui IP LAN. Aplikasi menerima semua jenis file maksimal 200.000.000 byte per file, menyimpan byte asli, menghasilkan absolute path, dan menghapus file setelah retensi 72 jam.

Hermes tidak menjadi dependency aplikasi. Tidak ada API Hermes, pemeriksaan versi, parser dokumen, atau pengujian kemampuan analisis Hermes. Kontrak selesai pada file utuh, lokasi absolut yang benar, permission baca, dan tombol Copy Path.

“Line ip” masih ditafsirkan sebagai IP LAN. Nilai IP aktual ditentukan dari lingkungan deployment.

## 2. Stack yang dipilih

| Bagian | Pilihan | Alasan |
| --- | --- | --- |
| Runtime | Node.js 24 LTS + TypeScript | Satu bahasa untuk backend dan interaksi browser; streaming I/O tersedia. |
| HTTP backend | Fastify + plugin multipart resmi | Routing sederhana dengan batas dan streaming upload. Versi paket dikunci kompatibel saat implementasi. |
| UI | HTML/CSS + TypeScript, dibangun dengan Vite | Satu halaman interaktif tidak memerlukan React, router SPA, atau state library. |
| Metadata | SQLite melalui `better-sqlite3` | Transaksi lokal sederhana; query pendek, tidak perlu server database. |
| File asli | Filesystem lokal persisten | Menghasilkan full path langsung tanpa object storage atau URL perantara. |
| Thumbnail | `sharp`, hanya untuk raster yang diizinkan | Thumbnail aman dan dibatasi; kegagalannya tidak menggagalkan upload. |
| Cleanup | Timer dalam proses aplikasi + startup sweep | Tidak perlu cron atau queue eksternal untuk satu instance. |
| Operasional | systemd | Restart service dan startup setelah reboot; bukan menjalankan dev server sebagai layanan produksi. |
| Akses LAN aman | Caddy sebagai reverse proxy HTTPS | Sertifikat internal harus dipercaya perangkat pengguna; membantu tombol copy dan melindungi login/file. |

Satu proses aplikasi melayani API dan hasil build UI. Caddy hanya lapisan transport, bukan service bisnis tambahan. Vite dipakai saat development/build, bukan server produksi.

SQLite menyimpan metadata, bukan blob file. Gunakan WAL, foreign keys aktif, busy timeout, dan transaksi pendek. Jangan menahan transaksi selama transfer jaringan atau pembuatan thumbnail.

## 3. Topologi

```text
Browser perangkat pengguna
  │ HTTPS melalui IP LAN
  ▼
Caddy pada host
  │ HTTP loopback
  ▼
Aplikasi Fastify — satu instance
  ├── Static UI
  ├── API upload / list / download / delete
  ├── SQLite
  ├── Direktori file asli
  ├── Thumbnail terbatas
  └── Cleanup startup + setiap 15 menit

Browser: Copy Path
  → Pengguna paste ke Hermes
  → Hermes membaca file pada host yang sama
```

Backend bind ke `127.0.0.1:3000`; proxy membuka interface LAN yang dipilih. Jangan membuka port backend ke jaringan atau mengaktifkan port forwarding internet. Firewall membatasi klien LAN yang diperbolehkan.

Akses HTTP langsung melalui IP hanya untuk development atau diagnosis terkontrol, bukan default deployment file pribadi. Fallback copy tetap tersedia karena dukungan browser berbeda-beda.

## 4. Struktur penyimpanan

Contoh layout yang direkomendasikan:

```text
/home/farhan/uploads/
  src/
  public/
  dist/
  data/
    app.sqlite
    tmp/
      <upload-id>.part
    files/
      <file-id>/
        <safe-name>
    previews/
      <file-id>.webp
```

Ini rancangan direktori, bukan struktur yang sudah dibuat.

- `DATA_DIR` harus absolut, pada filesystem yang sama untuk `tmp` dan `files` agar rename atomik.
- File asli tidak berada dalam direktori static web.
- ID berupa UUID acak buatan server. Nama duplikat tidak menimpa file sebelumnya.
- Nama asli disimpan sebagai metadata; nama disk adalah basename yang dinormalisasi.
- Buang separator `/` dan `\`, karakter kontrol termasuk newline/NUL, serta komponen `.`/`..`; batasi panjang dalam byte UTF-8, pertahankan ekstensi bila aman. Gunakan `file` jika hasil kosong.
- Semua lokasi dibentuk server dari direktori terkonfigurasi, ID terverifikasi, dan nama aman. API tidak menerima path tujuan.
- Contoh output: `/home/farhan/uploads/data/files/<file-id>/laporan.pdf`.
- Mengganti `DATA_DIR` setelah dipakai merupakan migrasi: path lama yang pernah disalin tidak otomatis tetap berlaku. Jangan memindahkan data diam-diam.

### Permission

Service berjalan sebagai user non-root. Jika user Hermes berbeda, berikan akses baca melalui group khusus: direktori file `0750`, file asli `0640`, parent directory dapat dilalui group yang relevan. Database, konfigurasi rahasia, dan file sementara tetap privat bagi service.

Jangan memakai `0777`, menjalankan file upload, atau memberi user Hermes izin menulis ke storage sebagai syarat penggunaan. Aturan retensi hanya menjangkau file dalam storage aplikasi, tidak salinan yang dibuat di lokasi lain.

## 5. Model metadata

### Tabel `files`

| Field | Fungsi |
| --- | --- |
| `id` | UUID primary key. |
| `original_name` | Nama kiriman browser untuk tampilan, selalu di-escape. |
| `stored_name` | Basename aman pada direktori ID. |
| `declared_mime` | MIME kiriman browser, opsional dan tidak dipercaya. |
| `size_bytes` | Jumlah byte yang benar-benar ditulis; nol valid. |
| `state` | `uploading`, `ready`, atau `deleting`. |
| `created_at` | UTC epoch milliseconds saat record dibuat. |
| `uploaded_at` | UTC saat file selesai dan siap; null selama upload. |
| `expires_at` | `uploaded_at + 259200000`; null selama upload. |
| `preview_state` | `none`, `pending`, `ready`, atau `unavailable`. |
| `delete_error` | Ringkasan kegagalan penghapusan terakhir, nullable. |

Index pada `(state, expires_at)` dan `(state, uploaded_at, id)`. Absolute path dihitung dari root storage dan field server, tidak disimpan sebagai input bebas pengguna.

Record `deleting` disimpan sampai penghapusan fisik selesai, bukan dihapus lebih dahulu. Tidak ada riwayat permanen file terhapus pada rilis pertama.

### Sesi login

SQLite menyimpan hash token sesi acak, waktu kedaluwarsa absolut, dan hash token CSRF. Token sesi mentah hanya berada dalam cookie browser. Password tunggal disimpan sebagai hash scrypt dalam konfigurasi privat, bukan plaintext di database atau source code.

## 6. Kontrak API

Semua endpoint file membutuhkan sesi login. Response JSON kesalahan berbentuk `{ "error": { "code": "...", "message": "..." } }`; tidak mengekspos stack trace atau rahasia server.

| Method dan route | Kontrak |
| --- | --- |
| `POST /api/session` | Login password tunggal; buat cookie sesi dan kembalikan token CSRF. |
| `GET /api/session` | Status sesi dan token CSRF untuk halaman yang dimuat ulang. |
| `DELETE /api/session` | Cabut sesi dan cookie; membutuhkan CSRF. |
| `POST /api/files` | Multipart berisi tepat satu part file `file`. Streaming, maksimal 200.000.000 byte isi file. `201` hanya setelah file siap. |
| `GET /api/files?cursor=...&limit=50` | Daftar file `ready` yang belum kedaluwarsa, terbaru dahulu, cursor berdasarkan waktu dan ID; maksimum 100 item per halaman. |
| `GET /api/files/:id/download` | Stream file asli sebagai attachment, tidak menerima path filesystem. |
| `GET /api/files/:id/preview` | Hanya thumbnail yang berhasil dibuat; jika tidak tersedia, `404`. |
| `DELETE /api/files/:id` | Tandai `deleting` lalu hapus file, preview, dan record. `204` setelah selesai; `202` bila menunggu percobaan cleanup berikutnya. |
| `GET /api/health` | Status hidup minimal tanpa path atau metadata pribadi. |

Contoh response upload:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "original_name": "laporan.pdf",
  "size_bytes": 124800,
  "absolute_path": "/home/farhan/uploads/data/files/550e8400-e29b-41d4-a716-446655440000/laporan.pdf",
  "uploaded_at": "2026-10-03T10:00:00.000Z",
  "expires_at": "2026-10-06T10:00:00.000Z",
  "preview_state": "unavailable"
}
```

Tanggal dan data di atas ilustratif. Response list memakai field publik yang sama; tidak mengirim `delete_error` internal atau rahasia konfigurasi.

Status kesalahan: `400` multipart/nama request invalid, `401` belum login, `403` CSRF/origin invalid, `404` file tidak tersedia, `413` batas byte terlampaui, `429` slot upload penuh/login dibatasi, `507` kapasitas tidak cukup, dan `500` kegagalan internal. File kedaluwarsa juga dianggap tidak tersedia oleh API meskipun penghapusan fisik belum selesai.

Download menggunakan `Content-Disposition: attachment` dengan encoding nama aman, `Content-Type: application/octet-stream`, `X-Content-Type-Options: nosniff`, dan `Cache-Control: no-store`. Preview hanya WebP hasil decode/re-encode server; tidak melayani SVG/HTML asli sebagai preview.

## 7. Flow upload dan konsistensi

1. Browser mengantrekan file; maksimal dua transfer paralel. Satu file satu request agar kegagalan parsial dan progress sederhana.
2. Backend memeriksa sesi, CSRF, slot transfer, dan kapasitas. Batas frontend hanya kenyamanan; backend tetap sumber kebenaran.
3. Server membuat ID, record `uploading`, dan `.part` menggunakan exclusive create tanpa mengikuti symlink.
4. Stream multipart ke `.part` dengan backpressure. Hitung byte aktual; batasi jumlah part, panjang header, dan field ekstra. Putus dan bersihkan ketika melewati 200.000.000 byte. File nol byte tetap sah.
5. Setelah stream lengkap dan multipart valid, flush file, tutup descriptor, lalu rename ke lokasi akhir pada filesystem yang sama. Sinkronkan direktori sesuai kebutuhan durability.
6. Commit metadata `ready`, ukuran aktual, waktu upload, dan kedaluwarsa. Baru setelah itu kirim `201` beserta full path.
7. Preview dikerjakan terpisah dan tidak menunda keberhasilan penyimpanan asli. Jumlah pekerjaan preview serta ukuran decode dibatasi.

Filesystem dan SQLite tidak memiliki satu transaksi bersama. Karena itu record `uploading` dibuat sebelum menulis file; record tetap ada jika proses berhenti sebelum commit `ready`.

### Pemulihan kegagalan

- Transfer gagal/abort: tutup stream, hapus `.part` dan artefak akhir jika ada, lalu hapus record. Jika pembersihan gagal, simpan `deleting` untuk dicoba ulang.
- Saat startup, sebelum menerima upload baru: dapatkan lock instance tunggal; bersihkan record `uploading` yang tersisa dari proses lama dan artefaknya. Tidak ada upload aktif dari instance lain yang boleh berjalan pada data directory yang sama.
- Crash setelah rename tetapi sebelum `ready`: record `uploading` mengidentifikasi file yang harus dibersihkan; file tersebut belum pernah dinyatakan sukses kepada browser.
- File `ready` yang hilang di luar aplikasi: jangan mengembalikan path sebagai siap pakai; laporkan error yang jelas dan rekonsiliasi metadata.
- Response hilang setelah commit sukses: file tetap muncul di riwayat setelah refresh. Tidak ada retry upload otomatis; retry manual dapat membuat upload kedua. Tidak perlu deduplikasi atau protokol resume pada rilis pertama.

Progress transfer 100% bukan tanda sudah tersimpan. UI berpindah dari `uploading` ke `saving`, lalu `ready` ketika `201` diterima.

## 8. Batas sumber daya

| Konfigurasi | Nilai awal rancangan |
| --- | --- |
| Ukuran file | 200.000.000 byte, keputusan pengguna. |
| Retensi | 72 jam, keputusan pengguna. |
| Interval cleanup | 15 menit. |
| Transfer upload | Dua aktif per instance, dua per browser. |
| Batch UI | Maksimal 20 file per pemilihan; kirim melalui antrean, bukan satu request besar. |
| Kuota storage | 10 GB desimal, default operasional yang dapat diubah setelah memeriksa disk. |
| Ruang disk cadangan | 1 GB, di luar kuota. |
| Batas preview | Input maksimal 20 MB dan 25 megapiksel; thumbnail sisi terpanjang 512 px; satu decode aktif. |

Batas preview tidak membatasi upload: gambar 100 MB tetap dapat disimpan tanpa thumbnail. Jangan decode animasi semua frame; hanya raster statis yang didukung, format lain memakai ikon.

Untuk mencegah dua upload bersamaan melampaui kapasitas, admission menghitung penggunaan aktual seluruh data termasuk temporary/preview, ditambah reservasi konservatif 200 MB untuk setiap upload aktif. Reservasi dilepas setelah selesai/abort; startup menghitung ulang penggunaan. Ukuran `Content-Length` tidak dipercaya sebagai ukuran file.

Pemeriksaan ruang disk bukan jaminan karena proses lain dapat mengisi disk; penanganan `ENOSPC` tetap wajib. Batasi request overhead secara terpisah, jangan memakai batas body persis 200 MB yang akan menolak file valid akibat multipart framing. Proxy harus melakukan streaming, tanpa buffering seluruh request atau batas default yang lebih kecil.

## 9. Auto-cleanup 72 jam

Aturan waktu:

```text
expires_at = uploaded_at + 72 jam
expired = now >= expires_at
```

Gunakan waktu UTC persisten; UI mengubahnya ke zona lokal pengguna. Perubahan jam host memengaruhi expiry, sehingga sinkronisasi waktu host perlu aktif. Membaca, copy, preview, download, dan restart tidak mengubah `expires_at`.

### Algoritma

1. Saat startup, pulihkan upload terputus, lalu jalankan cleanup sebelum menerima request file.
2. Setiap 15 menit, pilih file `ready` yang kedaluwarsa dan record `deleting` yang belum tuntas. Hanya satu sweep aktif; jadwal berikutnya tidak boleh overlap.
3. Tandai `deleting` dalam transaksi pendek; sejak saat itu endpoint list/copy/download tidak menawarkannya lagi.
4. Hapus file asli, thumbnail, dan direktori ID kosong. Gunakan hanya lokasi terkelola, jangan mengikuti symlink atau recursive delete berdasarkan input pengguna.
5. File yang sudah tidak ada dianggap terhapus. Kegagalan izin/I/O bukan sukses: simpan error, pertahankan record, dan coba lagi pada sweep berikutnya.
6. Hapus record setelah seluruh artefak berhasil dihapus. Tidak perlu menyimpan nama/path file terhapus selamanya.

Manual delete menggunakan alur yang sama. Koordinasikan preview dan delete per ID agar worker preview tidak menciptakan ulang thumbnail setelah penghapusan. Temporary preview dibuang jika file sudah kedaluwarsa atau `deleting` sebelum publikasi.

Pada Linux, download yang sudah membuka descriptor dapat selesai meskipun path dihapus; request baru ditolak. Pemakaian file oleh proses Hermes tidak dilacak dan tidak memperpanjang retensi. Path yang disalin sebelumnya dapat berhenti berlaku saat Hermes baru hendak membukanya.

Penghapusan fisik biasanya berlangsung pada sweep pertama setelah 72 jam, maksimal sekitar 15 menit jika service sehat. Saat service mati atau filesystem gagal, tidak ada jaminan penghapusan fisik tepat waktu. UI tidak boleh menjanjikan sebaliknya. Cleanup bukan secure erase media penyimpanan.

## 10. UI satu halaman

### Susunan

1. Header: nama aplikasi dan logout.
2. Dropzone: pilih banyak file, drag-and-drop, paste file/screenshot; keterangan “Semua jenis file · maks. 200 MB/file · otomatis dihapus setelah 3 hari”.
3. Antrean: nama, ukuran, progress, status, batal sebelum upload, dan retry manual bila gagal.
4. Riwayat aktif: nama, ukuran, thumbnail/ikon, full path, waktu kedaluwarsa, Copy Path, Download, dan Hapus.
5. Seleksi beberapa file dan tombol Copy Selected Paths; satu path per baris, urutan sesuai tampilan.

### Perilaku penting

- Gunakan XMLHttpRequest untuk progress upload; tidak perlu WebSocket.
- Render nama sebagai teks, bukan HTML. File tidak dikenal memakai ikon generik, bukan error.
- Copy menyalin path mentah tanpa quote, Markdown, atau instruksi Hermes.
- Coba Clipboard API pada secure context; fallback copy berbasis selection ketika didukung. Jika gagal, tampilkan field terseleksi dengan instruksi copy manual, jangan toast sukses palsu.
- Countdown lokal hanya tampilan; server tetap menentukan expiry. Refresh daftar setelah upload/delete, saat tab kembali aktif, dan secara berkala ketika halaman terlihat.
- Setelah expiry, nonaktifkan Copy/Download dan refresh riwayat. Path yang sudah ada di clipboard tidak dapat ditarik kembali.
- Hapus manual memerlukan konfirmasi. Response `202` ditampilkan sebagai penghapusan tertunda, bukan berhasil menghapus fisik.
- Halaman nyaman pada desktop maupun ponsel; clipboard file bergantung pada kemampuan browser.

## 11. Keamanan minimum

- Satu password pribadi; tidak perlu register, multi-user, atau recovery lewat email.
- Session cookie `HttpOnly`, `Secure`, `SameSite=Strict`, dengan masa berlaku absolut 7 hari. Logout mencabut sesi server; sesi kedaluwarsa dibersihkan oleh housekeeping.
- Token CSRF untuk upload/delete/logout dan pemeriksaan origin pada request mutasi. Login juga memeriksa origin dan menerima JSON saja.
- Batasi percobaan login dan jumlah sesi aktif; jangan mencatat password, cookie, atau token. Trust proxy hanya loopback yang dikendalikan, bukan sembarang header forwarded.
- Sertifikat LAN menggunakan CA internal Caddy yang dipasang sebagai trusted pada perangkat pengguna; sertifikat self-signed yang tidak dipercaya bukan pengalaman HTTPS yang selesai.
- Database/config tidak dapat diunduh lewat static route. Content Security Policy membatasi script/style ke aset aplikasi; tidak ada HTML aktif dari upload.
- Tidak melakukan antivirus, menjalankan executable, membuka macro, mengekstrak arsip, atau menganggap file aman hanya karena MIME tertentu.
- Storage directory tidak writable oleh user lain yang tidak dipercaya. Verifikasi path terkelola dan penggunaan API filesystem tanpa mengikuti symlink tetap dilakukan.

## 12. Operasional

Konfigurasi minimum: `DATA_DIR`, port loopback backend, origin publik HTTPS/IP LAN, password hash, kuota storage, serta user/group service. Nilai batas upload/retensi sesuai keputusan produk; perubahan konfigurasi harus eksplisit dan terdokumentasi.

systemd menjalankan satu instance hasil build, restart saat gagal, dan menunggu filesystem data siap. Startup gagal dengan pesan jelas jika storage tidak writable, konfigurasi tidak valid, atau lock sedang dipakai; jangan fallback diam-diam ke direktori temporary.

Saat shutdown, hentikan admission upload baru dan timer, beri transfer aktif waktu terbatas untuk selesai, lalu abort/bersihkan sisanya. Tutup database setelah pekerjaan dihentikan. Startup recovery menjadi pengaman jika shutdown terputus.

Log seperlunya: startup, error upload, error storage, dan ringkasan cleanup. Hindari nama asli/full path/token di log rutin. Tidak perlu dashboard monitoring atau telemetry tambahan.

## 13. Urutan implementasi dan bukti penerimaan

| Tahap | Hasil | Verifikasi nyata |
| --- | --- | --- |
| 1. Storage dan API | Upload streaming, commit metadata, absolute path, download | Upload file campuran dan nol byte; bandingkan hash file asal, lokasi disk, dan download. |
| 2. UI utama | Pilih/drop/paste, antrean, progress, Copy Path, riwayat | Gunakan browser pada alamat yang dipilih; cek isi clipboard sama dengan path file sebenarnya. |
| 3. Siklus file | Manual delete, expiry, cleanup, startup recovery | Majukan waktu pada harness sementara atau gunakan record bertimestamp terkontrol; buktikan sebelum/saat expiry, restart, dan kegagalan hapus. Tidak perlu menunggu tiga hari nyata. |
| 4. Akses aman | Login, sesi, CSRF, HTTPS LAN, permission host | Klien tanpa sesi tidak bisa mengakses file; perangkat LAN dapat login dan copy; user OS yang dituju dapat membaca file tanpa akses root. |
| 5. Penyempurnaan | Thumbnail terbatas, fallback copy, responsif, pesan kegagalan | Preview gagal tidak membatalkan upload; gunakan desktop/ponsel dan jalur clipboard fallback. |

Sebelum membuka layanan ke LAN, tahap keamanan harus selesai; tahap awal hanya loopback.

Kasus batas wajib: tepat 200.000.000 byte dan satu byte lebih besar, multipart tak valid, transfer terputus, nama traversal/newline, nama duplikat, disk penuh, upload paralel mendekati kuota, restart di tengah upload/commit, file hilang eksternal, preview bersamaan delete, cleanup setelah downtime, dan proteksi file di luar storage.

Pengujian aplikasi tidak mencakup apakah Hermes mampu memahami PDF, gambar, audio, atau format lain. Tidak ada klaim runtime pada dokumen ini: pembuktian dilakukan setelah implementasi tersedia.
