# Rilis SHIAP di cPanel Passenger

Paket kandidat terbaru `SHIAP-PRODUCTION-RELEASE-shiap-app-demo-20261109.zip` berisi runtime Next.js standalone untuk Linux x86_64, Node.js `24.22.2`, dan entry point Passenger `app.js`. Paket dibangun serta diuji pada container Linux Node 24 terisolasi tanpa file `.env*`; build memakai variabel release eksplisit untuk Supabase `Shiap App`, dan tidak membaca `.env.local`. Script build memvalidasi endpoint HTTPS/project ref, memastikan key bertipe publishable, dan tidak mencetak nilainya. Untuk membuat ulang paket dari workstation, Docker Desktop dengan Linux containers harus tersedia.

Build ini mengaktifkan `NEXT_PUBLIC_SHIAP_DEMO_MODE=true`: reservasi dapat diuji, tetapi instruksi transfer dan unggah bukti pembayaran nonaktif. Jangan mengaktifkan pembayaran nyata dengan mengganti environment runtime saja; mode ini tertanam saat build. Sebelum menerima pembayaran nyata, katalog dan rekening harus diverifikasi, migration guard pembayaran diterapkan setelah approval, lalu aplikasi dibangun ulang secara eksplisit untuk mode non-demo.

## Deployment langsung lewat SSH

Script [deploy-cpanel-production.ps1](../../scripts/deploy-cpanel-production.ps1) memakai alias Windows `shiap-production` dan application root `/home/shiapsit/shiap-app`. Pastikan Windows SSH Agent telah memuat `shiap_cpanel_deploy` (`ssh-add -l` harus menampilkan identity).

Jalankan tanpa argumen untuk dry-run. Script menjalankan lint, TypeScript, Node 24 Linux standalone build dan route smoke test; memeriksa baseline health, membuat backup runtime di luar application root, menguji upload/checksum di staging tersembunyi, lalu mensimulasikan perpindahan symlink, restart-file, dan rollback di direktori terisolasi. Dry-run tidak mengubah release aktif atau me-restart Passenger.

Deployment sungguhan hanya berjalan jika script dipanggil dengan `-Deploy` setelah ada persetujuan production. Script mengunggah ZIP, mengaktifkan release melalui symlink atomik, menyentuh `tmp/restart.txt`, menguji rute website, dan memulihkan release sebelumnya jika health check gagal. Private key tidak pernah disalin atau dibaca script. Build memperoleh publishable key dari Supabase CLI untuk project `Shiap App`; `.env.local` tidak dibaca dan mode pembayaran demo tetap aktif.

> Paket ini belum diunggah atau dijalankan di hosting dan tidak mengubah Supabase Cloud. Karena variabel `NEXT_PUBLIC_*` ditanam ke asset browser saat build, jangan bagikan ZIP ini ke pihak yang tidak dipercaya.

## Konfigurasi aplikasi di cPanel

1. Di **Setup Node.js App** buat aplikasi:
   - Node.js: `24.22.2` (atau Node 24 yang disediakan cPanel)
   - Application mode: `Production`
   - Application root: `shiap-app` (folder relatif ke home akun cPanel)
   - Application URL: domain `app.shiap.id`, root `/`
   - Application startup file: `app.js`
2. Klik **Create**. Catat path aplikasi yang dibuat cPanel. Jangan membuat aplikasi di document root domain yang sudah berisi file website lain.
3. Upload `SHIAP-PRODUCTION-RELEASE.zip` ke application root melalui File Manager, lalu extract di sana. Pastikan `app.js`, `server.js`, `package.json`, `public/`, dan `.next/` ada langsung di application root, bukan berada satu tingkat di dalam subfolder hasil extract.
4. Di bagian environment variables aplikasi, tambahkan:
   - `NODE_ENV` = `production`
   - `NEXT_PUBLIC_SUPABASE_URL` = URL project Supabase Cloud SHIAP
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable key untuk project yang sama
   - `NEXT_PUBLIC_SHIAP_DEMO_MODE` = `true` (penanda konfigurasi; UI mode demo sudah tertanam di build)
