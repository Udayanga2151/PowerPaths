// PowerPaths 2.0 · front-end. Talks to the Google Apps Script in config.js.
const C = window.PP;
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
let state = { token: null, data: null, pending: null, ref: null };

// A random id for this phone/browser (used to count each invite visit once)
let VID = store.get("pp_vid");
if (!VID) { VID = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).toLowerCase(); store.set("pp_vid", VID); }

// ---------- links from the URL ----------
(function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get("t")) store.set("pp_t", p.get("t").toLowerCase());   // personal link → remember this device
  if (p.get("ref")) { state.ref = p.get("ref").toLowerCase(); $("invited").classList.remove("hidden"); }
  if (p.get("t") || p.get("ref")) history.replaceState(null, "", location.pathname);  // hide codes from the address bar
  state.token = store.get("pp_t");
})();

document.querySelectorAll(".reg-link").forEach((a) => (a.href = C.FORM_URL));
document.querySelectorAll(".community-link").forEach((a) => (a.href = C.COMMUNITY_URL));

// ---------- talking to Apps Script ----------
async function getInit() {
  const r = await fetch(`${C.SCRIPT_URL}?a=init&t=${encodeURIComponent(state.token || "")}&v=${encodeURIComponent(VID)}`);
  return r.json();
}
async function post(body) {
  // no "content-type" header → no CORS pre-flight, works with Apps Script
  const r = await fetch(C.SCRIPT_URL, { method: "POST", body: JSON.stringify({ ...body, v: VID }) });
  return r.json();
}

// ---------- questions ----------
// QUIZ card: polls (+ opinions) share ONE "Submit my answers" button. Answered once, then locked, and polls show ✓ / ✗ right away.
// ASK card: "Ask the expert" questions have their own button and can be edited.
const KIND = {
  poll: { tag: "Quick quiz", ico: "chart" },
  opinion: { tag: "Your opinion", ico: "bulb", ph: "Your idea…" },
  ask: { tag: "Ask the expert", ico: "mic", ph: "Your question for the resource person…" },
};
const minFor = (q, d) => (q.type === "ask" ? d.minLenAsk || 10 : d.minLen);
const saved = {};   // what is already saved for each question
const fmtClose = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Colombo" });
const isQuiz = (q) => q.type !== "ask";

/** One question block (tag, text, input). Returns {q, get, msg, el, lock}. */
function questionBlock(q, d) {
  const type = KIND[q.type] ? q.type : "opinion", K = KIND[type];
  const el = document.createElement("div");
  el.className = "qi q-" + type;
  el.innerHTML = `<span class="tag"></span><p class="text"></p><div class="field"></div><p class="msg"></p>`;
  let tag = K.tag + (q.webinar ? ` · Webinar ${String(q.webinar).padStart(2, "0")}` : "");
  if (q.closes) tag += " · Closes " + fmtClose(q.closes);
  el.querySelector(".tag").textContent = tag;
  el.querySelector(".tag").insertAdjacentHTML("afterbegin", ico(K.ico));
  el.querySelector(".text").textContent = q.text;
  const field = el.querySelector(".field"), msg = el.querySelector(".msg");
  const mine = d.myAnswers && d.myAnswers[q.id];
  if (mine) saved[q.id] = mine;
  const it = { q, msg, el };
  if (type === "poll") {
    q.options.forEach((o) => {
      const lab = document.createElement("label");
      lab.className = "opt";
      lab.innerHTML = `<input type="radio"><span class="otext"></span><span class="mark" aria-hidden="true"></span>`;
      const r = lab.querySelector("input");
      r.name = "poll-" + q.id; r.value = o;
      if (mine && mine.toLowerCase() === o.toLowerCase()) r.checked = true;
      lab.querySelector(".otext").textContent = o;
      field.appendChild(lab);
    });
    it.get = () => { const c = field.querySelector("input:checked"); return c ? c.value : ""; };
    it.lock = (answer, correct, animate) => showResult(it, answer, correct, animate);
  } else {
    const ta = document.createElement("textarea");
    ta.placeholder = K.ph; ta.maxLength = d.maxLen;
    if (mine) ta.value = mine;
    const cnt = document.createElement("span");
    cnt.className = "count";
    field.append(ta, cnt);
    const min = minFor(q, d);
    const upd = () => (cnt.textContent = `${ta.value.trim().length} / ${d.maxLen}` + (ta.value.trim().length < min ? ` (min ${min})` : "") + (type === "ask" ? " · only the team sees it" : ""));
    ta.addEventListener("input", upd); upd();
    it.get = () => ta.value.trim();
    it.lock = () => { it.locked = true; ta.readOnly = true; cnt.remove(); el.classList.add("locked"); msg.className = "msg ok"; msg.textContent = "✓ Submitted"; };
    if (type === "ask" && mine) { msg.className = "msg ok"; msg.textContent = "✓ Sent. You can still edit it."; }
  }
  if (mine && isQuiz(q)) { it.locked = true; it.lock(mine, (d.myResults || {})[q.id] || "", false); }
  return it;
}

