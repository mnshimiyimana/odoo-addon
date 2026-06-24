function buildAddOn(e) {
  var config = getConfig();
  if (config.sessionToken && config.uid > 0) {
    return showLeads(e, config);
  }
  return showAuthForm(config);
}

function getConfig() {
  var props = PropertiesService.getUserProperties();
  return {
    odooUrl: props.getProperty('odooUrl') || '',
    db: props.getProperty('db') || '',
    username: props.getProperty('username') || '',
    sessionToken: props.getProperty('sessionToken') || '',
    uid: parseInt(props.getProperty('uid') || '0', 10)
  };
}

function showAuthForm(config) {
  var showPass = PropertiesService.getUserProperties().getProperty('showPass') === 'true';
  var ODOO_CRM_ICON = 'https://raw.githubusercontent.com/odoo/odoo/17.0/addons/crm/static/description/icon.png';
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Odoo CRM')
      .setSubtitle('Your pipeline, inside Gmail')
      .setImageUrl(ODOO_CRM_ICON)
      .setImageStyle(CardService.ImageStyle.SQUARE));

  var welcomeSection = CardService.newCardSection();
  welcomeSection.addWidget(
    CardService.newTextParagraph().setText(
      '<b><font color="#875A7B">Welcome!</font></b>  ' +
      '<font color="#5f6368">Sign in to instantly see CRM opportunities linked to the emails you open.</font>'
    )
  );
  card.addSection(welcomeSection);

  var fieldsSection = CardService.newCardSection().setHeader('Account');
  fieldsSection.addWidget(
    CardService.newTextInput()
      .setFieldName('odooUrl')
      .setTitle('Odoo URL')
      .setValue(config.odooUrl)
      .setHint('https://mycompany.odoo.com')
  );
  fieldsSection.addWidget(
    CardService.newTextInput()
      .setFieldName('username')
      .setTitle('Email')
      .setValue(config.username)
      .setHint('you@example.com')
  );
  fieldsSection.addWidget(
    CardService.newTextInput()
      .setFieldName('password')
      .setTitle(showPass ? 'Password (visible)' : 'Password')
      .setHint('Your Odoo password')
  );
  fieldsSection.addWidget(
    CardService.newTextInput()
      .setFieldName('database')
      .setTitle('Database (optional)')
      .setValue(config.db || '')
      .setHint('Leave blank to auto-detect')
  );
  card.addSection(fieldsSection);

  var btnSection = CardService.newCardSection();
  btnSection.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText(showPass ? 'Hide password' : 'Show password')
          .setOnClickAction(CardService.newAction().setFunctionName('toggleShowPassword'))
      )
      .addButton(
        CardService.newTextButton()
          .setText('Sign In')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(CardService.newAction().setFunctionName('doSignIn'))
      )
  );
  card.addSection(btnSection);

  return card.build();
}

