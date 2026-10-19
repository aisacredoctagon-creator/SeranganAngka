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
- **Sempurna** ±100 ms, **Bagus** ±250 ms, **Cepat/Lambat** ±400 ms (benar tapi kurang pas: poin berkurang, combo tidak putus). Salah atau soal lewat tanpa dijawab = Miss: combo putus, nyawa −1.
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
| Poin / aturan combo Cepat-Lambat | `points`, `offBeat.{breaksCombo,advancesCombo}` |
| Tahap kesulitan (naik per **jumlah jawaban benar**, bukan skor) | `tiers[].{digits,correct}`, `defaultCorrect` (10) |
| Kedekatan pilihan jawaban | `distractorStep` (per tahap; kecil = lebih dekat) |
| Mode gerak | `movementMode: 'smooth' \| 'step'`, `step.moveFraction` |
| Jumlah jalur, BPM, kecepatan per level | `levels[].{lanes,bpmStage,noteEveryBeats}`, `difficulties[].bpm` |
| Nyawa, combo, bintang | `lives`, `comboStep`, `maxMultiplier`, `stars` |
| Tombol keyboard & warna jalur | `keys`, `laneColors` (warna jalur merujuk variabel CSS `--c-lane-*`) |

Pintasan URL: `?mode=step`, `?mode=smooth`, `?lanes=4`. Mode gerak juga bisa diganti di menu utama ("Gerakan: Halus / Per Langkah") dan pilihan itu diingat.

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
Tiga lapisan suara, masing-masing punya tombol bisu + slider volume (ikon speaker di menu utama, dan di layar Jeda):
- **Musik**: backing (drum, bass, harmoni) yang berjalan terus, mengikuti BPM game.
- **Melodi**: dimainkan oleh pemain. Tiap jawaban benar = nada berikutnya dari melodi level itu, dikunci ke grid ketukan (`quantize`). Jawaban benar berturut-turut membentuk melodi utuh. Jawaban salah = satu nada di luar tangga nada (bergeser satu semitone dan sedikit fals), melodi **tidak** maju dan terbisukan sebentar. Soal yang terlewat tanpa dijawab = melodi terbisukan sebentar + bunyi "tuk" tanpa nada (bukan nada fals, karena bukan jawaban yang salah), melodi tidak maju.
- **Efek**: klik menu dan jingle akhir level.

Data musik tiap level (kunci, chord, gaya backing, instrumen, urutan melodi) ada di `js/music.js`. Semua melodi memakai tangga nada pentatonik dari kunci levelnya, jadi nada mana pun terdengar serasi di atas chord mana pun, kapan pun pemain menekannya.

| Pengaturan di `js/music.js` | Arti |
|---|---|
| `quantize.gridBeats` | grid penguncian nada melodi (0.5 = nada seperdelapan) |
| `quantize.lateToleranceMs` | menekan terlambat sampai sekian ms setelah grid: nada langsung bunyi; lebih lambat: menunggu grid berikutnya |
| `compensateOutputLatency` | `false` (default): garis target mengikuti waktu audio terjadwal, melodi pas dengan backing bila ditekan saat soal menyentuh garis. `true`: garis mengikuti suara yang terdengar |
| `wrong.*`, `duckBeats` | seberapa fals/keras nada salah, dan berapa lama melodi dibisukan |
| `tracks[n].melody` | urutan nada: `"E5 G5:3 A5"` (nada[:durasi dalam beat]) |

### Uji audio otomatis
Buka `http://localhost:8123/tests/audio-test.html` (setelah `node serve.js`). Halaman ini me-render musiknya secara offline lalu menganalisis sampel audionya: ketepatan grid dan nada melodi untuk ke-7 level, nada salah selalu di luar kunci dan tidak memajukan melodi, melodi dibisukan setelah kesalahan, seluruh bunyi backing mulai tepat di grid, dan tidak ada clipping.

### Memasang backing dari ElevenLabs (atau sumber audio lain)
Connector ElevenLabs yang terpasang di sesi pembuatan hanya mendukung suara/ucapan, bukan musik. Langkah:
1. Pasang connector ElevenLabs lengkap: Settings → Connectors → Add custom connector → `https://api.elevenlabs.io/v1/mcp`.
2. Minta backing instrumental **tanpa melodi/vokal**, loop 8 birama 4/4, kunci dan chord sesuai `js/music.js`, untuk tiap level dan BPM yang dipakai (21 file: L1–L3 di 60/80/100 BPM, L4–L5 di 70/90/110, L6–L7 di 80/100/120).
3. Simpan di `assets/audio/` dan daftarkan di `tracks[n].files` (lihat `assets/audio/README.md`). Pastikan tempo file tepat; musik hasil AI sering sedikit meleset, jadi cek dan, bila perlu, stretch ke BPM persis dan potong tepat di birama.
4. Jalankan lewat `node serve.js` (bukan `file://`). Bila file gagal dimuat, game otomatis kembali ke backing sintesis.

## Tampilan
UI mengikuti desain Figma "Alat Peraga Digital" (flat modern, aksen coral). Semua token (warna, font, radius, bayangan) ada di satu blok `:root` pada `css/style.css`. Ikon memakai Lucide (SVG inline di `js/ui.js`). Font: Fredoka, Rubik, Outfit, Plus Jakarta Sans (Google Fonts).
