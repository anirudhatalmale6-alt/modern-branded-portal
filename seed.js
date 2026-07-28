// Seed demo data: an admin, a demo member, activity + a sample PDF invoice
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { db, q } = require('./db');

const UP_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

function ensureUser({ name, email, password, is_admin, plan, plan_status }) {
  let u = q.userByEmail.get(email);
  if (u) return u;
  const renews = new Date(Date.now() + 24 * 864e5).toISOString().slice(0, 10);
  const info = q.createUser.run({
    name, email, password_hash: bcrypt.hashSync(password, 10),
    is_admin: is_admin ? 1 : 0, plan, plan_status, plan_renews: renews,
  });
  return q.userById.get(info.lastInsertRowid);
}

const admin = ensureUser({ name: 'Site Admin', email: 'admin@demo.com', password: 'Admin@123', is_admin: 1, plan: 'Enterprise', plan_status: 'Active' });
const demo  = ensureUser({ name: 'Demo User',  email: 'demo@demo.com',  password: 'Demo@123',  is_admin: 0, plan: 'Pro', plan_status: 'Active' });

// seed activity for demo user (only if none)
if (q.activityForUser.all(demo.id).length === 0) {
  const rows = [
    ['account_created', 'Account registered'],
    ['login', 'Signed in with password'],
    ['security', 'Reviewed security settings'],
    ['subscription', 'Upgraded to Pro plan'],
    ['login', 'Signed in from new device'],
  ];
  rows.forEach(([t, d]) => q.logActivity.run(demo.id, t, d, '203.0.113.10'));
}

// seed a minimal valid PDF invoice for the demo user (only if none)
if (q.invoicesForUser.all(demo.id).length === 0) {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 90>>stream
BT /F1 24 Tf 70 700 Td (Sample Invoice #INV-1001) Tj 0 -40 Td /F1 14 Tf (Amount due: $49.00) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
0000000209 00000 n
0000000349 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
419
%%EOF`;
  const fname = 'sample-invoice.pdf';
  fs.writeFileSync(path.join(UP_DIR, fname), pdf);
  q.addInvoice.run({ user_id: demo.id, label: 'Invoice — Jan 2026', amount: '$49.00', filename: fname, original: 'invoice-INV-1001.pdf' });
}

console.log('Seed complete.');
console.log('  Admin:  admin@demo.com / Admin@123');
console.log('  Member: demo@demo.com  / Demo@123');
db.close();
