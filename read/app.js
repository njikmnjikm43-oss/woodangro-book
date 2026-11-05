/* =========================================================
   주먹 쥔 손으로 쓰다듬지 못해서 — 1장 미리 읽기
   스크롤 엔진 · 장면 · 소리
   장면의 문장과 타이밍은 story.js 에 있습니다.
   ========================================================= */
(() => {
  'use strict';

  const ST = window.STORY;
  const F = ST.lockEnd;
  const HOLD_AT = ST.holdAt;
  const END = F + ST.finaleLen;

  /* ---------- 작은 도구 ---------- */
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = t => t * t * (3 - 2 * t);
  const seg = (s, a, b) => clamp((s - a) / (b - a));
  const sseg = (s, a, b) => sm(seg(s, a, b));
  const win = (s, a, b, c, d) => sseg(s, a, b) * (1 - sseg(s, c, d));
  const curve = (s, pts) => {
    if (s <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (s <= pts[i][0]) {
        const [a, va] = pts[i - 1], [b, vb] = pts[i];
        return lerp(va, vb, sm((s - a) / (b - a || 1)));
      }
    }
    return pts[pts.length - 1][1];
  };
  const rng = seed => {
    let x = seed >>> 0 || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const f1 = v => v.toFixed(1);
  const f3 = v => v.toFixed(3);

  // 투명도 + 보이기/숨기기 (값이 바뀔 때만 DOM 갱신)
  function vis(el, o) {
    o = o < 0.002 ? 0 : o > 0.998 ? 1 : +o.toFixed(3);
    if (el._o === o) return o;
    el._o = o;
    el.style.opacity = o;
    el.style.visibility = o ? 'visible' : 'hidden';
    return o;
  }
  function op(el, o) {
    o = o < 0.002 ? 0 : +o.toFixed(3);
    if (el._o === o) return;
    el._o = o;
    el.style.opacity = o;
  }

  /* ---------- 상태 ---------- */
  const root = document.documentElement;
  const stage = $('#stage');
  const spacer = $('#spacer');
  let VW = innerWidth, VH = innerHeight, narrow = VW < 760;
  let sNow = 0, sPrev = 0, tNow = 0, tPrevMs = performance.now();
  let gateOpen = true, unlocked = false, holdDone = false;
  let holdP = 0, holding = false, nextBeat = 0, doneT = -10;
  let autoScroll = null;

  /* =========================================================
     소리 (Web Audio로 직접 합성)
     ========================================================= */
  const A = (() => {
    let ctx = null, out = null, nb = null, muted = true;
    const L = {};
    let nextClink = 0, nextChirp = 0, lastKey = 0;
    const T = () => ctx.currentTime;
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const bq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; return s; };

    function init() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      out = gain(0);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3.5;
      comp.attack.value = 0.004; comp.release.value = 0.25;
      out.connect(comp); comp.connect(ctx.destination);
      nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      buildLoops();
      return true;
    }

    function setMuted(m) {
      muted = m;
      if (m && !ctx) return;
      if (!m && !init()) return;
      if (ctx.state === 'suspended') ctx.resume();
      out.gain.setTargetAtTime(m ? 0 : 0.9, T(), 0.15);
    }

    function loop(name, base, build) {
      const g = gain(0);
      g.connect(out);
      const extra = build(g) || {};
      L[name] = Object.assign({ g, base, v: -1 }, extra);
    }

    function buildLoops() {
      loop('room', 0.05, g => {           // 집 안 공기 + 냉장고 웅웅
        const n = noise(); n.connect(bq('lowpass', 240)).connect(g); n.start();
        const o = osc('sine', 100); o.connect(gain(0.12)).connect(g); o.start();
      });
      loop('pour', 0.2, g => {            // 컵에 물 따르는 소리
        const bp = bq('bandpass', 400, 7), bp2 = bq('bandpass', 900, 5);
        const n = noise(); n.connect(bp).connect(g); n.start(0, 0.3);
        const n2 = noise(); n2.connect(bp2).connect(gain(0.5)).connect(g); n2.start(0, 1.1);
        return { f: bp, f2: bp2 };
      });
      loop('dryer', 0.2, g => {           // 헤어드라이어
        const n = noise(); n.connect(bq('highpass', 700)).connect(bq('lowpass', 6500)).connect(g); n.start(0, 0.5);
        const o = osc('sawtooth', 210); o.connect(bq('lowpass', 1100)).connect(gain(0.12)).connect(g); o.start();
      });
      loop('wind', 0.11, g => {           // 오월 바람
        const n = noise(); const lp = bq('lowpass', 520, 0.6); n.connect(lp).connect(g); n.start(0, 0.9);
        const lfo = osc('sine', 0.11); lfo.connect(gain(280)).connect(lp.frequency); lfo.start();
      });
      loop('cafe', 0.05, g => {           // 카페 공기
        const n = noise(); n.connect(bq('lowpass', 380)).connect(g); n.start(0, 1.3);
        const o = osc('sine', 120); o.connect(gain(0.08)).connect(g); o.start();
      });
      loop('night', 0.06, g => {          // 여름밤
        const n = noise(); n.connect(bq('lowpass', 170)).connect(g); n.start(0, 0.2);
      });
      loop('pad', 0.045, g => {           // 마지막 화음
        const lp = bq('lowpass', 1100, 0.5); const trem = gain(1);
        lp.connect(trem).connect(g);
        const lfo = osc('sine', 0.09); lfo.connect(gain(0.18)).connect(trem.gain); lfo.start();
        [146.83, 220, 293.66, 369.99, 440].forEach((f, i) => {
          const o = osc(i % 2 ? 'sine' : 'triangle', f); o.detune.value = (i - 2) * 3;
          o.connect(gain(i === 0 ? 0.7 : 0.35)).connect(lp); o.start();
        });
      });
    }

    function setLoop(name, v) {
      const l = L[name];
      if (!l) return;
      v = Math.round(v * 200) / 200;
      if (v === l.v) return;
      l.v = v;
      l.g.gain.setTargetAtTime(v * l.base, T(), 0.12);
    }

    function env(g, t, peak, a, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function ping(freqs, decay, vol, t0 = 0, type = 'sine') {
      const t = T() + t0;
      freqs.forEach((f, i) => {
        const o = osc(type, f), g = gain(0);
        env(g, t, vol / (1 + i * 0.8), 0.002, decay * (1 - i * 0.12));
        o.connect(g).connect(out); o.start(t); o.stop(t + decay + 0.05);
      });
    }
    function burst(f, q, dur, vol, t0 = 0, type = 'bandpass') {
      const t = T() + t0, n = noise(), g = gain(0);
      env(g, t, vol, 0.001, dur);
      n.connect(bq(type, f, q)).connect(g).connect(out);
      n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05);
    }

    const fx = {
      clink(v = 0.3) {                    // 달그락
        for (let k = 0; k < 3; k++) {
          const t0 = k * 0.058 + Math.random() * 0.014, f = 1800 + Math.random() * 900;
          ping([f, f * 1.51, f * 2.27], 0.06 + Math.random() * 0.05, v * (1 - k * 0.22), t0);
          burst(5200, 1, 0.01, v * 0.4, t0, 'highpass');
        }
      },
      tak() { ping([1380, 2240], 0.06, 0.16); burst(850, 1.3, 0.04, 0.3); },
      key() {
        burst(2400 + Math.random() * 1800, 0.9, 0.014 + Math.random() * 0.01, 0.12 + Math.random() * 0.06);
        ping([150 + Math.random() * 40], 0.035, 0.05);
      },
      thud(v = 1) {                       // 문 닫히는 소리
        const t = T(), o = osc('sine', 95), g = gain(0);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.2);
        env(g, t, 0.5 * v, 0.004, 0.32);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
        burst(240, 0.8, 0.07, 0.3 * v, 0, 'lowpass');
        ping([180], 0.08, 0.08 * v);
      },
      murmur(n = 4) {                     // 문 너머 말소리
        const t = T();
        for (let i = 0; i < n; i++) {
          const tk = t + i * 0.17 + Math.random() * 0.02;
          const o = osc('sawtooth', 210 * (1 - i * 0.035) + Math.random() * 14), g = gain(0);
          g.gain.setValueAtTime(0, tk);
          g.gain.linearRampToValueAtTime(0.07, tk + 0.03);
          g.gain.setValueAtTime(0.07, tk + 0.1);
          g.gain.linearRampToValueAtTime(0, tk + 0.17);
          o.connect(bq('bandpass', 640, 2.4)).connect(bq('lowpass', 780)).connect(g).connect(out);
          o.start(tk); o.stop(tk + 0.2);
        }
      },
      pop() {                             // 메시지 전송
        const t = T(), o = osc('sine', 620), g = gain(0);
        o.frequency.exponentialRampToValueAtTime(1150, t + 0.05);
        env(g, t, 0.13, 0.004, 0.09);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.15);
        ping([1560], 0.05, 0.04, 0.045);
      },
      bell() {                            // 딸랑
        const strike = (f0, t0, v) => [[1, 1.5, 0.16], [2.76, 0.9, 0.07], [5.4, 0.45, 0.035], [8.93, 0.25, 0.02]]
          .forEach(([r, d, a]) => ping([f0 * r], d, a * v, t0));
        strike(1568, 0, 1); strike(1672, 0.1, 0.8);
        burst(6000, 1, 0.01, 0.06, 0, 'highpass');
      },
      buzz() {                            // 진동벨
        const t = T();
        [0, 0.36].forEach(p => {
          const o = osc('sawtooth', 148), o2 = osc('square', 151), lp = bq('lowpass', 380), g = gain(0);
          g.gain.setValueAtTime(0, t + p);
          g.gain.linearRampToValueAtTime(0.18, t + p + 0.02);
          g.gain.setValueAtTime(0.18, t + p + 0.24);
          g.gain.linearRampToValueAtTime(0, t + p + 0.28);
          o.connect(lp); o2.connect(lp); lp.connect(g).connect(out);
          o.start(t + p); o2.start(t + p); o.stop(t + p + 0.3); o2.stop(t + p + 0.3);
        });
      },
      glass(v = 1) { ping([3150, 4720, 6930], 0.32, 0.1 * v); ping([3360, 5010], 0.26, 0.07 * v, 0.035); },
      heart(v = 0.6) { ping([56, 112], 0.17, 0.5 * v); ping([48, 96], 0.2, 0.34 * v, 0.19); },
      chime() {
        [587.33, 739.99, 880, 1174.66, 1318.51].forEach((f, i) => {
          ping([f], 3.2, 0.06, i * 0.11);
          ping([f * 2.76], 1.2, 0.012, i * 0.11);
        });
      },
      chirp(v = 0.02) {                   // 귀뚜라미
        const t = T(), o = osc('sine', 4300 + Math.random() * 400), g = gain(0);
        for (let k = 0; k < 3; k++) {
          const tk = t + k * 0.055;
          g.gain.setValueAtTime(0, tk);
          g.gain.linearRampToValueAtTime(v, tk + 0.008);
          g.gain.linearRampToValueAtTime(0, tk + 0.032);
        }
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.22);
      },
    };

    function tick() {
      if (!ctx || muted) return;
      const now = T();
      if (L.cafe.v > 0.3 && now > nextClink) {
        nextClink = now + 2.2 + Math.random() * 4;
        const f = 2400 + Math.random() * 1500;
        ping([f, f * 1.6], 0.12, 0.03);
      }
      if (L.night.v > 0.3 && now > nextChirp) {
        nextChirp = now + 0.55 + Math.random() * 0.9;
        fx.chirp(0.02 * L.night.v);
      }
    }
    function pour(level, active) {
      if (!ctx) return;
      setLoop('pour', active ? 1 : 0);
      if (active) {
        L.pour.f.frequency.setTargetAtTime(380 + level * 1150, T(), 0.05);
        L.pour.f2.frequency.setTargetAtTime(800 + level * 1600, T(), 0.05);
      }
    }
    function key() {
      if (!ctx || muted) return;
      const n = performance.now();
      if (n - lastKey < 38) return;
      lastKey = n; fx.key();
    }

    return {
      init, setMuted, tick, pour, key,
      get muted() { return muted; },
      play(name, arg) { if (ctx && !muted && fx[name]) fx[name](arg); },
      setLoop(name, v) { if (ctx) setLoop(name, v); },
      suspend() { if (ctx) ctx.suspend(); },
      resume() { if (ctx && !muted) ctx.resume(); },
    };
  })();

  /* =========================================================
     문장
     ========================================================= */
  const capLayer = $('#caps');
  const BASES = {
    l: 'translateY(-50%)', r: 'translateY(-50%)',
    c: 'translate(-50%,-50%)', big: 'translate(-50%,-50%)', chapter: 'translate(-50%,-50%)',
    t: 'translateX(-50%)', b: 'translateX(-50%)',
    bigl: '', bigr: '',
  };
  function splitLetters(el) {
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          [...n.textContent].forEach(ch => {
            const s = document.createElement('span');
            s.className = 'lt'; s.textContent = ch; frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
    const R = rng(9);
    return $$('.lt', el).map(s => ({ s, r: R() }));
  }
  const caps = ST.caps.map(c => {
    const el = document.createElement('p');
    el.className = `cap ${c.at} ${c.cls || ''}`;
    el.innerHTML = c.html;
    if (c.y != null) el.style.top = c.y + 'vh';
    capLayer.appendChild(el);
    const t = c.f ? [F + c.f[0], F + c.f[1]] : c.t;
    return {
      el, a: t[0], b: t[1], at: c.at, from0: !!c.from0, fin: !!c.f,
      blow: c.blow || null, letters: c.blow ? splitLetters(el) : null,
      tremble: (c.cls || '').includes('tremble'), vis: false,
    };
  });
  function capBase(c) {
    if (narrow && (c.at === 'l' || c.at === 'r')) return '';
    return BASES[c.at] || '';
  }
  function updCaps(s) {
    for (const c of caps) {
      if (c.fin && !unlocked) { if (c.vis) { vis(c.el, 0); c.vis = false; } continue; }
      const fi = Math.min(0.28, (c.b - c.a) * 0.3);
      const o = c.from0 ? 1 - sseg(s, c.b - fi, c.b) : win(s, c.a, c.a + fi, c.b - fi, c.b);
      if (o <= 0.002) { if (c.vis) { vis(c.el, 0); c.vis = false; } continue; }
      c.vis = true;
      vis(c.el, o);
      const enter = c.from0 ? 0 : 1 - sseg(s, c.a, c.a + fi);
      const leave = sseg(s, c.b - fi, c.b);
      let tr = `${capBase(c)} translateY(${f1(enter * 22 - leave * 14)}px)`;
      if (c.tremble) tr += ` translate(${f1((Math.random() - 0.5) * 1.8)}px, ${f1((Math.random() - 0.5) * 1.4)}px)`;
      c.el.style.transform = tr;
      if (c.blow) blowLetters(c, s);
    }
  }
  function blowLetters(c, s) {
    const p = seg(s, c.blow[0], c.blow[1]);
    c.letters.forEach(({ s: el, r }) => {
      const q = clamp(p * 1.7 - r * 0.7);
      if (el._q === q) return;
      el._q = q;
      const e = q * q;
      el.style.transform = q > 0
        ? `translate(${f1(e * (VW * 0.6 + r * 220))}px, ${f1(-e * (30 + r * 140))}px) rotate(${f1(e * (r * 100 - 25))}deg)`
        : '';
      el.style.opacity = f3(1 - q);
    });
  }

  /* =========================================================
     배경색 · 글자색
     ========================================================= */
  const bgStops = ST.bg.map(([s, h]) => [s, hex(h)]);
  const DARK_FG = [38, 38, 38], LIGHT_FG = [236, 236, 234];
  let lastBg = '';
  function updBg(s) {
    let c = bgStops[bgStops.length - 1][1];
    if (s <= bgStops[0][0]) c = bgStops[0][1];
    else {
      for (let i = 1; i < bgStops.length; i++) {
        if (s <= bgStops[i][0]) {
          const [a, ca] = bgStops[i - 1], [b, cb] = bgStops[i];
          const t = sm(clamp((s - a) / (b - a || 1)));
          c = ca.map((v, k) => lerp(v, cb[k], t));
          break;
        }
      }
    }
    const rgb = c.map(v => Math.round(v));
    const key = rgb.join(',');
    if (key === lastBg) return;
    lastBg = key;
    stage.style.background = `rgb(${key})`;
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    const k = sseg(lum, 0.4, 0.6); // 0 = 어두운 배경, 1 = 밝은 배경
    const fg = LIGHT_FG.map((v, i) => Math.round(lerp(v, DARK_FG[i], k)));
    root.style.setProperty('--fg', `rgb(${fg.join(',')})`);
    root.style.setProperty('--mute', `rgba(${fg.join(',')},.55)`);
    root.style.setProperty('--line', `rgba(${fg.join(',')},.2)`);
    root.style.setProperty('--capbg', `rgba(${key},.9)`);
  }

  /* =========================================================
     1장 표지
     ========================================================= */
  const chapterEl = $('#chapter'), chapImg = $('#chapter img');
  function updChapter(s) {
    const o = vis(chapterEl, 1 - sseg(s, 1.45, 2.15));
    if (o) chapImg.style.transform = `scale(${f3(1 + 0.1 * seg(s, 0, 2.2))})`;
  }

  /* =========================================================
     식탁 (위에서 내려다본 그림)
     ========================================================= */
  const tableEl = $('#table');
  const T_ = {};
  function buildTable() {
    const R = rng(11);
    const strands = (n, rad) => Array.from({ length: n }, () => {
      const a = R() * Math.PI * 2, r0 = rad * Math.sqrt(R()) * 0.8;
      let x = Math.cos(a) * r0, y = Math.sin(a) * r0, h = R() * Math.PI * 2;
      const pts = [[x, y]];
      const steps = 9 + Math.floor(R() * 6);
      const curl = (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.3);
      for (let j = 0; j < steps; j++) {
        h += curl + (R() - 0.5) * 0.7;
        const st = 9 + R() * 9;
        x += Math.cos(h) * st; y += Math.sin(h) * st;
        const d = Math.hypot(x, y);
        if (d > rad) { x *= (rad / d) * 0.92; y *= (rad / d) * 0.92; h += Math.PI * 0.75; }
        pts.push([x, y]);
      }
      let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
      for (let j = 1; j < pts.length - 1; j++) {
        const mx = (pts[j][0] + pts[j + 1][0]) / 2, my = (pts[j][1] + pts[j + 1][1]) / 2;
        d += ` Q${f1(pts[j][0])} ${f1(pts[j][1])} ${f1(mx)} ${f1(my)}`;
      }
      return `<path d="${d}"/>`;
    }).join('');

    const plate = (id, cx, cy) => `
      <g id="${id}" transform="translate(${cx} ${cy})">
        <circle r="135" cx="5" cy="8" fill="rgba(0,0,0,.05)" stroke="none"/>
        <g filter="url(#rough)"><circle r="132" fill="#f8f6f1"/><circle r="101" opacity=".36"/></g>
        <g class="pasta" stroke="#3b3a37" stroke-width="2.3" opacity=".88">${strands(20, 84)}</g>
      </g>`;
    const fork = id => `
      <g id="${id}">
        <path d="M-11 -84 V -42 M-3.7 -84 V -42 M3.7 -84 V -42 M11 -84 V -42"/>
        <path d="M-12.5 -44 Q -12 -16 0 -12 Q 12 -16 12.5 -44" fill="#f8f6f1"/>
        <path d="M-3.4 -12 L -5.2 90 Q 0 98 5.2 90 L 3.4 -12" fill="#f8f6f1"/>
      </g>`;
    const cup = (id, cx, cy) => `
      <g id="${id}" transform="translate(${cx} ${cy})">
        <circle r="40" cx="3" cy="5" fill="rgba(0,0,0,.05)" stroke="none"/>
        <circle r="38" fill="#f9f8f5" filter="url(#rough)"/>
        <circle class="water" r="31" fill="#cdd3d5" stroke="none" opacity="0"/>
        <circle r="31" opacity=".4"/>
        <g class="rip" stroke="#8d989c" stroke-width="1"><circle r="5" opacity="0"/><circle r="5" opacity="0"/><circle r="5" opacity="0"/></g>
        <path d="M-18 -20 Q -24 -8 -22 4" stroke="#fff" stroke-width="3" opacity=".9"/>
      </g>`;
    const leaves = Array.from({ length: 10 }, () => {
      const x = (R() - 0.5) * 66, y = (R() - 0.5) * 66, r = R() * 360, s = 0.7 + R() * 0.5;
      return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(r)}) scale(${s.toFixed(2)})">
        <path d="M0 0 C 7 -8 7 -22 0 -30 C -7 -22 -7 -8 0 0 Z" fill="#e3e0d8"/><path d="M0 -2 L 0 -26" opacity=".5"/></g>`;
    }).join('');
    const feed = Array.from({ length: 9 }, (_, k) =>
      `<rect x="-21" y="${-50 + k * 22}" width="42" height="13" rx="2" fill="#c4c8c9"/><rect x="-21" y="${-34 + k * 22}" width="${18 + (k * 7) % 20}" height="3" rx="1.5" fill="#9ea3a5"/>`).join('');
    const drops = [[-58, 40, 6], [-36, 62, 4.5], [-8, 72, 7], [22, 64, 3.6], [-74, 18, 3], [-26, 44, 2.6], [36, 46, 3.2]];
    T_.drops = drops;

    tableEl.innerHTML = `
    <svg viewBox="0 0 600 1000" aria-hidden="true">
      <defs>
        <filter id="rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3"/>
          <feDisplacementMap in="SourceGraphic" scale="2.6"/>
        </filter>
        <clipPath id="screen"><rect x="-25" y="-51" width="50" height="102" rx="6"/></clipPath>
      </defs>
      <g stroke="#2a2a2a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <g filter="url(#rough)" opacity=".6">
          <rect x="24" y="22" width="552" height="956" rx="6" stroke-width="1.3"/>
          <path d="M40 150 C 200 140 400 160 560 146" opacity=".22"/>
          <path d="M40 420 C 220 432 380 410 560 424" opacity=".18"/>
          <path d="M40 610 C 210 600 400 622 560 606" opacity=".2"/>
          <path d="M40 880 C 200 892 390 870 560 884" opacity=".2"/>
        </g>
        <g id="salad" transform="translate(112 505)">
          <circle r="64" cx="4" cy="6" fill="rgba(0,0,0,.05)" stroke="none"/>
          <g filter="url(#rough)"><circle r="62" fill="#f8f6f1"/><circle r="50" opacity=".35"/></g>
          ${leaves}
          <circle cx="18" cy="-14" r="7" fill="#d2cdc3"/><circle cx="-20" cy="16" r="6" fill="#d2cdc3"/>
        </g>
        ${plate('herPlate', 300, 260)}
        ${plate('myPlate', 300, 740)}
        <g id="herFork" transform="translate(132 248) rotate(-28)">${fork('hf')}</g>
        <g id="myFork">${fork('mf')}</g>
        <g id="phone" transform="translate(500 196) rotate(16)">
          <rect x="-31" y="-59" width="62" height="118" rx="11" fill="#1f1f1f"/>
          <g clip-path="url(#screen)"><rect x="-25" y="-51" width="50" height="102" fill="#e3e6e6" stroke="none"/><g id="feed" stroke="none">${feed}</g></g>
        </g>
        ${cup('herCup', 482, 420)}
        ${cup('myCup', 120, 664)}
        <g id="drops" stroke="#8f989b" stroke-width=".8">${drops.map(([x, y, r]) =>
          `<ellipse cx="0" cy="0" rx="${r}" ry="${(r * 0.8).toFixed(1)}" fill="#cdd3d5" opacity="0" transform="translate(${482 + x} ${420 + y})"/>`).join('')}</g>
        <g id="tissue" opacity="0">
          <path d="M-28 -20 L -9 -29 L 10 -22 L 29 -27 L 25 -6 L 31 13 L 14 27 L -6 22 L -25 29 L -31 8 Z" fill="#fdfcf8"/>
          <path d="M-15 -10 L 2 4 L 19 -7 M -9 15 L 6 6" opacity=".45"/>
        </g>
      </g>
    </svg>`;

    ['herPlate', 'myPlate', 'herFork', 'myFork', 'phone', 'feed', 'herCup', 'myCup', 'salad', 'tissue']
      .forEach(id => (T_[id] = document.getElementById(id)));
    T_.myStrands = $$('#myPlate .pasta path');
    T_.dropEls = $$('#drops ellipse');
    for (const c of ['herCup', 'myCup']) {
      T_[c + 'W'] = $('.water', T_[c]);
      T_[c + 'R'] = $$('.rip circle', T_[c]);
    }
    T_.feedY = 0; T_.lastMy = 0.62; T_.lastHer = 0;
  }

  function updTable(s, dt, t) {
    const o = vis(tableEl, curve(s, [[2.85, 0], [3.25, 1], [13.9, 1], [14.15, 0.14], [14.95, 0.14], [15.25, 1], [18.5, 1], [19.0, 0]]));
    if (!o) { A.pour(0, false); return; }
    const inH = sseg(s, 3.0, 3.5), inM = sseg(s, 3.1, 3.6), clr = sseg(s, 17.9, 18.45);
    T_.herPlate.setAttribute('transform', `translate(300 ${f1(260 - 70 * (1 - inH) - 50 * clr)})`);
    op(T_.herPlate, inH * (1 - clr));
    T_.myPlate.setAttribute('transform', `translate(300 ${f1(740 + 70 * (1 - inM) + 50 * clr)})`);
    op(T_.myPlate, inM * (1 - clr));
    const rest = sseg(s, 3.05, 3.45) * (1 - clr);
    op(T_.salad, rest); op(T_.herCup, rest); op(T_.myCup, rest); op(T_.herFork, rest);

    // 수지의 핸드폰: 화면 속 피드가 계속 올라간다
    const ph = sseg(s, 3.05, 3.45) * (1 - sseg(s, 15.15, 15.5));
    op(T_.phone, ph);
    if (ph) {
      const speed = 1 + 1.8 * win(s, 5.1, 5.3, 5.8, 6.0);
      T_.feedY = (T_.feedY + dt * 15 * speed) % 22;
      T_.feed.setAttribute('transform', `translate(0 ${f1(-T_.feedY)})`);
    }

    // 내 접시만 비워진다
    const eat = seg(s, 5.8, 7.0), n = T_.myStrands.length;
    T_.myStrands.forEach((p, i) => {
      if (i < 2) return;
      const th = ((i - 2) / (n - 2)) * 0.85;
      op(p, 1 - sseg(eat, th, th + 0.15));
    });

    // 포크를 힘껏 쥐었다 → 내려놓았다
    const grip = win(s, 7.7, 8.1, 8.75, 8.92), down = sseg(s, 8.95, 9.25);
    const jx = (Math.random() - 0.5) * 3.4 * grip, jy = (Math.random() - 0.5) * 3.4 * grip;
    T_.myFork.setAttribute('transform',
      `translate(${f1(474 + jx - 8 * down)} ${f1(742 + jy + 22 * down)}) rotate(${f1(8 + 24 * down + (Math.random() - 0.5) * 2.4 * grip)})`);
    op(T_.myFork, sseg(s, 3.1, 3.6) * (1 - clr));

    // 물컵
    const myLvl = curve(s, [[9.65, 0.62], [9.8, 0], [9.85, 0], [10.35, 1]]);
    const herLvl = sseg(s, 10.65, 11.15);
    const water = (c, lvl) => {
      T_[c + 'W'].setAttribute('r', f1(9 + 22 * lvl));
      op(T_[c + 'W'], lvl ? 0.18 + 0.7 * lvl : 0);
    };
    water('myCup', myLvl); water('herCup', herLvl);
    const dMy = Math.abs(myLvl - T_.lastMy), dHer = Math.abs(herLvl - T_.lastHer);
    T_.lastMy = myLvl; T_.lastHer = herLvl;
    const pMy = s > 9.85 && dMy > 0.0006, pHer = dHer > 0.0006;
    A.pour(pHer ? herLvl : myLvl, pMy || pHer);
    const ripple = (c, on) => T_[c + 'R'].forEach((el, k) => {
      if (!on) { op(el, 0); return; }
      const fr = (t * 1.7 + k / 3) % 1;
      el.setAttribute('r', f1(4 + fr * 25));
      op(el, (1 - fr) * 0.7);
    });
    ripple('myCup', s > 9.85 && s < 10.35);
    ripple('herCup', s > 10.65 && s < 11.15);

    // 넘친 물 → 휴지
    T_.dropEls.forEach((el, i) => {
      const appear = sseg(s, 11.15 + i * 0.02, 11.32 + i * 0.02);
      const wipe = sseg(s, 12.3 + i * 0.06, 12.38 + i * 0.06);
      op(el, appear * (1 - wipe) * (1 - clr));
    });
    let tx, ty;
    if (s < 13.0) {
      const p = sseg(s, 12.2, 12.85);
      tx = lerp(548, 448, p); ty = lerp(326, 474, p);
      const rub = win(s, 12.25, 12.35, 12.75, 12.85);
      tx += Math.sin(t * 15) * 9 * rub; ty += Math.cos(t * 13) * 5 * rub;
    } else {
      const p = sseg(s, 13.15, 13.6);
      tx = lerp(448, 214, p); ty = lerp(474, 884, p);
    }
    op(T_.tissue, sseg(s, 12.15, 12.3) * (1 - clr));
    T_.tissue.setAttribute('transform', `translate(${f1(tx)} ${f1(ty)}) rotate(${f1(-12 + 40 * seg(s, 12.2, 13.6))})`);
  }

  /* =========================================================
     핏줄
     ========================================================= */
  const veinsEl = $('#veins');
  let veinPaths = [];
  function buildVeins() {
    veinsEl.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
    veinsEl.setAttribute('preserveAspectRatio', 'none');
    const R = rng(5), list = [];
    const grow = (x, y, ang, len, w, depth) => {
      const pts = [[x, y]];
      let L = 0;
      while (L < len) {
        ang += (R() - 0.5) * 0.36;
        const st = 14 + R() * 16;
        x += Math.cos(ang) * st; y += Math.sin(ang) * st; L += st;
        pts.push([x, y]);
        if (depth < 2 && L > 40 && R() < 0.1) grow(x, y, ang + (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.5), len * (0.35 + R() * 0.3), w * 0.6, depth + 1);
      }
      list.push({ pts, w, depth });
    };
    const roots = 7;
    for (let i = 0; i < roots; i++) {
      const x = VW * (0.06 + (0.88 * (i + R() * 0.7)) / roots);
      grow(x, VH + 12, -Math.PI / 2 + (R() - 0.5) * 0.6, VH * (0.32 + R() * 0.45), 2.4 + R() * 1.3, 0);
    }
    veinsEl.innerHTML = list.map(v => {
      let d = `M${f1(v.pts[0][0])} ${f1(v.pts[0][1])}`;
      for (let j = 1; j < v.pts.length - 1; j++) {
        const mx = (v.pts[j][0] + v.pts[j + 1][0]) / 2, my = (v.pts[j][1] + v.pts[j + 1][1]) / 2;
        d += ` Q${f1(v.pts[j][0])} ${f1(v.pts[j][1])} ${f1(mx)} ${f1(my)}`;
      }
      return `<path d="${d}" stroke-width="${v.w.toFixed(2)}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" data-d="${v.depth}"/>`;
    }).join('');
    veinPaths = $$('path', veinsEl).map(p => ({ p, d: +p.dataset.d, k: R(), q: -1 }));
  }
  function updVeins(s) {
    const g1 = sseg(s, 7.8, 8.75) * (1 - sseg(s, 8.95, 9.3));
    // 주먹을 쥐면 번지고, 지연이 말하는 동안 옅어졌다가, 손가락이 스치면 다시 짙어진다
    let g2 = curve(s, [[62.15, 0], [63.0, 1], [64.1, 1], [64.5, 0.3], [70.55, 0.3], [71.15, 1]]);
    g2 *= 1 - sm(holdP);
    if (unlocked) g2 *= 1 - sseg(s, F + 0.1, F + 0.5);
    const light = g2 > g1, g = Math.max(g1, g2);
    if (!vis(veinsEl, g > 0.002 ? 1 : 0)) return;
    veinsEl.style.color = light ? 'rgba(226,226,224,.34)' : 'rgba(40,40,40,.34)';
    veinPaths.forEach(v => {
      const q = +clamp(g * 1.35 - v.d * 0.18 - v.k * 0.12).toFixed(3);
      if (q === v.q) return;
      v.q = q;
      v.p.setAttribute('stroke-dashoffset', f1(100 * (1 - q)));
    });
  }

  /* =========================================================
     젖은 자국
     ========================================================= */
  const stainEl = $('#stain');
  stainEl.innerHTML = `
    <svg viewBox="-300 -300 600 600" aria-hidden="true">
      <defs>
        <radialGradient id="stg">
          <stop offset="0" stop-color="#3a3a3a" stop-opacity=".24"/>
          <stop offset=".62" stop-color="#3a3a3a" stop-opacity=".14"/>
          <stop offset=".82" stop-color="#3a3a3a" stop-opacity=".24"/>
          <stop offset="1" stop-color="#3a3a3a" stop-opacity="0"/>
        </radialGradient>
        <filter id="stf" x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="4"/>
          <feDisplacementMap in="SourceGraphic" scale="70"/>
        </filter>
      </defs>
      <circle r="230" fill="url(#stg)" filter="url(#stf)"/>
    </svg>`;
  const stainSvg = $('svg', stainEl);
  function updStain(s) {
    if (!vis(stainEl, win(s, 14.0, 14.25, 14.85, 15.2))) return;
    stainSvg.style.transform = `scale(${f3(lerp(0.22, 1.1, sm(seg(s, 14.0, 14.7))))})`;
  }

  /* =========================================================
     생화 향
     ========================================================= */
  const scentEl = $('#scent'), scentImgs = $$('#scent img');
  function updScent(s, t) {
    const faint = curve(s, [[18.5, 0], [19.05, 0.5], [19.9, 0.5], [20.5, 0]]);
    const dense = win(s, 23.85, 24.4, 25.2, 25.75);
    if (!vis(scentEl, Math.max(faint, dense))) return;
    const isDense = dense > faint;
    const f = isDense ? 'none' : 'brightness(.42)';
    if (scentEl._f !== f) { scentEl.style.filter = f; scentEl._f = f; }
    const k = isDense ? dense : faint / 0.5;
    const grow = isDense ? lerp(0.82, 1.28, k) : lerp(0.75, 1, k);
    const away = (1 - k) * 9;
    scentImgs.forEach((im, i) => {
      const sx = i % 2 ? 1 : -1, sy = i < 2 ? -1 : 1;
      im.style.transform = `translate(${f1(sx * away)}vw, ${f1(sy * away)}vh) scale(${f3(grow + Math.sin(t * 0.6 + i) * 0.012)})`;
    });
  }

  /* =========================================================
     메모장
     ========================================================= */
  const memoEl = $('#memo'), typedEl = $('#memo .typed'), flowEl = $('#memo .flow');
  const SENT = '사랑하는 사람과 살고 있다.';
  const FLOW = [
    '오월의 날씨는 선선했다. 처음 보는 카페가 보였다.',
    '커피를 한 모금 마시고 바나나 푸딩을 크게 떠먹었다.',
    '도어벨 소리와 동시에 직원이 큰 목소리로 인사를 해왔다.',
    '카페에 나 이외의 손님은 없었다. 진동벨을 받고 자리를 잡았다.',
    '손으로 산호라고 쓴 글씨가 눈에 띄는 카페였다.',
  ];
  flowEl.innerHTML = FLOW.map(l => `<p>${l}</p>`).join('');
  const flowLines = $$('p', flowEl);
  let lastTyped = -1, lastFlow = -1;
  function updMemo(s) {
    const e1 = win(s, 19.5, 19.9, 27.2, 27.6);
    const e2 = win(s, 42.05, 42.4, 43.05, 43.3);
    const e3 = win(s, 48.5, 48.85, 50.2, 50.6);
    let o = Math.max(e1, e2, e3);
    o *= 1 - win(s, 23.65, 23.95, 25.3, 25.7);
    if (!vis(memoEl, o)) return;

    // 한 자씩 타자
    const n = e1 >= e2 && e1 >= e3 ? Math.round(seg(s, 20.5, 21.7) * SENT.length) : SENT.length;
    if (n !== lastTyped) {
      if (n > lastTyped && lastTyped >= 0 && e1 > 0.5) A.key();
      typedEl.textContent = SENT.slice(0, n);
      lastTyped = n;
    }
    // 노트북을 덮으려는데
    const lid = 26 * sseg(s, 23.25, 23.7) * (1 - sseg(s, 25.55, 25.95));
    const rise = 18 * (1 - Math.max(sseg(s, 19.5, 19.9), sseg(s, 42.05, 42.4), sseg(s, 48.5, 48.85)));
    memoEl.style.transform = `translate(-50%, calc(-50% + ${f1(rise)}px)) perspective(1100px) rotateX(${f1(-lid)}deg)`;
    const slow = s > 26.35 && s < 27.7;
    if (memoEl._slow !== slow) { memoEl.classList.toggle('slow', slow); memoEl._slow = slow; }

    // 산호에서는 글이 잘 써진다
    const fp = e3 > 0 ? seg(s, 48.6, 49.65) * flowLines.length : 0;
    const fk = Math.round(fp * 40);
    if (fk !== lastFlow) {
      if (fk > lastFlow && lastFlow >= 0) A.key();
      lastFlow = fk;
      flowLines.forEach((p, i) => {
        const v = clamp(fp - i);
        p.style.clipPath = `inset(0 ${f1((1 - v) * 100)}% 0 0)`;
        p.style.opacity = v > 0 ? 1 : 0;
      });
    }
  }

  /* =========================================================
     김
     ========================================================= */
  const steamEl = $('#steam'), steamI = $$('#steam i');
  function updSteam(s, t) {
    if (!vis(steamEl, win(s, 23.75, 24.05, 25.0, 25.5))) return;
    const p = seg(s, 23.75, 25.5);
    steamI.forEach((el, i) => {
      const k = i / steamI.length;
      const y = lerp(100, -40, clamp(p * 1.3 - k * 0.3));
      const x = 52 + k * 34 + Math.sin(t * 0.5 + i * 1.7) * 4;
      el.style.transform = `translate(${f1(x - 23)}vw, ${f1(y - 23)}vh) scale(${f3(0.75 + k * 0.5)})`;
    });
  }

  /* =========================================================
     안방 문
     ========================================================= */
  const hallEl = $('#hall'), doorEl = $('#hall .door'), w1 = $('#hall .w1'), w2 = $('#hall .w2');
  doorEl.innerHTML = `
    <svg viewBox="0 0 400 700" aria-hidden="true">
      <defs>
        <linearGradient id="gapG" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".45"/></linearGradient>
        <linearGradient id="spillG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <g fill="none" stroke="rgba(235,235,233,.5)" stroke-width="1.6">
        <rect x="56" y="40" width="288" height="616"/>
        <path d="M68 52 H 320 V 646 H 68 Z" fill="rgba(255,255,255,.03)"/>
        <rect x="98" y="98" width="192" height="206" opacity=".45"/>
        <rect x="98" y="350" width="192" height="250" opacity=".45"/>
        <circle cx="292" cy="378" r="8"/>
      </g>
      <rect class="gap" x="321" y="52" width="9" height="594" fill="url(#gapG)"/>
      <path class="spill" d="M321 646 L 330 646 L 400 700 L 296 700 Z" fill="url(#spillG)"/>
      <line x1="0" y1="656" x2="400" y2="656" stroke="rgba(235,235,233,.2)"/>
    </svg>`;
  const gapEl = $('.gap', doorEl);
  function word(el, s, a, blowA) {
    const o = sseg(s, a, a + 0.3);
    const q = seg(s, blowA, blowA + 0.45);
    el.style.opacity = f3(o * (1 - q) * (1 - 0.6 * win(s, 30.85, 31.1, 31.85, 31.95)));
    el.style.filter = `blur(${f1(lerp(7, 2.2, sseg(s, a, a + 0.6)))}px)`;
    el.style.transform = `translate(${f1(q * q * VW * 0.5)}px, ${f1(-q * q * 60)}px) rotate(${f1(q * 18)}deg)`;
  }
  function updHall(s, t) {
    if (!vis(hallEl, win(s, 28.0, 28.5, 32.8, 33.2))) return;
    doorEl.style.opacity = f3(1 - 0.6 * win(s, 30.85, 31.1, 31.9, 32.2));
    const talk = win(s, 29.25, 29.35, 29.9, 30.0) + win(s, 30.05, 30.15, 30.7, 30.8);
    gapEl.style.opacity = f3(0.75 + 0.25 * Math.sin(t * 2.3) * Math.sin(t * 5.1) + 0.2 * talk);
    word(w1, s, 29.3, 31.95);
    word(w2, s, 30.05, 32.0);
  }

  /* =========================================================
     메시지 · 햇살 · 간판
     ========================================================= */
  const msgEl = $('#msg');
  function updMsg(s) {
    if (!vis(msgEl, win(s, 33.8, 34.0, 34.9, 35.15))) return;
    msgEl.style.transform = `translateY(${f1((1 - sseg(s, 33.8, 34.05)) * 16)}px)`;
  }
  const dappleEl = $('#dapple'), dapI = $$('#dapple i');
  function updDapple(s, t) {
    if (!vis(dappleEl, win(s, 33.7, 34.4, 37.4, 38.4))) return;
    dapI.forEach((el, i) => {
      const x = (i * 19 + 4) % 90 + Math.sin(t * 0.13 + i * 1.3) * 6 - 10;
      const y = (i * 37 + 10) % 85 + Math.cos(t * 0.11 + i * 2.1) * 5 - 12;
      el.style.transform = `translate(${f1(x)}vw, ${f1(y)}vh) rotate(${(i * 23) % 60}deg)`;
    });
  }
  const sanhoEl = $('#sanho');
  const SANHO = [
    'M120 70 Q 104 142 50 206', 'M112 120 Q 150 166 198 198',
    'M262 44 Q 256 140 262 238', 'M264 140 Q 291 137 320 142',
    'M92 262 Q 88 312 96 352 Q 204 351 318 343',
    'M538 42 Q 556 48 572 52', 'M470 96 Q 560 90 652 98',
    'M560 128 C 520 126 504 160 511 183 C 519 211 601 213 611 180 C 619 150 594 128 560 128',
    'M560 236 Q 563 262 558 291', 'M428 302 Q 562 291 704 300',
  ];
  sanhoEl.innerHTML = `
    <svg viewBox="0 0 760 420" aria-hidden="true">
      <defs><filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="8"/>
        <feDisplacementMap in="SourceGraphic" scale="3.5"/></filter></defs>
      <g fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" filter="url(#ink)">
        ${SANHO.map(d => `<path d="${d}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`).join('')}
      </g>
    </svg>`;
  const sanhoPaths = $$('path', sanhoEl);
  function updSanho(s) {
    if (!vis(sanhoEl, win(s, 36.75, 36.85, 38.8, 39.15))) return;
    const P = seg(s, 36.8, 37.75) * sanhoPaths.length;
    sanhoPaths.forEach((p, k) => {
      const q = clamp(P - k);
      if (p._q === q) return;
      p._q = q;
      p.setAttribute('stroke-dashoffset', f3(1 - q));
    });
  }

  /* =========================================================
     트레이 · 파우더
     ========================================================= */
  const trayEl = $('#tray');
  trayEl.innerHTML = `
    <svg viewBox="0 0 640 440" aria-hidden="true">
      <g stroke="#2a2a2a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x="30" y="34" width="580" height="372" rx="26" fill="#d6d0c4" filter="url(#rough)"/>
        <rect x="52" y="56" width="536" height="328" rx="16" opacity=".3"/>
        <path d="M70 110 C 220 100 420 122 570 108" opacity=".16"/>
        <path d="M70 190 C 240 200 400 180 570 194" opacity=".14"/>
        <path d="M70 280 C 220 270 410 290 570 276" opacity=".16"/>
        <path d="M70 350 C 240 360 400 342 570 354" opacity=".14"/>
        <g transform="translate(214 222)">
          <circle r="104" cx="4" cy="6" fill="rgba(0,0,0,.06)" stroke="none"/>
          <circle r="102" fill="#f6f4ef" filter="url(#rough)"/>
          <path d="M66 -14 Q 104 -12 104 0 Q 104 12 66 14" fill="#fbfaf7"/>
          <circle r="70" fill="#fbfaf7"/>
          <circle r="58" fill="#2d2a27"/>
          <circle r="54" stroke="#776e64" stroke-width="3" opacity=".55"/>
          <ellipse cx="-22" cy="-24" rx="15" ry="6" fill="rgba(255,255,255,.2)" stroke="none" transform="rotate(-35)"/>
        </g>
        <g transform="translate(452 214)">
          <circle r="74" cx="4" cy="6" fill="rgba(0,0,0,.06)" stroke="none"/>
          <circle r="72" fill="#f4f2ec" filter="url(#rough)"/>
          <circle r="63" fill="#ebe5d6"/>
          <g fill="#f1ead0" stroke-width="1">
            <circle cx="-26" cy="-18" r="13"/><circle cx="4" cy="-32" r="12"/><circle cx="24" cy="10" r="13"/><circle cx="-14" cy="22" r="12"/>
          </g>
          <g fill="#8f8572" stroke="none">
            <circle cx="-26" cy="-18" r="1.6"/><circle cx="4" cy="-32" r="1.6"/><circle cx="24" cy="10" r="1.6"/><circle cx="-14" cy="22" r="1.6"/>
            <circle cx="40" cy="-22" r="2.2"/><circle cx="-40" cy="6" r="1.8"/><circle cx="10" cy="40" r="2"/>
          </g>
          <path id="scoop" d="M-6 -34 C 22 -44 44 -20 32 4 C 22 20 -10 16 -20 -2 C -28 -18 -20 -30 -6 -34 Z" fill="#d4c9b0" stroke="none" opacity="0"/>
        </g>
        <g transform="translate(566 336) rotate(-35)"><ellipse rx="12" ry="18" fill="#f2f2f0"/><path d="M0 18 L 0 88" stroke-width="5"/></g>
      </g>
    </svg>`;
  const scoopEl = $('#scoop');
  function updTray(s) {
    if (!vis(trayEl, win(s, 43.6, 44.0, 48.3, 48.6))) return;
    trayEl.style.transform = `translateY(${f1((1 - sseg(s, 43.6, 44.0)) * 30)}px)`;
    op(scoopEl, sseg(s, 47.8, 47.95));
  }
  const pc = $('#powder'), pctx = pc.getContext('2d');
  const parts = Array.from({ length: 150 }, () => ({
    x: Math.random(), y: Math.random(), r: 0.8 + Math.random() * 3.2,
    vx: (Math.random() - 0.5) * 0.006, vy: -0.004 - Math.random() * 0.01,
    a: 0.25 + Math.random() * 0.6, ph: Math.random() * 6.28,
  }));
  function sizePowder() {
    const d = Math.min(2, devicePixelRatio || 1);
    pc.width = VW * d; pc.height = VH * d;
    pctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function updPowder(s, dt, t) {
    const o = curve(s, [[44.4, 0], [45.0, 1], [49.6, 0.7], [50.4, 0]]);
    if (!vis(pc, o > 0.002 ? 1 : 0)) return;
    pctx.clearRect(0, 0, VW, VH);
    pctx.fillStyle = '#fff';
    pctx.shadowColor = 'rgba(255,255,255,.9)';
    pctx.shadowBlur = 6;
    for (const p of parts) {
      p.x += (p.vx + Math.sin(t * 0.4 + p.ph) * 0.002) * dt;
      p.y += p.vy * dt;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;
      pctx.globalAlpha = o * p.a * (0.6 + 0.4 * Math.sin(t * 1.3 + p.ph));
      pctx.beginPath();
      pctx.arc(p.x * VW, p.y * VH, p.r, 0, 6.283);
      pctx.fill();
    }
  }

  /* =========================================================
     포장마차 · 지연
     ========================================================= */
  const nightEl = $('#night'), bulbEl = $('#night .bulb'), glowEl = $('#night .glow'), ntable = $('#night .ntable');
  ntable.innerHTML = `
    <svg viewBox="0 0 420 220" aria-hidden="true">
      <g fill="none" stroke-linecap="round">
        <circle cx="152" cy="108" r="31" fill="#33373a" stroke="rgba(240,240,240,.35)" stroke-width="1.4"/>
        <circle cx="152" cy="108" r="12" fill="#8c8f90"/>
        <path d="M130 92 Q 136 80 150 77" stroke="rgba(255,255,255,.45)" stroke-width="3"/>
        <g stroke="rgba(240,240,240,.7)" stroke-width="1.4">
          <circle cx="252" cy="82" r="17" fill="rgba(255,255,255,.06)"/><circle cx="252" cy="82" r="12.5" opacity=".45"/>
          <circle cx="300" cy="132" r="17" fill="rgba(255,255,255,.06)"/><circle cx="300" cy="132" r="12.5" opacity=".45"/>
        </g>
        <circle cx="344" cy="168" r="22" stroke="rgba(240,240,240,.65)" stroke-width="2.4" stroke-dasharray="2 3.5"/>
        <path id="glint" d="M362 150 L 366 160 L 376 164 L 366 168 L 362 178 L 358 168 L 348 164 L 358 160 Z" fill="#fff" opacity="0" transform-origin="362 164"/>
      </g>
    </svg>`;
  const glintEl = $('#glint');
  function updNight(s, t) {
    if (!vis(nightEl, win(s, 53.25, 53.95, F + 4.3, F + 4.8))) return;
    bulbEl.style.transform = `rotate(${f3(Math.sin(t * 0.7) * 1.6)}deg)`;
    glowEl.style.opacity = f3(0.85 + 0.35 * sm(holdP) + Math.sin(t * 3.1) * 0.02);
    op(ntable, win(s, 53.95, 54.35, 70.4, 70.8));
    const g = win(s, 55.15, 55.3, 55.75, 55.95);
    op(glintEl, g * (0.55 + 0.45 * Math.abs(Math.sin(t * 5))));
    glintEl.setAttribute('transform', `rotate(${f1(t * 40)} 362 164) scale(1)`);
  }
  const pjEl = $('#pj');
  function updPJ(s) {
    // 지연이 말하는 두 대목에서 나타난다
    const a = win(s, 55.65, 56.15, 61.15, 61.55), b = win(s, 64.0, 64.5, 66.5, 66.9);
    if (!vis(pjEl, Math.max(a, b))) return;
    const rise = (1 - (a >= b ? sseg(s, 55.65, 56.15) : sseg(s, 64.0, 64.5))) * 30;
    pjEl.style.transform = narrow
      ? `translateY(${f1(rise)}px) rotate(1.4deg)`
      : `translateY(calc(-50% + ${f1(rise)}px)) rotate(1.4deg)`;
  }

  /* =========================================================
     손 펴기
     ========================================================= */
  const holdLine = $('#holdLine'), holdBtn = $('#holdBtn'), holdHint = $('#holdHint'), ring = $('#holdBtn .ring');
  const glyphsEl = $('#glyphs'), gMe = $('#glyphs .me'), gYou = $('#glyphs .you');
  const flashEl = $('#flash');
  function updHold(s, dt, t) {
    if (!holdDone) {
      if (holding && s >= HOLD_AT - 0.05) {
        holdP = Math.min(1, holdP + dt / 2.6);
        if (t > nextBeat) { A.play('heart', 0.5 + 0.5 * holdP); nextBeat = t + lerp(1.0, 0.42, holdP); }
      } else holdP = Math.max(0, holdP - dt / 1.3);
      if (holdP >= 1) completeHold();
    }
    const e = sm(holdP);

    vis(holdLine, sseg(s, 70.6, 71.0) * (unlocked ? 1 - sseg(s, F + 0.15, F + 0.5) : 1));
    holdLine.style.letterSpacing = lerp(-0.04, 0.02, e).toFixed(3) + 'em';

    // 손을 편 뒤에는 아래로 물러나 문장 뒤에 옅게 남았다가, "포개어"에서 겹치고 사라진다
    const drop = unlocked ? sseg(s, F + 0.1, F + 0.6) : 0;
    let gO = sseg(s, 70.75, 71.15);
    if (unlocked) gO *= lerp(1, 0.24, drop) * (1 - sseg(s, F + 3.3, F + 3.8));
    if (vis(glyphsEl, gO)) {
      const overlap = unlocked ? sseg(s, F + 2.4, F + 2.9) : 0;
      const gap = lerp(2.2, 0, overlap);
      const meS = lerp(0.58, 1, e);
      const down = `translateY(${f1(drop * 13)}vh) scale(${f3(1 - drop * 0.25)})`;
      gMe.style.transform = `translate(-50%,-50%) ${down} translateX(${f1(lerp(-24, -gap, e))}vw) scale(${f3(meS * lerp(0.9, 1, e))}, ${f3(meS * lerp(0.78, 1, e))})`;
      gYou.style.transform = `translate(-50%,-50%) ${down} translateX(${f1(lerp(26, gap, e))}vw)`;
      gYou.style.opacity = f3(lerp(0.3, 1, e));
      gYou.style.color = `rgba(236,236,234,${f3(overlap * 0.35)})`;
    }

    // 버튼
    let bO = 0;
    if (!holdDone) bO = s >= HOLD_AT ? sseg(s, HOLD_AT, HOLD_AT + 0.3) : 0;
    else bO = clamp(1 - (t - doneT) / 0.6);
    holdBtn.style.opacity = f3(bO);
    holdHint.style.opacity = f3(bO * (1 - e * 0.6));
    const on = !holdDone && bO > 0.5;
    if (holdBtn._on !== on) { holdBtn.classList.toggle('on', on); holdBtn._on = on; }
    ring.style.strokeDashoffset = f1(339.3 * (1 - holdP));

    op(flashEl, clamp(1 - (t - doneT) / 1.1) * 0.5);
  }
  function completeHold() {
    holdDone = true; holding = false; doneT = tNow;
    holdBtn.classList.remove('pressed');
    A.play('chime');
    unlocked = true;
    setSpacer();
    setTimeout(() => smoothScrollTo((F + 0.95) * VH, 2600), 650);
  }
  function press(e) {
    if (holdDone || gateOpen || sNow < HOLD_AT - 0.05) return;
    holding = true; nextBeat = 0;
    holdBtn.classList.add('pressed');
    if (e) e.preventDefault();
  }
  function release() { holding = false; holdBtn.classList.remove('pressed'); }
  holdBtn.addEventListener('pointerdown', e => {
    try { holdBtn.setPointerCapture(e.pointerId); } catch (_) { /* 캡처가 안 되는 환경 */ }
    press(e);
  });
  holdBtn.addEventListener('pointerup', release);
  holdBtn.addEventListener('pointercancel', release);
  holdBtn.addEventListener('lostpointercapture', release);
  holdBtn.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (e.code !== 'Space' || gateOpen || holdDone || sNow < HOLD_AT - 0.05) return;
    e.preventDefault();
    if (!e.repeat) press();
  });
  addEventListener('keyup', e => { if (e.code === 'Space') release(); });

  /* =========================================================
     마지막: 류 · 표지
     ========================================================= */
  const ryuEl = $('#ryu'), coverEl = $('#cover'), cbg = $('#cover .cbg');
  const cv = ['.vt', '.by', '.tag', '.rel', '.links'].map(q => $(q, coverEl));
  const againEl = $('#again');
  function updFinale(s) {
    if (!unlocked) { vis(ryuEl, 0); vis(coverEl, 0); return; }
    if (vis(ryuEl, win(s, F + 4.8, F + 5.4, F + 6.3, F + 6.8))) {
      ryuEl.style.transform = `translate(-50%, calc(-50% + ${f1((1 - sseg(s, F + 4.8, F + 5.5)) * 24)}px))`;
    }
    const c = vis(coverEl, sseg(s, F + 6.35, F + 7.0));
    const on = c > 0.5;
    if (coverEl._on !== on) { coverEl.classList.toggle('on', on); coverEl._on = on; }
    if (!c) return;
    cbg.style.transform = `scale(${f3(lerp(1.08, 1, sseg(s, F + 6.35, F + 8.2)))})`;
    op(cv[0], sseg(s, F + 6.8, F + 7.3));
    op(cv[1], sseg(s, F + 7.0, F + 7.5));
    op(cv[2], sseg(s, F + 7.2, F + 7.7));
    op(cv[3], sseg(s, F + 7.4, F + 7.9));
    op(cv[4], sseg(s, F + 7.3, F + 7.8));
    op(againEl, sseg(s, F + 7.6, F + 8.1));
  }
  againEl.addEventListener('click', () => {
    cancelAuto();
    window.scrollTo(0, 0);
    sNow = 0; sPrev = 0;
  });

  /* =========================================================
     화면 표시 · 흔들림 · 어둠
     ========================================================= */
  const headEl = $('#head'), markerEl = $('#marker'), whereEl = $('#marker .where');
  const progEl = $('#prog'), progI = $('#prog i'), hintEl = $('#hint'), vigEl = $('#vig');
  let lastPlace = null;
  function updUI(s, t) {
    vis(headEl, sseg(s, 2.0, 2.4) * (unlocked ? 1 - sseg(s, F + 4.3, F + 4.7) : 1));
    let place = '';
    for (const [a, b, p] of ST.places) if (s >= a && s < b) place = p;
    if (place !== lastPlace) { whereEl.textContent = place; lastPlace = place; }
    vis(markerEl, place ? sseg(s, 2.0, 2.4) : 0);
    vis(progEl, sseg(s, 1.6, 2.2) * (unlocked ? 1 - sseg(s, F + 6.3, F + 6.8) : 1));
    progI.style.height = (clamp(s / (unlocked ? END : F)) * 100).toFixed(2) + '%';
    vis(hintEl, gateOpen ? 0 : 1 - sseg(s, 0.05, 0.4));
    vis(vigEl, Math.max(
      win(s, 7.7, 8.2, 8.85, 9.25) * 0.85,
      curve(s, [[42.5, 0], [42.65, 0.55], [42.8, 0.15], [42.95, 0.55], [43.1, 0]]),
      win(s, 50.9, 51.6, F + 4.3, F + 4.8) * 0.75,
    ));
    // 진동벨: 화면이 떨린다
    const sh = win(s, 43.1, 43.15, 43.4, 43.6);
    stage.style.transform = sh ? `translate(${f1((Math.random() - 0.5) * 9 * sh)}px, ${f1((Math.random() - 0.5) * 7 * sh)}px)` : '';
  }

  /* =========================================================
     소리 연결
     ========================================================= */
  const cues = ST.cues.map(([at, name, arg]) => ({ at, name, arg, fired: false }));
  function updSound(s) {
    for (const [name, pts] of Object.entries(ST.loops)) A.setLoop(name, curve(s, pts));
    A.tick();
  }
  function runCues(a, b) {
    for (const c of cues) {
      if (!c.fired && a < c.at && b >= c.at && b - c.at < 0.6) { c.fired = true; A.play(c.name, c.arg); }
      else if (c.fired && b < c.at - 0.15) c.fired = false;
    }
  }

  /* =========================================================
     스크롤 길이 · 자동 스크롤
     ========================================================= */
  function setSpacer() {
    spacer.style.height = Math.round((unlocked ? END : F) * VH + VH) + 'px';
  }
  function smoothScrollTo(y, dur) {
    cancelAuto();
    const y0 = window.scrollY, t0 = performance.now();
    const step = now => {
      const p = clamp((now - t0) / dur);
      window.scrollTo(0, y0 + (y - y0) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) autoScroll = requestAnimationFrame(step);
      else autoScroll = null;
    };
    autoScroll = requestAnimationFrame(step);
  }
  function cancelAuto() { if (autoScroll) cancelAnimationFrame(autoScroll); autoScroll = null; }
  addEventListener('wheel', cancelAuto, { passive: true });
  addEventListener('touchstart', cancelAuto, { passive: true });

  /* =========================================================
     첫 화면 · 소리 버튼
     ========================================================= */
  const gate = $('#gate'), sndBtn = $('#snd');
  (() => {
    const h = $('.gtitle', gate);
    const chars = [...h.textContent];
    h.innerHTML = chars.map((ch, i) => (ch === ' ' ? ' ' : `<span style="animation-delay:${(0.25 + i * 0.07).toFixed(2)}s">${ch}</span>`)).join('');
  })();
  $$('#gate button').forEach(b => b.addEventListener('click', () => {
    const sound = b.dataset.sound === '1';
    if (sound) A.setMuted(false);
    sndBtn.classList.toggle('on', sound);
    sndBtn.setAttribute('aria-label', sound ? '소리 끄기' : '소리 켜기');
    gate.classList.add('out');
    document.body.classList.remove('gated');
    gateOpen = false;
    window.scrollTo(0, 0);
  }));
  sndBtn.addEventListener('click', () => {
    const m = !A.muted;
    A.setMuted(m);
    sndBtn.classList.toggle('on', !m);
    sndBtn.setAttribute('aria-label', m ? '소리 켜기' : '소리 끄기');
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? A.suspend() : A.resume()));

  /* =========================================================
     종이 질감
     ========================================================= */
  (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d'), im = g.createImageData(180, 180);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = 192 + Math.random() * 63;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
  })();

  /* =========================================================
     시작
     ========================================================= */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  buildTable();
  buildVeins();
  sizePowder();
  setSpacer();

  addEventListener('resize', () => {
    const w = innerWidth, h = innerHeight;
    const big = w !== VW || Math.abs(h - VH) > 120;
    VW = w;
    if (big) VH = h;
    narrow = VW < 760;
    setSpacer(); buildVeins(); sizePowder();
  });

  function frame(ms) {
    const dt = Math.min(0.05, (ms - tPrevMs) / 1000);
    tPrevMs = ms;
    tNow = ms / 1000;
    const target = window.scrollY / VH;
    sNow += (target - sNow) * (1 - Math.exp(-dt * 7));
    if (Math.abs(target - sNow) < 0.0005) sNow = target;
    const s = sNow, t = tNow;

    updBg(s);
    updChapter(s);
    updDapple(s, t);
    updScent(s, t);
    updTable(s, dt, t);
    updStain(s);
    updMemo(s);
    updSteam(s, t);
    updHall(s, t);
    updMsg(s);
    updSanho(s);
    updTray(s);
    updPowder(s, dt, t);
    updNight(s, t);
    updPJ(s);
    updHold(s, dt, t);
    updFinale(s);
    updVeins(s);
    updCaps(s);
    updUI(s, t);
    if (!gateOpen) { updSound(s); runCues(sPrev, s); }
    sPrev = s;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 확인용: 주소 끝에 #s=24 처럼 붙이면 그 화면으로 바로 이동
  const m = location.hash.match(/s=([\d.]+)/);
  if (m) {
    $$('#gate button')[1].click();
    if (location.hash.includes('open')) { unlocked = true; holdDone = true; holdP = 1; setSpacer(); }
    requestAnimationFrame(() => { window.scrollTo(0, parseFloat(m[1]) * VH); sNow = parseFloat(m[1]); });
  }
  window.__thc = {
    get s() { return sNow; },
    jump(v) { cancelAuto(); window.scrollTo(0, v * VH); sNow = v; sPrev = v; },
    unlock() { unlocked = true; holdDone = true; holdP = 1; setSpacer(); },
  };
})();
