import { MODELS, LABEL_OPEN, LABEL_CLOSED, RULES } from "./config.js";
import { initStorage, saveSession, getLeaderboard, getSessions } from "./storage.js";

/* global tmPose */
const $ = (id) => document.getElementById(id);
const SIZE = 300;
const TESTS_KEY = "wakkerwacht.tests";

// ---------- UI setup ----------
for (const m of MODELS) $("modelSelect").add(new Option(m.name, m.id));
try { $("playerName").value = localStorage.getItem("wakkerwacht.name") || ""; } catch {}
$("threshold").oninput = (e) => ($("thresholdVal").textContent = Math.round(e.target.value * 100) + "%");

let backendMode = "local";
initStorage().then((mode) => {
  backendMode = mode;
  const b = $("backendBadge");
  b.textContent = mode === "supabase" ? "☁ Supabase" : "💾 lokaal";
  b.className = "badge " + (mode === "supabase" ? "ok" : "local");
  refreshLeaderboard();
  refreshHistory();
});
renderCompare();
let nameTimer;
$("playerName").addEventListener("input", () => { clearTimeout(nameTimer); nameTimer = setTimeout(refreshHistory, 400); });
$("onlyMine").onchange = refreshHistory;

// ---------- State ----------
let model, webcam, rafId, audioCtx, wakeLock, alarmTimer;
let modelInfo, labels = [], threshold = 0.9, pointInterval = 60;
let s; // sessiestate
let lastPrediction = null;
let testTruth = null;

function freshState() {
  return {
    startedAt: performance.now(),
    last: performance.now(),
    candidate: "geen", candidateSince: performance.now(), committed: "geen",
    points: 0, focusSec: 0, streakSec: 0, intervalSec: 0,
    closedMs: 0, alarmActive: false, alarms: 0,
    sinceBreakSec: 0, breakActive: false, breakLeft: 0,
    sinceChallengeSec: 0, challenge: null, locked: false,
    challengesPassed: 0, challengesFailed: 0,
    useChallenge: $("challengeToggle").checked,
    raw: "geen",
    elapsed: 0,          // seconden sinds start
    tlAcc: 0,            // accumulator voor 1 sample/seconde
    timeline: "",        // 1 teken per seconde: o=open d=dicht u=onzeker g=geen gezicht
    events: [],          // [{t, type, v?}]
  };
}

const TL_CHAR = { open: "o", dicht: "d", onzeker: "u", geen: "g" };
function recordTimeline(dt) {
  s.elapsed += dt;
  s.tlAcc += dt;
  while (s.tlAcc >= 1) {
    s.tlAcc -= 1;
    s.timeline += TL_CHAR[s.committed] || "g";
  }
}
function logEvent(type, v) {
  const e = { t: Math.round(s.elapsed), type };
  if (v !== undefined) e.v = v;
  s.events.push(e);
}

// ---------- Start / stop ----------
$("startBtn").onclick = async () => {
  const name = $("playerName").value.trim();
  if (!name) { $("playerName").focus(); return alert("Vul eerst je naam in."); }
  try { localStorage.setItem("wakkerwacht.name", name); } catch {}

  threshold = parseFloat($("threshold").value);
  pointInterval = parseInt($("pointInterval").value, 10);
  modelInfo = MODELS.find((m) => m.id === $("modelSelect").value);

  $("startBtn").disabled = true;
  $("startBtn").textContent = "Model laden…";
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();

    model = await tmPose.load(modelInfo.url + "model.json", modelInfo.url + "metadata.json");
    labels = model.getClassLabels();

    webcam = new tmPose.Webcam(SIZE, SIZE, true);
    await webcam.setup({ facingMode: "user" });
    // iOS Safari: video moet inline + in de DOM staan
    webcam.webcam.setAttribute("playsinline", "");
    webcam.webcam.muted = true;
    webcam.webcam.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(webcam.webcam);
    await webcam.play();

    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}

    buildLabelBars();
    $("setup").classList.add("hidden");
    $("live").classList.remove("hidden");
    s = freshState();
    rafId = requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    alert("Starten mislukt: " + (err.message || err) + "\nCamera vereist HTTPS en toestemming.");
  } finally {
    $("startBtn").disabled = false;
    $("startBtn").textContent = "▶ Start camera";
  }
};

