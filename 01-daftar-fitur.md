# Aplikasi Upload File untuk Hermes — Daftar Fitur

Status: scope upload semua jenis file, output absolute path, batas 200 MB per file, dan auto-cleanup setelah 3 hari ditetapkan pengguna. Implementasi belum dimulai.

## Keputusan desain terbaru — acuan sebelum development

Pengguna memilih **B / Dua panel** dan menetapkan **tanpa login**: langsung ke halaman upload, tanpa akun, avatar, maupun logout. Ketentuan password/sesi/login dalam rancangan awal di bawah ini tidak lagi menjadi acuan produk. Lihat `03-keputusan-desain.md` dan `design/b-final/README.md` untuk arah terbaru.

Tanpa login bukan berarti boleh terbuka ke internet. Pembatasan jaringan/perangkat serta transport aman perlu ditetapkan saat deployment; belum ada layanan yang dibuka oleh pekerjaan desain ini.

## 1. Tujuan dan batas kontrak

Aplikasi pribadi untuk mengunggah **file jenis apa pun**, menyimpannya secara persisten, lalu menghasilkan path/referensi siap disalin ke Hermes.

Semua jenis file termasuk gambar, PDF, dokumen Office, teks, source code, CSV, JSON, audio, video, arsip, executable, file berekstensi tidak dikenal, dan file tanpa ekstensi. Tidak ada allowlist ekstensi atau MIME untuk menentukan boleh tidaknya file disimpan. File kosong juga valid.

**Semua jenis file bukan berarti ukuran tak terbatas, dan bisa diunggah bukan berarti otomatis bisa dipahami Hermes.** Tiga kemampuan berikut harus dipisahkan:

1. **Upload dan penyimpanan:** wajib menerima semua jenis file dalam batas ukuran dan kapasitas yang ditetapkan, mempertahankan byte aslinya.
2. **Preview:** kenyamanan opsional per jenis file; format tanpa preview tetap dapat diunggah, disalin referensinya, dan diunduh.
3. **Pembacaan oleh Hermes:** di luar tanggung jawab aplikasi. Tidak perlu mengetahui versi, tool, model, atau format yang dapat dianalisis Hermes untuk membangun uploader.

Output yang dipilih adalah **absolute/full path dari root filesystem `/`**, bukan payload API, URL, atau path relatif. Hermes berjalan langsung di host. Rekomendasi deployment: uploader pada host yang sama agar path menunjuk file yang sama.

## 2. Flow utama

1. Pengguna memilih atau menyeret satu atau beberapa file dengan jenis campuran.
2. Aplikasi menampilkan antrean berisi nama dan ukuran; preview hanya untuk format yang aman dan didukung.
3. Pengguna dapat membatalkan item sebelum upload.
4. Backend memeriksa otorisasi, batas ukuran, kapasitas, dan keamanan nama/lokasi penyimpanan; lalu menyimpan byte file tanpa mengeksekusi atau mengonversinya.
5. Setelah penyimpanan selesai, aplikasi menampilkan referensi dari sudut pandang runtime Hermes.
6. Pengguna menyalin satu referensi atau blok beberapa referensi, lalu menempelkannya ke Hermes bersama permintaan.
7. Hermes mengakses file dengan tool yang sesuai. Dukungan membaca konten tidak diasumsikan hanya karena file dapat diakses.

Paste screenshot atau file dari clipboard menjadi jalur input tambahan jika browser menyediakan data file. File picker tetap tersedia untuk seluruh jenis file.

## 3. Fitur wajib rilis pertama

