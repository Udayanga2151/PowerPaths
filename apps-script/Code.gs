/**
 * PowerPaths 2.0 · Google Apps Script backend
 * --------------------------------------------
 * Lives inside the registration Google Sheet (Extensions → Apps Script).
 * The website talks ONLY to this script. The script never sends phone numbers or emails to the website.
 *
 * Tabs it uses:
 *   "Form Responses 1"  ← the Google Form writes here (do not rename columns)
 *   "Questions"         ← team adds questions here. Shown on the site when Active ✓ AND
 *                         now is between Opens and Closes (empty = no limit). Sri Lanka time.
 *   "Answers"           ← students' answers land here. Team fills "Stars" (0-5) and ticks "Best"
 *   "Registrants"       ← every registrant with an ID (PP2-001...), email status,
 *                         a one-tap "📲 Send" WhatsApp link and a "Sent ✓" tick box
 *   "Visits"            ← who came to the site through whose invite link (for invite points)
 */

// ======================= CHANGE THESE =======================
const CONFIG = {
  RESPONSES_SHEET: 'Form Responses 1',
  COL: {                                   // column headers in the responses sheet
    name: 'Name',
    email: 'Email',
    email2: 'Email Address',               // the auto-collected Google email (optional)
    phone: 'WhatsApp / Mobile Number',
    uni: 'University',
  },
  // ⚠️ false = NO emails go to anyone (demo / waiting for approval). Change to true after the chair approves.
  SEND_EMAILS: false,
  SITE_URL: 'https://powerpaths.pages.dev',          // your Cloudflare Pages link
  COMMUNITY_URL: 'https://chat.whatsapp.com/XXXXXXXX', // WhatsApp community/group invite link
  EMAIL_SUBJECT: '⚡ Welcome to PowerPaths 2.0 · your personal link',
  FROM_NAME: 'PowerPaths 2.0',
  MIN_LEN: 15,
  MAX_LEN: 1000,
  // visit = someone opens your invite link (once per phone)
  // join  = that same person registers with the form AFTER clicking your link
  POINTS: { answer: 5, star: 4, best: 50, visit: 1, join: 10 },
};
// =============================================================

const SH = { Q: 'Questions', A: 'Answers', W: 'Registrants', V: 'Visits' };
const V_HEAD = ['Timestamp', 'Invited by (ref)', 'Visitor device', 'Visitor token'];
const A_HEAD = ['Timestamp', 'Updated', 'Question ID', 'Token', 'Phone', 'Name', 'University', 'Answer', 'Stars', 'Best'];
const Q_HEAD = ['ID', 'Webinar', 'Question', 'Active', 'Opens', 'Closes'];
const W_HEAD = ['ID', 'Registered', 'Name', 'University', 'Phone', 'Email', 'Email sent', 'WhatsApp', 'Sent ✓', 'Notes'];
const WC = { id: 1, reg: 2, name: 3, uni: 4, phone: 5, email: 6, emailed: 7, wa: 8, sent: 9 };

// ---------- menu ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚡ PowerPaths')
    .addItem('1. Setup (run once)', 'setup')
    .addItem('Send a test email to me (preview)', 'sendTestEmailToMe')
    .addItem('2. Send welcome email to everyone not emailed yet', 'sendWelcomeToAll')
    .addItem('Sync registrants list now', 'syncRegistrants')
    .addItem('Rebuild WhatsApp links (after changing links/text)', 'refreshWhatsAppLinks')
    .addToUi();
}

