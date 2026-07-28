# Modern Branded Member Portal

A lightweight, secure member portal built with **Node.js + Express + SQLite**. It carries a
modern branded look from the landing page through to a private, 2FA-protected dashboard, and
includes an admin panel for uploading PDF invoices and managing subscriptions.

---

## ✨ Features

- **Modern branded front end** — landing page, sign-up, login (fully responsive, dark theme).
- **Secure authentication** — email + password (bcrypt-hashed) with **two-factor authentication
  (TOTP)** compatible with Google Authenticator, Authy, 1Password, etc.
- **Member dashboard**
  - Account **activity timeline** (sign-ins, security changes, downloads, subscription changes)
  - Current **subscription / membership status** (plan, status, renewal date)
  - **Downloadable PDF invoices**
- **Admin panel**
  - **Drag-and-drop upload** of PDF invoices and assign them to any user
  - Update any user's subscription plan, status and renewal date
  - View / delete all invoices, browse all users
- **Source code + these hand-off notes.**

---

## 🚀 Quick start

```bash
# 1. Install dependencies
npm install

# 2. (optional) configure environment — copy and edit
cp .env.example .env

# 3. Seed demo data (creates an admin + a demo member + a sample invoice)
npm run seed

# 4. Start the server
npm start
```

Then open **http://localhost:3000**

> Change the port with the `PORT` env var, e.g. `PORT=8080 npm start`.

### Demo accounts (created by `npm run seed`)

| Role   | Email            | Password    |
|--------|------------------|-------------|
| Admin  | `admin@demo.com` | `Admin@123` |
| Member | `demo@demo.com`  | `Demo@123`  |

---

## 🧪 Try the full flow

1. Log in as **admin@demo.com**, go to **Admin**, upload a PDF and assign it to *Demo User*.
2. Log in as **demo@demo.com** — the dashboard shows the activity timeline, subscription and the
   invoice you just uploaded. Click **Download**.
3. Go to **Account → Set up 2FA**, scan the QR with an authenticator app, and enable it.
4. Sign out and log in again — you'll now be asked for the 6-digit code before reaching the dashboard.

---

## ⚙️ Configuration (`.env`)

| Variable         | Default            | Description                                  |
|------------------|--------------------|----------------------------------------------|
| `PORT`           | `3000`             | Port the server listens on                   |
| `BRAND_NAME`     | `Nimbus`           | Brand name shown across the whole site       |
| `SESSION_SECRET` | (dev placeholder)  | **Set a long random string in production**   |

To re-brand: set `BRAND_NAME`, and (optionally) tweak the colour variables at the top of
`public/style.css` (`--brand`, `--brand-2`, etc.). The logo is the first letter of the brand name.

---

## 📁 Project structure

```
server.js            Express app — routes, auth, 2FA, admin, uploads
db.js                SQLite schema + prepared statements
seed.js              Creates demo admin/member + sample invoice
views/               EJS templates (landing, login, register, dashboard, account, admin, 2FA)
public/style.css     All styling (single stylesheet, no build step)
data/                SQLite database + sessions   (auto-created, git-ignored)
uploads/             Uploaded invoice PDFs        (auto-created, git-ignored)
```

## 🔐 Security notes

- Passwords hashed with **bcrypt**.
- 2FA uses **TOTP** (RFC 6238) via `speakeasy`; a QR is generated for easy enrolment.
- Sessions are httpOnly cookies with a server-side file store.
- Invoice downloads are access-controlled — a user can only download their own invoices
  (admins can view any). PDFs are validated on upload (type + 15 MB limit).
- For production: set a strong `SESSION_SECRET`, run behind HTTPS, and set the session cookie
  `secure: true` (one line in `server.js`).

## 🚢 Deployment

Runs anywhere Node runs (VPS, Render, Railway, Fly.io, a Docker container, etc.). It's a single
process with a file-based SQLite DB — no external database required. Point a process manager
(pm2/systemd) at `node server.js` and put it behind Nginx/HTTPS.
