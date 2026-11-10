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
function renderQuestions(d) {
  const box = $("questions");
  box.innerHTML = "";
  if (!d.questions.length) {
    box.innerHTML = `<div class="card mute small">No open question right now. A new one is coming soon, so watch the WhatsApp community! 👀</div>`;
    return;
  }
  d.questions.forEach((q) => {
    const el = document.createElement("div");
    el.className = "q";
    el.innerHTML = `<span class="tag"></span><p class="text"></p>
      <textarea placeholder="Your idea…"></textarea>
      <div class="qfoot"><span class="count"></span><button class="btn">Submit</button></div>
      <p class="msg"></p>`;
    let tag = q.webinar ? `Webinar ${String(q.webinar).padStart(2, "0")}` : "Question";
    if (q.closes) tag += " · Closes " + new Date(q.closes).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Colombo" });
    el.querySelector(".tag").textContent = tag;
    el.querySelector(".text").textContent = q.text;
    const ta = el.querySelector("textarea"), btn = el.querySelector("button"), msg = el.querySelector(".msg"), cnt = el.querySelector(".count");
    ta.maxLength = d.maxLen;
    const mine = d.myAnswers && d.myAnswers[q.id];
    if (mine) { ta.value = mine; btn.textContent = "Update"; }
    const upd = () => (cnt.textContent = `${ta.value.trim().length} / ${d.maxLen}` + (ta.value.trim().length < d.minLen ? ` (min ${d.minLen})` : ""));
    ta.addEventListener("input", upd); upd();
    btn.addEventListener("click", () => submitAnswer(q, ta, btn, msg, d));
    box.appendChild(el);
  });
}

async function submitAnswer(q, ta, btn, msg, d) {
  const text = ta.value.trim();
  msg.className = "msg";
  if (text.length < d.minLen) { msg.className = "msg err"; msg.textContent = `Please write at least ${d.minLen} characters.`; return; }
  if (!state.token) { state.pending = { q, ta, btn, msg }; openSheet(); return; }   // first time on this device
  btn.disabled = true; msg.textContent = "Saving…";
  try {
    const r = await post({ a: "answer", t: state.token, qid: q.id, text });
    if (r.needLogin) { store.set("pp_t", ""); state.token = null; state.pending = { q, ta, btn, msg }; openSheet(); return; }
    if (!r.ok) throw new Error(r.error);
    msg.className = "msg ok"; msg.textContent = "✓ Saved! You can edit it until the question closes.";
    btn.textContent = "Update";
    if (!r.registered) $("regnudge").classList.remove("hidden");
    refresh();
  } catch (e) { msg.className = "msg err"; msg.textContent = e.message || "Something went wrong. Try again."; }
  finally { btn.disabled = false; }
}

// ---------- "who are you" sheet ----------
function openSheet() {
  const f = $("idform");
  $("guest-fields").classList.add("hidden");
  $("sheet-msg").textContent = "";
  $("sheet-go").textContent = "Submit my answer";
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
  const body = { a: "answer", qid: p.q.id, text: p.ta.value.trim(), phone: f.phone.value, email: f.email.value };
  if (guest) {
    body.name = f.name.value.trim();
    body.uni = f.uni.value === "__other" ? f.uniOther.value.trim() : f.uni.value;
    if (!body.name || !body.uni) { m.className = "msg err"; m.textContent = "Please add your name and university."; return; }
  }
  go.disabled = true; m.className = "msg"; m.textContent = "Checking…";
  try {
    // First check if this number is registered (only when not already in guest mode)
    if (!guest) {
      const l = await post({ a: "login", phone: body.phone, email: body.email });
      if (!l.ok) throw new Error(l.error);
      if (!l.registered) {                       // not registered → ask name + university
        $("guest-fields").classList.remove("hidden");
        m.textContent = ""; go.textContent = "Save my answer"; f.name.focus();
        return;
      }
    }
    const r = await post(body);
    if (!r.ok) throw new Error(r.error);
    store.set("pp_t", r.token); state.token = r.token;
    $("sheet").classList.add("hidden");
    p.msg.className = "msg ok"; p.msg.textContent = "✓ Saved! You can edit it until the question closes."; p.btn.textContent = "Update";
    if (!r.registered) $("regnudge").classList.remove("hidden");
    refresh();
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
  $("rules").innerHTML = `<li>Answer a question: <b>${P.answer}</b></li>
    <li>Each ⭐ the team gives your answer: <b>${P.star}</b> (up to 5 ⭐)</li>
    <li>Picked as the best idea by the resource person: <b>+${P.best}</b></li>
    <li>Each person who opens your invite link: <b>${P.visit}</b></li>
    <li>…and if they then register for PowerPaths: <b>+${P.join}</b> more</li>
    <li>Your university's score is the total of all its students.</li>
    <li>Not registered yet? Your reviewed answers (⭐1 or more) still count for your university.</li>`;
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
async function refresh(first) {
  try {
    const d = await getInit();
    if (!d.ok) throw new Error(d.error);
    state.data = d;
    if (first) renderQuestions(d);
    renderMe(d); renderBoard(d);
  } catch (e) {
    if (first) $("questions").innerHTML = `<div class="card mute small">Couldn't load right now. Please refresh the page.</div>`;
  }
}
refresh(true);
// Opened through someone's invite link → tell the server (counted once per phone)
if (state.ref) post({ a: "visit", ref: state.ref, t: state.token || "" }).catch(() => {});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