/** Poll result: lock the options, colour the right one green and a wrong pick red. */
function showResult(it, answer, correct, animate) {
  it.locked = true;
  const opts = [...it.el.querySelectorAll(".opt")];
  it.el.classList.add("locked");
  opts.forEach((lab, i) => {
    const inp = lab.querySelector("input"), v = inp.value;
    inp.disabled = true;
    inp.checked = v.toLowerCase() === String(answer).toLowerCase();
    lab.classList.remove("right", "wrong", "answer");
    if (correct && v.toLowerCase() === correct.toLowerCase()) lab.classList.add(inp.checked ? "right" : "answer");
    else if (correct && inp.checked) lab.classList.add("wrong");
    else if (!correct && inp.checked) lab.classList.add("picked");
    if (animate) lab.style.animationDelay = i * 60 + "ms";
  });
  it.el.classList.toggle("animate", !!animate);
  const ok = correct && String(answer).toLowerCase() === correct.toLowerCase();
  it.msg.className = "msg " + (correct ? (ok ? "ok" : "bad") : "ok");
  it.msg.textContent = !correct ? "Vote saved" : ok ? "Correct! Well done" : `Not quite. The right answer is ${correct}`;
  it.msg.insertAdjacentHTML("afterbegin", ico(!correct || ok ? "check" : "x"));
  return ok;
}

function renderQuestions(d) {
  const box = $("questions");
  box.innerHTML = "";
  renderClosedPolls(d);
  if (!d.questions.length) {
    box.innerHTML = `<div class="card mute small">No open question right now. A new one is coming soon, so watch the WhatsApp community!</div>`;
    return;
  }
  const quiz = d.questions.filter(isQuiz).sort((a, b) => (a.type === "poll" ? 0 : 1) - (b.type === "poll" ? 0 : 1));
  const asks = d.questions.filter((q) => !isQuiz(q));
  if (quiz.length) box.appendChild(questionCard(quiz, d, "Submit my answers", "q-main"));
  asks.forEach((q) => box.appendChild(questionCard([q], d, "Send question", "q-ask-card")));
}

/** A card with one or more questions and ONE button. */
function questionCard(list, d, label, cls) {
  const card = document.createElement("div");
  card.className = "q " + cls;
  const items = list.map((q) => questionBlock(q, d));
  items.forEach((it) => card.appendChild(it.el));
  const foot = document.createElement("div");
  foot.className = "qfoot";
  foot.innerHTML = `<p class="msg"></p><button class="btn"></button>`;
  const btn = foot.querySelector("button"), msg = foot.querySelector(".msg");
  card.appendChild(foot);
  const job = { items, btn, msg, label, card, quiz: cls === "q-main" };
  setButton(job, d);
  if (job.quiz && items.every((it) => it.locked)) summary(job, d, false);
  btn.addEventListener("click", () => submitCard(job, d));
  return card;
}

function setButton(job) {
  if (job.quiz && job.items.every((it) => it.locked)) {
    job.btn.textContent = "✓ You have submitted"; job.btn.disabled = true; job.btn.classList.add("done");
  } else {
    job.btn.disabled = false; job.btn.classList.remove("done");
    job.btn.textContent = !job.quiz && job.items.every((it) => saved[it.q.id]) ? "Update" : job.label;
  }
}

/** Score line under the quiz, e.g. "You got 2 of 3 right" (+ a little celebration when all are right). */
function summary(job, d, animate) {
  const polls = job.items.filter((it) => it.q.type === "poll" && it.el.querySelector(".opt.right, .opt.wrong"));
  if (!polls.length) return;
  const right = polls.filter((it) => it.el.querySelector(".opt.right")).length;
  job.msg.className = "msg score";
  const bonus = right * (d.points.pollCorrect || 0);
  job.msg.textContent = right === polls.length ? `${right} / ${polls.length} correct! +${bonus} bonus points` : right ? `You got ${right} / ${polls.length} right · +${bonus} bonus points` : `0 / ${polls.length} this time. Come back tomorrow for new questions! 💪`;
  if (animate && right === polls.length) celebrate(job.card);
}