/** Run once: creates tabs, the secret key, and the "on form submit" trigger. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SH.Q, Q_HEAD);
  ensureSheet_(ss, SH.A, A_HEAD);
  ensureSheet_(ss, SH.W, W_HEAD);
  ensureSheet_(ss, SH.V, V_HEAD);
  try { ss.setSpreadsheetTimeZone('Asia/Colombo'); } catch (x) {}
  const q = ss.getSheetByName(SH.Q);
  q.getRange('D2:D200').insertCheckboxes();
  try {   // Opens / Closes: date + time picker
    q.getRange('E2:F200').setNumberFormat('yyyy-mm-dd hh:mm')
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  } catch (x) {}
  ss.getSheetByName(SH.A).getRange('J2:J2000').insertCheckboxes();
  const w = ss.getSheetByName(SH.W);
  w.getRange('I2:I3000').insertCheckboxes();
  try {   // row turns green when "Sent ✓" is ticked
    const rule = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$I2=TRUE')
      .setBackground('#d9f2dd').setRanges([w.getRange('A2:J3000')]).build();
    w.setConditionalFormatRules([rule]);
  } catch (x) {}

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());

  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'onFormSubmit');
  if (!has) ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  syncRegistrants();
}

function ensureSheet_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(head);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------- helpers ----------
/** 0771234567 / +94 77 123 4567 / 771234567 → 94771234567 */
function normPhone_(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '94' + d.slice(1);
  if (d.length === 9) d = '94' + d;
  return /^94\d{9}$/.test(d) ? d : '';
}
const normEmail_ = (e) => String(e || '').trim().toLowerCase();

/** "univeresity of ruhuna" → "University Of Ruhuna" (merges spelling variants) */
function normUni_(u) {
  const s = String(u || '').toLowerCase().replace(/univer\w*/g, 'university').replace(/\s+/g, ' ').trim();
  if (!s) return 'Other';
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** "Kasun Perera" → "Kasun P." (privacy on the public leaderboard) */
function shortName_(n) {
  const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Anonymous';
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  return parts.length > 1 ? first + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : first;
}

function hash_(kind, phone, len) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret) throw new Error('Run setup() first');
  const bytes = Utilities.computeHmacSha256Signature(kind + ':' + phone, secret);
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += abc[(bytes[i] + 256) % abc.length];
  return out;
}
/** personal login token (secret, only in their own link) */
const tokenFor_ = (phone) => hash_('t', phone, 10);
/** public referral code (safe to share) */
const refFor_ = (phone) => hash_('r', phone, 6);

/** Everyone who registered, one entry per phone number. */
function members_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.RESPONSES_SHEET);
  const values = sh.getDataRange().getValues();
  const head = values.shift().map(h => String(h).trim());
  const idx = {};
  Object.keys(CONFIG.COL).forEach(k => (idx[k] = head.indexOf(CONFIG.COL[k])));
  const list = [], byPhone = {};
  values.forEach(r => {
    const phone = normPhone_(r[idx.phone]);
    if (!phone || byPhone[phone]) return;          // one account per number
    const m = {
      phone, time: r[0],
      name: String(r[idx.name] || '').trim(),
      uni: normUni_(r[idx.uni]),
      emails: [normEmail_(r[idx.email]), idx.email2 >= 0 ? normEmail_(r[idx.email2]) : ''].filter(Boolean),
      token: tokenFor_(phone),
      ref: refFor_(phone),
    };
    byPhone[phone] = m;
    list.push(m);
  });
  return { list, byPhone };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Questions shown right now: Active ✓ and (Opens empty or passed) and (Closes empty or not yet). */
function activeQuestions_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.Q);
  const now = new Date();
  const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v);
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] !== '' && r[2] && r[3] === true &&
      (!isDate(r[4]) || r[4] <= now) && (!isDate(r[5]) || r[5] > now))
    .map(r => ({ id: String(r[0]), webinar: r[1], text: String(r[2]), closes: isDate(r[5]) ? r[5].toISOString() : null }));
}

function answerRows_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.A);
  return sh.getDataRange().getValues().slice(1);
}

