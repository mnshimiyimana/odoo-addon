// ─────────────────────────────────────────────────────────────────────────────
// RELAY LINKS — Separate Apps Script project, handles ONLY link redirects.
// No UrlFetchApp = no OAuth consent needed = no auth dialogs ever.
//
// Steps (one time):
//   1. Go to script.google.com → New project → name it "Relay Links"
//   2. Paste this entire file
//   3. Deploy → New deployment → Web App
//        Execute as: Me
//        Who has access: Anyone
//   4. Copy the /exec URL
//   5. In your MAIN project editor, run:
//        setupLinkRelay('https://script.google.com/macros/s/YOUR_ID/exec')
// ─────────────────────────────────────────────────────────────────────────────

function doGet(e) {
  var url = e.parameter.url;
  if (!url) return HtmlService.createHtmlOutput('<p>Missing url parameter.</p>');
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head>' +
    '<meta http-equiv="refresh" content="0;url=' + url + '">' +
    '</head><body>' +
    '<p>Opening Odoo&hellip; <a href="' + url + '">Click here if not redirected.</a></p>' +
    '</body></html>'
  );
}
