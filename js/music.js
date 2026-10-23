/*
 * Music data.
 *
 * How the sound works
 *  - The BACKING is a real song (assets/audio/*.mp3), one per tempo: 80, 100 and 120 BPM. Every level uses the song of the
 *    chosen speed (see `songs` below). 60 BPM has no song yet (a Suno track will be added later): for now the built-in
 *    synth backing made from each track's `style` / `chords` plays at 60 BPM.
 *  - A correct answer plays ONE short note (`correct`). A wrong answer plays a flat, detuned note a semitone below it.
 *    A missed problem plays a soft thud and silences the ringing note.
 *  - If a song cannot be loaded the game falls back to a built-in synth backing made from each track's
 *    `style` / `chords` (the `tracks` list, same order as CONFIG.levels).
 *
 * Fitting a song to the game: the game's beat clock runs at exactly the BPM of the difficulty, so each song entry says
 *    fileBpm   = the tempo the song REALLY has (measured; AI-made songs are often 1-2 % off their label). The song is
 *                played at a tiny speed change (BPM / fileBpm) so its beats stay on the game's beat grid.
 *    offsetSec = where the first beat sits inside the file; the song starts there on beat 0 of the game.
 *  Both were measured with tests/beat-analyzer.html. If a song feels early or late, nudge offsetSec (seconds).
 */
window.NA = window.NA || {};

NA.MUSIC = {
  songs: {
    80:  { src: 'assets/audio/80bpm.mp3',  fileBpm: 81.705,  offsetSec: 0.108 },
    100: { src: 'assets/audio/100bpm.mp3', fileBpm: 100.99,  offsetSec: 0.115 },
    120: { src: 'assets/audio/120bpm.mp3', fileBpm: 121.43,  offsetSec: 0.14 },
  },
  correct: { midi: 84, inst: 'bell', sec: 0.45 },   // the single note a correct answer plays (C6)
  // false = the on-screen beat follows the scheduled audio time. The problem reaches the line at the moment the
  //         beat is scheduled; the sound itself reaches your ears a little later (device output latency, ~10-50 ms,
  //         more on Bluetooth). A press made when the problem reaches the line then lines the melody up with the
  //         backing exactly, and judging does not depend on the audio device. (default)
  // true  = the on-screen beat matches what you HEAR (visuals are delayed by the output latency).
  compensateOutputLatency: false,
  wrong: {
    detuneCents: 35,         // how far the wrong note is pulled out of tune
    gain: 0.4,               // loudness (kept soft so it is clearly wrong but not painful)
  },
  duckBeats: { wrong: 0.75, miss: 0.5 },   // how long the note layer is muted after a mistake
  volumeDefaults: { music: 0.8, melody: 1, sfx: 0.9 },

  tracks: [
    {
      name: 'Penjumlahan', key: 'C', style: 'pop',
      chords: ['C', 'Am', 'F', 'G'],
    },
    {
      name: 'Perkalian', key: 'G', style: 'funk',
      chords: ['G', 'Em', 'C', 'D'],
    },
    {
      name: 'Pengurangan', key: 'A', style: 'chill',
      chords: ['Am', 'F', 'C', 'G'],
    },
    {
      name: 'Pembagian', key: 'F', style: 'disco',
      chords: ['F', 'Dm', 'Bb', 'C'],
    },
    {
      name: 'Campur', key: 'D', style: 'rock',
      chords: ['D', 'Bm', 'G', 'A'],
    },
    {
      name: 'Pecahan', key: 'E', style: 'chill',
      chords: ['Em', 'C', 'G', 'D'],
    },
    {
      name: 'Desimal', key: 'Bb', style: 'disco',
      chords: ['Bb', 'Gm', 'Eb', 'F'],
    },
  ],
};
