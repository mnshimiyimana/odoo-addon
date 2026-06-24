const express = require('express');
const cors = require('cors');
const xmlrpc = require('xmlrpc');
const { randomUUID } = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const ODOO_URL = process.env.ODOO_URL || 'https://odoo.example.com';
const DEFAULT_DB = process.env.ODOO_DB || 'your_db_name';
const PROXY_PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 1000 * 60 * 45;

const sessionCache = new Map();

function createClient(baseUrl) {
  return {
    common: xmlrpc.createSecureClient({ url: `${baseUrl}/xmlrpc/2/common` }),
    object: xmlrpc.createSecureClient({ url: `${baseUrl}/xmlrpc/2/object` }),
    db: xmlrpc.createSecureClient({ url: `${baseUrl}/xmlrpc/2/db` })
  };
}

function authenticateUser(baseUrl, db, login, apiKey) {
  return new Promise((resolve, reject) => {
    const client = createClient(baseUrl).common;
    client.methodCall('authenticate', [db, login, apiKey, {}], (error, uid) => {
      if (error) return reject(error);
      resolve(uid);
    });
  });
}

function execute_kw(session, model, method, params = [], kwargs = {}) {
  return new Promise((resolve, reject) => {
    const client = createClient(session.baseUrl).object;
    const args = [session.db, session.uid, session.apiKey, model, method, params, kwargs];
    client.methodCall('execute_kw', args, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

function requireSession(req, res, next) {
  const token = req.header('x-session-token');
  if (!token) {
    return res.status(401).json({ error: 'Missing X-Session-Token header' });
  }
  const session = sessionCache.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessionCache.delete(token);
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
  req.odooSession = session;
  next();
}

app.post('/api/auth', async (req, res) => {
  try {
    const { login, apiKey, db } = req.body;
    const baseUrl = req.body.baseUrl || ODOO_URL;
    const effectiveDb = db || DEFAULT_DB;
    if (!login || !apiKey || !effectiveDb) {
      return res.status(400).json({ error: 'login, apiKey, and db are required' });
    }
    const uid = await authenticateUser(baseUrl, effectiveDb, login, apiKey);
    if (!uid) {
      return res.status(401).json({ error: 'Odoo authentication failed' });
    }
    const token = randomUUID();
    sessionCache.set(token, {
      uid,
      login,
      apiKey,
      db: effectiveDb,
      baseUrl,
      expiresAt: Date.now() + SESSION_TTL_MS
    });
    res.json({ sessionToken: token, uid });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Authentication error' });
  }
});

app.post('/api/dbs', async (req, res) => {
  try {
    const baseUrl = req.body?.baseUrl || ODOO_URL;
    if (!baseUrl) {
      return res.status(400).json({ error: 'baseUrl is required to list databases' });
    }
    const dbClient = createClient(baseUrl).db;
    dbClient.methodCall('list', [], (error, dbs) => {
      if (error) {
        return res.status(500).json({ error: error.message || 'Failed to retrieve database list' });
      }
      res.json({ dbs });
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Database list lookup failed' });
  }
});

app.post('/api/leads', requireSession, async (req, res) => {
  try {
    const { sender } = req.body;
    if (!sender) {
      return res.status(400).json({ error: 'sender is required' });
    }
    const domain = ['|', ['email_from', '=ilike', sender], ['partner_id.email', '=ilike', sender]];
    const leads = await execute_kw(req.odooSession, 'crm.lead', 'search_read', [domain], {
      fields: ['name', 'stage_id', 'expected_revenue', 'probability', 'user_id'],
      limit: 50
    });
    res.json({ leads });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Lead lookup failed' });
  }
});

app.post('/api/leads/:id/stage', requireSession, async (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const { stage_id, note } = req.body;
    if (!leadId || !stage_id) {
      return res.status(400).json({ error: 'lead id and stage_id are required' });
    }
    const [lead] = await execute_kw(req.odooSession, 'crm.lead', 'search_read', [[['id', '=', leadId]]], {
      fields: ['id']
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    const [stage] = await execute_kw(req.odooSession, 'crm.stage', 'search_read', [[['id', '=', stage_id]]], {
      fields: ['id', 'name']
    });
    if (!stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }
    await execute_kw(req.odooSession, 'crm.lead', 'write', [[leadId], { stage_id }]);
    await execute_kw(req.odooSession, 'crm.lead', 'message_post', [[leadId], {
      body: note || 'Email logged from Gmail connector.',
      subject: 'Logged email from Gmail',
      message_type: 'comment'
    }]);
    res.json({ success: true, leadId, stage_id });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update lead stage' });
  }
});

app.listen(PROXY_PORT, () => {
  console.log(`Odoo Gmail proxy running on http://localhost:${PROXY_PORT}`);
});