$("stopBtn").onclick = async () => {
  cancelAnimationFrame(rafId);
  stopAlarm();
  webcam?.stop();
  webcam?.webcam?.remove();
  try { await wakeLock?.release(); } catch {}

  const session = {
    player: $("playerName").value.trim().slice(0, 30),
    points: s.points,
    focus_sec: Math.round(s.focusSec),
    duration_sec: Math.round((performance.now() - s.startedAt) / 1000),
    alarms: s.alarms,
    challenges_passed: s.challengesPassed,
    challenges_failed: s.challengesFailed,
    model_id: modelInfo.id,
    threshold,
    timeline: s.timeline,
    events: s.events,
  };
  const ok = await saveSession(session);
  alert(`Sessie bewaard${ok ? "" : " (lokaal – server faalde)"}: ${s.points} punten, ${fmt(session.focus_sec)} focus.`);
  $("live").classList.add("hidden");
  $("setup").classList.remove("hidden");
  $("testPanel").classList.add("hidden");
  refreshLeaderboard();
  refreshHistory();
};

// ---------- Main loop ----------
async function loop() {
  webcam.update();
  const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
  const prediction = await model.predict(posenetOutput);
  lastPrediction = prediction;

  const now = performance.now();
  const dt = Math.min((now - s.last) / 1000, 0.5); // seconden, begrensd bij tab-wissel
  s.last = now;

  const raw = classify(pose, prediction);
  if (raw !== s.candidate) { s.candidate = raw; s.candidateSince = now; }
  if (now - s.candidateSince >= RULES.stableMs) s.committed = s.candidate;

  s.raw = raw;
  update(dt, now);
  recordTimeline(dt);
  if (testTruth) recordTest(prediction);

  draw(pose);
  renderLabels(prediction);
  renderStats();
  rafId = requestAnimationFrame(loop);
}

// Ruwe toestand van deze frame: geen persoon / open / dicht / onzeker
function classify(pose, prediction) {
  if (!pose) return "geen";
  const kp = Object.fromEntries(pose.keypoints.map((k) => [k.part, k.score]));
  const visible = ["nose", "leftEye", "rightEye"].every((p) => (kp[p] || 0) >= RULES.minKeypointScore);
  if (!visible) return "geen";
  const p = Object.fromEntries(prediction.map((x) => [x.className, x.probability]));
  if ((p[LABEL_OPEN] || 0) >= threshold) return "open";
  if ((p[LABEL_CLOSED] || 0) >= threshold) return "dicht";
  return "onzeker";
}