function celebrate(card) {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const burst = document.createElement("div");
  burst.className = "burst";
  for (let i = 0; i < 18; i++) {
    const s = document.createElement("i");
    s.textContent = "✦";
    s.style.setProperty("--a", (i * 20) + "deg");
    s.style.setProperty("--d", 60 + (i % 4) * 22 + "px");
    burst.appendChild(s);
  }
  card.appendChild(burst);
  setTimeout(() => burst.remove(), 1400);
}

/** Check what is filled in. Returns the answers to send, or null if nothing can be sent. */
function collect(job, d) {
  const send = [];
  job.msg.className = "msg"; job.msg.textContent = "";
  job.items.forEach((it) => {
    if (it.locked) return;
    const v = it.get();
    if (!(it.msg.className.includes("ok") && saved[it.q.id] === v)) { it.msg.className = "msg"; it.msg.textContent = ""; }
    if (!v || saved[it.q.id] === v) return;                       // empty or unchanged: skip
    if (it.q.type !== "poll" && v.length < minFor(it.q, d)) {
      it.msg.className = "msg err"; it.msg.textContent = `Please write at least ${minFor(it.q, d)} characters.`;
      return;
    }
    send.push({ it, text: v });
  });
  const hasErr = job.items.some((it) => it.msg.className.includes("err"));
  if (!send.length) {
    if (!hasErr) {
      job.msg.className = "msg err";
      job.msg.textContent = !job.quiz && job.items.every((it) => saved[it.q.id]) ? "Nothing changed." : job.items.length > 1 ? "Answer at least one question." : job.quiz ? "Please pick an answer." : "Please write your question.";
    }
    return null;
  }
  // quiz: answers are final, so check before sending
  if (job.quiz) {
    const open = job.items.filter((it) => !it.locked).length;
    const warn = send.length < open ? `You answered ${send.length} of ${open}. ` : "";
    if (!confirm(`${warn}Submit now? Quiz answers can't be changed after you submit.`)) return null;
  }
  return send;
}

/** Sends the answers one by one. The first one may carry the phone/email (first time on this device). */
async function sendAll(send, ident) {
  let registered = true;
  for (const { it, text } of send) {
    const body = { a: "answer", qid: it.q.id, text };
    if (state.token) body.t = state.token; else Object.assign(body, ident);
    const r = await post(body);
    if (r.needLogin) { store.set("pp_t", ""); state.token = null; return { needLogin: true }; }
    if (!r.ok && r.locked) { saved[it.q.id] = r.answer; it.lock(r.answer, r.correct || "", true); continue; }   // answered before (other device)
    if (!r.ok) {
      it.msg.className = "msg err"; it.msg.textContent = r.error || "Couldn't save. Try again.";
      if (!state.token) throw new Error(r.error);   // first answer failed: stop and show it in the form
      continue;
    }
    if (r.token && !state.token) { store.set("pp_t", r.token); state.token = r.token; }
    saved[it.q.id] = text;
    if (isQuiz(it.q)) it.lock(text, r.correct || "", true);
    else { it.msg.className = "msg ok"; it.msg.textContent = "✓ Question sent! The team picks questions to ask live at the webinar."; }
    if (!r.registered) registered = false;
  }
  return { registered };
}

function afterSend(job, r) {
  job.msg.className = "msg"; job.msg.textContent = "";
  setButton(job);
  if (job.quiz) summary(job, state.data || { points: {} }, true);
  if (!r.registered) setTimeout(() => $("regnudge").classList.remove("hidden"), job.quiz ? 1600 : 0);
  refresh();
}

async function submitCard(job, d) {
  const send = collect(job, d);
  if (!send) return;
  if (!state.token) { state.pending = { job, send }; openSheet(); return; }   // first time on this device
  job.btn.disabled = true; job.msg.className = "msg"; job.msg.textContent = "Checking your answers…";
  try {
    const r = await sendAll(send);
    if (r.needLogin) { state.pending = { job, send }; openSheet(); return; }
    afterSend(job, r);
  } catch (e) { job.msg.className = "msg err"; job.msg.textContent = e.message || "Something went wrong. Try again."; setButton(job); }
}

/** Polls that closed: show the right answer (and whether you got it). */
function renderClosedPolls(d) {
  const box = $("results");
  box.innerHTML = "";
  (d.closedPolls || []).forEach((p) => {
    const mine = d.myAnswers && d.myAnswers[p.id];
    const el = document.createElement("div");
    el.className = "result";
    el.innerHTML = `<span class="tag">${ico("check")}Yesterday's quiz</span><p class="text"></p><p class="ans">Correct answer: <b></b></p><p class="you"></p>`;
    el.querySelector(".text").textContent = p.text;
    el.querySelector(".ans b").textContent = p.correct;
    const you = el.querySelector(".you");
    if (mine) {
      const right = mine.toLowerCase() === p.correct.toLowerCase();
      you.textContent = right ? `You answered ${mine}. Well done!` : `You answered ${mine}.`;
      you.className = "you " + (right ? "right" : "wrong");
    } else you.remove();
    box.appendChild(el);
  });
}

