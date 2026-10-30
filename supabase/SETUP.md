# Setup Supabase — Impiria29 Kita

Frontend login menggunakan Supabase Auth dan publishable key. Tiada secret key atau kata laluan database disimpan dalam folder app.

## 1. Pasang skema database

1. Log masuk ke Supabase Dashboard dan pilih projek `vxmuditmodaxcfqblxrf`.
2. Buka **SQL Editor → New query**.
3. Buka fail `schema.sql` dalam folder `supabase`, salin semua kandungan dan tampal ke editor.
4. Tekan **Run** sekali. Pastikan Supabase menunjukkan `Success`; jika ada ralat, jangan teruskan ke pendaftaran penduduk dahulu.

Skema menyediakan profil akaun, kelulusan penduduk, snapshot data komuniti, hebahan dan undi satu bagi setiap rumah. Penduduk hanya menerima data yang dibenarkan untuk rumah masing-masing; AJK tidak boleh membaca kewangan/log melalui API; admin boleh mengurus semua rekod. Pilihan individu dalam undian tidak boleh dibaca terus. Tarikh lahir keluarga kekal sulit kecuali ahli keluarga memilih untuk berkongsi ucapan; paparan umum hanya memberi nama serta hari/bulan.

## 2. Tetapan log masuk

Dalam Supabase, buka **Authentication → URL Configuration**. Selepas tapak diterbitkan, tetapkan **Site URL** kepada alamat HTTPS app dan tambah alamat itu di **Redirect URLs**. Gunakan kaedah e-mel/kata laluan. Untuk aliran permohonan tanpa e-mel pengesahan, buka **Authentication → Sign In / Providers → Email** dan matikan **Confirm email**. Supabase akan menandakan alamat e-mel sebagai disahkan secara automatik; AJK/admin perlu mengesahkan nama, telefon dan rumah secara berasingan sebelum meluluskan akaun. [Dokumentasi Supabase](https://supabase.com/docs/guides/auth/general-configuration).

## 3. Jadikan akaun anda admin pertama

1. Terbitkan folder app ke hosting HTTPS atau jalankan di komputer untuk ujian.
2. Di app, pilih **Mohon akses penduduk** dan daftar akaun anda dengan e-mel yang akan dijadikan admin serta nombor rumah sebenar.
3. Log masuk sekali supaya profil diwujudkan. Jika **Confirm email** dimatikan, tiada pautan e-mel diperlukan.
4. Dalam SQL Editor Supabase, tukar `alamat@email-anda` dalam arahan di bawah kepada e-mel akaun itu dan jalankan:

```sql
update public.profiles p
set role = 'admin',
    approval_status = 'approved',
    house_number = p.requested_house_number
from auth.users u
where p.user_id = u.id
  and lower(u.email) = lower('alamat@email-anda');
```

5. Log keluar dan log masuk semula. Akaun admin akan menyediakan rekod komuniti kosong untuk mula diisi.

## 4. Luluskan penduduk

Penduduk daftar dalam app; mereka belum dapat melihat data sehingga diluluskan. Admin boleh semak `public.profiles` di **Table Editor**, kemudian tetapkan `approval_status` kepada `approved` dan `house_number` kepada rumah yang telah disahkan. Jangan naikkan `role` selain `resident` kecuali untuk AJK/admin yang sah.

## Perlindungan kunci

`supabase-config.js` mengandungi URL projek dan publishable key untuk frontend. Publishable key memang direka untuk berada di browser; akses sebenar dikawal oleh RLS dan fungsi database dalam skema ini. Jangan letakkan `sb_secret_`, service-role key, kata laluan dashboard atau kata laluan database dalam app atau repo.


## 5. Aktifkan ucapan hari lahir penduduk

Fungsi ucapan hari lahir diaktifkan bersama fungsi permohonan melalui migration gabungan di bahagian 6. Paparan umum hanya mengembalikan nama, hubungan dan hari/bulan bagi ahli yang memilih untuk berkongsi; tahun lahir tidak dipaparkan.


## 6. Kelulusan permohonan di frontend

1. Untuk database sedia ada, buka **SQL Editor → New query**.
2. Jalankan kandungan fail `supabase/migrations/20261030_enable_birthdays_and_applications.sql` sekali untuk mengaktifkan fungsi permohonan serta ucapan hari lahir.
4. Selepas itu, AJK/admin yang log masuk akan melihat menu **Permohonan baharu**. Senarai dikemas kini setiap 45 saat. AJK/admin pilih rumah yang disahkan dan tekan **Luluskan akaun**. Penduduk hanya boleh log masuk selepas diluluskan.

Permohonan tanpa e-mel pengesahan hanya berfungsi selepas **Confirm email** dimatikan dalam tetapan Email provider (rujuk bahagian 2). Pemberitahuan permohonan muncul dalam app untuk AJK/admin yang sedang log masuk; ia bukan notifikasi push apabila app ditutup.


## 7. Pengurusan senarai akaun

Untuk database sedia ada, jalankan kandungan `supabase/migrations/20261030_account_management.sql` di **SQL Editor → New query**. Menu **Senarai pengguna** kemudian tersedia untuk admin dan AJK. Mereka boleh mengemas kini nama, telefon, rumah dan status kelulusan. Hanya admin boleh menukar peranan. Memadam akaun memadam akaun log masuk dan profilnya secara kekal; rekod isi rumah dikekalkan. Admin terakhir serta akaun yang sedang digunakan dilindungi daripada pemadaman.


## 8. Baki tabung pada Ringkasan penduduk

Untuk database sedia ada, jalankan `supabase/migrations/20261030_dashboard_public_summary.sql` di **SQL Editor → New query**. Fungsi ini hanya memberikan jumlah baki kepada ahli yang diluluskan; ia tidak memberikan senarai transaksi kepada penduduk. Selepas migration berjaya, log keluar dan masuk semula.


## 10. Kehadiran acara bagi setiap akaun

Untuk database sedia ada, jalankan `supabase/migrations/20261030_per_user_event_attendance.sql` di **SQL Editor → New query**. Migration ini menyimpan kehadiran per akaun, mengira jumlah yang hadir, dan tidak mendedahkan senarai nama peserta.