// ---------- Spelregels ----------
function update(dt, now) {
  const st = s.committed;

  // 1) Pauze (20-20-20): ogen rusten of wegkijken telt
  if (s.breakActive) {
    if (st !== "open") s.breakLeft -= dt;
    if (s.breakLeft <= 0) {
      s.breakActive = false;
      s.sinceBreakSec = 0;
      logEvent("break_done");
      flash("✅ Pauze voltooid – focus verder", "info");
    } else {
      showBanner(`☕ Pauze! Kijk 20 s weg van je scherm of sluit je ogen (${Math.ceil(s.breakLeft)} s)`, "break");
    }
    return;
  }

  // 2) Knipper-uitdaging (anti-foppen: een foto kan niet knipperen)
  if (s.challenge) {
    const c = s.challenge;
    if (c.phase === "close") {
      c.closedMs = st === "dicht" ? c.closedMs + dt * 1000 : 0;
      if (c.closedMs >= RULES.challengeHoldMs) c.phase = "reopen";
    } else if (c.phase === "reopen" && st === "open") {
      s.challenge = null;
      s.locked = false;
      s.challengesPassed++;
      s.sinceChallengeSec = 0;
      s.intervalSec = 0; // ogen waren dicht → lopend interval telt niet
      logEvent("challenge_ok");
      flash("✅ Uitdaging gehaald – punten weer actief", "info");
      return;
    }
    const left = (c.deadline - now) / 1000;
    if (left <= 0) {
      s.challenge = null;
      s.locked = true;
      s.challengesFailed++;
      logEvent("challenge_fail");
      s.sinceChallengeSec = RULES.challengeEverySec - 10; // nieuwe poging na 10 s
      flash("❌ Uitdaging gemist – punten geblokkeerd tot je er één haalt", "alarm");
      return;
    }
    showBanner(
      c.phase === "close"
        ? `👁️ Uitdaging: sluit je ogen 1 seconde (${Math.ceil(left)} s)`
        : `👁️ Goed! Open nu je ogen (${Math.ceil(left)} s)`,
      "challenge"
    );
    return;
  }

  // 3) Alarm bij in slaap vallen
  s.closedMs = st === "dicht" ? s.closedMs + dt * 1000 : 0;
  if (!s.alarmActive && s.closedMs >= RULES.alarmAfterMs) {
    s.alarmActive = true;
    s.alarms++;
    s.points = Math.max(0, s.points - RULES.alarmPenalty);
    s.streakSec = 0;
    s.intervalSec = 0;
    logEvent("alarm");
    startAlarm();
  }
  if (s.alarmActive) {
    if (st === "open") { s.alarmActive = false; stopAlarm(); hideBanner(); }
    else { showBanner("⏰ WAKKER WORDEN! Open je ogen", "alarm"); return; }
  }

  // 4) Focus & punten
  // Ogen dicht (stabiel) → lopend interval vervalt: dicht levert NOOIT punten op
  if (st === "dicht") { s.intervalSec = 0; s.streakSec = 0; hideBannerUnlessFlash(); return; }
  if (st === "geen") { s.streakSec = 0; showBanner("Geen gezicht in beeld", "info"); return; }
  // Enkel tellen als zowel de stabiele toestand als déze frame "open" zijn
  // (anders telt de 600 ms debounce na het sluiten van je ogen nog mee)
  if (st !== "open" || s.raw !== "open") { hideBannerUnlessFlash(); return; }

  if (s.locked) { showBanner("🔒 Punten geblokkeerd – wacht op de volgende uitdaging", "info"); }
  else hideBannerUnlessFlash();

  s.focusSec += dt;
  s.streakSec += dt;
  s.sinceBreakSec += dt;
  if (s.useChallenge) s.sinceChallengeSec += dt;

  if (!s.locked) {
    s.intervalSec += dt;
    if (s.intervalSec >= pointInterval) {
      s.intervalSec -= pointInterval;
      s.points += RULES.pointsPerInterval;
      logEvent("points", RULES.pointsPerInterval);
      flash(`+${RULES.pointsPerInterval} punten 🎉`, "info");
      beep(880, 0.12);
    }
  }

  if (s.sinceBreakSec >= RULES.breakAfterSec) {
    s.breakActive = true;
    s.breakLeft = RULES.breakDurationSec;
    logEvent("break");
    beep(520, 0.3);
    navigator.vibrate?.(300);
  } else if (s.useChallenge && s.sinceChallengeSec >= RULES.challengeEverySec) {
    s.challenge = { phase: "close", closedMs: 0, deadline: now + RULES.challengeWindowSec * 1000 };
    logEvent("challenge");
    beep(660, 0.15);
    navigator.vibrate?.(150);
  }
}