// ---------- scoring ----------
function scoreboard_(M) {
  const P = CONFIG.POINTS, score = {};
  M.list.forEach(m => (score[m.token] = { m, points: 0, answers: 0, visits: 0, joins: 0 }));

  answerRows_().forEach(r => {
    const s = score[r[3]];
    if (!s) return;                                  // guest (not registered yet): no points
    const stars = r[8] === '' || r[8] === null ? null : Number(r[8]);
    s.answers++;
    if (stars === 0) return;                         // 0 stars = spam
    s.points += P.answer + (stars || 0) * P.star + (r[9] === true ? P.best : 0);
  });

  // Invite points from the "Visits" tab
  const byRef = {}, byToken = {};
  M.list.forEach(m => { byRef[m.ref] = m; byToken[m.token] = m; });
  const joined = {};
  visitRows_().forEach(v => {
    const referrer = byRef[v[1]];
    if (!referrer) return;
    const visitor = v[3] ? byToken[v[3]] : null;
    if (v[3] && v[3] === referrer.token) return;      // own link on own phone: nothing
    const s = score[referrer.token];
    s.visits++; s.points += P.visit;
    // +join if the visitor registered AFTER clicking the link (once per person)
    if (visitor && !joined[visitor.token] && new Date(visitor.time) > new Date(v[0])) {
      joined[visitor.token] = 1;
      s.joins++; s.points += P.join;
    }
  });

  const rows = Object.keys(score).map(k => score[k])
    .sort((a, b) => b.points - a.points || b.joins - a.joins || a.m.name.localeCompare(b.m.name));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.points !== prev) { rank = i + 1; prev = r.points; } r.rank = rank; });
  return rows;
}

function board_(M) {
  const rows = scoreboard_(M);
  const top = rows.filter(r => r.points > 0).slice(0, 20).map(r => ({
    rank: r.rank, name: shortName_(r.m.name), uni: r.m.uni, points: r.points, answers: r.answers, visits: r.visits, joins: r.joins,
  }));
  const u = {};
  rows.forEach(r => {
    const x = u[r.m.uni] || (u[r.m.uni] = { uni: r.m.uni, points: 0, students: 0 });
    x.points += r.points; x.students++;
  });
  // Not-registered people's answers count for their UNIVERSITY only, and only after the team gives ⭐1 or more
  const P = CONFIG.POINTS, isMember = {};
  M.list.forEach(m => (isMember[m.token] = 1));
  answerRows_().forEach(r => {
    const stars = r[8] === '' || r[8] === null ? 0 : Number(r[8]);
    if (isMember[r[3]] || !(stars >= 1)) return;
    const name = normUni_(r[6]);
    const x = u[name] || (u[name] = { uni: name, points: 0, students: 0 });
    x.points += P.answer + stars * P.star + (r[9] === true ? P.best : 0);
  });
  const unis = Object.keys(u).map(k => u[k]).sort((a, b) => b.points - a.points || b.students - a.students);
  unis.forEach((x, i) => (x.rank = i + 1));
  const ranks = {};
  rows.forEach(r => (ranks[r.m.token] = { rank: r.rank, points: r.points, answers: r.answers, visits: r.visits, joins: r.joins }));
  return { top, unis, ranks, total: rows.length };
}

// ---------- invite visits ----------
function visitRows_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.V);
  return sh ? sh.getDataRange().getValues().slice(1) : [];
}

/** Someone opened an invite link (?ref=). One row per device; the first invite link wins. */
function recordVisit_(ref, vid, token, M) {
  ref = String(ref || '').toLowerCase(); vid = String(vid || '');
  if (!/^[a-z0-9]{4,12}$/.test(ref) || !/^[a-z0-9-]{8,40}$/.test(vid)) return;
  const owner = M.list.find(m => m.ref === ref);
  if (!owner || (token && token === owner.token)) return;   // unknown code, or own link
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.V);
  if (sh.getDataRange().getValues().some(r => r[2] === vid)) return;
  sh.appendRow([new Date(), ref, vid, token || '']);
}

/** When a device that came through an invite link is identified, remember who it is. */
function linkVisit_(vid, token) {
  if (!vid || !token) return;
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.V);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === vid) {
      if (!rows[i][3]) sh.getRange(i + 1, 4).setValue(token);
      return;
    }
  }
}

