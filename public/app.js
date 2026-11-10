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
const KIND = {
  poll: { tag: "📊 Quick poll", btn: "Submit" },
  opinion: { tag: "💡 Your opinion", btn: "Submit", ph: "Your idea…" },
  ask: { tag: "🎤 Ask the expert", btn: "Send question", ph: "Your question for the resource person…" },
};
const minFor = (q, d) => (q.type === "poll" ? 1 : q.type === "ask" ? d.minLenAsk || 10 : d.minLen);

function renderQuestions(d) {
  const box = $("questions");
  box.innerHTML = "";
  if (!d.questions.length) {
    box.innerHTML = `<div class="card mute small">No open question right now. A new one is coming soon, so watch the WhatsApp community! 👀</div>`;
    return;
  }
  const order = { poll: 0, opinion: 1, ask: 2 };
  d.questions.slice().sort((a, b) => (order[a.type] ?? 1) - (order[b.type] ?? 1)).forEach((q) => {
    const type = KIND[q.type] ? q.type : "opinion", K = KIND[type];
    const el = document.createElement("div");
    el.className = "q q-" + type;
    el.innerHTML = `<span class="tag"></span><p class="text"></p><div class="field"></div>
      <div class="qfoot"><span class="count"></span><button class="btn"></button></div>
      <p class="msg"></p>`;
    let tag = K.tag + (q.webinar ? ` · Webinar ${String(q.webinar).padStart(2, "0")}` : "");
    if (q.closes) tag += " · Closes " + new Date(q.closes).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Colombo" });
    el.querySelector(".tag").textContent = tag;
    el.querySelector(".text").textContent = q.text;
    const field = el.querySelector(".field"), btn = el.querySelector("button"), msg = el.querySelector(".msg"), cnt = el.querySelector(".count");
    const mine = d.myAnswers && d.myAnswers[q.id];
    btn.textContent = mine ? "Update" : K.btn;
    let get;
    if (type === "poll") {
      const name = "poll-" + q.id;
      q.options.forEach((o) => {
        const lab = document.createElement("label");
        lab.className = "opt";
        lab.innerHTML = `<input type="radio"><span></span>`;
        const r = lab.querySelector("input");
        r.name = name; r.value = o;
        if (mine && mine.toLowerCase() === o.toLowerCase()) r.checked = true;
        lab.querySelector("span").textContent = o;
        field.appendChild(lab);
      });
      get = () => { const c = field.querySelector("input:checked"); return c ? c.value : ""; };
    } else {
      const ta = document.createElement("textarea");
      ta.placeholder = K.ph; ta.maxLength = d.maxLen;
      if (mine) ta.value = mine;
      field.appendChild(ta);
      const min = minFor(q, d);
      const upd = () => (cnt.textContent = `${ta.value.trim().length} / ${d.maxLen}` + (ta.value.trim().length < min ? ` (min ${min})` : ""));
      ta.addEventListener("input", upd); upd();
      if (type === "ask") cnt.textContent += " · 🔒 only the team sees it";
      get = () => ta.value.trim();
    }
    btn.addEventListener("click", () => submitAnswer({ q, get, btn, msg }, d));
    box.appendChild(el);
  });
}

function savedText(q) {
  return q.type === "poll" ? "✓ Saved! You can change your vote until the poll closes."
    : q.type === "ask" ? "✓ Question sent! The team will pick questions to ask live at the webinar."
    : "✓ Saved! You can edit it until the question closes.";
}

async function submitAnswer(p, d) {
  const { q, get, btn, msg } = p, text = get();
  msg.className = "msg";
  if (q.type === "poll" && !text) { msg.className = "msg err"; msg.textContent = "Please pick an option."; return; }
  if (q.type !== "poll" && text.length < minFor(q, d)) { msg.className = "msg err"; msg.textContent = `Please write at least ${minFor(q, d)} characters.`; return; }
  if (!state.token) { state.pending = p; openSheet(); return; }   // first time on this device
  btn.disabled = true; msg.textContent = "Saving…";
  try {
    const r = await post({ a: "answer", t: state.token, qid: q.id, text });
    if (r.needLogin) { store.set("pp_t", ""); state.token = null; state.pending = p; openSheet(); return; }
    if (!r.ok) throw new Error(r.error);
    msg.className = "msg ok"; msg.textContent = savedText(q);
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
  const body = { a: "answer", qid: p.q.id, text: p.get(), phone: f.phone.value, email: f.email.value };
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
    p.msg.className = "msg ok"; p.msg.textContent = savedText(p.q); p.btn.textContent = "Update";
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
  $("rules").innerHTML = `<li>Register for PowerPaths: <b>${P.register}</b></li>
    <li>Answer a quick poll: <b>${P.poll}</b> (+${P.pollCorrect} if you're right)</li>
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