5. Simpan/perbarui aplikasi dari cPanel. Bila panel meminta dependency install, gunakan `npm install`/`npm ci` hanya jika perlu; paket standalone sudah membawa dependency runtime ter-trace dan umumnya tidak memerlukan instalasi ulang. Jangan menjalankan `next build` di hosting.
6. Klik **Restart** pada Setup Node.js App. Buka `https://app.shiap.id` dan verifikasi alur publik, login, katalog, serta satu alur booking dengan data uji yang aman.
7. Aktifkan SSL/AutoSSL di cPanel dan paksa HTTPS setelah DNS domain mengarah ke hosting. Pastikan URL site/callback Auth Supabase untuk domain produksi telah disetel secara terpisah di dashboard Supabase sebelum menerima login produksi. Langkah ini hanya mengubah konfigurasi Auth jika Anda melakukannya; rilis ini sendiri tidak mengubah Cloud.

## Environment dan keamanan

- Masukkan hanya URL Cloud dan publishable/anon key. Nilai ini memang digunakan browser. Jangan masukkan `service_role`, secret key, password database, atau `.env.local` ke ZIP, repository, maupun nilai `NEXT_PUBLIC_*`.
- Atur environment variables melalui UI **Setup Node.js App**. Hindari menaruh secret di file dalam document root.
- Nilai `NEXT_PUBLIC_*` tertanam saat build. Jika project/key berubah, buat ulang paket dari konfigurasi Cloud yang benar, unggah rilis baru, lalu restart.
- Jangan menjalankan `supabase db push`, `db reset`, atau migration dari cPanel. Semua perubahan database production memerlukan prosedur dan persetujuan tersendiri.

## Passenger, port, dan hostname

`app.js` hanya mengatur `NODE_ENV` dan default `HOSTNAME=0.0.0.0`, lalu memuat `server.js` standalone yang dihasilkan Next.js. Ia tidak membuat HTTP server kedua dan tidak menetapkan `PORT`. Passenger memasang reverse port binding dan mengarahkan trafik ke listener aplikasi; biarkan Passenger/cPanel mengelola port. Jika fitur domain membuat `.htaccess`, pertahankan file yang dibuat panel.

Untuk restart manual bila tombol panel tidak tersedia, buat/sentuh file kosong `tmp/restart.txt` di application root. Restart dari panel biasanya lebih mudah.

## Pemeriksaan log Passenger

1. Periksa **Setup Node.js App → application log** bila tersedia.
2. Periksa log aplikasi di folder `logs/` di application root dan log Errors di cPanel. Path log Passenger/Apache bisa berbeda antar penyedia; minta provider memastikan `PassengerLogFile`/log aplikasi jika folder itu tidak menampung pesan.
3. Cari error startup seperti modul hilang, versi Node tidak cocok, environment variable kosong, atau permission. Jangan menyalin nilai env/secret saat mengirim log untuk bantuan.
4. Setelah perbaikan/restart, muat ulang `/` dan beberapa route utama, lalu periksa kembali log.

## Rollback

Sebelum mengganti rilis aktif, simpan salinan seluruh application root saat itu (misalnya `shiap-app-previous-YYYYMMDD-HHMM`) di luar document root dan simpan ZIP rilis sebelumnya di komputer lokal. Jangan menimpa cadangan.

Jika rilis baru gagal:

1. Di Setup Node.js App, hentikan/restart aplikasi sesuai pilihan panel.
2. Pulihkan isi application root dari salinan sebelumnya, termasuk file konfigurasi `.htaccess` yang dibuat cPanel. Jangan mengganti environment variables yang sudah tervalidasi kecuali memang perlu.
3. Pastikan `app.js` dan `server.js` dari satu rilis yang sama berada di root aplikasi.
4. Restart aplikasi, periksa log Passenger, lalu verifikasi `https://app.shiap.id`.

Simpan setidaknya satu rilis terdahulu sampai login, katalog, checkout, pembayaran, dan callback Auth produksi sudah lolos pemeriksaan.

## Batas verifikasi

Build production, pemeriksaan TypeScript, startup `app.js`, homepage HTTP, dan endpoint optimasi gambar berjalan pada Linux x86_64 dengan Node `24.22.2`. Tes lokal menjalankan entry point yang sama dan memberi port melalui environment; Passenger/cPanel sebenarnya belum diuji karena rilis belum diunggah. Pastikan provider memang memakai Linux x86_64. DNS, SSL, environment UI cPanel, URL redirect Auth, dan konektivitas hosting perlu dikonfirmasi setelah upload.

Referensi: [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [cPanel Setup Node.js App](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/).