// ---------- API ----------
/** GET ?a=init&t=TOKEN → everything the page needs */
function doGet(e) {
  try {
    const t = String((e.parameter || {}).t || '').toLowerCase();
    const M = members_();
    if (e.parameter.v && t) {
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try { linkVisit_(String(e.parameter.v), t); } finally { lock.releaseLock(); }
    }
    const B = board_(M);
    const member = M.list.find(m => m.token === t);
    let me = null;
    const mine = {};
    if (t) answerRows_().forEach(r => { if (r[3] === t) mine[r[2]] = r[7]; });
    if (member) {
      me = { name: member.name.split(/\s+/)[0], uni: member.uni, ref: member.ref, registered: true, ...B.ranks[t], of: B.total };
    } else if (t && Object.keys(mine).length) {
      me = { registered: false };                    // a guest who answered before
    }
    return json_({
      ok: true, me, myAnswers: me ? mine : {},
      questions: activeQuestions_(),
      top: B.top, unis: B.unis, points: CONFIG.POINTS,
      unisList: Object.keys(M.list.reduce((o, m) => ((o[m.uni] = 1), o), {})).sort(),
      minLen: CONFIG.MIN_LEN, maxLen: CONFIG.MAX_LEN,
    });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * POST (body = JSON text)
 *   {a:'login', phone, email}                              → {ok, token} if registered
 *   {a:'answer', t, qid, text}                             → registered or remembered guest
 *   {a:'answer', phone, email, name?, uni?, qid, text}     → first time on this device
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const b = JSON.parse(e.postData.contents || '{}');
    const M = members_();

    if (b.a === 'visit') {                           // opened someone's invite link
      lock.waitLock(10000);
      recordVisit_(b.ref, b.v, String(b.t || '').toLowerCase(), M);
      return json_({ ok: true });
    }

    // --- who is this? ---
    let token = String(b.t || '').toLowerCase(), who = null;
    if (token) {
      who = M.list.find(m => m.token === token) || null;
    } else {
      const phone = normPhone_(b.phone), email = normEmail_(b.email);
      if (!phone) return json_({ ok: false, error: 'WhatsApp number එක හරියට දාන්න (07XXXXXXXX)' });
      const m = M.byPhone[phone];
      if (m) {
        if (m.emails.indexOf(email) < 0) return json_({ ok: false, error: 'මේ number එකයි email එකයි register වෙලා තියෙන විස්තරත් එක්ක ගැළපෙන්නේ නෑ' });
        who = m; token = m.token;
      } else {
        if (b.a === 'login') return json_({ ok: true, registered: false });
        if (!/\S+@\S+\.\S+/.test(email)) return json_({ ok: false, error: 'Email එක හරියට දාන්න' });
        if (!String(b.name || '').trim()) return json_({ ok: false, error: 'නම දාන්න', needDetails: true });
        token = tokenFor_(phone);                    // same token they will get after registering
      }
    }
    if (b.a === 'login') {
      lock.waitLock(10000);
      linkVisit_(String(b.v || ''), token);
      return json_({ ok: true, registered: true, token });
    }

    // --- save the answer ---
    if (b.a !== 'answer') return json_({ ok: false, error: 'unknown action' });
    const text = String(b.text || '').trim();
    if (text.length < CONFIG.MIN_LEN) return json_({ ok: false, error: 'අවම අකුරු ' + CONFIG.MIN_LEN + 'ක් ලියන්න' });
    if (text.length > CONFIG.MAX_LEN) return json_({ ok: false, error: 'උපරිම අකුරු ' + CONFIG.MAX_LEN + 'යි' });
    const q = activeQuestions_().find(x => x.id === String(b.qid));
    if (!q) return json_({ ok: false, error: 'මේ question එක දැන් open නෑ' });

    lock.waitLock(10000);
    const sh = SpreadsheetApp.getActive().getSheetByName(SH.A);
    const rows = sh.getDataRange().getValues();
    let rowNo = -1, guestRow = null;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][3] === token) {
        if (!guestRow) guestRow = rows[i];
        if (String(rows[i][2]) === q.id) { rowNo = i + 1; break; }
      }
    }
    const now = new Date();
    if (rowNo > 0) {
      sh.getRange(rowNo, 2).setValue(now);
      sh.getRange(rowNo, 8).setValue(text);
      sh.getRange(rowNo, 9).setValue('');            // edited → needs re-rating
    } else {
      if (!who && !guestRow && !b.phone) return json_({ ok: false, error: 'කරුණාකර නැවත number එක දාන්න', needLogin: true });
      const name = who ? who.name : (guestRow ? guestRow[5] : String(b.name).trim());
      const uni = who ? who.uni : (guestRow ? guestRow[6] : normUni_(b.uni));
      const phone = who ? who.phone : (guestRow ? guestRow[4] : normPhone_(b.phone));
      sh.appendRow([now, now, q.id, token, "'" + phone, name, uni, text, '', false]);
    }
    linkVisit_(String(b.v || ''), token);
    return json_({ ok: true, token, registered: !!who });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ---------- welcome email + WhatsApp + registrants list ----------
