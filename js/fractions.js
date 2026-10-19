/*
 * Fraction notation + fraction problem generator.
 *
 * NOTATION. Problems and answers are plain strings; a fraction is written as a token:
 *     {3/4}  = three-quarters       {2 1/3} = two and one third       {?/4} = missing numerator
 * NA.fmt.html(str)  turns tokens into a proper stacked fraction (numerator, bar, denominator) via HTML/CSS
 * NA.fmt.plain(str) gives readable text ("3/4", "2 1/3") for aria labels and tests.
 *
 * PROBLEM TYPES (chosen per tier with the weights in CONFIG.levels[n].fracTiers[t].types):
 *   addSame subSame     same denominators
 *   addUnlike subUnlike different denominators (related ones first, e.g. 1/2 + 1/4)
 *   mul div             fraction x fraction / whole number, fraction / fraction / whole number
 *   simplify            reduce to lowest terms
 *   compare             < = >   (only 3 answers, so a 4th lane stays empty)
 *   equiv               1/2 = ?/4   (or a missing denominator)
 *   mixedToImproper improperToMixed
 *   toDecimal toPercent
 *
 * DISTRACTORS are common mistakes first (adding numerators AND denominators, forgetting to simplify,
 * inverting the wrong fraction, ...), then near neighbours. No two options ever have the same value
 * (except for "simplify", where only ONE option is in lowest terms), so exactly one answer is right.
 */
