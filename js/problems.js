/*
 * Problem generator. NA.makeProblem(levelIndex, digitTier, lanes)
 *   digitTier = 0..4 (index into CONFIG.tiers; the "mix" tier is resolved by the game)
 * -> { text, options: [string x lanes, sorted low -> high], correct: index, answer: string, solution: string }
 *
 * Strings may contain fraction tokens such as {3/4} or {2 1/3}; render them with NA.fmt.html (js/fractions.js).
 * Whole-number levels: the wrong choices are the right answer +/- a multiple of 10 (e.g. 45, 65, 15), so every choice ends
 * in the same digit and the answer cannot be guessed from it. A one-digit answer gets consecutive one-digit choices (5, 6, 7). Decimals do the same with their last decimal digit.
 * Fraction levels: js/fractions.js (many problem types, "common mistake" distractors).
 */
(function () {
  const NA = window.NA;

  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[rand(0, arr.length - 1)];
  const weighted = (w) => {
    const e = Object.entries(w);
    let r = Math.random() * e.reduce((sum, x) => sum + x[1], 0);
    for (const [k, v] of e) { if ((r -= v) < 0) return k; }
    return e[0][0];
  };

  // A random number with exactly `d` digits (1-digit numbers start at `lo1`).
  const num = (d, lo1) => (d === 1 ? rand(lo1 === undefined ? 1 : lo1, 9) : rand(Math.pow(10, d - 1), Math.pow(10, d) - 1));
  const digitsOf = (L, tier) => {
    const [big, small] = NA.CONFIG.tiers[tier].digits;
    return L.cap ? [Math.min(big, L.cap[0]), Math.min(small, L.cap[1])] : [big, small];
  };

  // Cluster of `lanes` values spaced `step` apart that contains `ans` at a random slot.
  function cluster(ans, lanes, step, minVal) {
    let start = ans - rand(0, lanes - 1) * step;
    while (start < minVal) start += step;
    return Array.from({ length: lanes }, (_, i) => start + i * step);
  }
  // One-digit answer: the choices are consecutive one-digit numbers (5, 6, 7). Otherwise the wrong choices are
  // ans +/- 10, 20, 30 ... (nearer ones more likely, never below 1), so all choices end in the same digit.
  // Sorted low -> high with the right one inside; the right one's place is picked at random first (see below).
  function sameEnding(ans, lanes) {
    if (ans <= 9 && lanes <= 9) {
      const lo = Math.max(1, ans - (lanes - 1)), hi = Math.min(ans, 10 - lanes);
      const start = rand(lo, Math.max(lo, hi));
      return Array.from({ length: lanes }, (_, i) => start + i);
    }
    // The right answer's place among the choices is chosen FIRST and uniformly (lowest / middle / highest), then the wrong
    // ones are put on the matching sides - otherwise "ans - 10, ans, ans + 10" would make the middle choice right almost always.
    const need = lanes - 1, maxBelow = Math.floor((ans - 1) / 10);
    const below = rand(0, Math.min(need, maxBelow));
    const ks = (count, limit) => {                                  // distinct multipliers of 10, nearer ones likelier
      const pool = Array.from({ length: Math.min(limit, count + 3) }, (_, i) => ({ k: i + 1, w: i + 1 + Math.random() * 1.6 }));
      return pool.sort((x, y) => x.w - y.w).slice(0, count).map((x) => x.k);
    };
    return [...ks(below, maxBelow).map((k) => ans - 10 * k), ans, ...ks(need - below, 99).map((k) => ans + 10 * k)].sort((x, y) => x - y);
  }
  function assemble(text, ans, lanes, fmt) {
    const vals = sameEnding(ans, lanes);
    return { text, options: vals.map(fmt), correct: vals.indexOf(ans), answer: fmt(ans) };
  }

  const gens = {
    add(L, t, lanes) {
      const [big, small] = digitsOf(L, t);
      let a = num(big), b = num(small);
      if (Math.random() < 0.5) [a, b] = [b, a];
      return assemble(`${a} + ${b}`, a + b, lanes, String);
    },
    sub(L, t, lanes) {
      const [big, small] = digitsOf(L, t);
      let a, b;
      do { a = num(big); b = num(small); } while (a === b);
      if (a < b) [a, b] = [b, a];
      return assemble(`${a} − ${b}`, a - b, lanes, String);
    },
    mul(L, t, lanes) {
      const [big, small] = digitsOf(L, t);
      let a = num(big, 2), b = num(small, 2);
      if (Math.random() < 0.5) [a, b] = [b, a];
      return assemble(`${a} × ${b}`, a * b, lanes, String);
    },
    div(L, t, lanes) {
      const [big, small] = digitsOf(L, t);
      const q = num(big, 2), d = num(small, 2);
      return assemble(`${q * d} ÷ ${d}`, q, lanes, String);
    },

    // Decimals: CONFIG.levels[n].decTiers[t] = { ints, places, types } - see config.js.
    // Whole parts of 1 digit may be 0 (0.32 + 0.67). Operands never end in a zero (3.40 would read as 3.4).
    // Choices are spaced one unit of the second-last digit apart, so all end in the same digit.
    dec(L, t, lanes) {
      const S = L.decTiers[t];
      const kind = weighted(S.types);
      const pow = (p) => Math.pow(10, p);
      const mk = (digits, p) => {
        const whole = digits === 1 ? rand(0, 9) : num(digits);
        let frac = rand(1, pow(p) - 1);
        if (p === 2 && frac % 10 === 0) frac += 1;
        return { whole, frac, p };
      };
      const units = (o) => o.whole * pow(o.p) + o.frac;                   // the operand in units of 10^-p
      const show = (o) => (units(o) / pow(o.p)).toFixed(o.p);
      const showU = (n, p) => (n / pow(p)).toFixed(p);
      const pointOne = () => ({ whole: 0, frac: rand(2, 9), p: 1 });      // 0.2 .. 0.9
      const mkBig = (digits, p) => { let o; do { o = mk(digits, p); } while (units(o) < pow(p - 1)); return o; };   // value >= 0.1
      const trimU = (n, p) => { while (p > 1 && n % 10 === 0) { n /= 10; p--; } return showU(n, p); };      // 2.50 -> 2.5

      if (kind === 'add' || kind === 'sub') {
        const maxP = Math.max(S.places[0], S.places[1]);
        const toMax = (o) => units(o) * pow(maxP - o.p);                  // in units of 10^-maxP
        let A = mk(S.ints[0], S.places[0]), B = mk(S.ints[1], S.places[1]);
        let text, ans;
        if (kind === 'sub') {
          while (toMax(A) === toMax(B)) B = mk(S.ints[1], S.places[1]);
          if (toMax(A) < toMax(B)) [A, B] = [B, A];
          ans = toMax(A) - toMax(B);
          text = `${show(A)} − ${show(B)}`;
        } else {
          if (Math.random() < 0.5) [A, B] = [B, A];
          ans = toMax(A) + toMax(B);
          text = `${show(A)} + ${show(B)}`;
        }
        const fmt = (x) => showU(x, maxP);
        const vals = cluster(ans, lanes, 10, 1);                          // spacing = 10 units of the last place: same last digit (5.37, 5.47, 5.57)
        return { text, options: vals.map(fmt), correct: vals.indexOf(ans), answer: fmt(ans) };
      }

      // x and / : build the problem from its answer so it always comes out exact
      let text, ans, scale;                                               // answer = ans x 10^-scale
      if (kind === 'mulWhole') {
        const A = mkBig(S.ints[0], S.places[0]), n = rand(2, 9);
        text = `${show(A)} × ${n}`; ans = units(A) * n; scale = A.p;
      } else if (kind === 'mulDec') {
        const A = mkBig(S.ints[0], S.places[0]), B = pointOne();
        text = `${show(A)} × ${show(B)}`; ans = units(A) * units(B); scale = A.p + 1;
      } else if (kind === 'divWhole') {
        const Q = mkBig(S.ints[0], S.places[0]), n = rand(2, 9);
        text = `${trimU(units(Q) * n, Q.p)} ÷ ${n}`; ans = units(Q); scale = Q.p;
      } else {                                                            // divDec
        const Q = mkBig(S.ints[0], S.places[0]), B = pointOne();
        text = `${trimU(units(Q) * units(B), Q.p + 1)} ÷ ${show(B)}`; ans = units(Q); scale = Q.p;
      }
      let P = scale;
      while (P > 1 && ans % 10 === 0) { ans /= 10; P--; }                 // 5.00 -> 5.0
      scale = P;
      const mkOpt = (n, sc) => ({ n, sc, v: n / pow(sc), key: Math.round(n * pow(5 - sc)) });
      const answer = mkOpt(ans, P);
      const opts = cluster(ans, lanes, 10, Math.min(1, ans)).map((n) => (n === ans ? answer : mkOpt(n, P)));
      const fmtO = (o) => {                                               // never fewer than P places, never trailing extras
        let { n, sc } = o;
        while (sc > P && n % 10 === 0) { n /= 10; sc--; }
        return (n / pow(sc)).toFixed(sc);
      };
      // one wrong choice is the classic slip: decimal point in the wrong place (x10 or /10) - same digits, so it ends the same too
      const slips = [P > 0 ? mkOpt(ans, P - 1) : null, P < 4 ? mkOpt(ans, P + 1) : null].filter(Boolean)
        .filter((o) => fmtO(o).slice(-1) === fmtO(answer).slice(-1));    // a slip that would end differently (87.0 vs 8.7) would give the answer away
      const slip = slips.length ? pick(slips) : null;
      // the slip replaces a choice on ITS side of the answer, so the answer keeps its (random) place among the choices
      const sideOf = (o) => (o.v > answer.v ? 1 : -1);
      const room = slip ? opts.map((o, i) => (o !== answer && sideOf(o) === sideOf(slip) ? i : -1)).filter((i) => i >= 0) : [];
      if (slip && room.length && !opts.some((o) => o.key === slip.key)) opts[pick(room)] = slip;
      if (!opts.includes(answer)) throw new Error('answer outside the choices: ' + text);
      opts.sort((x, y) => x.v - y.v);
      return { text, options: opts.map(fmtO), correct: opts.indexOf(answer), answer: fmtO(answer) };
    },

    frac: (L, t, lanes) => NA.fractionProblem(L, t, lanes),
  };

  NA.makeProblem = function (levelIndex, digitTier, lanes) {
    const levels = NA.CONFIG.levels;
    let L = levels[levelIndex];
    if (L.type === 'mix') L = levels[pick(L.mixOf)];
    const p = gens[L.type](L, digitTier, lanes);
    if (!p.solution) p.solution = `${p.text} = ${p.answer}`;       // sentence shown on the review screen
    return p;
  };
})();