function personalLink_(m) { return CONFIG.SITE_URL.replace(/\/$/, '') + '/?t=' + m.token; }

function welcomeText_(m) {
  return 'Hi ' + m.name.split(/\s+/)[0] + '! ⚡ Thanks for registering for *PowerPaths 2.0*.\n\n' +
    '🔗 Your personal link (daily questions + leaderboard):\n' + personalLink_(m) + '\n' +
    '_This link is only for you, please don\'t share it._\n\n' +
    '👥 Join our WhatsApp community for updates:\n' + CONFIG.COMMUNITY_URL;
}

function welcomeHtml_(m) {
  const btn = (href, label, bg, fg) =>
    '<a href="' + href + '" style="display:inline-block;background:' + bg + ';color:' + fg +
    ';text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;margin:6px 0">' + label + '</a>';
  return '<div style="font-family:Arial,sans-serif;background:#030807;color:#F4F7F5;padding:28px;border-radius:16px;max-width:520px">' +
    '<p style="color:#5BE074;font-weight:700;letter-spacing:2px;margin:0">POWERPATHS 2.0</p>' +
    '<h2 style="margin:8px 0">Hi ' + m.name.split(/\s+/)[0] + '! ⚡</h2>' +
    '<p>Thanks for registering for <b>PowerPaths 2.0</b>, the IEEE PES webinar series on the future of Sri Lanka\'s electricity sector.</p>' +
    '<p>Answer the daily question, share your ideas with the resource persons and climb the leaderboard!</p>' +
    '<p>' + btn(personalLink_(m), 'Open my PowerPaths link →', '#39B54A', '#03140a') + '<br>' +
    '<span style="font-size:12px;color:#9fb5aa">This link is only for you. Please don\'t share it.</span></p>' +
    '<p>' + btn(CONFIG.COMMUNITY_URL, 'Join the WhatsApp community', '#ffffff', '#03140a') + '</p>' +
    '<p style="font-size:12px;color:#9fb5aa">IEEE PES Student Branch Chapter, University of Ruhuna · IEEE PES Sri Lanka Section</p></div>';
}

function waUrl_(m) { return 'https://wa.me/' + m.phone + '?text=' + encodeURIComponent(welcomeText_(m)); }

/** Writes a clickable "📲 Send" link into a cell. */
function setWaCell_(sheet, row, m) {
  const cell = sheet.getRange(row, WC.wa), url = waUrl_(m);
  try {
    cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText('📲 Send').setLinkUrl(url).build());
  } catch (x) { cell.setValue(url); }
}

