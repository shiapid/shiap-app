# Panduan Supabase Local untuk SHIAP

Panduan ini menyiapkan Supabase lokal di Windows agar perubahan skema dikelola sebagai file migration, bukan dijalankan satu per satu dari SQL Editor. Database hosted tetap menjadi sumber produksi; selama development, aplikasi diarahkan ke database lokal.

## 1. Prasyarat

- Windows 10/11 dengan WSL 2 aktif.
- Docker Desktop sudah terpasang dan statusnya **Engine running**.
- Node.js 20 atau lebih baru (`node --version`).
- Jalankan PowerShell dari folder repo `D:\shiap\shiap-app`.

Supabase CLI menjalankan Postgres, Auth, Storage, dan Studio dalam container Docker. Instalasi pertama mengunduh beberapa image dan dapat memerlukan waktu serta ruang disk.

## 2. Pasang CLI dan buat konfigurasi lokal

Jalankan dari root repo:

```powershell
npm.cmd install
npx.cmd supabase --version
npx.cmd supabase init
```

`supabase init` membuat `supabase/config.toml`. Folder `supabase/` dan migration di dalamnya sebaiknya disimpan ke Git. File `.env*`, password database, access token, dan service role key jangan dimasukkan ke Git atau chat.

## 3. Ambil baseline skema proyek online

Langkah ini hanya mengambil **skema**, bukan baris data customer. Pastikan Anda punya akses ke project hosted dan password database yang sesuai. Login/link dilakukan dari terminal pribadi:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref PROJECT_REF
npx.cmd supabase db pull --remote
```

Ganti `PROJECT_REF` dengan ID project dari URL Supabase Dashboard. Saat `link` diminta, masukkan password database secara interaktif; jangan menaruh password di perintah, file repo, atau chat.

Periksa migration hasil pull di `supabase/migrations/`. Pada pull pertama, CLI bisa meminta mencatat baseline sebagai sudah diterapkan pada riwayat migration hosted. Ini perubahan metadata migration saja, bukan perubahan tabel atau data, tetapi baca konfirmasi CLI sebelum menyetujuinya. Jangan jalankan `db push --remote` pada langkah baseline.

Jika repo sudah punya migration saat menjalankan pull pertama, berhenti dan tinjau dulu urutan migration. Baseline remote perlu diselaraskan dengan riwayat yang sudah ada agar migration tidak dieksekusi ulang.

## 4. Jalankan Supabase lokal

Supabase menggunakan kredensial development bersama dan tidak boleh terekspos ke jaringan umum. Buat network Docker khusus yang mengikat port host ke loopback:

```powershell
docker network create --driver bridge -o "com.docker.network.bridge.host_binding_ipv4=127.0.0.1" shiap-app-local-loopback
npx.cmd supabase start --network-id shiap-app-local-loopback --exclude imgproxy,edge-runtime,logflare,vector,supavisor
```

Jika stack sudah pernah berjalan pada network default, hentikan terlebih dulu dengan `npx.cmd supabase stop` (tanpa `--no-backup`), lalu jalankan perintah start di atas. Penghentian normal mempertahankan data lokal. Jangan menjalankan `docker network rm` untuk mengganti network.

Jika network tersebut sudah ada, jangan buat ulang; periksa pengaturannya dengan `docker network inspect shiap-app-local-loopback` dan pastikan opsi `host_binding_ipv4` bernilai `127.0.0.1`.

Periksa alamat publikasi port:

```powershell
docker ps --format "{{.Names}}|{{.Ports}}"
```

Idealnya port API, database, Studio, dan Mailpit tampil sebagai `127.0.0.1:...`. Jika Docker Desktop tetap menampilkan `0.0.0.0:...` atau `[::]:...`, jangan membuka rule inbound firewall untuk port tersebut dan pastikan Windows Firewall aktif dengan inbound default `Block` pada profil jaringan yang digunakan. Hentikan stack sebelum memakai mesin di jaringan yang tidak tepercaya bila firewall tidak dapat dipastikan.

Setelah itu, lihat status:

```powershell
npx.cmd supabase status
```

Alamat lokal yang umum:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Mailpit untuk email Auth lokal: `http://127.0.0.1:54324`
- Postgres: `127.0.0.1:54322`

CLI menampilkan URL dan key lokal. Gunakan **publishable key lokal**, bukan secret/service role key. Jangan salin output `status` ke log publik karena output dapat memuat kredensial.

## 5. Arahkan Next.js ke Supabase lokal

Jangan menimpa `.env.local` yang sekarang dipakai proyek hosted. Buat file lokal development berikut di root repo:

```powershell
@'
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ISI_DENGAN_PUBLISHABLE_KEY_LOKAL
'@ | Set-Content -LiteralPath .env.development.local
```

Ganti placeholder dengan publishable key yang ditampilkan `supabase status`. `.env.development.local` diabaikan Git, dan Next.js memprioritaskannya saat `npm run dev`. Setelah mengubah file, mulai ulang dev server:

```powershell
npm.cmd run dev
```

Untuk memastikan aplikasi tidak sedang memakai hosted project, periksa URL Supabase di Network tab browser atau pastikan request aplikasi menuju `127.0.0.1:54321`.

## 6. Kerja dengan migration

Buat migration baru untuk setiap perubahan database:

```powershell
npx.cmd supabase migration new nama_perubahan
```

Untuk SHIAP, schema aplikasi lokal tersedia di `supabase/migrations/20261107060000_local_app_schema.sql` dan migration sesudahnya. Ia membuat tabel katalog, booking, profil, admin, pembayaran, RPC, RLS, dan bucket yang dipakai aplikasi. `create_booking_order` menangani booking serta inventory hold; RPC booking legacy tidak diganti. SQL V1.4 di root repo menjadi trigger harga di dalam schema lokal.

Terapkan migration baru ke database lokal tanpa menghapus data:

```powershell
npx.cmd supabase db push --local
npx.cmd supabase db lint --local
```

Perintah tersebut menerapkan migration yang belum tercatat ke stack lokal. Hindari `db reset` untuk rutinitas karena perintah itu menghapus data database lokal.

Periksa tabel dan fungsi melalui Studio lokal (`http://127.0.0.1:54323`). Smoke test rollback-only dapat dijalankan dengan `Get-Content -Raw supabase/tests/local_booking_smoke.sql | docker exec -i supabase_db_shiap-app psql -U postgres -d postgres -X -v ON_ERROR_STOP=1`. Pengguna Auth lokal terpisah dari akun online; email konfirmasi dapat dibuka di Mailpit. Admin tidak dibuat otomatis. Setelah mendaftar melalui web lokal, jalankan di SQL Editor Studio lokal dengan email yang sama:

```sql
insert into public.admin_users(user_id)
select id from auth.users where email = 'EMAIL-AKUN-LOKAL'
on conflict do nothing;
```

Perintah ini hanya untuk database lokal; jangan jalankan pada project hosted tanpa persetujuan.

## 7. Data uji dan Storage

Gunakan data sintetis atau data yang sudah dianonimkan. Jangan dump data customer/payment produksi untuk development. Untuk data tetap, masukkan fixture aman melalui `supabase/seed.sql` dan konfigurasi bucket/policy dalam migration. Storage lokal juga terpisah dari bucket online; unggah file uji baru.

## 8. Rutinitas harian

```powershell
npx.cmd supabase start --network-id shiap-app-local-loopback --exclude imgproxy,edge-runtime,logflare,vector,supavisor
npm.cmd run dev:local
```

Setelah mengubah skema, buat migration lalu validasi dengan:

```powershell
npx.cmd supabase db push --local
npx.cmd supabase db lint
```

Saat selesai:

```powershell
npx.cmd supabase stop
```

Database lokal tetap tersimpan saat `stop`. `db reset` menghapus data lokal; gunakan hanya saat memang ingin membangun ulang database dari semua migration.

## 9. Deploy ke hosted (langkah terpisah)

Deploy hanya setelah baseline, migration, dan data uji sudah ditinjau. Lihat apa yang akan diterapkan terlebih dahulu:

```powershell
npx.cmd supabase db push --dry-run --remote
```

Pastikan project yang tertaut benar dan migration yang tampil sesuai. Jalankan perintah penerapan remote hanya setelah persetujuan eksplisit pemilik project serta backup hosted:

```powershell
npx.cmd supabase db push --remote
```

CLI v3 meminta konfirmasi untuk perubahan hosted. `--remote` secara eksplisit berarti project online; tanpa flag itu, perintah database menargetkan lokal. Jangan pernah gunakan `supabase db reset --remote` pada project produksi karena perintah tersebut destruktif.

## Troubleshooting singkat

- `Docker daemon is not running`: buka Docker Desktop dan tunggu sampai Engine running.
- Port lokal bentrok: hentikan service yang memakai port 54321–54324 atau sesuaikan port di `supabase/config.toml`, lalu `supabase stop` dan `supabase start`.
- Aplikasi tetap mengakses hosted: cek nama dan isi `.env.development.local`, lalu restart Next dev server.
- CLI meminta versi Node lebih baru: gunakan Node.js 20+.
- Migration gagal saat `db push --local`: baca error pertama, perbaiki migration terkait, lalu ulangi perintah lokal tersebut.

## Referensi resmi

- [Supabase CLI dan local development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Workflow untuk project yang sudah hosted](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Target lokal dan hosted pada CLI](https://supabase.com/docs/guides/local-development/local-and-hosted-projects)
- [Migration database](https://supabase.com/docs/guides/local-development/database-migrations)
- [Environment variable load order Next.js](https://nextjs.org/docs/app/guides/environment-variables#environment-variable-load-order)
