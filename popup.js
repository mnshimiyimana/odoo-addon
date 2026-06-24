const proxyUrlInput = document.getElementById('proxyUrl');
const odooDbInput = document.getElementById('odooDb');
const odooLoginInput = document.getElementById('odooLogin');
const odooApiKeyInput = document.getElementById('odooApiKey');
const saveConfigButton = document.getElementById('saveConfig');
const authButton = document.getElementById('authBtn');
const loadDbsButton = document.getElementById('loadDbs');
const refreshButton = document.getElementById('refreshLeads');
const configStatus = document.getElementById('configStatus');
const senderInfo = document.getElementById('senderInfo');
const leadsList = document.getElementById('leadsList');
const dbList = document.getElementById('dbList');

function setStatus(element, text, isError = false) {
  element.textContent = text;
  element.className = isError ? 'status error' : 'status';
}

async function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['odooProxyConfig'], (data) => resolve(data.odooProxyConfig || {}));
  });
}

async function init() {
  const config = await getStoredConfig();
  proxyUrlInput.value = config.proxyUrl || '';
  odooDbInput.value = config.db || '';
  odooLoginInput.value = config.login || '';
  odooApiKeyInput.value = config.apiKey || '';
}

async function sendBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

async function saveConfig() {
  const config = {
    proxyUrl: proxyUrlInput.value.trim(),
    db: odooDbInput.value.trim(),
    login: odooLoginInput.value.trim(),
    apiKey: odooApiKeyInput.value.trim()
  };
  await sendBackground({ type: 'saveConfig', config });
  setStatus(configStatus, 'Configuration saved.');
}

async function authenticateToProxy() {
  setStatus(configStatus, 'Authenticating...', false);
  const config = await getStoredConfig();
  const credentials = {
    login: config.login,
    apiKey: config.apiKey,
    db: config.db
  };
  const response = await sendBackground({ type: 'proxyAuth', credentials });
  if (!response.success) {
    setStatus(configStatus, `Auth failed: ${response.error}`, true);
    return;
  }
  setStatus(configStatus, 'Authenticated successfully.');
}

async function loadDatabaseList() {
  setStatus(configStatus, 'Loading databases...', false);
  const config = await getStoredConfig();
  const response = await sendBackground({ type: 'fetchDatabases', baseUrl: config.proxyUrl });
  if (!response.success) {
    setStatus(configStatus, `Database list failed: ${response.error}`, true);
    return;
  }
  dbList.innerHTML = '';
  response.dbs.forEach((dbName) => {
    const option = document.createElement('option');
    option.value = dbName;
    dbList.appendChild(option);
  });
  setStatus(configStatus, 'Database list loaded. Choose a DB from the list.', false);
}

function renderLeads(sender, leads) {
  senderInfo.textContent = `Sender: ${sender}`;
  leadsList.innerHTML = '';
  if (!leads || leads.length === 0) {
    leadsList.innerHTML = '<div class="empty">No CRM opportunities found for this sender.</div>';
    return;
  }
  leads.forEach((lead) => {
    const card = document.createElement('div');
    card.className = 'lead-card';
    card.innerHTML = `
      <h2>${lead.name}</h2>
      <p><strong>Stage:</strong> ${lead.stage_id?.[1] || 'Unknown'}</p>
      <p><strong>Expected Revenue:</strong> ${lead.expected_revenue || 'N/A'}</p>
      <p><strong>Probability:</strong> ${lead.probability || 'N/A'}%</p>
      <p><strong>Salesperson:</strong> ${lead.user_id?.[1] || 'Unassigned'}</p>
      <div class="actions">
        <label>New Stage ID</label>
        <input type="number" class="stage-input" placeholder="Stage ID" />
        <label>Log note</label>
        <textarea class="note-input" placeholder="Optional note about this email"></textarea>
        <button class="update-btn">Update stage and log note</button>
      </div>
    `;
    const updateBtn = card.querySelector('.update-btn');
    updateBtn.addEventListener('click', async () => {
      const stageInput = card.querySelector('.stage-input');
      const noteInput = card.querySelector('.note-input');
      const stageId = Number(stageInput.value.trim());
      const note = noteInput.value.trim();
      if (!stageId) {
        setStatus(configStatus, 'Enter a valid target stage ID.', true);
        return;
      }
      setStatus(configStatus, 'Updating lead...', false);
      const response = await sendBackground({
        type: 'updateLeadStage',
        leadId: lead.id,
        stageId,
        note,
        sender
      });
      if (!response.success) {
        setStatus(configStatus, `Update failed: ${response.error}`, true);
        return;
      }
      setStatus(configStatus, 'Lead updated successfully.', false);
    });
    leadsList.appendChild(card);
  });
}

async function refreshLeads() {
  setStatus(configStatus, 'Finding current Gmail sender...', false);
  const tab = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });

  if (!tab || !tab.url.includes('mail.google.com')) {
    setStatus(configStatus, 'Open an email in Gmail and try again.', true);
    return;
  }

  const messageId = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: 'requestCurrentMessageId' }, (response) => {
      resolve(response?.messageId);
    });
  });

  if (!messageId) {
    setStatus(configStatus, 'Unable to detect Gmail message ID. Navigate to an open email and try again.', true);
    return;
  }

  const senderResponse = await sendBackground({ type: 'fetchSender', messageId });
  if (!senderResponse.success) {
    setStatus(configStatus, `Failed to fetch sender: ${senderResponse.error}`, true);
    return;
  }

  const lookupResponse = await sendBackground({ type: 'lookupLeads', sender: senderResponse.sender });
  if (!lookupResponse.success) {
    setStatus(configStatus, `Lead lookup failed: ${lookupResponse.error}`, true);
    return;
  }

  setStatus(configStatus, 'Leads loaded.', false);
  renderLeads(senderResponse.sender, lookupResponse.leads);
}

saveConfigButton.addEventListener('click', saveConfig);
authButton.addEventListener('click', authenticateToProxy);
loadDbsButton.addEventListener('click', loadDatabaseList);
refreshButton.addEventListener('click', refreshLeads);

document.addEventListener('DOMContentLoaded', init);
