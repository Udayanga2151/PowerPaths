// Fake Google Apps Script environment so Code.gs can run in Node for local testing.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');

function a1(ref) {   // "D2:D200" -> {r, c, nr, nc}
  const m = ref.match(/^([A-Z])(\d+):([A-Z])(\d+)$/);
  const c1 = m[1].charCodeAt(0) - 64, c2 = m[3].charCodeAt(0) - 64;
  return { r: +m[2], c: c1, nr: +m[4] - +m[2] + 1, nc: c2 - c1 + 1 };
}
function makeSheet(name, rows) {
  const data = rows || [];
  const width = () => Math.max(1, ...data.map(r => r.length));
  const cell = (r, c, v) => { while (data.length < r) data.push([]); const row = data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
  const get = (r, c) => (data[r - 1] && data[r - 1][c - 1] !== undefined ? data[r - 1][c - 1] : '');
  const strip = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);
  const range = (r, c, nr = 1, nc = 1) => ({
    setValue: (v) => cell(r, c, strip(v)),
    setValues: function (vals) { vals.forEach((row, i) => row.forEach((v, j) => cell(r + i, c + j, strip(v)))); return this; },
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
    setRichTextValue: (rt) => cell(r, c, rt.url),
    setRichTextValues: (vals) => vals.forEach((row, i) => cell(r + i, c, row[0].url)),
    insertCheckboxes: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (get(r + i, c + j) === '') cell(r + i, c + j, false); },
    setFontWeight: function () { return this; }, setNumberFormat: function () { return this; }, setDataValidation: () => {},
  });
  const sh = {
    name, data,
    getDataRange: () => ({ getValues: () => data.map(r => { const x = r.slice(); while (x.length < width()) x.push(''); return x; }) }),
    getLastRow: () => data.length,
    appendRow: (r) => { data.push(r.map(strip)); },
    getRange: (r, c, nr, nc) => (typeof r === 'string' ? (({ r: R, c: C, nr: NR, nc: NC }) => range(R, C, NR, NC))(a1(r)) : range(r, c, nr, nc)),
    setFrozenRows: () => {},
  };
  return sh;
}

function load(seed) {
  const sheets = {};
  Object.entries(seed).forEach(([n, rows]) => (sheets[n] = makeSheet(n, rows)));
  const props = {};
  const mail = [];
  const cache = {};
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
  };
  const ctx = {
    console,
    SpreadsheetApp: { getActive: () => ss, getUi: () => { throw new Error('no ui'); },
      newRichTextValue: () => { const o = { setText: () => o, setLinkUrl: (u) => ((o.url = u), o), build: () => o }; return o; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => (props[k] = v) }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map(b => (b > 127 ? b - 256 : b)),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => ({ body: s }) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (o) => mail.push(o) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ forSpreadsheet: () => ({ onFormSubmit: () => ({ create() {} }) }) }) },
    Logger: { log: () => {} },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache[k] || null), put: (k, v) => (cache[k] = v), remove: (k) => delete cache[k] }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'me@example.com' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
  return { ctx, sheets, mail, cache };
}
module.exports = { load };