function showLeads(e, config) {
  var from = getEmailSender(e);
  var senderEmail = extractEmailAddress(from);

  var ODOO_CRM_ICON = 'https://raw.githubusercontent.com/odoo/odoo/17.0/addons/crm/static/description/icon.png';
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Odoo CRM')
      .setSubtitle(senderEmail || 'Open an email to see leads')
      .setImageUrl(ODOO_CRM_ICON)
      .setImageStyle(CardService.ImageStyle.SQUARE))
    .setFixedFooter(
      CardService.newFixedFooter()
        .setPrimaryButton(
          CardService.newTextButton()
            .setText('Sign Out')
            .setOnClickAction(CardService.newAction().setFunctionName('doSignOut'))
        )
    );

  // ── Connection status ─────────────────────────────────────────────────────
  var connSection = CardService.newCardSection();
  connSection.addWidget(
    CardService.newTextParagraph().setText(
      '<font color="#875A7B">●</font>  <b>' + config.username + '</b>  <font color="#1a73e8">✓</font>'
    )
  );
  card.addSection(connSection);

  // ── No sender ─────────────────────────────────────────────────────────────
  if (!senderEmail) {
    var noSenderSection = CardService.newCardSection();
    noSenderSection.addWidget(
      CardService.newTextParagraph().setText(
        '<font color="#5f6368">Open an email to see CRM opportunities linked to the sender.</font>'
      )
    );
    card.addSection(noSenderSection);
    return card.build();
  }

  // ── Leads ─────────────────────────────────────────────────────────────────
  var result = xmlrpcSearchLeads(config, senderEmail);
  var count = (result.leads && result.leads.length) || 0;
  var sectionHeader = result.error
    ? 'Error'
    : (count === 0
        ? 'No opportunities found'
        : count + (count === 1 ? ' opportunity' : ' opportunities'));

  var leadsSection = CardService.newCardSection().setHeader(sectionHeader);

  if (result.error) {
    leadsSection.addWidget(
      CardService.newTextParagraph()
        .setText('<font color="#c5221f">' + result.error + '</font>')
    );
  } else if (count === 0) {
    leadsSection.addWidget(
      CardService.newTextParagraph()
        .setText('No CRM leads are linked to <b>' + senderEmail + '</b>.')
    );
  } else {
    result.leads.forEach(function(lead) {
      var stage    = Array.isArray(lead.stage_id) ? lead.stage_id[1] : 'No stage';
      var rawProb  = lead.probability != null ? Math.round(lead.probability) : null;
      var probStr  = rawProb === null ? '—'
        : (rawProb >= 70 ? '↑ ' : rawProb >= 30 ? '→ ' : '↓ ') + rawProb + '%';
      var rawRev   = lead.expected_revenue;
      var revenue  = rawRev ? '$' + Number(rawRev).toLocaleString() : '—';
      var salesp   = Array.isArray(lead.user_id) ? lead.user_id[1] : 'Unassigned';
      leadsSection.addWidget(
        CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.BOOKMARK))
          .setTopLabel('◆  ' + stage)
          .setText('<b>' + lead.name + '</b>')
          .setBottomLabel(probStr + '   ·   ' + revenue + '   ·   ' + salesp)
          .setButton(
            CardService.newImageButton()
              .setIcon(CardService.Icon.DESCRIPTION)
              .setAltText('Open in Odoo')
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('openLeadInOdoo')
                  .setParameters({ id: String(lead.id) })
              )
          )
      );
    });
  }

  card.addSection(leadsSection);
  return card.build();
}

