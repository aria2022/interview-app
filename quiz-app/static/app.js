(function () {
  "use strict";

  var AI_STORE = "interview-quiz-ai-v1";
  var XP_STORE = "interview-quiz-xp-v1";
  var SOUND_STORE = "interview-quiz-sound-v1";
  var PROVIDERS = {
    anthropic: { label: "Anthropic", model: "claude-haiku-5-5" },
    openai: { label: "OpenAI", model: "gpt-4o-mini" }
  };
  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var all = [];
  var groups = [];
  var topic = "*";
  var count = 25;
  var run = null;
  var cells = [];
  var soundOn = false;
  var ai = { provider: "anthropic", key: "", model: PROVIDERS.anthropic.model, logs: {}, busy: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function shuffle(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ohne Speicher weiter */ } }
  function letter(i) { return String.fromCharCode(65 + i); }
  function fmt(n) { return n.toLocaleString("de-DE"); }
  function tcls(group) {
    var i = groups.indexOf(group);
    return "tc" + ((i < 0 ? 0 : i) % 4);
  }
  function valid(q) {
    return q && typeof q.q === "string" && typeof q.correct === "string" &&
      Array.isArray(q.wrong) && q.wrong.length === 3 &&
      typeof q.hint === "string" && typeof q.explain === "string";
  }

  /* ---------- Hintergrund: Raster und Lichtstreifen ---------- */
  var bg = { cv: null, cx: null, w: 0, h: 0, t: 0 };
  function bgResize() {
    bg.w = bg.cv.width = window.innerWidth;
    bg.h = bg.cv.height = window.innerHeight;
    bgDraw();
  }
  function bgDraw() {
    var cx = bg.cx, w = bg.w, h = bg.h, x, y;
    cx.clearRect(0, 0, w, h);
    cx.strokeStyle = "rgba(212,255,0,0.045)";
    cx.lineWidth = 1;
    for (x = 0; x < w + 48; x += 48) { cx.beginPath(); cx.moveTo(x + 0.5, 0); cx.lineTo(x + 0.5, h); cx.stroke(); }
    for (y = 0; y < h + 48; y += 48) { cx.beginPath(); cx.moveTo(0, y + 0.5); cx.lineTo(w, y + 0.5); cx.stroke(); }
    if (REDUCED) return;
    var sl = (bg.t * 1.4) % (h + 120) - 60;
    var g = cx.createLinearGradient(0, sl - 40, 0, sl + 40);
    g.addColorStop(0, "rgba(212,255,0,0)");
    g.addColorStop(0.5, "rgba(212,255,0,0.03)");
    g.addColorStop(1, "rgba(212,255,0,0)");
    cx.fillStyle = g;
    cx.fillRect(0, sl - 40, w, 80);
  }
  function bgLoop() {
    bg.t++;
    bgDraw();
    window.requestAnimationFrame(bgLoop);
  }
  function initBg() {
    bg.cv = $("bgCv");
    bg.cx = bg.cv.getContext("2d");
    if (!bg.cx) return;
    bgResize();
    window.addEventListener("resize", bgResize);
    if (!REDUCED) window.requestAnimationFrame(bgLoop);
  }

  /* ---------- Funken ---------- */
  var fx = { cv: null, cx: null, list: [], running: false };
  function fxResize() {
    if (!fx.cv) return;
    fx.cv.width = window.innerWidth;
    fx.cv.height = window.innerHeight;
  }
  function burst(x, y, col, n) {
    if (REDUCED || !fx.cx) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 2 + Math.random() * 8;
      fx.list.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, r: 2 + Math.random() * 4, col: col, life: 1, d: 0.018 + Math.random() * 0.026 });
    }
    if (!fx.running) { fx.running = true; window.requestAnimationFrame(fxLoop); }
  }
  function fxLoop() {
    var cx = fx.cx;
    cx.clearRect(0, 0, fx.cv.width, fx.cv.height);
    for (var i = fx.list.length - 1; i >= 0; i--) {
      var p = fx.list[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.vx *= 0.97; p.life -= p.d;
      if (p.life <= 0) { fx.list.splice(i, 1); continue; }
      cx.beginPath();
      cx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      cx.fillStyle = p.col + Math.floor(p.life * 255).toString(16).padStart(2, "0");
      cx.fill();
    }
    if (fx.list.length) {
      window.requestAnimationFrame(fxLoop);
    } else {
      fx.running = false;
      cx.clearRect(0, 0, fx.cv.width, fx.cv.height);
    }
  }
  function burstAt(node, col, n) {
    var r = node.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, col, n);
  }

  /* ---------- Ton (standardmäßig aus) ---------- */
  var audio = null;
  function getAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    }
    return audio;
  }
  function tone(f, when, dur, vol, type) {
    var a = soundOn ? getAudio() : null;
    if (!a) return;
    try {
      if (a.state === "suspended") a.resume();
      var o = a.createOscillator();
      var g = a.createGain();
      o.connect(g);
      g.connect(a.destination);
      o.type = type || "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(vol || 0.2, a.currentTime + when);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + when + dur);
      o.start(a.currentTime + when);
      o.stop(a.currentTime + when + dur + 0.05);
    } catch (e) { /* Ton ist nur Zugabe */ }
  }
  var SND = {
    ok: function () { tone(523, 0, 0.08); tone(659, 0.07, 0.12); tone(784, 0.14, 0.2); },
    bad: function () { tone(220, 0, 0.08, 0.16, "sawtooth"); tone(175, 0.08, 0.16, 0.12, "sawtooth"); },
    combo: function () { tone(880, 0, 0.06); tone(1100, 0.05, 0.09); tone(1320, 0.1, 0.15); },
    up: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.18, 0.16); }); }
  };
  function renderSound() {
    var b = $("soundBtn");
    b.setAttribute("aria-pressed", soundOn ? "true" : "false");
    b.textContent = soundOn ? "🔊 Ton an" : "🔇 Ton aus";
  }
  function toggleSound() {
    soundOn = !soundOn;
    lsSet(SOUND_STORE, soundOn ? "1" : "0");
    renderSound();
    if (soundOn) SND.ok();
  }

  /* ---------- Level und XP ---------- */
  function getXP() { var v = parseInt(lsGet(XP_STORE) || "0", 10); return isNaN(v) || v < 0 ? 0 : v; }
  function lvlOf(xp) { return Math.floor(xp / 100) + 1; }
  function drawXP() {
    var xp = getXP();
    var p = xp % 100;
    $("mLvl").textContent = "LEVEL " + lvlOf(xp);
    $("mXinf").textContent = p + " / 100 XP";
    $("mXfill").style.width = p + "%";
  }

  /* ---------- Bildschirme ---------- */
  function show(name) {
    ["start", "quiz", "result"].forEach(function (n) { $(n).hidden = n !== name; });
    $("exitBtn").hidden = name !== "quiz";
    var wrap = $("stripWrap");
    if (name === "start") { $("stripSlotStart").appendChild(wrap); wrap.hidden = false; }
    else if (name === "quiz") { $("stripSlotQuiz").appendChild(wrap); wrap.hidden = false; }
    else { wrap.hidden = true; }
    window.scrollTo(0, 0);
  }

  /* ---------- Pod-Leiste ---------- */
  function buildStrip(n, mode, wave) {
    var strip = $("strip");
    strip.textContent = "";
    strip.classList.toggle("wave", !!wave);
    strip.classList.toggle("big", mode === "preview");
    cells = [];
    for (var i = 0; i < n; i++) {
      var c;
      if (mode === "nav") {
        c = el("button", "pod", String(i + 1));
        c.type = "button";
        (function (k) { c.addEventListener("click", function () { jump(k); }); })(i);
      } else {
        c = el("div", "pod");
      }
      c.style.setProperty("--i", String(i));
      strip.appendChild(c);
      cells.push(c);
    }
  }

  function isDone(k) { return run.st[k].picked !== null; }
  function openCount() {
    var n = 0;
    run.st.forEach(function (s) { if (s.picked === null) n++; });
    return n;
  }
  function nextOpen(from) {
    var n = run.items.length;
    for (var d = 1; d < n; d++) {
      var k = (from + d) % n;
      if (!isDone(k)) return k;
    }
    return -1;
  }

  function updateStrip() {
    if (!run) return;
    var good = 0, bad = 0, skipped = 0;
    cells.forEach(function (c, i) {
      var s = run.st[i];
      var cls = "pod";
      var label;
      if (s.picked !== null) {
        cls += s.ok ? " running" : " crash";
        if (s.hint) cls += " hinted";
        if (s.ok) good++; else bad++;
        label = s.ok ? "richtig" : "falsch";
      } else if (s.skipped) {
        cls += " skipped";
        skipped++;
        label = "übersprungen";
      } else {
        label = "offen";
      }
      if (i === run.i) cls += " current";
      c.className = cls;
      c.setAttribute("aria-label", "Frage " + (i + 1) + ", " + label);
      if (i === run.i) c.setAttribute("aria-current", "step"); else c.removeAttribute("aria-current");
    });
    var n = run.items.length;
    var open = n - good - bad - skipped;
    var parts = [];
    if (good) parts.push(good + " richtig");
    if (bad) parts.push(bad + " falsch");
    if (skipped) parts.push(skipped + " übersprungen");
    if (open) parts.push(open + " offen");
    $("stripText").textContent = parts.join(" · ");
  }

  /* ---------- Startbildschirm ---------- */
  function pool() {
    return all.filter(function (x) { return topic === "*" || x.group === topic; });
  }
  function selectedCount() {
    var n = pool().length;
    return count > 0 ? Math.min(count, n) : n;
  }
  function previewStrip(wave) {
    var n = selectedCount();
    buildStrip(n, "preview", wave);
    $("stripText").textContent = n + " Fragen im Quiz";
    $("startBtn").disabled = n === 0;
  }
  function chip(label, pressed, cls, onClick) {
    var b = el("button", "cat-pill" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.addEventListener("click", onClick);
    return b;
  }
  function renderChips() {
    var tc = $("topicChips");
    tc.textContent = "";
    tc.appendChild(chip("Alle " + all.length, topic === "*", "", function () { topic = "*"; renderChips(); previewStrip(false); }));
    groups.forEach(function (g) {
      var n = all.filter(function (x) { return x.group === g; }).length;
      tc.appendChild(chip(g + " " + n, topic === g, tcls(g), function () { topic = g; renderChips(); previewStrip(false); }));
    });
    var cc = $("countChips");
    cc.textContent = "";
    [[10, "10"], [25, "25"], [0, "Alle"]].forEach(function (p) {
      cc.appendChild(chip(p[1], count === p[0], "", function () { count = p[0]; renderChips(); previewStrip(false); }));
    });
  }

  /* ---------- Quiz ---------- */
  function startRun(items) {
    run = {
      items: items,
      i: 0,
      st: items.map(function () { return { opts: null, picked: null, ok: false, gain: 0, hint: false, skipped: false }; }),
      btns: [],
      score: 0,
      combo: 0,
      maxCombo: 0,
      xpDone: false,
      xpGain: 0,
      lvUp: false
    };
    buildStrip(items.length, "nav", false);
    show("quiz");
    renderQuestion();
  }
  function startQuiz() {
    startRun(shuffle(pool()).slice(0, selectedCount()));
  }

  function renderHud() {
    $("qNo").textContent = "Frage " + (run.i + 1) + " / " + run.items.length;
    $("score").textContent = fmt(run.score);
    var cb = $("combo");
    if (run.combo >= 2) { cb.className = "b-combo on"; cb.textContent = "×" + run.combo; }
    else { cb.className = "b-combo"; cb.textContent = ""; }
  }

  function paintOptions(s) {
    s.opts.forEach(function (o, i) {
      var b = run.btns[i];
      b.className = "opt";
      b.disabled = false;
      if (s.picked !== null) {
        b.disabled = true;
        if (o.ok) b.classList.add(i === s.picked ? "hit" : "reveal");
        else if (i === s.picked) b.classList.add("miss");
        else b.classList.add("dim");
      }
    });
  }

  function paintFeedback(s, it) {
    var fb = $("feedback");
    if (s.picked === null) { fb.hidden = true; return; }
    var rightIdx = 0;
    s.opts.forEach(function (o, i) { if (o.ok) rightIdx = i; });
    fb.hidden = false;
    fb.className = "feedback " + (s.ok ? "good" : "bad");
    var v = $("verdict");
    v.className = "verdict " + (s.ok ? "good" : "bad");
    v.textContent = s.ok ? "Richtig. +" + s.gain + " Punkte" : "Nicht ganz. Richtig ist " + letter(rightIdx) + ".";
    $("explain").textContent = it.explain;
  }

  function updateNav() {
    var n = run.items.length;
    var done = isDone(run.i);
    var open = openCount();
    $("prevBtn").disabled = run.i === 0;
    var skipBtn = $("skipBtn");
    skipBtn.disabled = done || nextOpen(run.i) < 0;
    skipBtn.title = !done && nextOpen(run.i) < 0 ? "Das ist die letzte offene Frage." : "";
    var nb = $("nextBtn");
    nb.disabled = !done;
    nb.title = done ? "" : "Erst antworten oder überspringen.";
    nb.textContent = open === 0 ? "Ergebnis →" : run.i === n - 1 ? "Offene Frage →" : "Weiter →";
  }

  function renderQuestion() {
    var it = run.items[run.i];
    var s = run.st[run.i];
    if (!s.opts) {
      s.opts = shuffle([{ t: it.correct, ok: true }].concat(it.wrong.map(function (t) { return { t: t, ok: false }; })));
    }
    var tag = $("topic");
    tag.textContent = it.group;
    tag.className = "q-tag " + tcls(it.group);
    $("question").textContent = it.q;
    var qc = $("qCard");
    qc.classList.remove("shake");
    qc.style.animation = "none";
    void qc.offsetHeight;
    qc.style.animation = "";

    var box = $("options");
    box.textContent = "";
    run.btns = s.opts.map(function (o, idx) {
      var b = el("button", "opt");
      b.type = "button";
      b.appendChild(el("span", "key", letter(idx)));
      b.appendChild(el("span", "opt-text", o.t));
      b.addEventListener("click", function () { pick(idx); });
      box.appendChild(b);
      return b;
    });
    paintOptions(s);

    var hint = $("hint");
    hint.textContent = "💡 Tipp: " + it.hint;
    hint.hidden = !s.hint;
    $("hintBtn").hidden = s.picked !== null || s.hint;
    paintFeedback(s, it);
    renderHud();
    updateNav();
    updateStrip();
    renderAiLog();
    window.scrollTo(0, 0);
    $("question").focus({ preventScroll: true });
  }

  function pick(idx) {
    if (!run) return;
    var s = run.st[run.i];
    if (s.picked !== null) return;
    var it = run.items[run.i];
    var chosen = s.opts[idx];
    s.picked = idx;
    s.ok = chosen.ok;
    s.skipped = false;
    if (chosen.ok) {
      run.combo++;
      if (run.combo > run.maxCombo) run.maxCombo = run.combo;
      s.gain = (s.hint ? 50 : 100) * Math.min(run.combo, 5);
      run.score += s.gain;
      SND.ok();
      if (run.combo >= 3) window.setTimeout(SND.combo, 120);
      burstAt(run.btns[idx], "#00e87c", 24);
    } else {
      run.combo = 0;
      s.gain = 0;
      SND.bad();
      var qc = $("qCard");
      qc.classList.remove("shake");
      void qc.offsetHeight;
      qc.classList.add("shake");
      burstAt(run.btns[idx], "#ff3355", 14);
    }
    paintOptions(s);
    paintFeedback(s, it);
    $("hintBtn").hidden = true;
    renderHud();
    updateNav();
    updateStrip();
    renderAiLog();
    $("nextBtn").focus({ preventScroll: true });
    if (!$("feedback").hidden) $("feedback").scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
  }

  function showHint() {
    if (!run) return;
    var s = run.st[run.i];
    if (s.picked !== null || s.hint) return;
    s.hint = true;
    $("hint").hidden = false;
    $("hintBtn").hidden = true;
    updateStrip();
  }

  function jump(k) {
    if (!run || k === run.i || k < 0 || k >= run.items.length) return;
    run.i = k;
    renderQuestion();
  }
  function prev() { if (run && run.i > 0) jump(run.i - 1); }
  function skip() {
    if (!run || isDone(run.i)) return;
    var t = nextOpen(run.i);
    if (t < 0) return;
    run.st[run.i].skipped = true;
    run.i = t;
    renderQuestion();
  }
  function next() {
    if (!run || !isDone(run.i)) return;
    var n = run.items.length;
    if (openCount() === 0) { showResult(); return; }
    if (run.i < n - 1) { jump(run.i + 1); return; }
    var first = 0;
    while (first < n && isDone(first)) first++;
    jump(first);
  }
  function exitQuiz() {
    if (!run) return;
    var answered = run.st.some(function (s) { return s.picked !== null; });
    if (answered) showResult(); else backToStart();
  }

  /* ---------- Ergebnis ---------- */
  function statBox(value, label) {
    var b = el("div", "stat-box");
    b.appendChild(el("span", "stat-n", value));
    b.appendChild(el("span", "stat-l", label));
    return b;
  }

  function showResult() {
    var n = run.items.length;
    var answered = 0, good = 0, hints = 0, noHint = 0;
    run.st.forEach(function (s) {
      if (s.picked === null) return;
      answered++;
      if (s.ok) { good++; if (!s.hint) noHint++; }
      if (s.hint) hints++;
    });
    var pct = answered ? Math.round(good * 100 / answered) : 0;

    if (!run.xpDone) {
      run.xpDone = true;
      run.xpGain = good * 5 + Math.round(run.score / 8);
      var before = getXP();
      var after = before + run.xpGain;
      lsSet(XP_STORE, String(after));
      run.lvUp = lvlOf(after) > lvlOf(before);
      if (run.lvUp) window.setTimeout(SND.up, 300);
    }

    var em, ti;
    if (pct >= 90) { em = "🏆"; ti = "PERFEKT"; }
    else if (pct >= 70) { em = "⚡"; ti = "STARK"; }
    else if (pct >= 50) { em = "💪"; ti = "WEITER SO"; }
    else { em = "🎯"; ti = "ÜBEN"; }
    $("rEm").textContent = run.lvUp ? "⬆️" : em;
    $("scoreHead").textContent = run.lvUp ? "LEVEL UP!" : ti;
    var sub = good + " von " + answered + " richtig";
    if (answered < n) sub += " · " + (n - answered) + " offen";
    sub += " · " + fmt(run.score) + " Punkte";
    $("scoreSub").textContent = sub + ". " + noHint + " richtig ohne Tipp, " + hints + " Mal den Tipp genutzt.";

    var stats = $("rStats");
    stats.textContent = "";
    stats.appendChild(statBox(good + "/" + answered, "Richtig"));
    stats.appendChild(statBox("×" + run.maxCombo, "Max Combo"));
    stats.appendChild(statBox(fmt(run.score), "Punkte"));
    $("rXp").textContent = "+" + run.xpGain + " XP";
    $("retryBtn").hidden = good === n;

    var bars = $("topicBars");
    bars.textContent = "";
    var seen = [];
    run.items.forEach(function (it) { if (seen.indexOf(it.group) < 0) seen.push(it.group); });
    seen.forEach(function (g) {
      var total = 0, ok = 0;
      run.items.forEach(function (it, i) {
        if (it.group !== g) return;
        total++;
        if (run.st[i].picked !== null && run.st[i].ok) ok++;
      });
      var row = el("div", "topic-row " + tcls(g));
      var head = el("div", "head");
      head.appendChild(el("span", "", g));
      head.appendChild(el("span", "", ok + " von " + total));
      var track = el("div", "bar-track");
      var fill = el("div", "bar-fill");
      fill.style.width = Math.round(ok * 100 / total) + "%";
      track.appendChild(fill);
      row.appendChild(head);
      row.appendChild(track);
      bars.appendChild(row);
    });

    var tb = $("podRows");
    tb.textContent = "";
    run.items.forEach(function (it, i) {
      var s = run.st[i];
      var state = s.picked === null ? "pend" : s.ok ? "ok" : "fail";
      var tr = el("tr", state);
      tr.appendChild(el("td", "", "frage-" + it.id));
      tr.appendChild(el("td", "", state === "ok" ? "1/1" : "0/1"));
      tr.appendChild(el("td", "", state === "ok" ? "Running" : state === "fail" ? "CrashLoopBackOff" : "Pending"));
      tr.appendChild(el("td", "", s.hint ? "ja" : "-"));
      tb.appendChild(tr);
      if (state !== "ok") {
        var d = el("tr", "detail");
        var td = el("td");
        td.colSpan = 4;
        td.appendChild(el("div", "qtext", it.q));
        if (state === "fail") td.appendChild(el("div", "", "Deine Antwort: " + s.opts[s.picked].t));
        else td.appendChild(el("div", "", "Nicht beantwortet."));
        td.appendChild(el("div", "", "Richtig: " + it.correct));
        d.appendChild(td);
        tb.appendChild(d);
      }
    });

    show("result");
    drawXP();
    if (run.lvUp || pct === 100) {
      window.setTimeout(function () {
        burst(window.innerWidth / 2, window.innerHeight * 0.3, "#d4ff00", 50);
        burst(window.innerWidth / 2, window.innerHeight * 0.3, "#00e87c", 35);
      }, 400);
    }
  }

  function retryWrong() {
    var items = run.items.filter(function (it, i) { return !(run.st[i].picked !== null && run.st[i].ok); });
    if (items.length) startRun(shuffle(items));
  }
  function backToStart() {
    run = null;
    show("start");
    previewStrip(false);
    drawXP();
  }

  /* ---------- KI-Helfer ---------- */
  function loadAi() {
    var raw = null;
    try { raw = localStorage.getItem(AI_STORE) || sessionStorage.getItem(AI_STORE); } catch (e) { raw = null; }
    if (!raw) return;
    try {
      var s = JSON.parse(raw);
      if (s && PROVIDERS[s.provider]) ai.provider = s.provider;
      if (s && typeof s.key === "string") ai.key = s.key;
      if (s && typeof s.model === "string" && s.model) ai.model = s.model;
    } catch (e) { /* kaputte Daten ignorieren */ }
  }
  function saveAi(remember) {
    var data = JSON.stringify({ provider: ai.provider, key: ai.key, model: ai.model });
    try {
      localStorage.removeItem(AI_STORE);
      sessionStorage.removeItem(AI_STORE);
      (remember ? localStorage : sessionStorage).setItem(AI_STORE, data);
    } catch (e) { /* ohne Speicher weiter */ }
  }
  function clearAi() {
    ai.key = "";
    try { localStorage.removeItem(AI_STORE); sessionStorage.removeItem(AI_STORE); } catch (e) { /* egal */ }
  }

  function openAi() {
    var d = $("ai");
    d.classList.add("open");
    d.removeAttribute("inert");
    d.setAttribute("aria-hidden", "false");
    renderAiPanel();
    var target = ai.key ? $("aiInput") : $("aiKey");
    target.focus();
  }
  function closeAi() {
    var d = $("ai");
    d.classList.remove("open");
    d.setAttribute("inert", "");
    d.setAttribute("aria-hidden", "true");
    $("aiToggle").focus();
  }
  function renderAiPanel() {
    var hasKey = !!ai.key;
    $("aiSetup").hidden = hasKey;
    $("aiChat").hidden = !hasKey;
    $("aiProvider").value = ai.provider;
    $("aiModel").value = ai.model;
    if (hasKey) renderAiLog();
  }

  function logKey() { return run && run.items[run.i] ? run.items[run.i].id : 0; }

  function renderAiLog() {
    var box = $("aiLog");
    if (!box) return;
    box.textContent = "";
    var log = ai.logs[logKey()] || [];
    if (log.length === 0) {
      box.appendChild(el("p", "msg note", run
        ? "Stell eine Frage zur aktuellen Quizfrage. Die Lösung verrate ich erst, wenn du geantwortet hast."
        : "Stell eine Frage zu Kubernetes, DevOps oder zum Gespräch."));
    }
    log.forEach(function (m) {
      box.appendChild(el("p", m.role === "user" ? "msg user" : m.error ? "msg err" : "msg ai", m.content));
    });
    box.scrollTop = box.scrollHeight;
  }

  function systemPrompt() {
    var s = "Du bist ein geduldiger Lernhelfer für Kubernetes, DevOps und ein Vorstellungsgespräch. " +
      "Antworte auf Deutsch in kurzen, einfachen Sätzen, höchstens fünf Sätze. Wenn du etwas nicht sicher weißt, sag das offen.";
    var it = run ? run.items[run.i] : null;
    if (run && it) {
      var st = run.st[run.i];
      s += "\n\nAktuelle Quizfrage: " + it.q + "\nAntwortmöglichkeiten:";
      st.opts.forEach(function (o, i) { s += "\n" + letter(i) + ") " + o.t; });
      if (st.picked === null) {
        s += "\n\nDer Nutzer hat noch nicht geantwortet. Verrate die richtige Antwort nicht. Gib Denkanstöße und erkläre Begriffe.";
      } else {
        s += "\n\nDer Nutzer hat geantwortet und lag " + (st.ok ? "richtig" : "falsch") +
          ". Richtige Antwort: " + it.correct + "\nMusterantwort: " + it.explain + "\nDu darfst jetzt erklären.";
      }
    }
    return s;
  }

  function errorText(err, status) {
    if (status === 401 || status === 403) return "Der Anbieter lehnt den Key ab (" + status + "). Prüfe den Key unter \"Key ändern oder löschen\".";
    if (status === 404) return "Modell nicht gefunden (404). Trage unter \"Key ändern oder löschen\" ein Modell ein, das dein Konto nutzen darf.";
    if (status === 429) return "Zu viele Anfragen oder kein Guthaben mehr (429). Warte kurz oder prüfe dein Guthaben.";
    if (status) return "Fehler vom Anbieter (" + status + "): " + (err && err.message ? err.message : "keine Details");
    return "Keine Verbindung zum Anbieter. Prüfe Internet und Firewall. Technische Meldung: " + (err && err.message ? err.message : "unbekannt");
  }

  function callProvider(history, system) {
    var url, headers, body;
    if (ai.provider === "openai") {
      url = "https://api.openai.com/v1/chat/completions";
      headers = { "Content-Type": "application/json", "Authorization": "Bearer " + ai.key };
      body = { model: ai.model, messages: [{ role: "system", content: system }].concat(history) };
    } else {
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": ai.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      };
      body = { model: ai.model, max_tokens: 600, system: system, messages: history };
    }
    return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var e = new Error((data && data.error && data.error.message) || ("HTTP " + r.status));
          e.status = r.status;
          throw e;
        }
        var text = ai.provider === "openai"
          ? (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ""
          : (data.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n");
        if (!text) throw new Error("Leere Antwort");
        return text;
      });
    });
  }

  function sendAi() {
    var input = $("aiInput");
    var text = input.value.trim();
    if (!text || ai.busy || !ai.key) return;
    var k = logKey();
    var log = ai.logs[k] = ai.logs[k] || [];
    var history = log.filter(function (m) { return !m.error; }).map(function (m) { return { role: m.role, content: m.content }; });
    history.push({ role: "user", content: text });
    log.push({ role: "user", content: text });
    input.value = "";
    ai.busy = true;
    $("aiSend").disabled = true;
    renderAiLog();
    var system = systemPrompt();
    callProvider(history, system).then(function (reply) {
      log.push({ role: "assistant", content: reply });
    }).catch(function (err) {
      log.push({ role: "assistant", error: true, content: errorText(err, err && err.status) });
    }).then(function () {
      ai.busy = false;
      $("aiSend").disabled = false;
      if (ai.logs[logKey()] === log) renderAiLog();
    });
  }

  function saveSetup() {
    var key = $("aiKey").value.trim();
    var model = $("aiModel").value.trim();
    var msg = $("aiSetupMsg");
    if (!key) { msg.textContent = "Bitte trage einen Key ein."; return; }
    if (!model) { msg.textContent = "Bitte trage ein Modell ein."; return; }
    ai.provider = $("aiProvider").value;
    ai.key = key;
    ai.model = model;
    saveAi($("aiRemember").checked);
    $("aiKey").value = "";
    msg.textContent = "";
    renderAiPanel();
    $("aiInput").focus();
  }

  /* ---------- Start ---------- */
  function init() {
    loadAi();
    soundOn = lsGet(SOUND_STORE) === "1";
    renderSound();
    drawXP();
    initBg();
    show("start");
    fx.cv = $("fxCv");
    fx.cx = fx.cv.getContext("2d");
    fxResize();
    window.addEventListener("resize", fxResize);

    $("startBtn").addEventListener("click", startQuiz);
    $("hintBtn").addEventListener("click", showHint);
    $("prevBtn").addEventListener("click", prev);
    $("skipBtn").addEventListener("click", skip);
    $("nextBtn").addEventListener("click", next);
    $("exitBtn").addEventListener("click", exitQuiz);
    $("retryBtn").addEventListener("click", retryWrong);
    $("againBtn").addEventListener("click", backToStart);
    $("soundBtn").addEventListener("click", toggleSound);
    $("aiToggle").addEventListener("click", function () { $("ai").classList.contains("open") ? closeAi() : openAi(); });
    $("aiAsk").addEventListener("click", openAi);
    $("aiClose").addEventListener("click", closeAi);
    $("aiSave").addEventListener("click", saveSetup);
    $("aiSend").addEventListener("click", sendAi);
    $("aiReset").addEventListener("click", function () { clearAi(); renderAiPanel(); $("aiKey").focus(); });
    $("aiProvider").addEventListener("change", function () {
      var p = $("aiProvider").value;
      $("aiModel").value = PROVIDERS[p].model;
    });
    $("aiInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendAi(); }
    });

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape" && $("ai").classList.contains("open")) { closeAi(); return; }
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ($("quiz").hidden || !run) return;
      if ($("ai").classList.contains("open")) return;
      var s = run.st[run.i];
      var open = s.picked === null;
      var k = e.key.toLowerCase();
      var idx = "abcd".indexOf(k);
      if (idx < 0 && k.length === 1 && "1234".indexOf(k) >= 0) idx = "1234".indexOf(k);
      if (idx >= 0 && k.length === 1) { if (open) pick(idx); return; }
      if (k === "h") { showHint(); return; }
      if (k === "s") { skip(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); if (open) skip(); else next(); return; }
      if (e.key === "Enter" && !open && tag !== "BUTTON") { e.preventDefault(); next(); }
    });

    fetch("/api/info").then(function (r) { return r.json(); }).then(function (d) {
      $("pod").textContent = d.hostname;
    }).catch(function () { $("pod").textContent = "unbekannt"; });

    fetch("/api/questions").then(function (r) { return r.json(); }).then(function (data) {
      all = data.filter(valid);
      all.forEach(function (x) { if (groups.indexOf(x.group) < 0) groups.push(x.group); });
      $("lead").textContent = all.length + " Fragen · " + groups.length + " Themen · Tipp · KI-Helfer";
      renderChips();
      show("start");
      previewStrip(true);
    }).catch(function () {
      show("start");
      $("lead").textContent = "Die Fragen konnten nicht geladen werden. Lade die Seite neu.";
    });
  }

  init();
})();
