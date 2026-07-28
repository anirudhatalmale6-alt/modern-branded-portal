// Modern Branded Login Site — Express + SQLite
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { q } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const BRAND = process.env.BRAND_NAME || 'Nimbus';

// ---- uploads ----
const UP_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + Math.round(Math.random() * 1e9) + '.pdf';
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF files are allowed'));
  },
});

// ---- app config ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new FileStore({ path: path.join(__dirname, 'data', 'sessions'), retries: 1, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

app.use((req, res, next) => {
  res.locals.brand = BRAND;
  res.locals.user = req.session.userId ? q.userById.get(req.session.userId) : null;
  next();
});

const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0];
const log = (uid, type, detail, req) => q.logActivity.run(uid, type, detail || '', ipOf(req));

// ---- guards ----
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  if (req.session.pending2fa) return res.redirect('/2fa');
  next();
}
function requireAdmin(req, res, next) {
  const u = res.locals.user;
  if (!u || !u.is_admin) return res.status(403).render('error', { code: 403, msg: 'Admin access required' });
  next();
}

// ======================= PUBLIC =======================
app.get('/', (req, res) => res.render('landing'));

app.get('/register', (req, res) => res.render('register', { error: null, form: {} }));
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  const form = { name, email };
  if (!name || !email || !password || password.length < 6)
    return res.render('register', { error: 'Please fill all fields (password min 6 chars).', form });
  if (q.userByEmail.get(email.toLowerCase()))
    return res.render('register', { error: 'An account with that email already exists.', form });
  const hash = bcrypt.hashSync(password, 10);
  const renews = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const info = q.createUser.run({
    name, email: email.toLowerCase(), password_hash: hash, is_admin: 0,
    plan: 'Starter', plan_status: 'Active', plan_renews: renews,
  });
  req.session.userId = info.lastInsertRowid;
  log(info.lastInsertRowid, 'account_created', 'Account registered', req);
  log(info.lastInsertRowid, 'login', 'First sign-in', req);
  res.redirect('/dashboard');
});

app.get('/login', (req, res) => res.render('login', { error: null, form: {} }));
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = q.userByEmail.get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash))
    return res.render('login', { error: 'Invalid email or password.', form: { email } });

  if (user.twofa_enabled) {
    req.session.userId = user.id;
    req.session.pending2fa = true;
    return res.redirect('/2fa');
  }
  req.session.userId = user.id;
  log(user.id, 'login', 'Signed in with password', req);
  res.redirect('/dashboard');
});

// ---- 2FA challenge on login ----
app.get('/2fa', (req, res) => {
  if (!req.session.userId || !req.session.pending2fa) return res.redirect('/login');
  res.render('twofa_verify', { error: null });
});
app.post('/2fa', (req, res) => {
  if (!req.session.userId || !req.session.pending2fa) return res.redirect('/login');
  const user = q.userById.get(req.session.userId);
  const ok = speakeasy.totp.verify({
    secret: user.twofa_secret, encoding: 'base32', token: (req.body.token || '').replace(/\s/g, ''), window: 1,
  });
  if (!ok) return res.render('twofa_verify', { error: 'Incorrect code, try again.' });
  req.session.pending2fa = false;
  log(user.id, 'login', 'Completed 2FA verification', req);
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  const uid = req.session.userId;
  if (uid) log(uid, 'logout', 'Signed out', req);
  req.session.destroy(() => res.redirect('/login'));
});

// ======================= DASHBOARD =======================
app.get('/dashboard', requireAuth, (req, res) => {
  const u = res.locals.user;
  res.render('dashboard', {
    activity: q.activityForUser.all(u.id),
    invoices: q.invoicesForUser.all(u.id),
  });
});

app.get('/invoice/:id', requireAuth, (req, res) => {
  const inv = q.invoiceById.get(req.params.id);
  if (!inv) return res.status(404).render('error', { code: 404, msg: 'Invoice not found' });
  if (inv.user_id !== res.locals.user.id && !res.locals.user.is_admin)
    return res.status(403).render('error', { code: 403, msg: 'Not your invoice' });
  const file = path.join(UP_DIR, inv.filename);
  if (!fs.existsSync(file)) return res.status(404).render('error', { code: 404, msg: 'File missing on server' });
  log(res.locals.user.id, 'invoice_download', `Downloaded ${inv.label}`, req);
  res.download(file, inv.original);
});

