let lastMessageId = null;

function parseGmailMessageId() {
  const hash = window.location.hash || '';
  const raw = hash.split('/')[1] || hash.replace(/^#/, '');
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]+$/.test(raw)) {
    return raw;
  }
  return null;
}

function reportCurrentMessageId() {
  const messageId = parseGmailMessageId();
  if (messageId && messageId !== lastMessageId) {
    lastMessageId = messageId;
  }
}

window.addEventListener('hashchange', reportCurrentMessageId, true);
window.addEventListener('load', reportCurrentMessageId, true);

reportCurrentMessageId();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'requestCurrentMessageId') {
    sendResponse({ messageId: lastMessageId });
  }
});
