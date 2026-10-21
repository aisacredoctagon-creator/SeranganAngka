# Folder aset audio

Lagu latar game, satu per tempo (dipakai semua level sesuai kesulitan):

| File | Kesulitan | BPM nama | Tempo asli (hasil ukur) |
|---|---|---|---|
| `80bpm.mp3` | Mudah | 80 | ≈ 81,7 |
| `100bpm.mp3` | Sedang | 100 | ≈ 101,0 |
| `120bpm.mp3` | Susah | 120 | ≈ 121,4 |

Pendaftarannya ada di `js/music.js` (`songs`): `src`, `fileBpm` (tempo asli, dipakai untuk memutar lagu sedikit lebih lambat/cepat agar pas dengan grid game) dan `offsetSec` (posisi ketukan pertama di dalam file).

Mengganti lagu: taruh file mp3 baru di sini, ukur dengan `tests/beat-analyzer.html`, perbarui entri `songs`. Bila file gagal dimuat, game memakai backing sintesis cadangan. Game harus dibuka lewat server (`node serve.js`), bukan `file://`.