function openLeadInOdoo(e) {
  var config = getConfig();
  var leadId = e.commonEventObject.parameters.id;
  var odooUrl = config.odooUrl + '/odoo/crm/' + leadId;
  var url = 'https://www.google.com/url?q=' + encodeURIComponent(odooUrl);
  return CardService.newActionResponseBuilder()
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl(url)
        .setOpenAs(CardService.OpenAs.FULL_SIZE)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

function doSignIn(e) {
  var inputs = e.commonEventObject.formInputs || {};
  var odooUrl = getFormValue(inputs, 'odooUrl')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(odoo|web)(\/.*)?$/, '');
  var username = getFormValue(inputs, 'username');
  var password = getFormValue(inputs, 'password');

  if (!odooUrl || !username || !password) {
    var nav = CardService.newNavigation().updateCard(createErrorCard('All fields are required.'));
    return CardService.newActionResponseBuilder().setNavigation(nav).build();
  }

  if (!getRelayUrl()) {
    var nav = CardService.newNavigation().updateCard(createErrorCard(
      'Relay not configured. Deploy Relay.gs as a Web App, then run setupRelay() in the editor.'
    ));
    return CardService.newActionResponseBuilder().setNavigation(nav).build();
  }
  var database = getFormValue(inputs, 'database').trim();
  var authResult = database
    ? xmlrpcAuthenticateWithDb(odooUrl, database, username, password)
    : xmlrpcAuthenticateAnyDb(odooUrl, username, password);
  if (authResult.error) {
    var nav = CardService.newNavigation().updateCard(createErrorCard('Sign in failed: ' + authResult.error));
    return CardService.newActionResponseBuilder().setNavigation(nav).build();
  }

  var props = PropertiesService.getUserProperties();
  props.setProperty('odooUrl', odooUrl);
  props.setProperty('db', authResult.db);
  props.setProperty('username', username);
  props.setProperty('sessionToken', password);
  props.setProperty('uid', String(authResult.uid));

  var nav = CardService.newNavigation().updateCard(buildAddOn(e));
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

function doSignOut(e) {
  var props = PropertiesService.getUserProperties();
  props.deleteProperty('sessionToken');
  props.deleteProperty('uid');
  props.deleteProperty('db');
  props.deleteProperty('showPass');
  var nav = CardService.newNavigation().updateCard(buildAddOn(e));
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

function toggleShowPassword(e) {
  var props = PropertiesService.getUserProperties();
  var current = props.getProperty('showPass') === 'true';
  props.setProperty('showPass', current ? 'false' : 'true');
  var nav = CardService.newNavigation().updateCard(showAuthForm(getConfig()));
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

function getEmailSender(e) {
  if (!e || !e.gmail) return '';
  var accessToken = e.gmail.accessToken;
  var messageId = e.gmail.messageId;
  if (!accessToken || !messageId) return '';
  try {
    GmailApp.setCurrentMessageAccessToken(accessToken);
    var message = GmailApp.getMessageById(messageId);
    return message ? message.getFrom() : '';
  } catch (err) {
    return '';
  }
}

function extractEmailAddress(from) {
  if (!from) return '';
  var match = from.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : from.trim().toLowerCase();
}

// ── Relay ─────────────────────────────────────────────────────────────────────
// Returns the relay URL stored in Script Properties, or '' if not configured.
// To configure: run  setupRelay('https://script.google.com/macros/s/YOUR_ID/exec')
// from the Apps Script editor after deploying Relay.gs as a Web App.
function getRelayUrl() {
  try { return PropertiesService.getScriptProperties().getProperty('relayUrl') || ''; } catch(e) { return ''; }
}

function getLinkRelayUrl() {
  try { return PropertiesService.getScriptProperties().getProperty('linkRelayUrl') || ''; } catch(e) { return ''; }
}

function setupRelay(execUrl) {
  PropertiesService.getScriptProperties().setProperty('relayUrl', execUrl);
  Logger.log('Relay configured: ' + execUrl);
}

function setupLinkRelay(execUrl) {
  PropertiesService.getScriptProperties().setProperty('linkRelayUrl', execUrl);
  Logger.log('Link relay configured: ' + execUrl);
}

// ── Odoo XML-RPC ─────────────────────────────────────────────────────────────

// Authenticate using Odoo's JSON-RPC session endpoint, which returns real error messages.
function jsonrpcAuthenticateWithDb(odooUrl, db, login, password) {
  var bodyObj = {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { db: db, login: login, password: password }
  };
  var relay = getRelayUrl();
  var rawJson;
  if (relay) {
    var r = UrlFetchApp.fetch(relay, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ url: odooUrl + '/web/session/authenticate', method: 'post', contentType: 'application/json', payload: JSON.stringify(bodyObj) }),
      muteHttpExceptions: true
    });
    if (r.getResponseCode() !== 200) return { error: 'Relay HTTP ' + r.getResponseCode() };
    var envelope; try { envelope = JSON.parse(r.getContentText()); } catch(ex) { return { error: 'Relay parse error' }; }
    if (envelope.status !== 200) return { error: 'Odoo HTTP ' + envelope.status };
    rawJson = envelope.body;
  } else {
    var r2 = UrlFetchApp.fetch(odooUrl + '/web/session/authenticate', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(bodyObj), muteHttpExceptions: true
    });
    if (r2.getResponseCode() !== 200) return { error: 'HTTP ' + r2.getResponseCode() };
    rawJson = r2.getContentText();
  }
  var parsed; try { parsed = JSON.parse(rawJson); } catch(ex) { return { error: 'JSON parse error' }; }
  if (parsed.error) {
    var msg = (parsed.error.data && parsed.error.data.message) ? parsed.error.data.message : JSON.stringify(parsed.error);
    return { error: msg };
  }
  var res = parsed.result;
  if (res && res.uid && res.uid > 0) return { uid: res.uid, db: db };
  if (res && res.uid === false) return { error: 'Wrong username or password for database "' + db + '".' };
  return { error: 'Unexpected response: ' + JSON.stringify(res) };
}

