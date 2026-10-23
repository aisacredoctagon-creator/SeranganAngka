# Serangan Angka

Game ritme dengan soal matematika yang jatuh ke garis target mengikuti beat musik. Pemain menjawab lewat lane di bawah layar (sentuh, klik, atau keyboard). Dibuat untuk pelajar usia 12–16 tahun dan nyaman dimainkan di ponsel maupun desktop.

Dibuat dengan HTML + CSS + JavaScript murni (tanpa build, tanpa dependensi).

**Main online:** https://aisacredoctagon-creator.github.io/SeranganAngka/

## Menjalankan secara lokal
- Cara cepat: buka `index.html` di browser lalu klik **Main**.
- Disarankan lewat server lokal (butuh Node.js, diperlukan bila memakai file audio sendiri): `node serve.js`, lalu buka http://localhost:8123.
- Tes otomatis: buka `/tests/audio-test.html` dan `/tests/problems-test.html` di server lokal; judul halaman berubah menjadi "ALL PASS" bila lulus.

## Struktur folder
```
index.html              halaman utama (menu, game, hasil)
css/style.css           gaya: layout fluid, mobile-first
js/config.js            semua pengaturan gameplay (BPM, nyawa, tahap, jendela waktu, ...)
js/music.js             data musik per level (kunci, chord, melodi)
js/audio.js             mesin audio Web Audio (backing, melodi, nada salah)
js/game.js              loop permainan, penilaian, nyawa, jeda
js/problems.js          pembuat soal bilangan dan desimal
js/fractions.js         notasi pecahan bertumpuk + pembuat soal pecahan
js/ui.js                menu, layar hasil, penyimpanan, kontrol suara
tests/                  tes otomatis audio dan generator soal
assets/audio/           tempat file musik latar opsional (lihat README di dalamnya)
serve.js                server statis kecil untuk pengembangan lokal
```

## Cara main
- Soal jatuh di kolom tengah; tekan jawaban yang benar **saat soal menyentuh garis**. Hanya soal terdekat dengan garis yang aktif (disorot & sedikit membesar). Garis berdenyut tiap beat.
- Pilihan jawaban berurutan kecil → besar dan nilainya berdekatan (mis. 12, 13, 14).
- Keyboard: 3 jalur `A W D`, 4 jalur `A W D F`, 5 jalur `A W D F J`. Layar sentuh/klik: ketuk kotak jawaban **atau kolom jalur di area permainan**. `Esc`/`P` = jeda.
- **Sempurna** ±100 ms, **Bagus** ±250 ms, **Telat** ±400 ms (benar tapi kurang pas, baik terlalu cepat maupun terlambat: poin berkurang, combo tidak putus). Salah atau soal lewat tanpa dijawab = "Kepeleset": combo putus, nyawa −1.
- **Kecepatan** (sama untuk semua level, dipilih di menu dengan simbol not): 60 BPM poin ×0,25 · 80 BPM ×0,5 · 100 BPM ×1 · 120 BPM ×1,5. Pengali ini dikalikan dengan pengali combo. **120 BPM terkunci** (pudar, dengan petunjuk "Kamu harus menuntaskan tahap 6") sampai pemain menamatkan satu level (menang, bukan kalah); buka langsung dengan `?unlock=all`. Kunci ini diatur lewat `locked` di `difficulties[]` pada `js/config.js`.
- Level 1–5: ketiga pilihan jawaban **berakhiran angka sama** (mis. 45, 65, 15; jawaban salah = jawaban benar ± kelipatan 10), jadi tidak bisa ditebak dari angka belakang.
- Level Pecahan dan Desimal memakai 3 pilihan jawaban, dan ketiganya **berakhiran sama** supaya tidak bisa ditebak dari angka belakang: desimal memiliki digit terakhir yang sama (mis. 5,37 / 5,47 / 5,57), pecahan memiliki penyebut yang sama (mis. 3/8, 5/8, 7/8).
- Tahap kesulitan naik berdasarkan jumlah jawaban benar (lihat `tiers`), dan ada jeda napas setelah 5–8 soal.
- Semua level terbuka sejak awal (tidak ada kunci level); "Lanjut Level" di layar hasil selalu tampil dan kembali ke level 1 setelah level terakhir.

## Semua pengaturan ada di `js/config.js`
| Topik | Kunci |
|---|---|
| Jarak antar soal (beat) | `levels[].noteEveryBeats` (4 → 3 → 2) |
| Waktu jatuh (beat) | `approachBeats` (default 4) |
| Jeda napas | `breather.{everyMin,everyMax,beatsMin,beatsMax}` |
| Jendela waktu | `windows.{perfect,good,accept}` |
| Poin / aturan combo Telat (cepat atau lambat) | `points`, `offBeat.{breaksCombo,advancesCombo}` |
| Tahap kesulitan (naik per **jumlah jawaban benar**, bukan skor) | `tiers[].{digits,correct}`, `defaultCorrect` (10) |
| Kedekatan pilihan jawaban | `distractorStep` (per tahap; kecil = lebih dekat) |
| Mode gerak | `movementMode: 'smooth' \| 'step'`, `step.moveFraction` |
| Jumlah jalur, jarak antar soal per level | `levels[].{lanes,noteEveryBeats}` |
| BPM dan pengali poin per kesulitan | `difficulties[].{bpm,scoreMult}` |
| Nyawa, combo, bintang | `lives`, `comboStep`, `maxMultiplier`, `stars` |
| Tombol keyboard & warna jalur | `keys`, `laneColors` (warna jalur merujuk variabel CSS `--c-lane-*`) |

