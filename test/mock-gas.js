// Fake Google Apps Script environment so Code.gs can run in Node for local testing.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');

function makeSheet(name, rows) {
  const data = rows || [];
  const sh = {
    name, data,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getLastRow: () => data.length,
    appendRow: (r) => { data.push(r.map(v => (typeof v === 'string' && v.startsWith("'")) ? v.slice(1) : v)); },
    getRange: (r, c) => ({
      setValue: (v) => { while (data.length < r) data.push([]); data[r - 1][c - 1] = v; },
      setRichTextValue: (rt) => { while (data.length < r) data.push([]); data[r - 1][c - 1] = rt.url; },
      insertCheckboxes: () => {}, setFontWeight: () => {}, setNumberFormat: function () { return this; }, setDataValidation: () => {},
    }),
    setFrozenRows: () => {},
  };
  return sh;
}

function load(seed) {
  const sheets = {};
  Object.entries(seed).forEach(([n, rows]) => (sheets[n] = makeSheet(n, rows)));
  const props = {};
  const mail = [];
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
    Session: { getActiveUser: () => ({ getEmail: () => 'me@example.com' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
  return { ctx, sheets, mail };
}
module.exports = { load };
