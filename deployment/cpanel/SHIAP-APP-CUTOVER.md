# Cutover SHIAP production ke Supabase `Shiap App`

Status: **BLOCKED — jangan upload/deploy sampai data dan Auth dimigrasikan serta disetujui.**  
Tanggal pemeriksaan: 9 November 2026  
Target kandidat: `Shiap App` (`sbomjhwmjmqteybsegdl`)  
Domain: `https://app.shiap.id`  
Runtime paket: Linux x86_64, Node `24.22.2`, Next.js standalone, cPanel Passenger `app.js`.

## Yang telah disiapkan

- `SHIAP-PRODUCTION-RELEASE-shiap-app-20261109.zip`: build terisolasi untuk project `Shiap App`, menggunakan publishable key resmi dengan tipe `publishable` yang diambil sementara dari metadata Supabase. Key tidak dicetak/disimpan sebagai file env.
- ZIP memuat `app.js`, `server.js`, `package.json`, `public/`, dan `.next/static/`; tidak memuat `.env*` atau `.git`.
- Pemeriksaan static bundle: ref `Shiap App` ditemukan; ref `shiap-production` tidak ditemukan. Satu string `http://localhost:9999` dari dependency runtime Next ditemukan; itu bukan URL Supabase. Satu-satunya host Supabase dalam bundle adalah target canonical.
- Startup Passenger diuji melalui container Node `24.22.2`: homepage dan Next image optimizer memberi respons sukses.
- ZIP lama `SHIAP-PRODUCTION-RELEASE.zip` tidak ditimpa. ZIP lama mengarah ke project sebelumnya dan merupakan bagian dari rollback.
- `scripts/build-cpanel-release.mjs` kini mendukung konfigurasi build eksplisit melalui process environment, validasi project-ref, dan nama ZIP berbeda. Build dapat dilakukan tanpa membaca `.env.local` development.

## Status pre-cutover

`Shiap App` memiliki 28/28 migration tercatat. Schema aplikasi pasca-retire cocok dengan migration lokal untuk fungsi inti, dan table/RLS/policy sudah tersedia. Pemeriksaan PostgREST read-only memberi `200` untuk `trip_packages`, `stay_properties`, `shiap_experiences`, `custom_trip_settings`, `site_icon_settings`, `home_hero_settings`, dan `payment_settings`. `booking_orders` menolak akses anon (`401`), sesuai isolasi; RPC penulisan/booking tidak dieksekusi pada production.

Project target masih kosong untuk data akun dan operasional:

| Data agregat | Project lama `shiap-production` | Target `Shiap App` |
|---|---:|---:|
| Auth users / identities / sessions | 1 / 1 / 0 | 0 / 0 / 0 |
| Profiles / admin users | 1 / 1 | 0 / 0 |
| Trip packages / departures | 2 / 1 | 0 / 0 |
| Stay properties / room types | 1 / 0 | 0 / 0 |
| Booking orders / items | 4 / 4 | 0 / 0 |
| Payment records / booking events | 1 / 6 | 0 / 0 |
| `shiap_experiences` | Tabel tidak ada | 40 baris katalog/demo |
| Payment settings | 1 baris | 1 baris |
| Home/custom trip settings | Tabel tidak ada | 1 / 1 baris |
| Site icon settings | Tabel tidak ada | 0 baris |
| File Storage payment proofs | 1 objek | 0 objek |
| File Storage catalog images | 0 objek | 0 objek |

Empat booking lama terbagi menjadi satu `pending_confirmation/unpaid`, satu `confirmed/unpaid`, satu `cancelled/unpaid`, dan satu `cancelled/pending`. Tidak ada transaksi dengan status `paid` pada agregat tersebut. Tetap migrasikan seluruh record, bukan hanya yang aktif, agar riwayat pelanggan dan audit pembayaran tidak hilang.

Pada kedua project, nama bank terdeteksi Mandiri, tetapi hanya setting lama yang lolos pemeriksaan boolean untuk nama pemilik dan nomor rekening resmi yang sebelumnya diberikan. Nilai rekening tidak ditampilkan di laporan. **Jangan terima pembayaran melalui target baru sebelum konfigurasi ini diperbaiki dan diverifikasi.**

## Rencana transfer data — belum dijalankan