// ---- account / 2FA setup ----
app.get('/account', requireAuth, (req, res) => res.render('account', { qr: null, error: null, msg: null }));

app.post('/account/2fa/setup', requireAuth, async (req, res) => {
  const u = res.locals.user;
  const secret = speakeasy.generateSecret({ name: `${BRAND} (${u.email})` });
  req.session.tmpSecret = secret.base32;
  const qr = await qrcode.toDataURL(secret.otpauth_url);
  res.render('account', { qr, secret: secret.base32, error: null, msg: null });
});

app.post('/account/2fa/enable', requireAuth, (req, res) => {
  const u = res.locals.user;
  const secret = req.session.tmpSecret;
  const ok = secret && speakeasy.totp.verify({
    secret, encoding: 'base32', token: (req.body.token || '').replace(/\s/g, ''), window: 1,
  });
  if (!ok) return res.render('account', { qr: null, error: 'Code did not match. Start setup again.', msg: null });
  q.setSecret.run(secret, u.id);
  q.enable2fa.run(u.id);
  delete req.session.tmpSecret;
  log(u.id, 'security', 'Enabled two-factor authentication', req);
  res.locals.user = q.userById.get(u.id);
  res.render('account', { qr: null, error: null, msg: 'Two-factor authentication is now enabled.' });
});

app.post('/account/2fa/disable', requireAuth, (req, res) => {
  const u = res.locals.user;
  q.disable2fa.run(u.id);
  log(u.id, 'security', 'Disabled two-factor authentication', req);
  res.locals.user = q.userById.get(u.id);
  res.render('account', { qr: null, error: null, msg: 'Two-factor authentication disabled.' });
});

// ======================= ADMIN =======================
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.render('admin', {
    users: q.allUsers.all(),
    invoices: q.allInvoices.all(),
    error: null, msg: req.query.msg || null,
  });
});

app.post('/admin/invoice', requireAuth, requireAdmin, upload.single('pdf'), (req, res) => {
  const { user_id, label, amount } = req.body;
  const target = q.userById.get(user_id);
  if (!req.file || !target) {
    if (req.file) fs.unlinkSync(path.join(UP_DIR, req.file.filename));
    return res.render('admin', {
      users: q.allUsers.all(), invoices: q.allInvoices.all(),
      error: 'Select a valid user and a PDF file.', msg: null,
    });
  }
  q.addInvoice.run({
    user_id: target.id, label: label || 'Invoice', amount: amount || '',
    filename: req.file.filename, original: req.file.originalname,
  });
  log(target.id, 'invoice_added', `Invoice "${label || 'Invoice'}" made available`, req);
  res.redirect('/admin?msg=' + encodeURIComponent('Invoice uploaded and assigned to ' + target.name));
});

app.post('/admin/invoice/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const inv = q.invoiceById.get(req.params.id);
  if (inv) {
    const f = path.join(UP_DIR, inv.filename);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    q.deleteInvoice.run(inv.id);
  }
  res.redirect('/admin?msg=' + encodeURIComponent('Invoice deleted'));
});

app.post('/admin/plan', requireAuth, requireAdmin, (req, res) => {
  const { user_id, plan, plan_status, plan_renews } = req.body;
  const target = q.userById.get(user_id);
  if (target) {
    q.updatePlan.run(plan, plan_status, plan_renews || null, target.id);
    log(target.id, 'subscription', `Plan updated to ${plan} (${plan_status})`, req);
  }
  res.redirect('/admin?msg=' + encodeURIComponent('Subscription updated'));
});

// ---- errors ----
app.use((req, res) => res.status(404).render('error', { code: 404, msg: 'Page not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { code: 500, msg: err.message || 'Something went wrong' });
});

app.listen(PORT, () => console.log(`${BRAND} running on http://localhost:${PORT}`));
