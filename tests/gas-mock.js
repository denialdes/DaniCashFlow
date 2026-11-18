/**
 * Tiruan layanan Google Apps Script di memori + loader yang memuat file .gs asli ke satu konteks vm.
 * Dipakai untuk menguji backend sungguhan tanpa Google. Tiruan sengaja "ketat":
 *  - menulis ke sheet tanpa memegang lock = error
 *  - sel berformat bukan '@' yang berisi "yyyy-MM-dd" diubah jadi Date, dan "=..." dievaluasi (seperti Sheets asli)
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function create() {
  const m = { clock: new Date('2026-11-16T03:00:00Z'), guardWrites: false, lock: { held: false, failNext: 0 }, fetchLog: [], trashed: [], files: {}, props: {} };
  const ssById = {};
  let seq = 0;

  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.v[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); }
      return out;
    }
    setNumberFormats(f) { f.forEach((row, i) => row.forEach((x, j) => { this.sh.fmt[`${this.r + i},${this.c + j}`] = x; })); return this; }
    setNumberFormat(x) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt[`${this.r + i},${this.c + j}`] = x; return this; }
    setValues(vals) {
      if (m.guardWrites && !m.lock.held && this.sh.ss === m.main) throw new Error('TULIS TANPA LOCK: ' + this.sh.name);
      if (this.r + vals.length - 1 > this.sh.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      vals.forEach((row, i) => {
        const rr = this.r - 1 + i;
        while (this.sh.v.length <= rr) this.sh.v.push([]);
        row.forEach((val, j) => {
          const f = this.sh.fmt[`${this.r + i},${this.c + j}`];
          if (typeof val === 'string' && f !== '@') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) val = new Date(Date.parse(val + 'T00:00:00+07:00'));
            else if (val.startsWith('=')) val = '#FORMULA';
          }
          this.sh.v[rr][this.c - 1 + j] = val;
        });
      });
      return this;
    }
    setValue(x) { return this.setValues([[x]]); }
    setFontWeight() { return this; }
    setFontSize() { return this; }
  }
  class Sheet {
    constructor(ss, name) { Object.assign(this, { ss, name, v: [], fmt: {}, maxRows: 1000 }); }
    getName() { return this.name; }
    setName(n) { this.name = n; return this; }
    getLastRow() { let n = this.v.length; while (n > 0 && this.v[n - 1].every((c) => c === '' || c == null)) n--; return n; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(after, n) { if (after > this.maxRows || n < 1) throw new Error('insertRowsAfter'); this.maxRows += n; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getDataRange() { const lr = Math.max(1, this.getLastRow()); const lc = Math.max(1, ...this.v.map((r) => r.length)); return new Range(this, 1, 1, lr, lc); }
    deleteRow(r) { if (m.guardWrites && !m.lock.held && this.ss === m.main) throw new Error('TULIS TANPA LOCK'); this.v.splice(r - 1, 1); }
    clearContents() { if (m.guardWrites && !m.lock.held && this.ss === m.main) throw new Error('TULIS TANPA LOCK'); this.v = []; }
    setFrozenRows() {}
    setColumnWidth() {}
  }
  class Spreadsheet {
    constructor(name) { this.id = 'ss' + ++seq; this.name = name; this.sheets = [new Sheet(this, 'Sheet1')]; ssById[this.id] = this; }
    getId() { return this.id; }
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; }
    getSheets() { return this.sheets; }
    deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  }
  m.main = new Spreadsheet('Keuangan Keluarga');
  m.ssById = ssById;

  const sandbox = {
    console: { log() {}, warn() {}, error: (...a) => { m.errors = (m.errors || []).concat([a.join(' ')]); } },
    SpreadsheetApp: { getActive: () => m.main, create: (n) => new Spreadsheet(n), flush() {}, openById: (id) => ssById[id] },
    LockService: {
      getScriptLock: () => ({
        waitLock() { if (m.lock.failNext > 0) { m.lock.failNext--; throw new Error('timeout'); } if (m.lock.held) throw new Error('LOCK GANDA'); m.lock.held = true; },
        releaseLock() { m.lock.held = false; },
      }),
    },
    CacheService: (() => { const store = new Map(); return { getScriptCache: () => ({ get: (k) => store.get(k) || null, put: (k, v) => store.set(k, v) }) }; })(),
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => m.props[k] || null, setProperty: (k, v) => { m.props[k] = v; } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'Owner@Gmail.com' }), getScriptTimeZone: () => m.scriptTz || 'Asia/Jakarta' },
    ScriptApp: { getOAuthToken: () => 'oauth-token', getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ inTimezone: () => ({ create() {} }) }) }) }) }) },
    Utilities: {
      DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' },
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map((b) => (b > 127 ? b - 256 : b)),
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(s).digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64DecodeWebSafe: (str) => Array.from(Buffer.from(str, 'base64')).map((b) => (b > 127 ? b - 256 : b)),
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map((b) => b & 255)).toString('utf8') }),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64'),
      formatDate(d, tz, pat) {
        if (tz !== 'Asia/Jakarta') throw new Error('tz');
        const j = new Date(d.getTime() + 7 * 3600e3).toISOString();
        return pat === 'yyyy-MM-dd' ? j.slice(0, 10) : pat === "yyyy-MM-dd'T'HH:mm:ss" ? j.slice(0, 19) : pat === 'yyyy-MM-dd HHmm' ? j.slice(0, 10) + ' ' + j.slice(11, 13) + j.slice(14, 16) : (() => { throw new Error('pat ' + pat); })();
      },
    },
    UrlFetchApp: {
      fetch(url, opt) {
        m.fetchLog.push(url);
        if (url.includes('/export?format=')) {
          if (m.exportFail) return { getResponseCode: () => 500 };
          const id = url.split('/d/')[1].split('/')[0];
          m.exportLockHeld = m.lock.held;
          m.lastExport = { id, url, auth: opt.headers.Authorization, sheets: ssById[id].sheets.map((s) => ({ name: s.name, v: s.v })) };
          return { getResponseCode: () => 200, getBlob: () => ({ getBytes: () => Array.from(Buffer.from('%PDF-fake')) }) };
        }
        throw new Error('fetch tak terduga ' + url);
      },
    },
    DriveApp: {
      getFileById: (id) => ({ setTrashed: () => m.trashed.push(id), getName: () => 'Keuangan Keluarga', makeCopy: (n) => { m.files[n] = 1; }, getDateCreated: () => new Date() }),
      getFoldersByName: () => ({ hasNext: () => true, next: () => ({ getFiles: () => ({ hasNext: () => false }) }) }),
      createFolder: () => ({}),
    },
  };
  class MockDate extends Date {
    constructor(...a) { if (a.length === 0) super(m.clock.getTime()); else super(...a); }
    static now() { return m.clock.getTime(); }
  }
  sandbox.Date = MockDate;
  vm.createContext(sandbox);
  m.ctx = sandbox;
  const dir = path.join(__dirname, '..', 'backend');
  ['Config', 'Db', 'Calc', 'Auth', 'Api', 'Setup'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(dir, f + '.gs'), 'utf8'), sandbox, { filename: f + '.gs' }));
  // const/class di skrip vm tidak menjadi properti global; ekspor lewat evaluasi
  m.g = vm.runInContext('({Api, Db, Calc, Auth, SCHEMA, setupDatabase, resetPassword, backupNow, restoreFromBackup, LIMITS})', sandbox);

  // Token sesi sungguhan (ditandatangani backend asli) untuk pengguna yang sudah ada; ttl dalam detik.
  m.addToken = (name, username, ttl) => { m.g.Db.reset(); return m.g.Auth.issue(m.g.Db.all('Users').find((u) => u.email === username), ttl).token; };
  m.login = (username, password) => m.call(null, 'auth.login', { username, password });
  m.call = (token, action, payload, raw) => {
    const body = raw !== undefined ? raw : JSON.stringify({ token, action, payload });
    return JSON.parse(JSON.stringify(m.g.Api.handle({ postData: { contents: body } }))); // seperti yang diterima klien
  };
  return m;
}
module.exports = { create };
