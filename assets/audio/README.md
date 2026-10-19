# Folder aset audio

Taruh file musik latar (backing) di sini, lalu daftarkan di `js/music.js` pada `tracks[n].files`.
Selama folder ini kosong, game memakai backing sintesis bawaan (Web Audio), jadi tidak ada yang rusak.

Penamaan yang disarankan: `L<level>-<bpm>bpm.mp3`, mis. `L1-100bpm.mp3`.

Tiap file harus:
- **instrumental, tanpa melodi utama** (melodi dimainkan pemain lewat jawaban benar) dan tanpa vokal,
- **tempo tepat** sesuai BPM di nama file, birama 4/4, jumlah birama bulat (mis. 8 birama = 32 beat) supaya bisa di-loop mulus,
- **kunci dan chord sama** dengan `key` dan `chords` track level itu di `js/music.js`,
- dimulai tepat di ketukan pertama (kalau ada hening di awal, isi `offsetSec`).

Pendaftaran (contoh Level 1, tempo 100 BPM):

```js
files: { 100: { src: 'assets/audio/L1-100bpm.mp3', loopBeats: 32, offsetSec: 0 } }
```

File dipakai hanya bila game dimainkan tepat pada BPM itu; BPM lain tetap memakai backing sintesis.
Game harus dibuka lewat server (`node serve.js`), bukan dengan klik dua kali `index.html`, karena browser memblokir pemuatan file audio dari `file://`.