// ---------- Rendering ----------
const ctx = $("canvas").getContext("2d");
function draw(pose) {
  ctx.drawImage(webcam.canvas, 0, 0);
  if (pose) {
    tmPose.drawKeypoints(pose.keypoints, RULES.minKeypointScore, ctx);
    tmPose.drawSkeleton(pose.keypoints, RULES.minKeypointScore, ctx);
  }
}

function buildLabelBars() {
  $("labels").innerHTML = labels
    .map((l, i) => `<div class="lbl"><span>${escapeHtml(l)}</span><div class="bar"><div id="bar${i}"></div></div><span id="pct${i}">0%</span></div>`)
    .join("");
}
function renderLabels(prediction) {
  prediction.forEach((p, i) => {
    $("bar" + i).style.width = (p.probability * 100).toFixed(0) + "%";
    $("pct" + i).textContent = (p.probability * 100).toFixed(0) + "%";
  });
}

const STATE_TXT = { open: "👀 ogen open", dicht: "😴 ogen dicht", onzeker: "🤔 onzeker", geen: "🚫 geen gezicht" };
function renderStats() {
  const b = $("stateBadge");
  b.textContent = STATE_TXT[s.committed];
  b.className = "state " + (s.committed === "open" ? "open" : s.committed === "dicht" ? "dicht" : "neutral");
  $("points").textContent = s.points;
  $("focusTime").textContent = fmt(s.focusSec);
  $("streak").textContent = fmt(s.streakSec);
  $("alarms").textContent = s.alarms;
  $("nextPointBar").style.width = Math.min(100, (s.intervalSec / pointInterval) * 100) + "%";
  $("nextPointTxt").textContent = s.locked
    ? "punten geblokkeerd"
    : `volgende +${RULES.pointsPerInterval} over ${Math.ceil(pointInterval - s.intervalSec)} s · pauze over ${fmt(RULES.breakAfterSec - s.sinceBreakSec)}`;
}

let flashUntil = 0;
function showBanner(text, kind) {
  if (performance.now() < flashUntil && kind === "info") return;
  const el = $("banner");
  el.textContent = text;
  el.className = "banner " + kind;
}
function hideBanner() { $("banner").className = "banner hidden"; }
function hideBannerUnlessFlash() { if (performance.now() >= flashUntil) hideBanner(); }
function flash(text, kind) {
  flashUntil = 0;
  showBanner(text, kind);
  flashUntil = performance.now() + 2000;
}

// ---------- Geluid ----------
function beep(freq = 880, dur = 0.2) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.value = freq;
  o.type = "square";
  g.gain.value = 0.15;
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + dur);
}
function startAlarm() {
  stopAlarm();
  const tick = () => { beep(1000, 0.25); navigator.vibrate?.(250); };
  tick();
  alarmTimer = setInterval(tick, 500);
}
function stopAlarm() { clearInterval(alarmTimer); alarmTimer = null; }

// ---------- Testmodus / modelvergelijking ----------
$("testToggle").onclick = () => { $("testPanel").classList.toggle("hidden"); renderTest(); };
document.querySelectorAll(".hold").forEach((btn) => {
  const on = (e) => { e.preventDefault(); testTruth = btn.dataset.truth; btn.classList.add("active"); };
  const off = () => { testTruth = null; btn.classList.remove("active"); };
  btn.addEventListener("pointerdown", on);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, off));
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
});
$("testReset").onclick = () => {
  const all = readTests();
  delete all[modelInfo.id];
  writeTests(all);
  renderTest();
  renderCompare();
};

function readTests() { try { return JSON.parse(localStorage.getItem(TESTS_KEY)) || {}; } catch { return {}; } }
function writeTests(t) { try { localStorage.setItem(TESTS_KEY, JSON.stringify(t)); } catch {} }