// ---------- "who are you" sheet ----------
function openSheet() {
  const f = $("idform");
  $("guest-fields").classList.add("hidden");
  $("sheet-msg").textContent = "";
  $("sheet-go").textContent = "Continue";
  $("sheet").classList.remove("hidden");
  f.phone.focus();
}
$("sheet-close").onclick = () => $("sheet").classList.add("hidden");
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest(".sheet").classList.add("hidden")));
$("uni-select").onchange = (e) => $("uni-other").classList.toggle("hidden", e.target.value !== "__other");

$("idform").onsubmit = async (ev) => {
  ev.preventDefault();
  const f = ev.target, p = state.pending, go = $("sheet-go"), m = $("sheet-msg");
  const guest = !$("guest-fields").classList.contains("hidden");
  const ident = { phone: f.phone.value, email: f.email.value };
  if (guest) {
    ident.name = f.name.value.trim();
    ident.uni = f.uni.value === "__other" ? f.uniOther.value.trim() : f.uni.value;
    if (!ident.name || !ident.uni) { m.className = "msg err"; m.textContent = "Please add your name and university."; return; }
  }
  go.disabled = true; m.className = "msg"; m.textContent = "Checking…";
  try {
    // First check if this number is registered (only when not already in guest mode)
    if (!guest) {
      const l = await post({ a: "login", ...ident });
      if (!l.ok) throw new Error(l.error);
      if (!l.registered) {                       // not registered → ask name + university
        $("guest-fields").classList.remove("hidden");
        m.textContent = ""; go.textContent = "Save my answers"; f.name.focus();
        return;
      }
      store.set("pp_t", l.token); state.token = l.token;   // registered: remembered on this device from now on
    }
    const r = await sendAll(p.send, ident);
    if (!state.token) throw new Error("Couldn't save. Please check your details.");
    $("sheet").classList.add("hidden");
    afterSend(p.job, r);
  } catch (e) { m.className = "msg err"; m.textContent = e.message || "Something went wrong. Try again."; }
  finally { go.disabled = false; }
};

// ---------- invite + leaderboard ----------
// vector icons (from the sprite in index.html) and rank badges, instead of emoji
const ico = (n, c = "ic") => n ? `<svg class="${c}" aria-hidden="true"><use href="#i-${n}"/></svg>` : "";
// 1st / 2nd / 3rd: a metal hexagon badge with the number; colour by rank so ties share it
function badge(rank, size) {
  const m = ["gold", "silver", "bronze"][rank - 1];
  if (!m) return `<span class="rk">${rank}</span>`;
  return `<svg class="badge ${size} ${m}" viewBox="0 0 48 52" aria-label="Rank ${rank}"><path class="hex" d="M24 2 44 13.5v25L24 50 4 38.5v-25z" fill="url(#g-${m})"/>` +
    `<path d="M24 7.5 39.5 16.5v19L24 44.5 8.5 35.5v-19z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2"/>` +
    `<text x="24" y="32.5" text-anchor="middle">${rank}</text></svg>`;
}

function li(rank, title, sub, pts) {
  const el = document.createElement("li");
  if (rank <= 3) el.className = "t" + rank;
  el.innerHTML = `<span class="r"></span><span class="who"><b></b><span></span></span><span class="pts"></span>`;
  if (rank <= 3) el.querySelector(".r").innerHTML = badge(rank, "sm"); else el.querySelector(".r").innerHTML = `<span class="rk">${rank}</span>`;
  el.querySelector(".who b").textContent = title;
  el.querySelector(".who span").textContent = sub;
  el.querySelector(".pts").textContent = pts + " pts";
  return el;
}