(function () {
  const NA = window.NA;

  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[rand(0, arr.length - 1)];
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const red = (n, d) => { const g = gcd(n, d); return [n / g, d / g]; };
  const rk = (n, d) => { const [a, b] = red(n, d); return `${a}/${b}`; };            // value key: equal values -> equal keys
  const weighted = (w) => {
    const entries = Object.entries(w);
    let r = Math.random() * entries.reduce((s, e) => s + e[1], 0);
    for (const [k, v] of entries) { if ((r -= v) < 0) return k; }
    return entries[0][0];
  };

  // ------------------------------------------------------------------ notation
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const TOKEN = /\{(?:(\d+) )?([\d?]+)\/([\d?]+)\}/g;
  function fracHtml(w, n, d) {
    const f = `<span class="fr"><span class="fn${n === '?' ? ' q' : ''}">${n}</span><span class="fd${d === '?' ? ' q' : ''}">${d}</span></span>`;
    return w ? `<span class="mx"><span class="mw">${w}</span>${f}</span>` : f;
  }
  NA.fmt = {
    html(s) {
      let out = '', last = 0, m;
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(s))) {
        out += esc(s.slice(last, m.index)) + fracHtml(m[1], m[2], m[3]);
        last = m.index + m[0].length;
      }
      return out + esc(s.slice(last));
    },
    plain: (s) => s.replace(TOKEN, (_, w, n, d) => `${w ? w + ' ' : ''}${n}/${d}`),
    hasFraction: (s) => s.indexOf('{') >= 0,
  };

  const tf = (n, d) => (d === 1 ? String(n) : `{${n}/${d}}`);                     // fraction token (whole number if d = 1)

  // option objects: tok = what is shown, val = number (for sorting), key = identity of its VALUE
  const fo = (n, d) => ({ tok: tf(n, d), val: n / d, key: rk(n, d) });
  const mo = (w, n, d) => ({ tok: n === 0 ? String(w) : `{${w} ${n}/${d}}`, val: w + n / d, key: rk(w * d + n, d) });
  const trim = (x) => String(+x.toFixed(4));
  const no = (x) => ({ tok: String(x), val: x, key: String(x) });
  const dco = (x) => ({ tok: trim(x), val: x, key: trim(x) });
  const pco = (x) => ({ tok: `${trim(x)}%`, val: x, key: `${trim(x)}%` });
  // neighbours of a fraction answer an/ad: (an-1)/ad, (an+1)/ad, (an-2)/ad ...
  const nbr = (an, ad) => (g) => {
    const delta = 1 + (g >> 1), n = an + (g % 2 ? -delta : delta);
    return fo(n > 0 ? n : an + delta, ad);
  };

  function build(text, ans, cands, filler, lanes, extra) {
    extra = extra || {};
    const keyOf = extra.keyOf || ((o) => o.key);
    const seen = new Set([keyOf(ans)]);
    const wrong = [];
    const add = (c) => {
      if (!c || wrong.length >= lanes - 1) return;
      if (!(c.val > 0) || !isFinite(c.val)) return;
      if (extra.minVal && c.val < extra.minVal) return;
      const k = keyOf(c);
      if (seen.has(k)) return;
      seen.add(k);
      wrong.push(c);
    };
    shuffle(cands.filter(Boolean)).forEach(add);                                   // common mistakes first...
    for (let g = 0; wrong.length < lanes - 1 && g < 400; g++) add(filler(g));        // ...then near neighbours
    if (wrong.length < lanes - 1) throw new Error(`no options for: ${text}`);
    const opts = [ans, ...wrong];
    opts.forEach((o) => { o.t = Math.random(); });
    opts.sort((a, b) => a.val - b.val || a.t - b.t);                               // low -> high, like the other levels
    const p = { text, options: opts.map((o) => o.tok), correct: opts.indexOf(ans), answer: ans.tok, meta: extra.meta };
    if (extra.solution) p.solution = extra.solution;
    return p;
  }

  const properFrac = (dens) => { const d = pick(dens); return [rand(1, d - 1), d]; };
  // two different denominators; `related` = one is a multiple of the other (1/2 + 1/4)
  function denPair(P) {
    for (let g = 0; g < 60; g++) {
      const d1 = pick(P.dens);
      const pool = P.dens.filter((x) => x !== d1 && (!P.related || x % d1 === 0 || d1 % x === 0));
      if (pool.length) return [d1, pick(pool)];
    }
    const d1 = pick(P.dens);
    return [d1, pick(P.dens.filter((x) => x !== d1))];
  }

  // ------------------------------------------------------------------ the problem types
  const FT = {
    addSame(P, lanes) {
      const d = pick(P.dens);
      let a, b;
      do { a = rand(1, d - 1); b = rand(1, d - 1); } while (P.noImproper && a + b > d);
      const [an, ad] = red(a + b, d);
      return build(`${tf(a, d)} + ${tf(b, d)}`, fo(an, ad),
        [fo(a + b, d + d), fo(a * b, d), fo(Math.abs(a - b) || 1, d), fo(a + b, d + 1)], nbr(an, ad), lanes,
        { meta: { type: 'addSame' } });
    },

    subSame(P, lanes) {
      const d = pick(P.dens.filter((x) => x >= 3));
      const a = rand(2, d - 1), b = rand(1, a - 1);
      const [an, ad] = red(a - b, d);
      return build(`${tf(a, d)} − ${tf(b, d)}`, fo(an, ad),
        [fo(a + b, d), fo(a - b, d + d), fo(a - b, d - 1), fo(b, d)], nbr(an, ad), lanes, { meta: { type: 'subSame' } });
    },

    addUnlike(P, lanes) {
      const [d1, d2] = denPair(P);
      const a = rand(1, d1 - 1), b = rand(1, d2 - 1);
      const [an, ad] = red(a * d2 + b * d1, d1 * d2);
      return build(`${tf(a, d1)} + ${tf(b, d2)}`, fo(an, ad),
        [fo(a + b, d1 + d2), fo(a + b, d1 * d2), fo(a + b, Math.max(d1, d2)), fo(a * d2 + b * d1, d1 + d2)],
        nbr(an, ad), lanes, { meta: { type: 'addUnlike' } });
    },

    subUnlike(P, lanes) {
      let d1, d2, a, b;
      for (let g = 0; g < 100; g++) {
        [d1, d2] = denPair(P);
        a = rand(1, d1 - 1); b = rand(1, d2 - 1);
        if (a * d2 > b * d1) break;
        if (g === 99) { [a, b, d1, d2] = [b, a, d2, d1]; if (a * d2 <= b * d1) throw new Error('subUnlike'); }
      }
      const [an, ad] = red(a * d2 - b * d1, d1 * d2);
      return build(`${tf(a, d1)} − ${tf(b, d2)}`, fo(an, ad),
        [fo(Math.abs(a - b) || 1, Math.abs(d1 - d2)), fo(Math.abs(a - b) || 1, d1 * d2), fo(a * d2 - b * d1, d1 + d2), fo(a + b, d1 * d2)],
        nbr(an, ad), lanes, { meta: { type: 'subUnlike' } });
    },

    mul(P, lanes) {
      if (Math.random() < 0.35) {                                   // fraction x whole number
        const [a, b] = properFrac(P.dens), n = rand(2, 6);
        const [an, ad] = red(a * n, b);
        return build(`${tf(a, b)} × ${n}`, fo(an, ad),
          [fo(a * n, b * n), fo(a, b * n), fo(a + n, b), fo(a * n, b + n)], nbr(an, ad), lanes, { meta: { type: 'mul' } });
      }
      const [a, b] = properFrac(P.dens), [c, d] = properFrac(P.dens);
      const [an, ad] = red(a * c, b * d);
      return build(`${tf(a, b)} × ${tf(c, d)}`, fo(an, ad),
        [fo(a * c, b + d), fo(a + c, b + d), fo(a * c, b), fo(a * d, b * c)], nbr(an, ad), lanes, { meta: { type: 'mul' } });
    },

    div(P, lanes) {
      if (Math.random() < 0.3) {                                    // fraction / whole number
        const [a, b] = properFrac(P.dens), n = rand(2, 5);
        const [an, ad] = red(a, b * n);
        return build(`${tf(a, b)} ÷ ${n}`, fo(an, ad),
          [fo(a * n, b), fo(a, b + n), fo(a + n, b * n), fo(a * n, b * n)], nbr(an, ad), lanes, { meta: { type: 'div' } });
      }
      const [a, b] = properFrac(P.dens), [c, d] = properFrac(P.dens);
      const [an, ad] = red(a * d, b * c);
      return build(`${tf(a, b)} ÷ ${tf(c, d)}`, fo(an, ad),
        [fo(a * c, b * d), fo(b * c, a * d), fo(a * d, b + c), fo(a + d, b * c)], nbr(an, ad), lanes, { meta: { type: 'div' } });
    },

    // Only ONE option is in lowest terms (the answer). Half-simplified and unsimplified forms are
    // equal in value but not simplified - classic mistakes - so options are told apart by their text.
    simplify(P, lanes) {
      let a, b;
      do { [a, b] = properFrac(P.dens); } while (gcd(a, b) !== 1);
      const k = rand(2, P.kMax);
      const cands = [fo(a * k, b * k), fo(a, b + 1), fo(a + 1, b), fo(a, b * k), fo(a * k, b + k)];
      for (let f = 2; f < k; f++) if (k % f === 0) cands.push(fo(a * (k / f), b * (k / f)));   // simplified only part-way
      return build(`Sederhanakan ${tf(a * k, b * k)}`, fo(a, b), cands, nbr(a, b), lanes,
        { keyOf: (o) => o.tok, meta: { type: 'simplify' }, solution: `${tf(a * k, b * k)} = ${tf(a, b)}` });
    },

    compare(P, lanes) {
      const mode = weighted(P.compareModes || { general: 1 });
      let a, b, c, d;
      if (mode === 'sameDen') {
        d = pick(P.dens.filter((x) => x >= 3)); b = d;
        do { a = rand(1, d - 1); c = rand(1, d - 1); } while (a === c);
      } else if (mode === 'sameNum') {
        a = c = rand(1, 3);
        const pool = P.dens.filter((x) => x > a);
        b = pick(pool);
        do { d = pick(pool); } while (d === b && pool.length > 1);
        if (d === b) throw new Error('sameNum');
      } else if (mode === 'equal') {
        [a, b] = properFrac(P.dens);
        const k = rand(2, Math.max(2, Math.min(P.kMax, 4)));
        c = a * k; d = b * k;
      } else {
        do { [a, b] = properFrac(P.dens); [c, d] = properFrac(P.dens); } while (a * d === c * b);
      }
      if (Math.random() < 0.5) [a, b, c, d] = [c, d, a, b];
      const sym = a * d < c * b ? '<' : a * d > c * b ? '>' : '=';
      const options = ['<', '=', '>'];
      return {
        text: `${tf(a, b)} ? ${tf(c, d)}`, options, correct: options.indexOf(sym), answer: sym,
        solution: `${tf(a, b)} ${sym} ${tf(c, d)}`, meta: { type: 'compare' },
      };
    },

    equiv(P, lanes) {
      const [a, b] = properFrac(P.dens);
      const k = rand(2, P.kMax);
      if (P.equivDen && Math.random() < 0.4) {                      // 3/4 = 9/?
        const ans = b * k;
        return build(`${tf(a, b)} = {${a * k}/?}`, no(ans),
          [no(b + (a * k - a)), no(a * k), no(b + k), no(ans + 1), no(ans - 1)], (g) => no(ans + (g % 2 ? -1 : 1) * (1 + (g >> 1))), lanes,
          { meta: { type: 'equiv' }, solution: `${tf(a, b)} = ${tf(a * k, b * k)}` });
      }
      const ans = a * k;                                            // 1/2 = ?/4
      return build(`${tf(a, b)} = {?/${b * k}}`, no(ans),
        [no(a + (b * k - b)), no(b * k), no(a + k), no(ans + 1), no(ans - 1)], (g) => no(ans + (g % 2 ? -1 : 1) * (1 + (g >> 1))), lanes,
        { meta: { type: 'equiv' }, solution: `${tf(a, b)} = ${tf(a * k, b * k)}` });
    },

    mixedToImproper(P, lanes) {
      let n, d;
      do { d = pick(P.dens.filter((x) => x >= 2)); n = rand(1, d - 1); } while (gcd(n, d) !== 1);
      const w = rand(1, P.wMax), an = w * d + n;
      // mistakes: writing whole and numerator side by side (12/3), the numerator as the new denominator,
      // forgetting to add the numerator (w x d)/d, adding the whole twice
      return build(`{${w} ${n}/${d}} = ?`, fo(an, d),
        [fo(parseInt(`${w}${n}`, 10), d), fo(an, n), fo(w * d, d), fo(an + d, d), fo(w * n + d, d)], nbr(an, d), lanes,
        { meta: { type: 'mixedToImproper' }, minVal: 1, solution: `{${w} ${n}/${d}} = ${tf(an, d)}` });
    },

    improperToMixed(P, lanes) {
      let d, r;
      do { d = pick(P.dens.filter((x) => x >= 2)); r = rand(1, d - 1); } while (gcd(r, d) !== 1);
      const w = rand(1, P.wMax), n = w * d + r;
      const cands = [mo(w, d - r, d), mo(w + 1, r, d), mo(w - 1 >= 1 ? w - 1 : w + 2, r, d), mo(w + 1, d - r, d)];
      const filler = (g) => mo(Math.max(1, w + (g % 2 ? -1 : 1) * (1 + (g >> 2))), ((r + g) % (d - 1 || 1)) + 1, d);
      return build(`{${n}/${d}} = ?`, mo(w, r, d), cands, filler, lanes,
        { meta: { type: 'improperToMixed' }, solution: `{${n}/${d}} = {${w} ${r}/${d}}` });
    },

    toDecimal(P, lanes) {
      const b = pick(P.decDens), a = rand(1, b - 1), v = a / b;
      const cands = [dco(1 - v), dco(v / 10), dco(v * 10), dco(v + 0.1), dco(v - 0.1)];
      if (a < 10 && b < 10) cands.push(dco(parseFloat(`0.${a}${b}`)));
      return build(`${tf(a, b)} = ?`, dco(v), cands, (g) => dco(v + (g % 2 ? -1 : 1) * 0.05 * (1 + (g >> 1))), lanes,
        { meta: { type: 'toDecimal' }, solution: `${tf(a, b)} = ${trim(v)}` });
    },

    toPercent(P, lanes) {
      const b = pick(P.decDens), a = rand(1, b - 1), v = (a * 100) / b;
      const cands = [pco(100 - v), pco(v / 10), pco(v * 10), pco(v + 10), pco(v - 10), pco(parseFloat(`${a}${b}`))];
      return build(`${tf(a, b)} = ?`, pco(v), cands, (g) => pco(v + (g % 2 ? -1 : 1) * 5 * (1 + (g >> 1))), lanes,
        { meta: { type: 'toPercent' }, solution: `${tf(a, b)} = ${trim(v)}%` });
    },
  };

  // CONFIG.levels[n].fracTiers[digitTier] -> one problem
  NA.fractionProblem = function (L, tier, lanes) {
    const P = L.fracTiers[tier];
    let last;
    for (let tries = 0; tries < 20; tries++) {
      try { return FT[weighted(P.types)](P, lanes); } catch (e) { last = e; }
    }
    throw last;
  };
  NA._frac = { FT };    // for tests
})();