| ID | Fitur | Perilaku dan kriteria penerimaan |
| --- | --- | --- |
| F01 | Upload semua jenis file | File picker tidak dibatasi jenis gambar. Satu batch dapat berisi gambar, dokumen, audio, video, arsip, executable, file tak dikenal, tanpa ekstensi, dan file kosong. Format tidak menjadi alasan penolakan. |
| F02 | Drag-and-drop dan clipboard | File yang diseret masuk antrean. Paste menerima data file/gambar yang disediakan browser; teks clipboard tidak otomatis diubah menjadi file. Jika clipboard tidak didukung, pengguna tetap dapat memilih file. |
| F03 | Validasi upload | Periksa otorisasi, batas byte, jumlah file per batch, kapasitas, serta keamanan nama/path. MIME browser tidak dipercaya untuk menentukan cara menampilkan konten. Kegagalan mengenali atau decode format tidak menggagalkan penyimpanan file asli. |
| F04 | Status per file | Tampilkan menunggu, mengunggah, berhasil, atau gagal, dengan progres transfer. Referensi baru siap setelah file tersimpan lengkap, bukan sekadar transfer mencapai 100%. Kegagalan satu item tidak menutupi hasil item lain; item gagal dapat dicoba ulang sendiri. |
| F05 | Penyimpanan persisten dan utuh | Byte asli dipertahankan, termasuk untuk file kosong dan file yang tidak dapat diparse. ID unik mencegah nama sama menimpa file lain. Restart tidak menghilangkan file atau riwayat sebelum masa retensinya habis. |
| F06 | Full path file | Setelah upload selesai, tampilkan absolute path dari `/` ke file yang benar-benar tersimpan pada host. Bukan URL atau path browser. Direktori harus bisa dilalui dan file dibaca oleh user OS yang menjalankan Hermes. |
| F07 | Tombol Copy Path | Tombol per file menyalin full path mentah tanpa tambahan instruksi atau tanda kutip. Copy beberapa file menghasilkan satu path per baris. Tampilkan keberhasilan hanya setelah copy berhasil; sediakan fallback copy dan teks terseleksi untuk browser yang membatasi clipboard pada HTTP melalui IP LAN. |
| F08 | Riwayat dan informasi file | Tampilkan nama asli, ukuran, tipe jika diketahui, waktu upload, waktu kedaluwarsa, dan full path. Gunakan ikon generik bila tidak ada preview. Riwayat file aktif tersedia setelah refresh dan restart. |
| F09 | Preview aman | Gambar raster yang didukung boleh memiliki thumbnail dengan batas sumber daya decode. Format lain menampilkan informasi file. Preview gagal/tidak tersedia tidak mengubah status upload berhasil. HTML, SVG, script, dan konten aktif tidak dirender langsung pada origin aplikasi. |
| F10 | Download file asli | Pengguna berwenang dapat mengunduh kembali setiap file, termasuk format tak dikenal. Isi unduhan identik dengan upload; nama unduhan ditangani secara aman. |
| F11 | Hapus file | Penghapusan eksplisit dengan konfirmasi menghapus file, metadata, dan turunan preview. UI menjelaskan bahwa referensi lama akan berhenti bekerja. |
| F12 | Akses pribadi | Default tidak terbuka ke internet. Deployment jaringan memerlukan autentikasi dan transport aman. Upload, daftar, preview, download, dan hapus dilindungi; akses langsung Hermes mengikuti izin filesystem atau kontrak HTTP yang dipilih. |
| F13 | Batas sumber daya | Maksimum **200 MB per file (200.000.000 byte)**; tepat batas diterima, lebih besar ditolak. Batas berlaku pada byte file, bukan overhead multipart. Backend menegakkan batas selama streaming meski ukuran awal tidak diketahui. Kapasitas total dan konkurensi dikonfigurasi; file tidak dimuat seluruhnya ke RAM. Disk tidak dapat ditulis menghasilkan kegagalan tanpa full path sukses palsu. |
| F14 | Bukti output file | Buktikan full path bersifat absolut, menunjuk file lengkap pada host, dan isi file sama dengan upload. Verifikasi permission baca untuk user OS Hermes; tidak perlu menguji kemampuan analisis Hermes. |
| F15 | Auto-cleanup 3 hari | File kedaluwarsa 72 jam setelah upload berhasil. Worker memeriksa setiap 15 menit dan saat startup, menghapus file asli, preview, dan metadata aktif yang kedaluwarsa. File kedaluwarsa tidak lagi ditawarkan untuk copy/download; kegagalan hapus dicatat dan dicoba pada siklus berikutnya. |

## 4. Keputusan produk dan keamanan