/** Adds every registrant who is not in the "Registrants" tab yet, with the next ID (PP2-001, PP2-002...). */
function syncRegistrants() {
  const M = members_();
  const w = SpreadsheetApp.getActive().getSheetByName(SH.W);
  const rows = w.getDataRange().getValues();
  const have = {};
  let maxId = 0;
  rows.slice(1).forEach(r => {
    have[normPhone_(r[WC.phone - 1])] = 1;
    const n = parseInt(String(r[0]).replace(/\D/g, ''), 10);
    if (n > maxId) maxId = n;
  });
  let added = 0;
  M.list.forEach(m => {
    if (have[m.phone]) return;
    maxId++;
    w.appendRow(['PP2-' + ('00' + maxId).slice(-3), m.time, m.name, m.uni, "'" + m.phone, m.emails[0] || '', '', '', false, '']);
    setWaCell_(w, w.getLastRow(), m);
    added++;
  });
  return added;
}

function sendWelcomeEmail_(m) {
  if (CONFIG.SEND_EMAILS !== true) return false;     // switch is OFF
  const to = m.emails[0];
  if (!to || MailApp.getRemainingDailyQuota() < 1) return false;
  MailApp.sendEmail({ to, subject: CONFIG.EMAIL_SUBJECT, name: CONFIG.FROM_NAME, body: welcomeText_(m), htmlBody: welcomeHtml_(m) });
  return true;
}

/** Emails everyone in "Registrants" whose "Email sent" is empty. */
function emailPending_(onlyPhone) {
  const M = members_();
  const w = SpreadsheetApp.getActive().getSheetByName(SH.W);
  const rows = w.getDataRange().getValues();
  let sent = 0, left = 0;
  for (let i = 1; i < rows.length; i++) {
    const phone = normPhone_(rows[i][WC.phone - 1]);
    if (rows[i][WC.emailed - 1] || (onlyPhone && phone !== onlyPhone)) continue;
    const m = M.byPhone[phone];
    if (!m) continue;
    if (sendWelcomeEmail_(m)) { w.getRange(i + 1, WC.emailed).setValue(new Date()); sent++; } else left++;
  }
  return { sent, left };
}

/** Trigger: runs automatically when someone submits the form. */
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    syncRegistrants();
    const phone = normPhone_((e && e.namedValues && e.namedValues[CONFIG.COL.phone] || [''])[0]);
    if (phone) emailPending_(phone);
  } finally { lock.releaseLock(); }
}

/** Menu: add missing registrants, then email everyone not emailed yet (stops at Gmail's daily limit). */
function sendWelcomeToAll() {
  syncRegistrants();
  if (CONFIG.SEND_EMAILS !== true) {
    const off = 'Emails are OFF (SEND_EMAILS: false). Nothing was sent. Set SEND_EMAILS: true in the code, save, and run this again.';
    try { SpreadsheetApp.getUi().alert(off); } catch (x) { Logger.log(off); }
    return;
  }
  const r = emailPending_();
  const msg = 'Sent ' + r.sent + ' welcome emails.' + (r.left ? ' ' + r.left + ' left (Gmail daily limit or no email). Run again tomorrow.' : '');
  try { SpreadsheetApp.getUi().alert(msg); } catch (x) { Logger.log(msg); }
}

/** Menu: sends the welcome email ONLY to you (with a demo link), so you can show it before approval. */
function sendTestEmailToMe() {
  const me = Session.getActiveUser().getEmail();
  const demo = { name: 'Test Student', token: 'demo', emails: [me] };
  MailApp.sendEmail({ to: me, subject: '[TEST] ' + CONFIG.EMAIL_SUBJECT, name: CONFIG.FROM_NAME, body: welcomeText_(demo), htmlBody: welcomeHtml_(demo) });
  try { SpreadsheetApp.getUi().alert('Test email sent to ' + me); } catch (x) {}
}

/** Menu: rebuild all "📲 Send" links (after changing SITE_URL, COMMUNITY_URL or the message text). */
function refreshWhatsAppLinks() {
  const M = members_();
  const w = SpreadsheetApp.getActive().getSheetByName(SH.W);
  const rows = w.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const m = M.byPhone[normPhone_(rows[i][WC.phone - 1])];
    if (m) setWaCell_(w, i + 1, m);
  }
}