// numbers run up when they scroll into view (the first time), and from the old value on later updates.
// opts.from: start value for the first run (default 0), opts.prefix: e.g. "#" for the rank
const reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const seenIO = "IntersectionObserver" in window ? new IntersectionObserver((list) => list.forEach((e) => {
  if (!e.isIntersecting) return;
  seenIO.unobserve(e.target); e.target.dataset.seen = "1"; runCount(e.target);
}), { threshold: 0.6 }) : null;
function runCount(el) {
  const pre = el.dataset.pre || "", to = Number(el.dataset.to) || 0;
  const from = parseInt(String(el.textContent).replace(/[^\d-]/g, ""), 10) || 0;
  if (from === to || reduceMotion) { el.textContent = pre + to; return; }
  const t0 = performance.now(), dur = 1100;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = pre + Math.round(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function countUp(el, to, opts = {}) {
  el.dataset.to = Number(to) || 0; el.dataset.pre = opts.prefix || "";
  if (seenIO && !reduceMotion && !el.dataset.seen) {        // not looked at yet: wait until it scrolls into view
    el.textContent = el.dataset.pre + (opts.from || 0);
    seenIO.observe(el);
    return;
  }
  runCount(el);
}

// is this leaderboard row the person looking at the site?
const isMe = (r, me) => !!(me && me.registered && r.rank === me.rank && r.points === me.points && r.uni === me.uni &&
  String(r.name).split(" ")[0].toLowerCase() === String(me.name).split(/\s+/)[0].toLowerCase());

// top 3 as a podium: 2nd | 1st | 3rd
function podium(rows, me) {
  const el = document.createElement("li");
  el.className = "podium";
  [1, 0, 2].forEach((i) => {
    const r = rows[i];
    if (!r) return;
    const p = document.createElement("div");
    p.className = "pod r" + r.rank + (i === 0 ? " mid" : "") + (isMe(r, me) ? " me-row" : "");  // colour by rank (ties share it), centre one is taller
    p.innerHTML = `<span class="medal"></span><b class="nm"></b><span class="un"></span><strong class="pp"><span>0</span> pts</strong><small></small><em class="you">You</em>`;
    p.querySelector(".medal").innerHTML = badge(r.rank, i === 0 ? "lg" : "md");
    p.querySelector(".nm").textContent = r.name;
    p.querySelector(".un").textContent = r.uni;
    p.querySelector("small").textContent = `${r.answers} answers · ${r.visits} invites · ${r.joins} joined`;
    countUp(p.querySelector(".pp span"), r.points);
    el.appendChild(p);
  });
  return el;
}

function renderMe(d) {
  const me = d.me;
  if (me && me.registered) {
    $("hello").textContent = `Hi ${me.name} · #${me.rank} of ${me.of}`; $("hello").insertAdjacentHTML("afterbegin", ico("user"));
    $("hello").classList.remove("hidden");
    countUp($("me-rank"), me.rank, { from: me.of, prefix: "#" }); $("me-of").textContent = ` of ${me.of}`;
    countUp($("me-points"), me.points); countUp($("me-refs"), me.visits); countUp($("me-ans"), me.answers); countUp($("me-joins"), me.joins || 0);
    $("me-card").classList.remove("hidden");
    const link = `${location.origin}${location.pathname}?ref=${me.ref}`;
    $("ref-link").value = link;
    $("ref-pts").textContent = d.points.visit;
    $("join-pts").textContent = d.points.join;
    $("wa-share").href = "https://wa.me/?text=" + encodeURIComponent(
      `PowerPaths 2.0: a free IEEE PES webinar series on the future of Sri Lanka's electricity sector. Register and answer the daily question with me!\n${link}`);
    $("invite").classList.remove("hidden");
  } else if (me && !me.registered) {
    $("hello").textContent = "Welcome back! Register to get on the leaderboard"; $("hello").insertAdjacentHTML("afterbegin", ico("user"));
    $("hello").classList.remove("hidden");
  }
}

function renderBoard(d) {
  const st = $("students"), un = $("unis");
  st.innerHTML = ""; un.innerHTML = "";
  if (!d.top.length) st.innerHTML = `<li class="mute small">No points yet. Answer today's question and be the first!</li>`;
  if (d.top.length >= 3) st.appendChild(podium(d.top, d.me));
  d.top.slice(d.top.length >= 3 ? 3 : 0).forEach((r) => {
    const row = li(r.rank, r.name, `${r.uni} · ${r.answers} answers · ${r.visits} invites · ${r.joins} joined`, r.points);
    if (isMe(r, d.me)) { row.classList.add("me-row"); row.querySelector(".who b").insertAdjacentHTML("beforeend", ' <em class="you">You</em>'); }
    st.appendChild(row);
  });
  d.unis.forEach((u) => un.appendChild(li(u.rank, u.uni, `${u.students} registered · ${u.answers || 0} answers · ${u.visits || 0} invites · ${u.joins || 0} joined`, u.points)));
  const P = d.points;
  // keep the points cards in step with the server's numbers (the HTML already has the defaults, so they show at once)
  const v = { ...P, pollMax: P.poll + P.pollCorrect, askMax: P.ask + P.askPicked };
  document.querySelectorAll("[data-p]").forEach((e) => { if (v[e.dataset.p] !== undefined) e.textContent = v[e.dataset.p]; });
  const sel = $("uni-select");
  sel.innerHTML = `<option value="">Select…</option>` + d.unisList.map((u) => `<option></option>`).join("") + `<option value="__other">Other</option>`;
  d.unisList.forEach((u, i) => { sel.options[i + 1].value = u; sel.options[i + 1].textContent = u; });
}

document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
  $("students").classList.toggle("hidden", t.dataset.tab !== "students");
  $("unis").classList.toggle("hidden", t.dataset.tab !== "unis");
}));