- **Satu pengguna terlebih dahulu:** belum perlu organisasi atau workspace.
- **Tidak ada filter jenis file untuk upload:** MIME/ekstensi hanya metadata, bukan gerbang penyimpanan atau bukti keamanan.
- **Simpan asli tanpa modifikasi:** tidak ada resize, kompresi, konversi, atau penghapusan metadata diam-diam. Thumbnail merupakan turunan terpisah.
- **File tidak tepercaya:** uploader tidak menjalankan executable, script, macro, atau isi file lain. Menerima file bukan berarti menyatakannya bebas malware.
- **Tidak mengekstrak arsip otomatis:** ZIP dan arsip lain disimpan sebagai file. Ini menghindari eksekusi tersembunyi, path traversal saat ekstraksi, dan decompression bomb pada jalur upload.
- **Penyimpanan bukan webroot:** nama/path kiriman pengguna tidak dapat menentukan lokasi penyimpanan. Gunakan ID server dan lokasi internal terkontrol; simpan nama asli sebagai metadata.
- **Download tidak menjadi eksekusi browser:** endpoint file asli menggunakan attachment dan `X-Content-Type-Options: nosniff`. Preview hanya melalui jalur aman untuk format yang diizinkan sebagai preview, bukan izin upload.
- **Pembatasan preview terpisah:** gambar rusak atau berdimensi terlalu besar tetap boleh tersimpan dalam batas byte upload; preview dapat ditolak tanpa menghapus file asli.
- **Tidak ada URL publik secara default:** file dan metadata dapat berisi informasi sensitif, termasuk EXIF, kredensial, dan dokumen pribadi.
- **Retensi 3 hari:** `expires_at = uploaded_at + 72 jam`, dihitung sejak upload selesai dengan timestamp UTC, bukan dari mtime file. Copy, preview, download, dan restart tidak memperpanjang umur. UI menampilkan waktu kedaluwarsa dalam zona waktu pengguna dan memperingatkan bahwa path tidak permanen.
- **Tidak ada analisis AI di uploader:** parsing, transkripsi, OCR, dan analisis tetap mengikuti kemampuan Hermes, bukan syarat upload.
- **Tidak otomatis mengirim pesan ke Hermes:** flow pertama upload → copy → paste.
- **Konten file bukan instruksi tepercaya:** memberikan referensi kepada Hermes tidak berarti mengizinkan menjalankan program, macro, atau perintah yang terdapat di dalamnya.
- **Batas ukuran:** 200 MB desimal per file (200.000.000 byte). Retensi tidak menggantikan batas kapasitas total atau pemeriksaan ruang disk.
- **Cleanup aman:** hanya file milik aplikasi dalam direktori data terkelola; tidak mengikuti symlink atau menghapus file lain pada host. Upload yang sedang berlangsung tidak termasuk cleanup retensi. Upload terputus ditangani terpisah.
- **Jadwal penghapusan:** ketika service aktif, file kedaluwarsa dibersihkan pada siklus berikutnya, normalnya paling lambat 15 menit setelah batas 72 jam. Jika service mati, cleanup dijalankan saat startup. Kegagalan filesystem dapat menunda penghapusan fisik; jangan mengklaim file sudah terhapus sebelum berhasil.

## 5. Bentuk output

Tombol **Copy Path** menyalin teks seperti berikut (contoh lokasi, bukan direktori yang sudah dibuat):

```text
/home/farhan/uploads/data/files/01abc/laporan.pdf
```

Copy beberapa file:

```text
/home/farhan/uploads/data/files/01abc/laporan.pdf
/home/farhan/uploads/data/files/02def/rekaman.mp4
```

Direktori ID unik menghindari benturan nama; komponen nama file dinormalisasi agar aman untuk filesystem dan output satu-path-per-baris. Nama asli tetap disimpan sebagai metadata. Path dari root `/` tidak berarti aplikasi perlu berjalan sebagai user root. Pengguna menempelkan path ke Hermes; proses setelah itu di luar scope aplikasi.

## 6. Arah arsitektur awal