Pintasan URL: `?mode=step`, `?mode=smooth`, `?lanes=4`, `?unlock=all`. Mode gerak bisa diganti di menu utama ("Gerakan: Halus / Per Langkah"), tetapi setiap kunjungan selalu dimulai dari **Halus** (pilihan tidak diingat).

## Mobile & layar lain
- Layout fluid (rem, `clamp()`, flex/grid, `dvh`) tanpa ukuran piksel tetap: satu CSS untuk ponsel 360 px sampai desktop 1920 px. Portrait diutamakan: ladang jatuh mengisi sisa tinggi layar, lane jawaban di bawah (zona jempol). Landscape ponsel memakai aturan `max-height: 520px` yang lebih rapat. Padding `env(safe-area-inset-*)` menghormati notch dan bar navigasi.
- Garis target dan kotak soal diukur dari layout sungguhan (`layoutMetrics()` di `js/game.js`; `layout.lineRatio` di config), dihitung ulang saat layar diputar atau diubah ukurannya. Teks soal dan jawaban yang tak muat menyusut otomatis (`--fit`).
- Sentuhan: tiap lane adalah target sentuh selebar lane penuh (kolom di ladang + pad di bawah, minimal 48 px), memakai pointer events (sentuh, mouse, dan keyboard sama-sama jalan; dua jempol sekaligus bisa). `touch-action`, `overscroll-behavior`, `user-select` dan penahan gestur zoom mencegah zoom ganda, pull-to-refresh, dan seleksi teks saat bermain.
- Audio dibuat dan dilanjutkan pada sentuhan pertama (aturan autoplay mobile). Animasi hanya memakai `transform`/`opacity`; satu frame game memakan sekitar 0,07 ms skrip.
- Batasan: iPhone dengan sakelar bisu (ringer off) membisukan Web Audio; getaran/haptik tidak dipakai.

## Level Pecahan & Desimal
- Hanya empat operasi dasar (tambah, kurang, kali, bagi). Jenis soal lain (sederhanakan, bandingkan, senilai, campuran, desimal/persen) tetap ada di `js/fractions.js` dan bisa diaktifkan lagi lewat bobot `types` di `fracTiers`.
- Pecahan ditulis dengan garis pecahan (pembilang di atas, penyebut di bawah) di soal, lane, layar review, dan kartu menu. Di data, pecahan ditulis sebagai token `{3/4}`, pecahan campuran `{2 1/3}`, angka yang dicari `{?/4}`; `NA.fmt.html()` mengubahnya menjadi tampilan bertumpuk (`js/fractions.js`).
- Jenis soal yang dipakai: penjumlahan/pengurangan (penyebut sama, lalu berbeda), perkalian, dan pembagian. Generator juga punya 7 jenis lain yang tidak dipakai secara default: menyederhanakan, membandingkan (`<` `=` `>`), pecahan senilai (`1/2 = ?/4`), campuran ↔ biasa, pecahan → desimal, pecahan → persen. Jenis dan tingkat kesulitan per tahap diatur di `levels[5].fracTiers` (penyebut, bobot jenis soal).
- Pengecoh = kesalahan umum dulu (menjumlahkan pembilang dan penyebut, lupa menyederhanakan, membalik pecahan yang salah, menulis "12/3" untuk 1 2/3), baru nilai di sekitarnya. Tidak ada dua pilihan yang bernilai sama, jadi jawaban benar selalu unik (khusus "sederhanakan": hanya satu pilihan yang sudah paling sederhana).
- Bila jenis soal perbandingan diaktifkan, jawabannya hanya 3 (`<` `=` `>`), jadi lane ke-4 dikosongkan (diredupkan, ditekan tidak berefek).
- Desimal: `levels[6].decTiers` mengatur tiap tahap (digit bagian bulat, jumlah desimal, pengurangan, desimal berbeda-beda).
- Pecahan dan Desimal memakai 4 ketukan per soal (`noteEveryBeats: 4`) karena soalnya butuh waktu berpikir lebih lama; ubah di `js/config.js` bila perlu.
- Tes: `http://localhost:8123/tests/problems-test.html` menghitung ulang jawaban setiap soal dengan aritmetika pecahan eksak dan memastikan tepat satu pilihan yang benar (49.000 soal, semua level).