function xmlrpcAuthenticateWithDb(odooUrl, db, login, password) {
  var result = xmlrpcCall(odooUrl + '/xmlrpc/2/common', 'authenticate', [db, login, password, {}]);
  if (result.error) return { error: result.error };
  if (result.value && result.value > 0) return { uid: result.value, db: db };
  return { error: 'Wrong username or password for database "' + db + '".' };
}

function xmlrpcAuthenticateAnyDb(odooUrl, login, password) {
  // Try the subdomain first — for Odoo.com SaaS this is always the DB name (1 relay call).
  var subdomain = odooUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].split('.')[0];
  var result = xmlrpcAuthenticateWithDb(odooUrl, subdomain, login, password);
  if (!result.error) return result;

  // Only if subdomain fails, try parsing the login page for the real DB name.
  var pageDb = discoverDbFromLoginPage(odooUrl);
  if (pageDb && pageDb !== subdomain) {
    result = xmlrpcAuthenticateWithDb(odooUrl, pageDb, login, password);
    if (!result.error) return result;
  }

  return { error: result.error || 'Authentication failed. Enter the database name in the Database field and try again.' };
}

function discoverDbFromLoginPage(odooUrl) {
  try {
    var html;
    var relay = getRelayUrl();
    // Try both /web/login and /odoo/login (Odoo 17 changed the path).
    var loginUrls = [odooUrl + '/web/login', odooUrl + '/odoo/login'];
    for (var u = 0; u < loginUrls.length; u++) {
      if (relay) {
        var resp = UrlFetchApp.fetch(relay, {
          method: 'post', contentType: 'application/json',
          payload: JSON.stringify({ url: loginUrls[u], method: 'get' }),
          muteHttpExceptions: true
        });
        var d = JSON.parse(resp.getContentText());
        if (d.status !== 200) continue;
        html = d.body;
      } else {
        var resp2 = UrlFetchApp.fetch(loginUrls[u], { muteHttpExceptions: true, followRedirects: true });
        if (resp2.getResponseCode() !== 200) continue;
        html = resp2.getContentText();
      }
      var inputs = html.match(/<input[^>]+>/gi) || [];
      for (var i = 0; i < inputs.length; i++) {
        if (/name=["']db["']/.test(inputs[i])) {
          var m = inputs[i].match(/value=["']([^"']+)["']/);
          if (m && m[1]) return m[1];
        }
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

function xmlrpcSearchLeads(config, sender) {
  // Odoo domains use flat prefix (Polish) notation — operators cannot be nested as elements.
  // ['|', '|', A, B, C] means (A OR B) OR C.
  var domain = ['|', '|',
    ['email_from', '=ilike', sender],
    ['email_from', 'ilike', '%' + sender + '%'],
    ['partner_id.email', '=ilike', sender]
  ];
  var result = xmlrpcCall(
    config.odooUrl + '/xmlrpc/2/object',
    'execute_kw',
    [config.db, config.uid, config.sessionToken,
     'crm.lead', 'search_read', [domain],
     { fields: ['name', 'stage_id', 'expected_revenue', 'probability', 'user_id'], limit: 50 }]
  );
  if (result.error) return { error: result.error };
  return { leads: result.value || [] };
}

function xmlrpcCall(url, methodName, params) {
  var relay = getRelayUrl();
  if (relay) {
    var opts = {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ url: url, method: 'post', contentType: 'text/xml', payload: buildXmlRpcRequest(methodName, params) }),
      muteHttpExceptions: true
    };
    var r = UrlFetchApp.fetch(relay, opts);
    if (r.getResponseCode() !== 200) return { error: 'Relay HTTP ' + r.getResponseCode() };
    var d; try { d = JSON.parse(r.getContentText()); } catch(ex) { return { error: 'Relay parse error' }; }
    if (d.status !== 200) return { error: 'Odoo HTTP ' + d.status };
    return parseXmlRpcResponse(d.body);
  }
  var options = {
    method: 'post', contentType: 'text/xml',
    payload: buildXmlRpcRequest(methodName, params),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) return { error: 'HTTP ' + response.getResponseCode() };
  return parseXmlRpcResponse(response.getContentText());
}

function buildXmlRpcRequest(methodName, params) {
  var xml = '<?xml version="1.0"?><methodCall><methodName>' + methodName + '</methodName><params>';
  params.forEach(function(p) { xml += '<param>' + encodeValue(p) + '</param>'; });
  xml += '</params></methodCall>';
  return xml;
}

function encodeValue(val) {
  if (val === null || val === undefined || val === false) {
    return '<value><boolean>0</boolean></value>';
  }
  if (val === true) {
    return '<value><boolean>1</boolean></value>';
  }
  if (typeof val === 'number') {
    return Number.isInteger(val)
      ? '<value><int>' + val + '</int></value>'
      : '<value><double>' + val + '</double></value>';
  }
  if (typeof val === 'string') {
    return '<value><string>' + val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</string></value>';
  }
  if (Array.isArray(val)) {
    return '<value><array><data>' + val.map(encodeValue).join('') + '</data></array></value>';
  }
  if (typeof val === 'object') {
    var members = Object.keys(val).map(function(key) {
      return '<member><name>' + key + '</name>' + encodeValue(val[key]) + '</member>';
    }).join('');
    return '<value><struct>' + members + '</struct></value>';
  }
  return '<value><string>' + String(val) + '</string></value>';
}

function parseXmlRpcResponse(xmlText) {
  try {
    var doc = XmlService.parse(xmlText);
    var root = doc.getRootElement();
    var fault = root.getChild('fault');
    if (fault) {
      var faultVal = extractValue(fault.getChild('value'));
      return { error: faultVal && faultVal.faultString ? faultVal.faultString : JSON.stringify(faultVal) };
    }
    var params = root.getChild('params');
    if (params) {
      var param = params.getChild('param');
      if (param) return { value: extractValue(param.getChild('value')) };
    }
    return { error: 'Empty response' };
  } catch (err) {
    return { error: 'Parse error: ' + err.message };
  }
}

function extractValue(el) {
  if (!el) return null;
  var children = el.getChildren();
  if (children.length === 0) return el.getText();
  var type = children[0];
  var name = type.getName();
  var text = type.getText();
  if (name === 'int' || name === 'i4' || name === 'i8') return parseInt(text, 10);
  if (name === 'double') return parseFloat(text);
  if (name === 'boolean') return text === '1';
  if (name === 'string') return text;
  if (name === 'nil') return null;
  if (name === 'array') {
    var data = type.getChild('data');
    return data ? data.getChildren('value').map(extractValue) : [];
  }
  if (name === 'struct') {
    var obj = {};
    type.getChildren('member').forEach(function(member) {
      obj[member.getChild('name').getText()] = extractValue(member.getChild('value'));
    });
    return obj;
  }
  return text;
}

// ── Debug helper ──────────────────────────────────────────────────────────────
// Call from the Apps Script editor console, e.g.:
//   debugAuth('https://arakav18.odoo.com', 'you@example.com', 'yourpassword')
//   debugAuth('https://arakav18.odoo.com', 'you@example.com', 'yourpassword', 'arakav18')
function debugAuth(odooUrl, username, password, db) {
  Logger.log('Relay: ' + (getRelayUrl() || '(NOT SET — run setupRelay first)'));
  Logger.log('Testing: ' + odooUrl);

  // Connectivity check — no auth needed
  var ver = xmlrpcCall(odooUrl + '/xmlrpc/2/common', 'version', []);
  Logger.log('Server reachable: ' + JSON.stringify(ver));

  // DB discovery
  var pageDb = discoverDbFromLoginPage(odooUrl);
  Logger.log('DB from login page: ' + (pageDb || '(not found)'));

  // Explicit DB or auto-detect
  var targetDb = db || pageDb || odooUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].split('.')[0];
  Logger.log('Trying DB: ' + targetDb);

  // JSON-RPC auth (shows real error message from Odoo)
  var auth = jsonrpcAuthenticateWithDb(odooUrl, targetDb, username, password);
  Logger.log('Auth result: ' + JSON.stringify(auth));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFormValue(inputs, field) {
  var f = inputs[field];
  if (!f || !f.stringInputs || !f.stringInputs.value) return '';
  return f.stringInputs.value[0] || '';
}

function createErrorCard(message) {
  var card = CardService.newCardBuilder();
  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextParagraph().setText('<font color="#d33b27">' + message + '</font>'));
  card.addSection(section);
  return card.build();
}
