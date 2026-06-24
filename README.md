# Odoo Gmail CRM Connector

This workspace contains:

- `manifest.json`, `background.js`, `content.js`, `popup.html`, `popup.js`, and `styles.css` for a Chrome Manifest V3 Gmail extension.
- `proxy/server.js` and `proxy/package.json` for a Node.js backend proxy that authenticates to Odoo via XML-RPC and exposes JSON endpoints.

## What this does

- The extension authenticates to Gmail using OAuth and reads the sender email address from the currently opened Gmail message.
- It calls the proxy, which authenticates to Odoo using per-user credentials and caches the session UID.
- The proxy searches `crm.lead` with the domain:
  - `['|', ('email_from', '=ilike', sender), ('partner_id.email', '=ilike', sender)]`
- The extension displays each opportunity with `name`, `stage_id`, `expected_revenue`, `probability`, and `user_id`.
- The user can update the opportunity stage and log the email as a note via `crm.lead.message_post`.

## Setup

1. Install proxy dependencies:

```bash
cd proxy
npm install
```

2. Configure the proxy environment:

- `ODOO_URL`: your Odoo server base URL, e.g. `https://odoo.example.com`
- `ODOO_DB`: the Odoo database name to use
- `PORT`: optional proxy port, default `3000`

Example:

```bash
export ODOO_URL=https://odoo.example.com
export ODOO_DB=my_odoo_db
export PORT=3000
node server.js
```

3. Create a Google OAuth client ID for a Chrome extension and set it in `manifest.json`.

4. Load the extension in Chrome:

- Go to `chrome://extensions`
- Enable Developer mode
- Load unpacked extension and select this workspace folder

5. Configure the extension popup:

- `Proxy URL`: e.g. `http://localhost:3000`
- Click `Load available DBs` to populate the database dropdown if the Odoo server exposes database listing
- Choose a database or enter it manually
- Enter `Odoo Username` and `Odoo API Key`
- Save config and authenticate

6. Open Gmail, select an email, and click the extension icon.

## Docker (optional)

You can run the proxy in Docker for a consistent local environment.

Build and run:

```bash
cd /Users/maureentn/Documents/odoo-addon
docker-compose up --build
```

The proxy will be reachable at `http://localhost:3000` by default.

## Quick test checklist

- Start the proxy (either `node proxy/server.js` or `docker-compose up`).
- Use `proxy/test.sh` or `curl` to call `/api/auth` and obtain a `sessionToken`.
- Call `/api/leads` with header `X-Session-Token` to verify lead search.
- Call `/api/leads/:id/stage` to verify write and note logging.

If a step fails, check the proxy logs for XML-RPC errors from Odoo (auth failures, permission errors, etc.).

## Notes

- The extension uses the Gmail REST API rather than scraping DOM.
- The proxy never uses a shared Odoo account; it authenticates per user and caches the Odoo UID in a session token.
- The proxy exposes:
  - `POST /api/auth`
  - `POST /api/leads`
  - `POST /api/leads/:id/stage`

## Required Odoo setup

- Create an Odoo API key for the user account you want to authenticate with.
- Ensure the user has access to `crm.lead` and can create messages on leads.

## Gmail OAuth scopes

- `https://www.googleapis.com/auth/gmail.readonly`

## Replace placeholders

- `YOUR_GOOGLE_OAUTH_CLIENT_ID` in `manifest.json`
- `https://your-proxy.example.com/*` in `manifest.json` with your actual proxy domain
- `ODOO_URL` and `ODOO_DB` in proxy environment variables
