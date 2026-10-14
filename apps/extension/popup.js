const form = document.querySelector('#domain-form');
const input = document.querySelector('#domain-input');
const list = document.querySelector('#domain-list');
const status = document.querySelector('#status');
const submitButton = form.querySelector('button[type="submit"]');

let busy = false;

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  for (const button of list.querySelectorAll('button')) button.disabled = value;
}

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function send(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) reject(new Error('The extension service worker is unavailable. Inspect errors at chrome://extensions.'));
      else resolve(response);
    });
  });
}

function render(domains) {
  list.replaceChildren();
  if (!domains.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No domains configured.';
    list.append(empty);
    return;
  }

  for (const domain of domains) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = domain;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${domain}`);
    remove.addEventListener('click', () => { void changeDomain('removeDomain', domain); });
    item.append(label, remove);
    list.append(item);
  }
}

function showState(response) {
  render(response.configuredDomains ?? []);
  if (!response.ok) {
    setStatus(response.error ?? 'Could not read extension status.', 'error');
  } else if (response.applied) {
    setStatus(`Rules applied for ${response.appliedDomains.length} domain${response.appliedDomains.length === 1 ? '' : 's'}.`, 'success');
  } else {
    setStatus('The saved list does not match the active Chrome rules. Retry an update or inspect chrome://extensions.', 'error');
  }
}

async function loadState() {
  try {
    showState(await send({ action: 'getState' }));
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function changeDomain(action, domain) {
  if (busy) return;
  setBusy(true);
  setStatus('Updating the local list and Chrome rules…');
  try {
    const response = await send({ action, domain });
    showState(response);
    if (response.ok && action === 'addDomain') {
      input.value = '';
      input.focus();
    }
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!busy) void changeDomain('addDomain', input.value);
});

void loadState();