let testDirty = 0;
function recordTest(prediction) {
  const top = prediction.reduce((a, b) => (b.probability > a.probability ? b : a));
  const predicted = top.className === LABEL_OPEN ? "open" : top.className === LABEL_CLOSED ? "dicht" : top.className;
  const confident = top.probability >= threshold;
  const all = readTests();
  const m = (all[modelInfo.id] ||= { name: modelInfo.name, open: { open: 0, dicht: 0, unsure: 0 }, dicht: { open: 0, dicht: 0, unsure: 0 } });
  m[testTruth][predicted] = (m[testTruth][predicted] || 0) + 1;
  if (!confident) m[testTruth].unsure++;
  writeTests(all);
  if (++testDirty % 5 === 0) { renderTest(); renderCompare(); }
}

function stats(m) {
  const total = m.open.open + m.open.dicht + m.dicht.open + m.dicht.dicht;
  const correct = m.open.open + m.dicht.dicht;
  const unsure = m.open.unsure + m.dicht.unsure;
  return { total, acc: total ? correct / total : 0, unsure: total ? unsure / total : 0 };
}

function renderTest() {
  const m = readTests()[modelInfo.id];
  if (!m) { $("testResult").innerHTML = '<p class="muted">Nog geen testdata.</p>'; return; }
  const st = stats(m);
  $("testResult").innerHTML = `
    <table>
      <tr><th>echt \\ voorspeld</th><th>open</th><th>dicht</th></tr>
      <tr><td>open</td><td>${m.open.open}</td><td>${m.open.dicht}</td></tr>
      <tr><td>dicht</td><td>${m.dicht.open}</td><td>${m.dicht.dicht}</td></tr>
    </table>
    <p><b>Nauwkeurigheid: ${(st.acc * 100).toFixed(1)}%</b> over ${st.total} frames ·
    ${(st.unsure * 100).toFixed(0)}% onder de drempel</p>`;
}

function renderCompare() {
  const all = readTests();
  const ids = Object.keys(all);
  if (!ids.length) { $("compareTable").innerHTML = '<p class="muted">Nog geen tests uitgevoerd.</p>'; return; }
  $("compareTable").innerHTML = `<table>
    <tr><th>Model</th><th>Frames</th><th>Accuraat</th><th>Open ✓</th><th>Dicht ✓</th><th>&lt; drempel</th></tr>
    ${ids.map((id) => {
      const m = all[id], st = stats(m);
      const po = m.open.open + m.open.dicht, pd = m.dicht.open + m.dicht.dicht;
      return `<tr><td>${escapeHtml(m.name)}</td><td>${st.total}</td><td><b>${(st.acc * 100).toFixed(1)}%</b></td>
        <td>${po ? ((m.open.open / po) * 100).toFixed(0) + "%" : "–"}</td>
        <td>${pd ? ((m.dicht.dicht / pd) * 100).toFixed(0) + "%" : "–"}</td>
        <td>${(st.unsure * 100).toFixed(0)}%</td></tr>`;
    }).join("")}
  </table>`;
}

// ---------- Scorebord ----------
async function refreshLeaderboard() {
  const rows = await getLeaderboard(10);
  $("leaderboard").innerHTML = rows.length
    ? rows.map((r) => `<li>${escapeHtml(r.player)} <span>${r.total_points} pt · ${fmt(r.total_focus_sec)} · ${r.sessions}×</span></li>`).join("")
    : '<li class="muted">Nog geen scores – start een sessie!</li>';
}

// ---------- Sessies terugkijken ----------
let historyRows = [];
async function refreshHistory() {
  const name = $("playerName").value.trim();
  const onlyMine = $("onlyMine").checked && !!name;
  $("sessionDetail").classList.add("hidden");
  historyRows = await getSessions(onlyMine ? name : null);
  const where = backendMode === "supabase" ? "" : " op dit toestel";
  $("historyFor").textContent = historyRows.length
    ? `${historyRows.length} sessie(s)${onlyMine ? ` van ${name}` : ""}${where} – tik om te bekijken.`
    : `Nog geen sessies${onlyMine ? ` van ${name}` : ""}${where}.`;
  $("history").innerHTML = historyRows
    .map((r, i) => `<li><button data-i="${i}">
        <span>${fmtDate(r.created_at)} · ${escapeHtml(r.player)}</span>
        <b>${r.points} pt</b>
        <small>${fmt(r.focus_sec)} focus · ${fmt(r.duration_sec)} duur · ${r.alarms} ⏰${r.timeline ? "" : " · geen tijdlijn"}</small>
      </button></li>`)
    .join("");
  $("history").querySelectorAll("button").forEach((b) => (b.onclick = () => showSession(historyRows[b.dataset.i])));
}