```text
Browser
  → Backend uploader
      → File asli pada penyimpanan persisten
      → Metadata upload
      → Preview aman bila didukung
  ← Referensi yang dapat diakses Hermes

Pengguna copy full path → paste ke Hermes pada host yang sama
  → Pemakaian file oleh Hermes di luar scope uploader
```

### Komponen

| Komponen | Tanggung jawab |
| --- | --- |
| Web UI | Antrean file campuran, status, preview opsional, copy, riwayat, download, dan hapus. |
| Backend | Otorisasi, streaming upload/download, batas 200 MB, penyimpanan, pembentukan full path, dan penghapusan. |
| Filesystem persisten | File asli di luar webroot dan turunan preview terpisah; tersedia sampai dihapus manual atau kedaluwarsa. |
| SQLite | ID, nama asli, ukuran, tipe bila tersedia, lokasi internal, `uploaded_at`, `expires_at`, status penghapusan, dan status preview terpisah. |
| Konfigurasi host | Direktori data absolut dan permission baca bagi user OS Hermes. Tidak ada integrasi API Hermes. |
| Worker cleanup | Pemeriksaan saat startup dan setiap 15 menit; penghapusan idempoten serta pencatatan kegagalan untuk percobaan berikutnya. |

### Deployment yang dipilih

- Hermes berjalan langsung pada host; uploader direkomendasikan berjalan pada host yang sama.
- Akses lewat “line ip” ditafsirkan sementara sebagai **IP LAN**, misalnya `http://192.168.1.10:3000`. Alamat aktual mengikuti konfigurasi host, bukan angka contoh ini.
- Bind ke interface LAN yang diperlukan; jangan membuka akses internet secara otomatis. Firewall membatasi jaringan yang diizinkan. Autentikasi tetap diperlukan untuk file pribadi; gunakan HTTPS untuk melindungi kredensial dan transfer.
- Clipboard API modern dapat dibatasi pada HTTP melalui IP LAN. Tombol copy harus memiliki fallback dan opsi seleksi manual; HTTPS dengan sertifikat yang dipercaya perangkat menjadi jalur yang disarankan.
- Jalankan aplikasi sebagai user non-root. Atur owner/group dan permission direktori/file agar user Hermes dapat membaca tanpa memberi akses semua user host.

Default: satu service aplikasi, filesystem persisten, SQLite, dan worker cleanup dalam service. Tidak perlu container, shared-storage lintas mesin, API Hermes, microservices, queue, object storage, atau layanan AI tambahan.

Penyimpanan asli tidak menunggu keberhasilan preview. Upload belum lengkap tidak dipublikasikan sebagai file siap pakai. Detail commit file/metadata dan pembersihan upload terputus ditetapkan dalam dokumen arsitektur.

## 7. Keputusan yang sudah tersedia

| Hal | Keputusan |
| --- | --- |
| Produk/repo/versi Hermes | Tidak diperlukan: uploader tidak berintegrasi dengan API atau internal Hermes. |
| Lokasi Hermes | Berjalan langsung di host. Uploader ditempatkan pada host yang sama. |
| Output | Full/absolute path dari root filesystem `/`, dengan tombol Copy Path. |
| Format yang dianalisis Hermes | Di luar scope; tidak perlu diteliti atau dijadikan acceptance criterion. |
| Akses aplikasi | “Line ip” sementara diartikan sebagai IP LAN. |
| Ukuran upload | Maksimum 200 MB desimal per file. |
| Retensi | Auto-cleanup setelah 72 jam sejak upload berhasil. |

Detail deployment yang ditentukan saat implementasi: IP/interface dan port, direktori data, user/group OS untuk izin baca, kapasitas disk, serta konfigurasi autentikasi/HTTPS. Ini bukan alasan untuk meminta pengguna menjelaskan versi atau kemampuan Hermes.

## 8. Di luar cakupan awal

Yang tidak masuk bukan jenis filenya, melainkan pemrosesan tambahan berikut:

- Chat UI pengganti Hermes dan pengiriman otomatis ke sesi Hermes.
- Penelitian versi/repo, pengujian model, dan matriks format yang dapat dianalisis Hermes.
- OCR, transkripsi, captioning, konversi dokumen, serta analisis AI oleh uploader.
- Ekstraksi arsip atau eksekusi file otomatis.
- Preview universal untuk semua format.
- Editor gambar, video, audio, atau dokumen.
- Akun banyak pengguna, organisasi, dan public sharing.
- Sinkronisasi cloud dan pencarian semantik.

