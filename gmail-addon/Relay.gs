// ─────────────────────────────────────────────────────────────────────────────
// RELAY — This file goes in a SEPARATE Apps Script project (not this one).
//
// Steps:
//   1. Go to script.google.com → New project
//   2. Paste this entire file into the editor
//   3. Click Deploy → New deployment → Web App
//        Execute as: Me
//        Who has access: Anyone
//   4. Copy the /exec URL
//   5. Back in THIS project's editor, run:
//        setupRelay('https://script.google.com/macros/s/YOUR_ID/exec')
//   Done — the add-on will now work with any Odoo URL automatically.
// ─────────────────────────────────────────────────────────────────────────────

// Forwards XML-RPC calls from the Gmail add-on to any Odoo instance.
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var fetchOptions = {
      method: body.method || 'post',
      muteHttpExceptions: true,
      followRedirects: true
    };
    if (body.contentType) fetchOptions.contentType = body.contentType;
    if (body.payload)     fetchOptions.payload     = body.payload;

    var response = UrlFetchApp.fetch(body.url, fetchOptions);
    return ContentService
      .createTextOutput(JSON.stringify({
        status: response.getResponseCode(),
        body:   response.getContentText()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 500, body: '', error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Redirects "Open in Odoo" link clicks to the actual Odoo record.
function doGet(e) {
  var url = e.parameter.url;
  if (!url) return HtmlService.createHtmlOutput('<p>Missing url parameter.</p>');
  var safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head>' +
    '<meta http-equiv="refresh" content="0;url=' + safe + '">' +
    '</head><body style="font-family:sans-serif;padding:32px;text-align:center;">' +
    '<p>Redirecting to Odoo&hellip;</p>' +
    '<p><a href="' + safe + '">Click here if you are not redirected automatically.</a></p>' +
    '</body></html>'
  );
}
