# Setup Supabase — Impiria29 Kita

Frontend login menggunakan Supabase Auth dan publishable key. Tiada secret key atau kata laluan database disimpan dalam folder app.

## 1. Pasang skema database

1. Log masuk ke Supabase Dashboard dan pilih projek `vxmuditmodaxcfqblxrf`.
2. Buka **SQL Editor → New query**.
3. Buka fail `schema.sql` dalam folder `supabase`, salin semua kandungan dan tampal ke editor.
4. Tekan **Run** sekali. Pastikan Supabase menunjukkan `Success`; jika ada ralat, jangan teruskan ke pendaftaran penduduk dahulu.

Skema menyediakan profil akaun, kelulusan penduduk, snapshot data komuniti, hebahan dan undi satu bagi setiap rumah. Penduduk hanya menerima data yang dibenarkan untuk rumah masing-masing; AJK tidak boleh membaca kewangan/log melalui API; admin boleh mengurus semua rekod. Pilihan individu dalam undian tidak boleh dibaca terus.

## 2. Tetapan log masuk

Dalam Supabase, buka **Authentication → URL Configuration**. Selepas tapak diterbitkan, tetapkan **Site URL** kepada alamat HTTPS app dan tambah alamat itu di **Redirect URLs**. Gunakan kaedah e-mel/kata laluan. Tetapan pengesahan e-mel boleh dikekalkan; jika dihidupkan, pengguna perlu sahkan e-mel sebelum log masuk.

## 3. Jadikan akaun anda admin pertama

1. Terbitkan folder app ke hosting HTTPS atau jalankan di komputer untuk ujian.
2. Di app, pilih **Mohon akses penduduk** dan daftar akaun anda dengan e-mel yang akan dijadikan admin serta nombor rumah sebenar.
3. Jika pengesahan e-mel dihidupkan, sahkan pautan e-mel dan log masuk sekali supaya profil diwujudkan.
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
