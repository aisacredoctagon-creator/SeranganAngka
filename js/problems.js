/*
 * Problem generator. NA.makeProblem(levelIndex, digitTier, lanes)
 *   digitTier = 0..4 (index into CONFIG.tiers; the "mix" tier is resolved by the game)
 * -> { text, options: [string x lanes, sorted low -> high], correct: index, answer: string, solution: string }
 *
 * Strings may contain fraction tokens such as {3/4} or {2 1/3}; render them with NA.fmt.html (js/fractions.js).
 * Whole-number and decimal levels: answer choices are a tight cluster around the right answer (e.g. 12, 13, 14)
 * with the right answer at a random position; the gap comes from CONFIG.distractorStep.
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
  function assemble(text, ans, lanes, step, fmt) {
    const vals = cluster(ans, lanes, step, 0);
    const options = vals.map(fmt);
    return { text, options, correct: vals.indexOf(ans), answer: fmt(ans) };
  }

  const gens = {
    add(L, t, lanes, step) {
      const [big, small] = digitsOf(L, t);
      let a = num(big), b = num(small);
      if (Math.random() < 0.5) [a, b] = [b, a];
      return assemble(`${a} + ${b}`, a + b, lanes, step, String);
    },
    sub(L, t, lanes, step) {
      const [big, small] = digitsOf(L, t);
      let a, b;
      do { a = num(big); b = num(small); } while (a === b);
      if (a < b) [a, b] = [b, a];
      return assemble(`${a} − ${b}`, a - b, lanes, step, String);
    },
    mul(L, t, lanes, step) {
      const [big, small] = digitsOf(L, t);
      let a = num(big, 2), b = num(small, 2);
      if (Math.random() < 0.5) [a, b] = [b, a];
      return assemble(`${a} × ${b}`, a * b, lanes, step, String);
    },
    div(L, t, lanes, step) {
      const [big, small] = digitsOf(L, t);
      const q = num(big, 2), d = num(small, 2);
      return assemble(`${q * d} ÷ ${d}`, q, lanes, step, String);
    },

    // Decimals: CONFIG.levels[n].decTiers[t] = { ints, places, types } - see config.js.
    // Whole parts of 1 digit may be 0 (0.32 + 0.67). Operands never end in a zero (3.40 would read as 3.4).
    dec(L, t, lanes, step) {
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
        const vals = cluster(ans, lanes, step * pow(maxP - 1), 0);        // a "step" is always 0.1
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
      const unit = pow(P - 1);                                            // 0.1 in units of 10^-P
      const mkOpt = (n, sc) => ({ n, sc, v: n / pow(sc), key: Math.round(n * pow(5 - sc)) });
      const answer = mkOpt(ans, P);
      const opts = cluster(ans, lanes, step * unit, Math.min(unit, ans)).map((n) => (n === ans ? answer : mkOpt(n, P)));
      // one wrong choice is the classic slip: decimal point in the wrong place (x10 or /10)
      const slips = [mkOpt(ans * 10, P), P < 4 ? mkOpt(ans, P + 1) : null].filter(Boolean);
      const slip = pick(slips);
      const swap = opts.map((o, i) => (o === answer ? -1 : i)).filter((i) => i >= 0);
      if (!opts.some((o) => o.key === slip.key)) opts[pick(swap)] = slip;
      if (!opts.includes(answer)) throw new Error('answer outside the choices: ' + text);
      opts.sort((x, y) => x.v - y.v);
      const fmtO = (o) => {                                               // never fewer than P places, never trailing extras
        let { n, sc } = o;
        while (sc > P && n % 10 === 0) { n /= 10; sc--; }
        return (n / pow(sc)).toFixed(sc);
      };
      return { text, options: opts.map(fmtO), correct: opts.indexOf(answer), answer: fmtO(answer) };
    },

    frac: (L, t, lanes) => NA.fractionProblem(L, t, lanes),
  };

  NA.makeProblem = function (levelIndex, digitTier, lanes) {
    const levels = NA.CONFIG.levels;
    let L = levels[levelIndex];
    if (L.type === 'mix') L = levels[pick(L.mixOf)];
    const step = NA.CONFIG.distractorStep[digitTier] || 1;
    const p = gens[L.type](L, digitTier, lanes, step);
    if (!p.solution) p.solution = `${p.text} = ${p.answer}`;       // sentence shown on the review screen
    return p;
  };
})();