$("copy-btn").onclick = async () => {
  try { await navigator.clipboard.writeText($("ref-link").value); $("copy-btn").textContent = "Copied ✓"; }
  catch { $("ref-link").select(); }
};

// ---------- start ----------
// Speed: show what we had last time immediately, then update with fresh data.
function showCached() {
  try {
    const c = JSON.parse(store.get("pp_cache") || "null");
    if (!c || c.t !== (state.token || "") || Date.now() - c.at > 6 * 3600e3) return;
    renderMe(c.d); renderBoard(c.d);
  } catch {}
}

async function refresh(first) {
  try {
    const d = await getInit();
    if (!d.ok) throw new Error(d.error);
    state.data = d;
    if (first) renderQuestions(d); else renderClosedPolls(d);
    renderMe(d); renderBoard(d);
    store.set("pp_cache", JSON.stringify({ t: state.token || "", at: Date.now(), d: { ...d, questions: [], myAnswers: {} } }));
  } catch (e) {
    if (first) $("questions").innerHTML = `<div class="card mute small">Couldn't load right now. Please refresh the page.</div>`;
  }
}
showCached();
refresh(true);

// ---------- carousels ("How to get points" + "The Series") ----------
// Auto-slides; the active card pops up with a green light running round it.
// Stops while the mouse is over it, or for 8 s after someone touches / swipes it.
function carousel(track, dots, ms, center) {
  if (!track) return;
  const cards = [...track.children];
  let idx = 0, timer = null, resume = null, auto = false;
  const left = (i) => center ? cards[i].offsetLeft - (track.clientWidth - cards[i].offsetWidth) / 2 : cards[i].offsetLeft - 4;
  const show = (i, scroll = true) => {
    idx = (i + cards.length) % cards.length;
    cards.forEach((c, k) => c.classList.toggle("on", k === idx));
    if (dots) [...dots.children].forEach((b, k) => b.classList.toggle("on", k === idx));
    if (scroll) { auto = true; track.scrollTo({ left: left(idx), behavior: "smooth" }); setTimeout(() => (auto = false), 700); }
  };
  if (dots) {
    dots.innerHTML = "";
    cards.forEach((_, k) => { const b = document.createElement("button"); b.setAttribute("aria-label", `Card ${k + 1}`); b.onclick = () => { show(k); pause(); }; dots.appendChild(b); });
  }
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = () => { if (!reduce && !timer) timer = setInterval(() => show(idx + 1), ms); };
  const stop = () => { clearInterval(timer); timer = null; clearTimeout(resume); };
  const pause = () => { stop(); resume = setTimeout(start, 8000); };
  // a swipe by hand: the card nearest the middle (or left edge) becomes the active one
  track.addEventListener("scroll", () => {
    if (auto) return;
    const pos = track.scrollLeft; let best = 0;
    cards.forEach((_, k) => { if (Math.abs(left(k) - pos) < Math.abs(left(best) - pos)) best = k; });
    if (best !== idx) show(best, false);
  }, { passive: true });
  ["pointerdown", "touchstart", "wheel", "focusin"].forEach((e) => track.addEventListener(e, pause, { passive: true }));
  track.addEventListener("mouseenter", stop);
  track.addEventListener("mouseleave", () => { clearTimeout(resume); start(); });
  show(0, false); start();
}
carousel($("pts-track"), $("pts-dots"), 2600, true);
carousel($("series"), $("dots"), 3200, false);
// ---------- "Share my rank" / "Share my university": a story-size image made right here in the browser ----------
const loadScript = (src) => new Promise((ok, bad) => {
  if (window.qrcode) return ok();
  const sc = document.createElement("script"); sc.src = src; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc);
});
const loadImg = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
const shortNm = (n) => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); if (!p.length) return "";
  const f = p[0].charAt(0).toUpperCase() + p[0].slice(1).toLowerCase(); return p.length > 1 ? `${f} ${p[p.length - 1].charAt(0).toUpperCase()}.` : f; };
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");

