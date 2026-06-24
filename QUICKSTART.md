# Quick Start & Test Guide

## Step 1: Confirm Node is installed
```bash
node -v
npm -v
```

## Step 2: Install proxy dependencies
```bash
cd /Users/maureentn/Documents/odoo-addon/proxy
npm install
```

## Step 3: Start the proxy
```bash
export ODOO_URL=https://your.odoo.server.com
export ODOO_DB=your_db_name
export PORT=3000
node server.js
```

You should see:
```
Odoo Gmail proxy running on http://localhost:3000
```

## Step 4: Test the proxy endpoints

### 4a. List Odoo databases
```bash
curl -X POST http://localhost:3000/api/dbs \
  -H 'Content-Type: application/json' \
  -d '{"baseUrl":"https://your.odoo.server.com"}'
```

Expected response:
```json
{"dbs": ["db1", "db2", "your_db_name"]}
```

### 4b. Authenticate to Odoo
```bash
curl -X POST http://localhost:3000/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"login":"user@example.com","apiKey":"YOUR_ODOO_API_KEY","db":"your_db_name"}'
```

Save the returned `sessionToken` for the next test.

Expected response:
```json
{"sessionToken":"<UUID>","uid":123}
```

### 4c. Lookup leads for a sender
```bash
curl -X POST http://localhost:3000/api/leads \
  -H 'Content-Type: application/json' \
  -H 'X-Session-Token: <YOUR_SESSION_TOKEN>' \
  -d '{"sender":"contact@example.com"}'
```

Expected response:
```json
{
  "leads": [
    {
      "id": 456,
      "name": "Opportunity Name",
      "stage_id": [7, "Stage Name"],
      "expected_revenue": 10000,
      "probability": 50,
      "user_id": [1, "Salesperson Name"]
    }
  ]
}
```

### 4d. Update a lead stage and log a note
```bash
curl -X POST http://localhost:3000/api/leads/456/stage \
  -H 'Content-Type: application/json' \
  -H 'X-Session-Token: <YOUR_SESSION_TOKEN>' \
  -d '{"stage_id":8,"note":"Email from customer received via Gmail connector"}'
```

Expected response:
```json
{"success":true,"leadId":456,"stage_id":8}
```

## Step 5: Set up the Chrome extension

### 5a. Get a Google OAuth client ID
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Gmail API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Choose **Chrome Extension** as the application type
6. Add extension ID (you'll get this after loading the unpacked extension)
7. Copy the **Client ID**

### 5b. Update manifest.json
Replace `REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID` in [manifest.json](manifest.json) with your actual client ID.

Also update the proxy domain if not using localhost:
```json
"host_permissions": [
  "https://mail.google.com/*",
  "http://localhost:3000/*"
]
```

### 5c. Load the extension in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `/Users/maureentn/Documents/odoo-addon`
5. Copy the extension ID from the extension card

### 5d. Configure the extension ID in Google Cloud Console
Return to the OAuth 2.0 Client ID and add the extension ID as an authorized app.

## Step 6: Test the extension in Gmail

### 6a. Configure the extension
1. Open Gmail
2. Click the extension icon (top-right)
3. Set `Proxy URL` to `http://localhost:3000`
4. Click `Load available DBs` to see your Odoo databases
5. Choose a database from the dropdown
6. Enter your Odoo username and API key
7. Click **Save Config**
8. Click **Authenticate to Odoo**

### 6b. Look up leads
1. Open a Gmail email
2. Click the extension icon
3. Click **Refresh leads for current email**
4. The popup should show leads linked to the sender's email

### 6c. Update a lead
1. From the leads list, enter a new `stage_id` (you can find valid stage IDs in the Odoo CRM module)
2. Optionally enter a note
3. Click **Update stage and log note**
4. Check the Odoo CRM to confirm the lead stage changed and a note was added

## Troubleshooting

### Proxy won't start
- Confirm `ODOO_URL` and `ODOO_DB` are set correctly
- Confirm port 3000 is not in use: `lsof -i :3000`
- Check that the Odoo server is reachable and has XML-RPC enabled

### Authentication fails
- Confirm the username and API key are correct
- Confirm the Odoo user has the `CRM` app installed and access to `crm.lead`
- Check the proxy logs for XML-RPC errors

### Extension popup is blank or error
- Confirm the Google OAuth client ID is set in `manifest.json`
- Check that the extension ID matches the one in Google Cloud Console
- Reload the extension: go to `chrome://extensions`, find the extension, and click the reload icon

### No leads showing up
- Confirm the sender's email is in the `email_from` field or linked via `partner_id.email` in the CRM lead
- Use curl to test the `/api/leads` endpoint directly
- Check the Odoo server logs for errors

## Production Deployment

For production, consider:
1. Running the proxy behind a reverse proxy (nginx) with TLS
2. Setting up a real database for session storage instead of in-memory
3. Adding rate limiting and request throttling
4. Using environment-based secrets for Odoo credentials
5. Deploying via Docker:
   ```bash
   docker-compose up --build
   ```

See [README.md](README.md) for more details.
