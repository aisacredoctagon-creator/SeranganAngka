/*
 * Music data, one track per level (same order as CONFIG.levels).
 *
 * How the sound works
 *  - BACKING (drums, bass, harmony) plays all the time at the game's BPM.
 *  - MELODY is played BY THE PLAYER: every correct answer plays the next note of `melody`,
 *    snapped to the beat grid (see `quantize`). A wrong answer plays an out-of-key note and does
 *    NOT advance the melody. A missed problem mutes the melody briefly and does not advance it.
 *  - Melody notes are written as "NOTE[:beats]" (default length = `noteBeats`), e.g. "E5 G5:3 A5".
 *    All melodies use the PENTATONIC scale of the track's key, so any note sounds good over any
 *    chord of the progression no matter when the player happens to play it.
 *
 * Replacing the synth backing with real audio (e.g. ElevenLabs) later - see README.md:
 *    files: { 60: { src: 'assets/audio/level1-60bpm.mp3', loopBeats: 16, offsetSec: 0 } }
 *  The key is the BPM the file was made at; the game uses it when it is played at exactly that BPM
 *  and falls back to the synth backing otherwise. `key` + `chords` below must match the audio.
 */
window.NA = window.NA || {};

NA.MUSIC = {
  quantize: {
    gridBeats: 0.5,          // melody notes land on this grid (in beats): 0.5 = eighth notes, 1 = beats
    lateToleranceMs: 50,     // pressed up to this late after a grid point? play at once; later than that waits for the next grid point
  },
  // false = the on-screen beat follows the scheduled audio time. The problem reaches the line at the moment the
  //         beat is scheduled; the sound itself reaches your ears a little later (device output latency, ~10-50 ms,
  //         more on Bluetooth). A press made when the problem reaches the line then lines the melody up with the
  //         backing exactly, and judging does not depend on the audio device. (default)
  // true  = the on-screen beat matches what you HEAR (visuals are delayed by the output latency). Melody notes
  //         then sound about one output latency behind the backing.
  compensateOutputLatency: false,
  wrong: {
    detuneCents: 35,         // how far the wrong note is pulled out of tune
    gain: 0.4,               // loudness (kept soft so it is clearly wrong but not painful)
    immediate: true,         // true = sound right away; false = snap to the grid like correct notes
  },
  duckBeats: { wrong: 0.75, miss: 0.5 },   // how long the melody layer is muted after a mistake
  volumeDefaults: { music: 0.8, melody: 1, sfx: 0.9 },

  tracks: [
    {
      name: 'Penjumlahan', key: 'C', mode: 'major', style: 'pop', lead: 'bell', noteBeats: 2,
      chords: ['C', 'Am', 'F', 'G'],
      melody: 'C5 E5 G5 E5 A5 G5 E5 D5:3  C5 E5 G5 E5 A5 C6 A5 G5:3  A5 G5 E5 G5 A5 G5 E5 D5:3  E5 D5 C5 D5 E5 G5 E5 C5:4',
      files: {},
    },
    {
      name: 'Perkalian', key: 'G', mode: 'major', style: 'funk', lead: 'marimba', noteBeats: 2,
      chords: ['G', 'Em', 'C', 'D'],
      melody: 'D5 G5 B5 G5 A5 G5 E5 D5:3  D5 G5 B5 D6 B5 A5 G5 E5:3  E5 G5 A5 G5 E5 D5 E5 G5  A5 G5 E5 D5 B4 D5 E5 G5:4',
      files: {},
    },
    {
      name: 'Pengurangan', key: 'A', mode: 'minor', style: 'chill', lead: 'glass', noteBeats: 3,
      chords: ['Am', 'F', 'C', 'G'],
      melody: 'A4 C5 E5 D5 C5 A4 C5 E5:4  A5 G5 E5 D5 C5 D5 E5 C5:4  E5 G5 A5 G5 E5 D5 C5 D5  E5 D5 C5 A4 C5 D5 E5 A4:4',
      files: {},
    },
    {
      name: 'Pembagian', key: 'F', mode: 'major', style: 'disco', lead: 'pluck', noteBeats: 2,
      chords: ['F', 'Dm', 'Bb', 'C'],
      melody: 'F5 A5 C6 A5 G5 F5 D5 F5:3  A5 C6 D6 C6 A5 G5 A5 F5:3  D5 F5 G5 A5 G5 F5 D5 C5  D5 F5 A5 G5 F5 D5 C5 F5:4',
      files: {},
    },
    {
      name: 'Campur', key: 'D', mode: 'major', style: 'rock', lead: 'marimba', noteBeats: 2,
      chords: ['D', 'Bm', 'G', 'A'],
      melody: 'D5 F#5 A5 F#5 B5 A5 F#5 E5:3  D5 F#5 A5 B5 D6 B5 A5 F#5:3  B5 A5 F#5 A5 B5 A5 F#5 E5  F#5 E5 D5 E5 F#5 A5 F#5 D5:4',
      files: {},
    },
    {
      name: 'Pecahan', key: 'E', mode: 'minor', style: 'chill', lead: 'bell', noteBeats: 2,
      chords: ['Em', 'C', 'G', 'D'],
      melody: 'E5 G5 B5 A5 G5 E5 G5 B5:3  D6 B5 A5 G5 E5 G5 A5 E5:3  A5 B5 D6 B5 A5 G5 E5 G5  B5 A5 G5 E5 D5 E5 G5 E5:4',
      files: {},
    },
    {
      name: 'Desimal', key: 'Bb', mode: 'major', style: 'disco', lead: 'glass', noteBeats: 2,
      chords: ['Bb', 'Gm', 'Eb', 'F'],
      melody: 'Bb4 D5 F5 D5 G5 F5 D5 C5:3  Bb4 D5 F5 G5 Bb5 G5 F5 D5:3  G5 F5 D5 F5 G5 F5 D5 C5  D5 C5 Bb4 C5 D5 F5 D5 Bb4:4',
      files: {},
    },
  ],
};