PDF, video, audio, SVG, gambar animasi, arsip, executable, dan file tidak dikenal **tetap masuk cakupan upload**.

## 9. Urutan kerja yang disarankan

### Langkah 1 — Tetapkan daftar fitur

Gunakan dokumen ini sebagai scope: upload semua jenis file, penyimpanan utuh, referensi Hermes, dan pemisahan upload/preview/pembacaan.

### Langkah 2 — Tetapkan lokasi data dan permission

Tentukan direktori data absolut pada host dan izin baca user OS Hermes. Verifikasi bahwa file pada lokasi tersebut dapat dibaca dengan izin yang tepat; tidak perlu menjalankan analisis konten melalui Hermes.

### Langkah 3 — Tulis arsitektur dan kontrak integrasi

Dokumen berikutnya: `02-arsitektur-dan-integrasi.md`.

Isi: deployment IP LAN, stack, endpoint, metadata, full path, streaming upload/download maksimal 200 MB, commit penyimpanan, retensi 72 jam dan cleanup 15 menit/startup, cleanup upload terputus, preview aman, kontrol akses, serta kapasitas disk.

### Langkah 4 — Implementasikan jalur utama

Bangun upload batch campuran → simpan byte asli → tampilkan full path → Copy Path. Uji keberadaan file pada path tersebut dan download ulang untuk memastikan integritas. Pemrosesan Hermes bukan bagian implementasi atau acceptance test uploader.

### Langkah 5 — Lengkapi fitur penggunaan harian

Lengkapi clipboard dan fallback copy pada akses IP LAN, status per file, riwayat dengan waktu kedaluwarsa, download, hapus manual, auto-cleanup, preview opsional, batas kapasitas, dan kegagalan parsial. Kontrol akses wajib sebelum membuka layanan melalui jaringan.

### Langkah 6 — Uji skenario nyata

Uji jenis file campuran, executable tanpa menjalankannya, format tak dikenal, tanpa ekstensi, file kosong, nama duplikat/karakter khusus, file rusak tetapi tersimpan utuh, dan preview gagal. Uji tepat 200.000.000 byte serta satu byte di atasnya, upload terputus, disk penuh/tidak dapat ditulis, restart, penghapusan manual, dan akses tidak sah. Verifikasi integritas upload/download dengan hash serta tombol copy pada browser lewat alamat IP. Uji retensi tepat sebelum dan saat 72 jam, cleanup startup setelah downtime, penghapusan yang gagal lalu dicoba ulang, dan perlindungan file di luar direktori terkelola. Pastikan copy/download tidak memperpanjang retensi dan upload aktif tidak terhapus.

## 10. Definisi selesai

- Semua jenis file diterima tanpa allowlist format, maksimal 200.000.000 byte per file dan dalam kapasitas yang terdokumentasi.
- File asli tetap utuh setelah upload, download, dan restart selama belum dihapus atau kedaluwarsa.
- Format tanpa preview atau parser tetap dapat disimpan, diunduh, dan disalin full path-nya.
- Full path dari `/` menunjuk file lengkap pada host dan permission memungkinkan user OS Hermes membacanya.
- Tidak ada persyaratan tentang kemampuan Hermes menganalisis konten.
- Riwayat, waktu kedaluwarsa, status per file, Copy Path, download, dan hapus berfungsi melalui akses IP LAN.
- File kedaluwarsa setelah 72 jam dan dibersihkan sesuai jadwal, termasuk saat startup setelah downtime; kegagalan hapus tidak dilaporkan sebagai sukses.
- Kegagalan transfer/penyimpanan tidak menghasilkan status sukses palsu.
- Upload tidak mengeksekusi konten dan tidak membuka file kepada pihak yang tidak berhak.
- Cara menjalankan, lokasi data, batas kapasitas, keamanan akses, dan penggunaan bersama Hermes terdokumentasi.
