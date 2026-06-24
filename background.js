const CACHE_TTL_MS = 1000 * 60 * 2;
const SENDER_CACHE_KEY = 'senderLookupCache';
const CONFIG_KEY = 'odooProxyConfig';
const SESSION_KEY = 'proxySession';

async function getStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, resolve);
  });
}

async function setStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

async function clearStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

function parseEmailAddress(headerValue) {
  if (!headerValue) return null;
  const match = headerValue.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  return headerValue.trim().toLowerCase();
}

async function getGmailAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        return reject(new Error(chrome.runtime.lastError?.message || 'Failed to get Gmail auth token'));
      }
      resolve(token);
    });
  });
}

async function fetchSenderFromMessageId(messageId) {
  const token = await getGmailAuthToken();
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=From`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) {
    throw new Error(`Gmail API failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const header = data.payload?.headers?.find((h) => h.name === 'From');
  const email = parseEmailAddress(header?.value);
  if (!email) {
    throw new Error('Unable to extract sender email from Gmail metadata');
  }
  return email;
}

async function getCachedSender(sender) {
  const { [SENDER_CACHE_KEY]: cache = {} } = await getStorage(SENDER_CACHE_KEY);
  const entry = cache[sender];
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }
  return null;
}

async function setCachedSender(sender, data) {
  const { [SENDER_CACHE_KEY]: cache = {} } = await getStorage(SENDER_CACHE_KEY);
  cache[sender] = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data
  };
  await setStorage({ [SENDER_CACHE_KEY]: cache });
}

async function getProxyConfig() {
  const { [CONFIG_KEY]: config = {} } = await getStorage(CONFIG_KEY);
  return config;
}

async function saveProxyConfig(config) {
  await setStorage({ [CONFIG_KEY]: config });
}

async function getSession() {
  const { [SESSION_KEY]: session = null } = await getStorage(SESSION_KEY);
  return session;
}

async function saveSession(session) {
  await setStorage({ [SESSION_KEY]: session });
}

async function makeProxyRequest(path, method = 'POST', body = {}) {
  const config = await getProxyConfig();
  if (!config || !config.proxyUrl) {
    throw new Error('Proxy URL is not configured. Set it in the extension settings.');
  }

  const session = await getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['X-Session-Token'] = session.token;
  }
  const res = await fetch(`${config.proxyUrl.replace(/\/+$/, '')}${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body)
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.error || payload?.message || `${res.status} ${res.statusText}`;
    throw new Error(`Proxy request failed: ${message}`);
  }
  return payload;
}

async function fetchDatabases() {
  const { proxyUrl } = await getProxyConfig();
  if (!proxyUrl) {
    throw new Error('Proxy URL is not configured.');
  }
  return makeProxyRequest('/api/dbs', 'POST', { baseUrl: proxyUrl });
}

async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.type) {
      case 'saveConfig':
        await saveProxyConfig(request.config);
        sendResponse({ success: true });
        break;
      case 'proxyAuth': {
        const config = await getProxyConfig();
        if (!config?.proxyUrl) throw new Error('Proxy URL is not configured.');
        const payload = await makeProxyRequest('/api/auth', 'POST', request.credentials);
        await saveSession({ token: payload.sessionToken, expiresAt: Date.now() + 1000 * 60 * 60 });
        sendResponse({ success: true, sessionToken: payload.sessionToken });
        break;
      }
      case 'fetchDatabases': {
        const response = await makeProxyRequest('/api/dbs', 'POST', { baseUrl: request.baseUrl });
        sendResponse({ success: true, dbs: response.dbs });
        break;
      }
      case 'fetchSender': {
        const messageId = request.messageId;
        if (!messageId) throw new Error('Missing Gmail messageId');
        const senderEmail = await fetchSenderFromMessageId(messageId);
        sendResponse({ success: true, sender: senderEmail });
        break;
      }
      case 'lookupLeads': {
        const cached = await getCachedSender(request.sender);
        if (cached) {
          sendResponse({ success: true, leads: cached });
          break;
        }
        const payload = await makeProxyRequest('/api/leads', 'POST', { sender: request.sender });
        await setCachedSender(request.sender, payload.leads);
        sendResponse({ success: true, leads: payload.leads });
        break;
      }
      case 'updateLeadStage': {
        const payload = await makeProxyRequest(`/api/leads/${request.leadId}/stage`, 'POST', {
          stage_id: request.stageId,
          note: request.note || '',
          sender: request.sender
        });
        sendResponse({ success: true, result: payload });
        break;
      }
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await setStorage({ [SENDER_CACHE_KEY]: {}, [CONFIG_KEY]: {}, [SESSION_KEY]: null });
});