## Sistem suara
Tiga lapisan suara di mesin audio, dengan dua kontrol di layar (tombol bisu + slider volume; tombol "Suara" di menu utama dan layar Jeda). Slider **Efek** mengatur lapisan **nada** dan **efek** sekaligus:
- **Musik**: lagu sungguhan di `assets/audio/` untuk **80, 100, dan 120 BPM**; semua level memakai lagu sesuai kecepatan yang dipilih. **60 BPM belum punya lagu** (nanti diganti lagu dari Suno): untuk sementara dimainkan backing sintesis bawaan yang dibuat dari `style` + `chords` tiap level.
- **Nada**: jawaban benar = **satu nada pendek** (selalu nada yang sama, langsung bunyi). Jawaban salah = nada fals satu semitone di bawahnya. Soal yang terlewat = bunyi "tuk" tanpa nada dan nada yang sedang berdering dibungkam.
- **Efek**: bunyi hover dan klik tombol di menu utama (tick pendek saat kursor masuk, "pop" saat klik, arpeggio naik untuk tombol Main!), klik menu, dan jingle akhir level.
- **BGM menu utama**: loop synth sederhana (C – Am – F – G, 92 BPM: pad lembut, bass, arpeggio, ketukan tipis) yang berjalan di bawah slider **Musik**. Mulai setelah klik atau tombol pertama (browser memblokir suara otomatis sebelum itu), berhenti saat game dimulai, dan menyala lagi saat kembali ke menu.

Cara lagu dipasangkan ke game: jam ketukan game berjalan tepat di BPM kesulitan, sedangkan lagu hasil AI biasanya sedikit meleset dari BPM namanya. Karena itu tiap lagu di `js/music.js` (`songs`) punya `fileBpm` (tempo asli hasil ukur) dan `offsetSec` (posisi ketukan pertama di dalam file). Lagu diputar dengan perubahan kecepatan sangat kecil (BPM ÷ fileBpm, sekitar 1–2 %) supaya ketukannya jatuh persis di grid game, dan di-loop per birama penuh. Angka-angka itu diukur dengan `tests/beat-analyzer.html`; bila lagu terasa terlalu cepat/lambat dari soal yang jatuh, geser `offsetSec` (detik) di `js/music.js`.

| Pengaturan di `js/music.js` | Arti |
|---|---|
| `songs[bpm]` | `src` (file mp3), `fileBpm` (tempo asli lagu), `offsetSec` (ketukan pertama di file) |
| `correct` | nada tunggal jawaban benar: `midi` (84 = C6), `inst` (`bell`, `marimba`, `glass`, `pluck`), `sec` |
| `compensateOutputLatency` | `false` (default): garis target mengikuti waktu audio terjadwal. `true`: garis mengikuti suara yang terdengar |
| `wrong.*`, `duckBeats` | seberapa fals/keras nada salah, dan berapa lama nada dibungkam setelah kesalahan |
| `tracks[n]` | `style` + `chords` backing sintesis cadangan, dipakai hanya bila lagu gagal dimuat |

Lagu (3,3–3,6 MB tiap file) dimuat saat tombol **Main** ditekan (atau lebih awal, saat kesulitan dipilih); selama itu tombol menampilkan "Memuat musik…". Bila gagal dimuat dalam 15 detik, game jalan dengan backing sintesis.

### Uji audio otomatis
Buka `http://localhost:8123/tests/audio-test.html` (setelah `node serve.js`). Halaman ini me-render bunyinya secara offline lalu menganalisis sampel audionya: jawaban benar selalu satu nada yang sama dan tepat di waktunya, nada salah satu semitone di bawahnya, nada dibungkam setelah soal terlewat, backing sintesis cadangan tepat di grid dan tanpa clipping, serta ketiga lagu terdaftar dan filenya ada.

### Mengganti lagu
Taruh file mp3 baru di `assets/audio/`, ukur tempo dan ketukan pertamanya dengan `tests/beat-analyzer.html` (isi daftar nama file di bagian atas skripnya), lalu perbarui `src`, `fileBpm`, dan `offsetSec` di `js/music.js`. Game harus dibuka lewat server (`node serve.js`), bukan `file://`.

## Tampilan
UI mengikuti desain Figma "Alat Peraga Digital" bagian "Pop Play" (latar krem, outline tebal gelap, bayangan datar, aksen oranye). Semua token (warna, font, radius, outline, bayangan) ada di satu blok `:root` pada `css/style.css`. Ikon memakai Lucide (SVG inline di `js/ui.js`). Font: Rubik (angka, judul) dan Fredoka One (tombol, nama level) dari Google Fonts. Badge penilaian menampilkan poin + penilaian, mis. "+100 SEMPURNA!".

Garis pemisah jalur berupa deretan not kecil yang samar (satu not, lalu sepasang not balok) dan bergerak turun secepat soal jatuh, jadi mengikuti BPM (berhenti saat jeda); garis target punya zona merah transparan di bawahnya. Judul menu dan kartu level punya animasi (dimatikan jika perangkat meminta *reduced motion*).
