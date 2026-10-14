export function createPopupController({
  document = globalThis.document,
  chrome = globalThis.chrome,
  confirm = globalThis.confirm,
} = {}) {
  const domainForm = document.querySelector('#domain-form');
  const domainInput = document.querySelector('#domain-input');
  const domainList = document.querySelector('#domain-list');
  const domainStatus = document.querySelector('#status');
  const domainSubmitButton = domainForm?.querySelector?.('button[type="submit"]')
    ?? document?.querySelector?.('#domain-form button[type="submit"]');

  const pairingForm = document.querySelector('#pairing-form');
  const pairingCodeInput = document.querySelector('#pairing-code-input');
  const deviceNameInput = document.querySelector('#device-name-input');
  const pairButton = document.querySelector('#pair-button');

  const deviceStatusBadge = document.querySelector('#device-status-badge');
  const deviceStatusMessage = document.querySelector('#device-status-message');
  const deviceMetaList = document.querySelector('#device-meta-list');
  const deviceNameDisplay = document.querySelector('#device-name-display');
  const deviceIdDisplay = document.querySelector('#device-id-display');
  const devicePlatformDisplay = document.querySelector('#device-platform-display');
  const deviceHeartbeatDisplay = document.querySelector('#device-heartbeat-display');
  const deviceError = document.querySelector('#device-error');

  const unpairContainer = document.querySelector('#unpair-container');
  const unpairButton = document.querySelector('#unpair-button');

  let domainBusy = false;
  let pairingBusy = false;
  let unpairingBusy = false;

  function setDomainBusy(value) {
    domainBusy = value;
    if (domainSubmitButton) domainSubmitButton.disabled = value;
    if (domainList) {
      for (const button of domainList.querySelectorAll('button')) {
        button.disabled = value;
      }
    }
  }

  function setPairingBusy(value) {
    pairingBusy = value;
    if (pairButton) {
      pairButton.disabled = value;
      pairButton.textContent = value ? 'Pairing device…' : 'Pair device';
    }
    if (pairingCodeInput) pairingCodeInput.disabled = value;
    if (deviceNameInput) deviceNameInput.disabled = value;
  }

  function setStatus(message, kind = '') {
    if (!domainStatus) return;
    domainStatus.textContent = message;
    domainStatus.dataset.kind = kind;
  }

  function setDeviceError(message) {
    if (!deviceError) return;
    if (message) {
      deviceError.textContent = message;
      deviceError.hidden = false;
    } else {
      deviceError.textContent = '';
      deviceError.hidden = true;
    }
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome?.runtime?.sendMessage(message, (response) => {
        const runtimeError = chrome?.runtime?.lastError;
        if (runtimeError) {
          reject(new Error('The extension service worker is unavailable. Inspect errors at chrome://extensions.'));
        } else {
          resolve(response);
        }
      });
    });
  }

  function renderDomainList(domains) {
    if (!domainList) return;
    domainList.replaceChildren();
    if (!domains.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No domains configured.';
      domainList.append(empty);
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
      remove.addEventListener('click', () => {
        void changeDomain('removeDomain', domain);
      });
      item.append(label, remove);
      domainList.append(item);
    }
  }

  function renderDeviceStatus(device) {
    const status = device?.pairingStatus ?? 'unpaired';

    if (status === 'paired') {
      if (deviceStatusBadge) {
        deviceStatusBadge.textContent = 'Paired';
        deviceStatusBadge.className = 'badge badge-paired';
      }
      if (deviceStatusMessage) deviceStatusMessage.hidden = true;
      if (deviceMetaList) deviceMetaList.hidden = false;
      if (deviceNameDisplay) deviceNameDisplay.textContent = device?.deviceName || 'Unnamed Device';
      if (deviceIdDisplay) deviceIdDisplay.textContent = device?.deviceId || 'Unknown';
      if (devicePlatformDisplay) devicePlatformDisplay.textContent = device?.platform || 'unknown';

      if (deviceHeartbeatDisplay) {
        if (device?.lastSeenAt) {
          const dateStr = new Date(device.lastSeenAt).toLocaleString();
          if (device.lastHeartbeatStatus === 'offline') {
            deviceHeartbeatDisplay.textContent = `${dateStr} (offline - local rules active)`;
          } else if (device.lastHeartbeatStatus === 'error') {
            deviceHeartbeatDisplay.textContent = `${dateStr} (server error - retrying)`;
          } else {
            deviceHeartbeatDisplay.textContent = dateStr;
          }
        } else if (device?.lastHeartbeatStatus === 'offline') {
          deviceHeartbeatDisplay.textContent = 'Offline (will retry - local rules active)';
        } else {
          deviceHeartbeatDisplay.textContent = 'Scheduled (every 15 min)';
        }
      }

      if (pairingForm) pairingForm.hidden = true;
      if (unpairContainer) unpairContainer.hidden = false;
    } else if (status === 'invalid_session') {
      if (deviceStatusBadge) {
        deviceStatusBadge.textContent = 'Re-auth required';
        deviceStatusBadge.className = 'badge badge-invalid_session';
      }
      if (deviceStatusMessage) {
        deviceStatusMessage.textContent = 'Device session is invalid or expired. Re-pairing is required. (Local filtering remains active).';
        deviceStatusMessage.hidden = false;
      }
      if (deviceMetaList) deviceMetaList.hidden = false;
      if (deviceNameDisplay) deviceNameDisplay.textContent = device?.deviceName || 'Unnamed Device';
      if (deviceIdDisplay) deviceIdDisplay.textContent = device?.deviceId || 'Unknown';
      if (devicePlatformDisplay) devicePlatformDisplay.textContent = device?.platform || 'unknown';
      if (deviceHeartbeatDisplay) deviceHeartbeatDisplay.textContent = 'Re-authentication required';

      if (pairingForm) pairingForm.hidden = false;
      if (unpairContainer) unpairContainer.hidden = false;
    } else {
      // Unpaired default
      if (deviceStatusBadge) {
        deviceStatusBadge.textContent = 'Unpaired';
        deviceStatusBadge.className = 'badge badge-unpaired';
      }
      if (deviceStatusMessage) {
        deviceStatusMessage.textContent = 'This device is not paired to a parent account.';
        deviceStatusMessage.hidden = false;
      }
      if (deviceMetaList) deviceMetaList.hidden = true;
      if (pairingForm) pairingForm.hidden = false;
      if (unpairContainer) unpairContainer.hidden = true;
    }
  }

  function showState(response) {
    if (!response) return;
    renderDomainList(response.configuredDomains ?? []);

    if (!response.ok) {
      setStatus(response.error ?? 'Could not read extension status.', 'error');
    } else if (response.applied) {
      const count = response.appliedDomains?.length ?? 0;
      setStatus(`Rules applied for ${count} domain${count === 1 ? '' : 's'}.`, 'success');
    } else {
      setStatus('The saved list does not match the active Chrome rules. Retry an update or inspect chrome://extensions.', 'error');
    }

    if (response.device !== undefined) {
      renderDeviceStatus(response.device);
    }
  }

  async function loadState() {
    try {
      const response = await send({ action: 'getState' });
      showState(response);
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function changeDomain(action, domain) {
    if (domainBusy) return;
    setDomainBusy(true);
    setStatus('Updating the local list and Chrome rules…');
    try {
      const response = await send({ action, domain });
      showState(response);
      if (response?.ok && action === 'addDomain' && domainInput) {
        domainInput.value = '';
        domainInput.focus();
      }
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setDomainBusy(false);
    }
  }

  async function handlePairingSubmit(event) {
    event?.preventDefault();
    if (pairingBusy) return;

    const rawCode = pairingCodeInput?.value ?? '';
    const rawName = deviceNameInput?.value ?? '';
    const code = rawCode.trim();
    const name = rawName.trim();

    if (!code || !/^[A-Za-z0-9_-]{22}$/u.test(code)) {
      setDeviceError('Pairing code must be a 22-character base64url string.');
      pairingCodeInput?.focus();
      return;
    }

    if (!name || name.length > 60) {
      setDeviceError('Device name must be between 1 and 60 characters.');
      deviceNameInput?.focus();
      return;
    }

    setDeviceError(null);
    setPairingBusy(true);

    try {
      const response = await send({
        action: 'redeemPairingCode',
        code,
        name,
        platform: 'unknown',
      });

      if (!response?.ok) {
        setDeviceError(response?.error ?? 'Pairing failed. Check code and network.');
      } else {
        if (pairingCodeInput) pairingCodeInput.value = '';
        renderDeviceStatus(response.device);
        setDeviceError(null);
      }
    } catch (error) {
      setDeviceError(error.message || 'Unable to communicate with the extension service worker.');
    } finally {
      setPairingBusy(false);
    }
  }

  async function handleUnpair() {
    if (unpairingBusy) return;

    if (confirm) {
      const confirmed = confirm('Unpair this device from your KidsGuard account? Local filtering rules will remain active.');
      if (!confirmed) return;
    }

    unpairingBusy = true;
    if (unpairButton) unpairButton.disabled = true;

    try {
      const response = await send({ action: 'clearDeviceSession' });
      if (!response?.ok) {
        setDeviceError(response?.error ?? 'Failed to unpair device.');
      } else {
        renderDeviceStatus(response.device);
        setDeviceError(null);
      }
    } catch (error) {
      setDeviceError(error.message || 'Unable to unpair device.');
    } finally {
      unpairingBusy = false;
      if (unpairButton) unpairButton.disabled = false;
    }
  }

  function init() {
    domainForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!domainBusy && domainInput) void changeDomain('addDomain', domainInput.value);
    });

    pairingForm?.addEventListener('submit', (event) => {
      void handlePairingSubmit(event);
    });

    unpairButton?.addEventListener('click', () => {
      void handleUnpair();
    });

    void loadState();
  }

  return {
    init,
    loadState,
    handlePairingSubmit,
    handleUnpair,
    changeDomain,
    renderDeviceStatus,
    showState,
    setDeviceError,
  };
}

if (typeof document !== 'undefined') {
  const controller = createPopupController({ document, chrome, confirm: globalThis.confirm });
  controller.init();
}