function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// text that shrinks until it fits the width
function fitText(c, text, x, y, maxW, size, weight) {
  let s = size; do { c.font = `${weight} ${s}px Poppins, sans-serif`; s -= 2; } while (c.measureText(text).width > maxW && s > 12);
  c.fillText(text, x, y);
}
// letter-spaced line, centred on x
function spaced(c, text, x, y, gap) {
  const ws = [...text].map((ch) => c.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
  let cx = x - total / 2; c.textAlign = "left";
  [...text].forEach((ch, i) => { c.fillText(ch, cx, y); cx += ws[i] + gap; });
  c.textAlign = "center"; return total;
}
function wrap(c, text, maxW) {
  const out = []; let line = "";
  text.split(" ").forEach((w) => { const t = line ? line + " " + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
  if (line) out.push(line); return out;
}

async function drawCard(kind, v) {
  await Promise.all([document.fonts.load("700 60px Poppins"), document.fonts.load("400 30px Poppins")]).catch(() => {});
  await loadScript("qrcode.js").catch(() => {});
  const [logo, logos] = await Promise.all([loadImg("logo.png"), loadImg("logos.png")]);
  const W = 1080, H = 1920, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d"); c.textAlign = "center"; c.textBaseline = "alphabetic";
  const G = "#5BE074";
  // background + glow + dots
  let g = c.createLinearGradient(0, 0, W * 0.5, H); g.addColorStop(0, "#062512"); g.addColorStop(0.5, "#03170b"); g.addColorStop(1, "#010a05");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  g = c.createRadialGradient(540, 590, 0, 540, 590, 640); g.addColorStop(0, "rgba(57,181,74,.45)"); g.addColorStop(1, "rgba(57,181,74,0)");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255,255,255,.05)";
  for (let y = 11; y < H; y += 22) for (let x = 11; x < W; x += 22) c.fillRect(x, y, 2, 2);
  // logo pill
  if (logo) { const lh = 46, lw = logo.width * lh / logo.height; c.fillStyle = "#fff"; c.shadowColor = "rgba(0,0,0,.4)"; c.shadowBlur = 30;
    rrect(c, (W - lw) / 2 - 36, 90, lw + 72, lh + 36, 22); c.fill(); c.shadowBlur = 0; c.drawImage(logo, (W - lw) / 2, 108, lw, lh); }
  // kicker
  c.font = "700 30px Poppins, sans-serif"; c.fillStyle = G;
  const kw = spaced(c, v.kick, 552, 296, 10);
  c.beginPath(); c.arc(552 - kw / 2 - 24, 286, 7, 0, 7); c.fill();
  // ring with the rank
  const cx = 540, cy = 582, R = 232;
  c.save(); c.shadowColor = "rgba(91,224,116,.55)"; c.shadowBlur = 80;
  g = c.createConicGradient ? c.createConicGradient(3.5, cx, cy) : c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  [[0, G], [0.35, "#b6ffc2"], [0.7, "#2f9e43"], [1, G]].forEach(([o, col]) => g.addColorStop(o, col));
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fillStyle = g; c.fill(); c.restore();
  g = c.createRadialGradient(cx, cy - 80, 0, cx, cy, R); g.addColorStop(0, "#0f3a20"); g.addColorStop(0.7, "#041a0c"); g.addColorStop(1, "#041a0c");
  c.beginPath(); c.arc(cx, cy, R - 10, 0, Math.PI * 2); c.fillStyle = g; c.fill();
  g = c.createLinearGradient(0, cy - 150, 0, cy + 40); g.addColorStop(0, "#e6ffea"); g.addColorStop(0.6, G); g.addColorStop(1, "#2f9e43");
  c.fillStyle = g; fitText(c, "#" + v.rank, cx, cy + 50, 380, 210, 700);
  c.fillStyle = "#b9dcc3"; c.font = "400 34px Poppins, sans-serif"; c.fillText(v.of, cx, cy + 112);
  // name + subtitle
  c.fillStyle = "#fff"; fitText(c, v.title, 540, 940, 920, 76, 700);
  c.fillStyle = "#b9dcc3"; fitText(c, v.sub, 540, 1004, 920, 36, 400);
  // 4 stat boxes
  v.stats.forEach(([label, val], i) => {
    const x = 80 + i * 235, y = 1075;
    rrect(c, x, y, 215, 152, 26); c.fillStyle = "rgba(255,255,255,.04)"; c.fill(); c.strokeStyle = "rgba(91,224,116,.35)"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "#fff"; fitText(c, fmtNum(val), x + 107, y + 82, 190, 60, 700);
    c.fillStyle = "#9fcfae"; c.font = "400 22px Poppins, sans-serif"; spaced(c, label.toUpperCase(), x + 107, y + 124, 3);
  });
  // invite box with QR (their own invite link, so scans count for them)
  const by = 1292;
  rrect(c, 80, by, 920, 270, 32); c.fillStyle = "rgba(91,224,116,.08)"; c.fill();
  c.setLineDash([10, 8]); c.strokeStyle = "rgba(91,224,116,.5)"; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
  rrect(c, 116, by + 30, 210, 210, 20); c.fillStyle = "#fff"; c.fill();
  if (window.qrcode) {
    const q = qrcode(0, "M"); q.addData(v.link); q.make();
    const n = q.getModuleCount(), cell = 182 / n; c.fillStyle = "#03140a";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(130 + k * cell, by + 44 + r * cell, cell + 0.4, cell + 0.4);
  }
  c.textAlign = "left"; c.fillStyle = "#fff"; fitText(c, v.h3, 360, by + 98, 610, 46, 700);
  c.font = "400 28px Poppins, sans-serif"; c.fillStyle = "#cfe8d6";
  wrap(c, v.p, 600).forEach((ln, i) => c.fillText(ln, 360, by + 148 + i * 40));
  c.fillStyle = G; c.font = "700 30px Poppins, sans-serif"; c.fillText(location.host || "powerpaths.pages.dev", 360, by + 148 + wrap(c, v.p, 600).length * 40 + 4);
  c.textAlign = "center";
  // date + time it was shared
  c.fillStyle = "#8fb59b"; c.font = "400 26px Poppins, sans-serif";
  c.fillText("Ranked on " + new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Colombo" }) + " · " +
    new Date().toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Colombo" }), 540, 1742);
  // white footer with the logos
  c.fillStyle = "#fff"; c.fillRect(0, 1780, W, 140);
  if (logos) { const s2 = Math.min(1000 / logos.width, 104 / logos.height), lw = logos.width * s2, lh = logos.height * s2; c.drawImage(logos, (W - lw) / 2, 1850 - lh / 2, lw, lh); }
  return cv;
}

function cardData(kind) {
  const d = state.data || {}, me = d.me || {}, link = `${location.origin}${location.pathname}?ref=${me.ref || ""}`;
  if (kind === "uni") {
    const unis = d.unis || [], u = unis.find((x) => x.uni === me.uni) || { rank: "–", points: 0, students: 0, answers: 0, joins: 0 };
    return { kick: "UNIVERSITY RANKING", rank: u.rank, of: `of ${unis.length} universities`, title: me.uni || "", sub: "PowerPaths 2.0 · IEEE PES webinar series",
      stats: [["Points", u.points], ["Students", u.students], ["Answers", u.answers || 0], ["Joins", u.joins || 0]],
      h3: u.rank === 1 ? "Help us stay #1!" : "Help us reach #1!", p: "Register, answer the daily quiz and add points for your university at", link,
      text: `${me.uni} is #${u.rank} on the PowerPaths 2.0 leaderboard! Register and help us climb: ${link}` };
  }
  return { kick: "MY POWERPATHS RANK", rank: me.rank, of: `of ${me.of} students`, title: shortNm(me.name), sub: me.uni || "",
    stats: [["Points", me.points], ["Answers", me.answers], ["Invites", me.visits], ["Joins", me.joins || 0]],
    h3: "Can you beat my rank?", p: "Scan, answer the daily quiz and climb the leaderboard at", link,
    text: `I'm #${me.rank} on the PowerPaths 2.0 leaderboard! Can you beat my rank? ${link}` };
}

async function shareCard(kind, btn) {
  const msg = $("share-msg"), label = btn.innerHTML;
  btn.disabled = true; msg.textContent = "Making your card…";
  try {
    const v = cardData(kind), cv = await drawCard(kind, v);
    const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
    const file = new File([blob], `powerpaths-${kind === "uni" ? "university" : "my"}-rank.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: v.text }); msg.textContent = ""; }
      catch (e) { msg.textContent = e && e.name === "AbortError" ? "" : "Couldn't open sharing. Try again."; }
    } else {                                    // desktop: download the picture
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg.textContent = "✓ Card downloaded. Post it on your WhatsApp status or Instagram story!";
    }
  } catch (e) { msg.textContent = "Couldn't make the card. Please try again."; }
  btn.disabled = false; btn.innerHTML = label;
}
$("share-me").addEventListener("click", (e) => shareCard("me", e.currentTarget));
$("share-uni").addEventListener("click", (e) => shareCard("uni", e.currentTarget));
window.__ppCard = (kind) => drawCard(kind, cardData(kind)).then((cv) => cv.toDataURL("image/png"));   // used by the preview script

// Opened through someone's invite link → tell the server (counted once per phone)
if (state.ref) post({ a: "visit", ref: state.ref, t: state.token || "" }).catch(() => {});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
