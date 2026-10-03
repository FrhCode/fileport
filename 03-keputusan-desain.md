# Keputusan desain terbaru

Dokumen ini mengambil prioritas atas bagian rancangan awal yang bertentangan.

## Keputusan pengguna
- Arah visual terpilih: **B / Dua panel**.
- Desktop-first; aplikasi terang, netral lembut, minimal dan tenang.
- Upload di panel kiri, antrean dan riwayat di area kanan.
- **Tidak ada login.** Aplikasi langsung membuka halaman kerja; tidak ada akun, avatar, password, atau tombol Keluar.
- Desain gambar disiapkan sebelum development. Pengguna menyetujui PNG hasil render mockup HTML, bukan text-to-image.

## Scope artefak
Acuan terbaru ada di `design/b-final/`. Eksplorasi A/B/C lama dipertahankan sebagai arsip, bukan acuan auth atau komposisi terbaru.

State visual: kosong; antrean sebelum upload; upload + menyimpan; berhasil; gagal parsial/retry; multi-select + copy; fallback copy; detail; konfirmasi hapus; hapus tertunda; hapus berhasil; kedaluwarsa.

Satu halaman aplikasi berubah keadaan; detail dan konfirmasi menggunakan modal. Bukan dua belas halaman navigasi.

## Kontrak yang tidak berubah
Semua jenis file, maksimum 200.000.000 byte per file, byte asli dipertahankan, absolute path pada host, retensi 72 jam sejak selesai, cleanup 15 menit/startup, tidak mengeksekusi/menganalisis file, tidak mengirim otomatis ke Hermes.

## Catatan deployment tanpa login
Menghapus login aplikasi menghapus pembatasan identitas di tingkat UI/sesi. Jangan menyebut aplikasi terautentikasi atau memakai ikon gembok/label akses pribadi yang menyesatkan. Sebelum deployment LAN, tetapkan pembatasan jaringan/perangkat dan transport yang sesuai. Orang yang dapat mencapai layanan tanpa lapisan pembatasan akan dapat mengakses fungsi file. Dokumen ini tidak mengizinkan port forwarding internet atau membuka service pada jaringan sekarang.

Implementasi backend belum dimulai. Data di mockup adalah contoh fiktif, bukan bukti upload, copy, penghapusan, atau keamanan runtime.