const EVENT_TXT = {
  points: (e) => `+${e.v} punten`,
  alarm: () => "⏰ alarm – ogen te lang dicht",
  challenge: () => "👁️ knipper-uitdaging gestart",
  challenge_ok: () => "✅ uitdaging gehaald",
  challenge_fail: () => "❌ uitdaging gemist",
  break: () => "☕ pauze gestart",
  break_done: () => "✅ pauze voltooid",
};

function showSession(r) {
  const tl = r.timeline || "";
  const count = (c) => [...tl].filter((x) => x === c).length;
  const total = tl.length || 1;
  const pct = (c) => Math.round((count(c) / total) * 100);

  // tijdlijn comprimeren tot runs: "ooooddd" → [["o",4],["d",3]]
  const runs = [];
  for (const ch of tl) {
    if (runs.length && runs[runs.length - 1][0] === ch) runs[runs.length - 1][1]++;
    else runs.push([ch, 1]);
  }
  const NAMES = { o: "open", d: "dicht", u: "onzeker", g: "geen gezicht" };
  const bar = runs
    .map(([ch, n]) => `<div class="tl-${ch}" style="flex:${n}" title="${NAMES[ch]} ${n}s"></div>`)
    .join("");
  const markers = (r.events || [])
    .filter((e) => e.type === "alarm" || e.type === "points")
    .map((e) => `<i class="mk-${e.type}" style="left:${(e.t / total) * 100}%"></i>`)
    .join("");

  $("sessionDetail").innerHTML = `
    <div class="row"><h3>${escapeHtml(r.player)} · ${fmtDate(r.created_at)}</h3><button class="small" id="closeDetail">✕</button></div>
    <div class="stats">
      <div><span>${r.points}</span><small>punten</small></div>
      <div><span>${fmt(r.focus_sec)}</span><small>focus</small></div>
      <div><span>${fmt(r.duration_sec)}</span><small>duur</small></div>
      <div><span>${r.alarms}</span><small>alarmen</small></div>
    </div>
    ${tl ? `<div class="timeline">${bar}${markers}</div>
    <div class="tl-axis"><span>0:00</span><span>${fmt(tl.length)}</span></div>
    <div class="legend">
      <span><i class="tl-o"></i>open ${pct("o")}%</span>
      <span><i class="tl-d"></i>dicht ${pct("d")}%</span>
      <span><i class="tl-u"></i>onzeker ${pct("u")}%</span>
      <span><i class="tl-g"></i>geen gezicht ${pct("g")}%</span>
    </div>` : '<p class="muted">Geen tijdlijn voor deze (oudere) sessie.</p>'}
    <p class="muted">Model ${escapeHtml(r.model_id)} · drempel ${Math.round(r.threshold * 100)}% ·
      uitdagingen ${r.challenges_passed} ✓ / ${r.challenges_failed} ✗</p>
    ${(r.events || []).length ? `<ol class="events">${r.events
      .map((e) => `<li><code>${fmt(e.t)}</code> ${(EVENT_TXT[e.type] || (() => e.type))(e)}</li>`)
      .join("")}</ol>` : ""}`;
  $("sessionDetail").classList.remove("hidden");
  $("closeDetail").onclick = () => $("sessionDetail").classList.add("hidden");
  $("sessionDetail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString("nl-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---------- Helpers ----------
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