1. Buat backup database penuh project lama dan target, serta salinan objek Storage di luar workspace; uji restore ke staging. Backup DB tidak menyertakan bytes objek Storage.
2. Freeze sementara perubahan katalog/booking pada project lama ketika cutover akhirnya disetujui. Ulangi agregat status/row count tepat sebelum snapshot agar transaksi baru tidak tertinggal.
3. Migrasikan Auth secara terkontrol dengan mempertahankan UUID user dan identity. Uji metode Supabase Auth migration yang didukung pada staging. Jangan mengekspor hash/password/session ke repo. JWT secret antarproject berbeda; rencanakan login ulang sesudah perpindahan dan jangan menggunakan ulang JWT secret hanya untuk mempertahankan session.
4. Migrasikan katalog yang menjadi referensi historis terlebih dahulu dengan ID asli: 2 trip, 1 departure, 1 stay. Verifikasi foreign key dan benturan ID sebelum import. Jangan menimpa 40 `shiap_experiences` di target; project lama tidak memiliki tabel tersebut.
5. Migrasikan `profiles` dan `admin_users` dengan UUID Auth yang sama. Migrasikan semua 4 `booking_orders`, 4 `booking_items`, 6 event, dan 1 payment record dengan ID asli serta relasi/status/tanggal/price snapshot dipertahankan. Audit trigger target pada staging terlebih dahulu agar import tidak menambah booked seats atau menahan kapasitas dua kali.
6. Salin satu objek payment proof ke bucket private dengan bucket/path/metadata yang sesuai; verifikasi hash file dan akses hanya pemilik/admin. Jangan membuka bucket publik.
7. Transfer konfigurasi pembayaran dari sumber yang telah disahkan dan cocokkan dengan rekening resmi SHIAP tanpa memuat nilainya ke repo/log. Isi `site_icon_settings` bukan blocker karena tabel kosong berarti fallback ikon aktif; preferensi dari browser tidak boleh dikira data Cloud.
8. Jangan salin setting singleton/home/custom secara blind: bandingkan target yang sudah ada dan source sebelum memilih nilai. Jangan timpa setting `Shiap App` tanpa approval.
9. Setelah import staging, bandingkan jumlah dan status agregat, FK, integrity checks, login/reset email, admin guard, customer isolation, RLS, file proof, serta booking inventory. Jalankan transaksi simultan dan expiry/cancel hanya di staging.
10. Ambil approval eksplisit untuk snapshot/transfer data. Tidak ada data yang dipindahkan dalam pekerjaan ini.

Panduan resmi Supabase menyebut Auth users/password hashes bisa dipindahkan melalui prosedur Auth/schema migration; JWT secret project berbeda membuat token lama tidak berlaku. Ikuti prosedur di staging, jangan memulihkan seluruh schema Auth/database di atas target yang sudah memiliki migration tanpa rencana restore teruji: [Migrating Auth Users Between Supabase Projects](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects), [Backup and Restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Auth production yang masih harus diselesaikan

Endpoint settings publik mengonfirmasi signup aktif dan konfirmasi email diwajibkan, tetapi tidak menampilkan Site URL/redirect allow-list. Dashboard Auth target harus dikonfigurasi/ditinjau sebelum login production:

- Site URL: `https://app.shiap.id`
- Redirect allow-list minimal: `https://app.shiap.id/auth/callback` dan pola callback aplikasi yang diperlukan (`https://app.shiap.id/**`). Kode signup dan reset password memakai `/auth/callback` dengan `next=/profile` atau `next=/reset-password`.
- Pastikan SMTP/email delivery teruji. Email confirmation saat ini tidak auto-confirm.
- Pastikan reset password selesai di `/reset-password` dan callback kembali ke domain HTTPS.
- Tidak ada akun Auth pada target sekarang; admin login belum bisa berhasil hingga user/admin dipindahkan atau dibuat melalui proses yang disetujui.

Perubahan Dashboard tersebut belum dilakukan.

## Pengujian dan batasan

- `npm run lint`: lulus, 0 error dan 3 warning `<img>` existing.
- `tsc --noEmit`: lulus.
- Production standalone build: lulus; Next.js menyelesaikan TypeScript dan static page generation.
- Passenger Node 24 smoke: homepage dan image optimizer lulus.
- PostgREST GET `limit=0`: tabel katalog/settings lulus; booking private menolak anon sesuai RLS.
- Migration history: 28/28 pada `Shiap App`.
- Booking/payment RPC tidak dipanggil karena dapat menulis status atau mengubah inventory. Pengujian transaksi, customer/admin role, callback email, DNS, dan Passenger hosting sebenarnya masih menunggu staging/cPanel.

## Cutover setelah seluruh blocker hilang

1. Simpan salinan application root aktif cPanel dan ZIP release lama di luar document root; catat waktu/versi.
2. Konfigurasikan Auth URL/redirect/SMTP dan selesaikan migrasi data+Auth yang telah diuji. Verifikasi rekening dan file proof.
3. Pastikan runtime cPanel env berisi `NODE_ENV=production`, URL project `Shiap App`, serta publishable key dari project yang sama. Build client harus tetap berasal dari ZIP canonical ini; mengganti env saja tidak mengganti nilai yang sudah dibundel.
4. Upload ZIP ke staging root, extract sehingga `app.js`, `server.js`, `package.json`, `.next/`, `public/` berada langsung di application root. Atur Node `24.22.2`, mode Production, startup `app.js`; biarkan Passenger menentukan port.
5. Jalankan smoke test dan verifikasi request API berakhir pada project canonical. Jangan buka transaksi sebelum semua langkah lulus.
6. Untuk rollback, pulihkan application root backup serta `SHIAP-PRODUCTION-RELEASE.zip` (bundle project lama) dan environment yang cocok. Jangan hapus project/database mana pun.

Cutover live, perubahan cPanel, konfigurasi Auth, transfer data, dan perubahan project lama **belum dilakukan**.
