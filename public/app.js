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
  poll: { tag: "📊 Quick quiz" },
  opinion: { tag: "💡 Your opinion", ph: "Your idea…" },
  ask: { tag: "🎤 Ask the expert", ph: "Your question for the resource person…" },
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
    const upd = () => (cnt.textContent = `${ta.value.trim().length} / ${d.maxLen}` + (ta.value.trim().length < min ? ` (min ${min})` : "") + (type === "ask" ? " · 🔒 only the team sees it" : ""));
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
  it.msg.textContent = !correct ? "✓ Vote saved" : ok ? "✅ Correct! Well done" : `❌ Not quite. The right answer is ${correct}`;
  return ok;
}

function renderQuestions(d) {
  const box = $("questions");
  box.innerHTML = "";
  renderClosedPolls(d);
  if (!d.questions.length) {
    box.innerHTML = `<div class="card mute small">No open question right now. A new one is coming soon, so watch the WhatsApp community! 👀</div>`;
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
  job.msg.textContent = right === polls.length ? `🏆 ${right} / ${polls.length} correct! +${bonus} bonus points` : right ? `You got ${right} / ${polls.length} right · +${bonus} bonus points` : `0 / ${polls.length} this time. Come back tomorrow for new questions! 💪`;
  if (animate && right === polls.length) celebrate(job.card);
}

function celebrate(card) {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const burst = document.createElement("div");
  burst.className = "burst";
  for (let i = 0; i < 18; i++) {
    const s = document.createElement("i");
    s.textContent = i % 3 ? "✦" : "⚡";
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
    el.innerHTML = `<span class="tag">✅ Yesterday's quiz</span><p class="text"></p><p class="ans">Correct answer: <b></b></p><p class="you"></p>`;
    el.querySelector(".text").textContent = p.text;
    el.querySelector(".ans b").textContent = p.correct;
    const you = el.querySelector(".you");
    if (mine) {
      const right = mine.toLowerCase() === p.correct.toLowerCase();
      you.textContent = right ? `You answered ${mine}. Well done! 🎉` : `You answered ${mine}.`;
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
function li(rank, title, sub, pts) {
  const el = document.createElement("li");
  if (rank <= 3) el.className = "t" + rank;
  el.innerHTML = `<span class="r"></span><span class="who"><b></b><span></span></span><span class="pts"></span>`;
  el.querySelector(".r").textContent = ["🥇", "🥈", "🥉"][rank - 1] || rank;
  el.querySelector(".who b").textContent = title;
  el.querySelector(".who span").textContent = sub;
  el.querySelector(".pts").textContent = pts + " pts";
  return el;
}

function renderMe(d) {
  const me = d.me;
  if (me && me.registered) {
    $("hello").textContent = `👋 Hi ${me.name} · #${me.rank} of ${me.of}`;
    $("hello").classList.remove("hidden");
    $("me-rank").textContent = "#" + me.rank; $("me-of").textContent = ` of ${me.of}`;
    $("me-points").textContent = me.points; $("me-refs").textContent = me.visits; $("me-ans").textContent = me.answers;
    $("me-card").classList.remove("hidden");
    const link = `${location.origin}${location.pathname}?ref=${me.ref}`;
    $("ref-link").value = link;
    $("ref-pts").textContent = d.points.visit;
    $("join-pts").textContent = d.points.join;
    $("wa-share").href = "https://wa.me/?text=" + encodeURIComponent(
      `⚡ PowerPaths 2.0: a free IEEE PES webinar series on the future of Sri Lanka's electricity sector. Register and answer the daily question with me!\n${link}`);
    $("invite").classList.remove("hidden");
  } else if (me && !me.registered) {
    $("hello").textContent = "👋 Welcome back! Register to get on the leaderboard";
    $("hello").classList.remove("hidden");
  }
}

function renderBoard(d) {
  const st = $("students"), un = $("unis");
  st.innerHTML = ""; un.innerHTML = "";
  if (!d.top.length) st.innerHTML = `<li class="mute small">No points yet. Answer today's question and be the first! 🚀</li>`;
  d.top.forEach((r) => st.appendChild(li(r.rank, r.name, `${r.uni} · ${r.answers} answers · ${r.visits} invites`, r.points)));
  d.unis.forEach((u) => un.appendChild(li(u.rank, u.uni, `${u.students} registered`, u.points)));
  const P = d.points;
  $("rules").innerHTML = `<li>Register for PowerPaths: <b>${P.register}</b></li>
    <li>Answer a quiz question: <b>${P.poll}</b> (+${P.pollCorrect} more if you're right)</li>
    <li>Share your opinion: <b>${P.opinion}</b>, plus <b>${P.star}</b> for each ⭐ the team gives it (up to 5 ⭐)</li>
    <li>Your opinion picked as a best idea: <b>+${P.best}</b></li>
    <li>Ask the resource person a question: <b>${P.ask}</b> (+${P.askPicked} if it's picked for the webinar)</li>
    <li>Each person who opens your invite link: <b>${P.visit}</b></li>
    <li>…and if they then register for PowerPaths: <b>+${P.join}</b> more</li>
    <li>Your university's score is the total of all its students.</li>
    <li>Not registered yet? Your answers the team rates ⭐1 or more still count for your university.</li>
    <li>Spam or off-topic answers get 0 ⭐ and no points.</li>`;
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

// ---------- "The Series" carousel: auto-slides every 4 s, stops while someone touches it ----------
(function carousel() {
  const track = $("series"), dots = $("dots");
  if (!track) return;
  const cards = [...track.children];
  const perView = () => (track.clientWidth >= 560 ? 2 : 1);
  const pages = () => Math.max(1, cards.length - perView() + 1);
  const current = () => Math.round(track.scrollLeft / (cards[0].offsetWidth + 12));
  const go = (i) => track.scrollTo({ left: i * (cards[0].offsetWidth + 12), behavior: "smooth" });
  function drawDots() {
    dots.innerHTML = "";
    for (let i = 0; i < pages(); i++) {
      const b = document.createElement("button");
      b.setAttribute("aria-label", `Webinar ${i + 1}`);
      b.onclick = () => { go(i); pause(); };
      dots.appendChild(b);
    }
    mark();
  }
  const mark = () => [...dots.children].forEach((b, i) => b.classList.toggle("on", i === Math.min(current(), pages() - 1)));
  let timer = null, resume = null;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = () => { if (!reduce && !timer) timer = setInterval(() => go((current() + 1) % pages()), 4000); };
  const pause = () => { clearInterval(timer); timer = null; clearTimeout(resume); resume = setTimeout(start, 10000); };
  track.addEventListener("scroll", () => requestAnimationFrame(mark), { passive: true });
  ["pointerdown", "touchstart", "wheel", "focusin"].forEach((e) => track.addEventListener(e, pause, { passive: true }));
  window.addEventListener("resize", drawDots);
  drawDots(); start();
})();
// Opened through someone's invite link → tell the server (counted once per phone)
if (state.ref) post({ a: "visit", ref: state.ref, t: state.token || "" }).catch(() => {});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
