// SQLite database setup and helpers
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  twofa_secret  TEXT,
  twofa_enabled INTEGER NOT NULL DEFAULT 0,
  plan          TEXT    NOT NULL DEFAULT 'Free',
  plan_status   TEXT    NOT NULL DEFAULT 'Active',
  plan_renews   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  type       TEXT    NOT NULL,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  label       TEXT    NOT NULL,
  amount      TEXT,
  filename    TEXT    NOT NULL,
  original    TEXT    NOT NULL,
  uploaded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// ---- helpers ----
const q = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  allUsers: db.prepare('SELECT * FROM users ORDER BY created_at DESC'),
  createUser: db.prepare(`INSERT INTO users (name,email,password_hash,is_admin,plan,plan_status,plan_renews)
                          VALUES (@name,@email,@password_hash,@is_admin,@plan,@plan_status,@plan_renews)`),
  setSecret: db.prepare('UPDATE users SET twofa_secret = ? WHERE id = ?'),
  enable2fa: db.prepare('UPDATE users SET twofa_enabled = 1 WHERE id = ?'),
  disable2fa: db.prepare('UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?'),
  updatePlan: db.prepare('UPDATE users SET plan=?, plan_status=?, plan_renews=? WHERE id=?'),

  logActivity: db.prepare('INSERT INTO activity (user_id,type,detail,ip) VALUES (?,?,?,?)'),
  activityForUser: db.prepare('SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'),

  addInvoice: db.prepare(`INSERT INTO invoices (user_id,label,amount,filename,original)
                          VALUES (@user_id,@label,@amount,@filename,@original)`),
  invoicesForUser: db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY uploaded_at DESC'),
  invoiceById: db.prepare('SELECT * FROM invoices WHERE id = ?'),
  allInvoices: db.prepare(`SELECT i.*, u.name AS user_name, u.email AS user_email
                           FROM invoices i JOIN users u ON u.id = i.user_id
                           ORDER BY i.uploaded_at DESC`),
  deleteInvoice: db.prepare('DELETE FROM invoices WHERE id = ?'),
};

module.exports = { db, q };
