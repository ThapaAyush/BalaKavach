export function createPopupController({
  document = globalThis.document,
  chrome = globalThis.chrome,
  window = globalThis.window,
  autoSyncIntervalMs = 3000,
} = {}) {
  const domainList = document.querySelector('#domain-list');
  const domainStatus = document.querySelector('#status');

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
  const devicePolicyDisplay = document.querySelector('#device-policy-display');
  const deviceSyncDisplay = document.querySelector('#device-sync-display');
  const deviceSyncMode = document.querySelector('#device-sync-mode');
  const syncButton = document.querySelector('#sync-button');
  const deviceError = document.querySelector('#device-error');
  const apiUrlInput = document.querySelector('#api-url-input');
  const presetCloudBtn = document.querySelector('#preset-cloud-btn');
  const presetLocalBtn = document.querySelector('#preset-local-btn');
  const deviceServerDisplay = document.querySelector('#device-server-display');
  const deviceHistorySyncDisplay = document.querySelector('#device-history-sync-display');
  const pairedActions = document.querySelector('#paired-actions');
  const syncHistoryButton = document.querySelector('#sync-history-button');
  const syncHistoryButtonText = document.querySelector('#sync-history-button-text');
  const historySyncStatus = document.querySelector('#history-sync-status');

  let pairingBusy = false;
  let syncBusy = false;
  let autoSyncTimer = null;

  function setPairingBusy(value) {
    pairingBusy = value;
    if (pairButton) {
      pairButton.disabled = value;
      pairButton.textContent = value ? 'Pairing device…' : 'Pair device';
    }
    if (pairingCodeInput) pairingCodeInput.disabled = value;
    if (deviceNameInput) deviceNameInput.disabled = value;
  }

  function setSyncBusy(value) {
    syncBusy = value;
    if (syncButton) {
      syncButton.disabled = value;
      syncButton.textContent = value ? 'Syncing with parent…' : 'Sync with parent policy';
    }
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

  function renderDomainList(domains = []) {
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
      item.append(label);
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

      if (devicePolicyDisplay) {
        const ver = device?.acknowledgedPolicyVersion ?? device?.policyVersion ?? 0;
        devicePolicyDisplay.textContent = `v${ver}`;
      }

      if (deviceSyncDisplay) {
        if (device?.lastPolicySyncAt) {
          const dateStr = new Date(device.lastPolicySyncAt).toLocaleString();
          if (device.lastHeartbeatStatus === 'offline') {
            deviceSyncDisplay.textContent = `${dateStr} (offline)`;
          } else if (device.lastHeartbeatStatus === 'error') {
            deviceSyncDisplay.textContent = `${dateStr} (sync error)`;
          } else {
            deviceSyncDisplay.textContent = dateStr;
          }
        } else if (device?.lastSeenAt) {
          deviceSyncDisplay.textContent = new Date(device.lastSeenAt).toLocaleString();
        } else if (device?.lastHeartbeatStatus === 'offline') {
          deviceSyncDisplay.textContent = 'Offline (will retry)';
        } else {
          deviceSyncDisplay.textContent = 'Pending initial sync';
        }
      }

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

      if (deviceServerDisplay) {
        deviceServerDisplay.textContent = device?.apiBaseUrl || 'Default';
      }
      if (deviceSyncMode) deviceSyncMode.textContent = 'Automatic (live)';
      if (pairingForm) pairingForm.hidden = true;
      if (syncButton) syncButton.hidden = true;
      if (pairedActions) pairedActions.hidden = false;

      if (deviceHistorySyncDisplay && chrome?.storage?.local?.get) {
        try {
          chrome.storage.local.get(['kidsguard_last_history_sync', 'kidsguard_last_history_count'], (res) => {
            if (res?.kidsguard_last_history_sync) {
              const timeStr = new Date(res.kidsguard_last_history_sync).toLocaleTimeString();
              const count = res.kidsguard_last_history_count ?? 0;
              deviceHistorySyncDisplay.textContent = `${timeStr} (${count} visit${count === 1 ? '' : 's'})`;
            } else {
              deviceHistorySyncDisplay.textContent = 'Live tracking';
            }
          });
        } catch {
          deviceHistorySyncDisplay.textContent = 'Live tracking';
        }
      }
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
      if (devicePolicyDisplay) {
        const ver = device?.acknowledgedPolicyVersion ?? device?.policyVersion ?? 0;
        devicePolicyDisplay.textContent = `v${ver}`;
      }
      if (deviceSyncDisplay) deviceSyncDisplay.textContent = 'Re-auth required';
      if (deviceSyncMode) deviceSyncMode.textContent = 'Inactive (re-auth required)';

      if (pairingForm) pairingForm.hidden = false;
      if (syncButton) syncButton.hidden = true;
      if (pairedActions) pairedActions.hidden = true;
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
      if (deviceSyncMode) deviceSyncMode.textContent = 'Inactive (unpaired)';
      if (pairingForm) pairingForm.hidden = false;
      if (syncButton) syncButton.hidden = true;
      if (pairedActions) pairedActions.hidden = true;
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
      setStatus('The saved list does not match the active Chrome rules. Retry sync or inspect chrome://extensions.', 'error');
    }

    if (response.device !== undefined) {
      renderDeviceStatus(response.device);
    }
  }

  async function loadState() {
    try {
      const response = await send({ action: 'getState' });
      showState(response);
      return response;
    } catch (error) {
      setStatus(error.message, 'error');
      return null;
    }
  }

  async function autoSync() {
    if (syncBusy) return null;
    syncBusy = true;
    try {
      const response = await send({ action: 'syncPolicy' });
      if (response?.ok) {
        showState(response);
        setDeviceError(null);
      }
      return response;
    } catch {
      // In automatic polling, fail silently without disrupting the user
      return null;
    } finally {
      syncBusy = false;
    }
  }

  async function handleSync({ silent = false } = {}) {
    if (syncBusy) return null;
    syncBusy = true;
    if (!silent) {
      setSyncBusy(true);
      setDeviceError(null);
      setStatus('Syncing rules with parent policy…');
    }

    try {
      const response = await send({ action: 'syncPolicy' });
      if (!response?.ok) {
        if (!silent) {
          setDeviceError(response?.error ?? 'Policy synchronization failed.');
          setStatus('Policy sync failed.', 'error');
        }
      } else {
        showState(response);
        if (!silent) {
          setDeviceError(null);
        }
      }
      return response;
    } catch (error) {
      if (!silent) {
        setDeviceError(error.message || 'Unable to communicate with the extension service worker.');
        setStatus(error.message, 'error');
      }
      return null;
    } finally {
      syncBusy = false;
      if (!silent) {
        setSyncBusy(false);
      }
    }
  }

  async function handleSyncHistory() {
    if (syncBusy) return null;
    syncBusy = true;
    if (syncHistoryButton) syncHistoryButton.disabled = true;
    if (syncHistoryButtonText) syncHistoryButtonText.textContent = 'Syncing history…';
    if (historySyncStatus) {
      historySyncStatus.hidden = false;
      historySyncStatus.textContent = 'Reading Chrome browsing history…';
      historySyncStatus.dataset.kind = 'info';
      if (historySyncStatus.style) historySyncStatus.style.color = '#0284c7';
    }

    try {
      const response = await send({ action: 'syncWebHistory', lookbackDays: 7, maxResults: 1000 });
      if (response?.ok) {
        const count = response.ingestedCount ?? 0;
        const msg = count > 0
          ? `✓ Synced ${count} browsing visit${count === 1 ? '' : 's'} to parent!`
          : '✓ Browsing history is up to date!';
        if (historySyncStatus) {
          historySyncStatus.textContent = msg;
          historySyncStatus.dataset.kind = 'success';
          if (historySyncStatus.style) historySyncStatus.style.color = '#047857';
        }
        if (deviceHistorySyncDisplay) {
          deviceHistorySyncDisplay.textContent = `Just now (${count} visit${count === 1 ? '' : 's'})`;
        }
      } else {
        if (historySyncStatus) {
          historySyncStatus.textContent = response?.error || 'History sync could not complete.';
          historySyncStatus.dataset.kind = 'error';
          if (historySyncStatus.style) historySyncStatus.style.color = '#b91c1c';
        }
      }
      return response;
    } catch (err) {
      if (historySyncStatus) {
        historySyncStatus.textContent = err.message || 'Sync failed.';
        historySyncStatus.dataset.kind = 'error';
        if (historySyncStatus.style) historySyncStatus.style.color = '#b91c1c';
      }
      return null;
    } finally {
      syncBusy = false;
      if (syncHistoryButton) syncHistoryButton.disabled = false;
      if (syncHistoryButtonText) syncHistoryButtonText.textContent = 'Sync Browsing History';
    }
  }

  function startAutoSync() {
    stopAutoSync();
    if (autoSyncIntervalMs > 0 && typeof setInterval !== 'undefined') {
      autoSyncTimer = setInterval(() => {
        void autoSync();
      }, autoSyncIntervalMs);
      autoSyncTimer?.unref?.();
    }
  }

  function stopAutoSync() {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
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

    const payload = {
      action: 'redeemPairingCode',
      code,
      name,
      platform: 'unknown',
    };
    if (apiUrlInput && typeof apiUrlInput.value === 'string' && apiUrlInput.value.trim()) {
      payload.apiBaseUrl = apiUrlInput.value.trim();
    }

    const targetBaseUrl = payload.apiBaseUrl || 'https://balakavach-be.onrender.com/api/v1';
    let targetOrigin = null;
    try {
      const parsed = new URL(targetBaseUrl);
      targetOrigin = `${parsed.origin}/*`;
    } catch {
      // Ignore URL parsing errors here; backend/client will validate URL format
    }

    if (targetOrigin && chrome?.permissions?.request && chrome?.permissions?.contains) {
      try {
        const hasPerm = await chrome.permissions.contains({ origins: [targetOrigin] });
        if (!hasPerm) {
          const granted = await chrome.permissions.request({ origins: [targetOrigin] });
          if (!granted) {
            setDeviceError(`Network permission to access ${targetOrigin} was not granted. Please allow access in the browser prompt or reload the extension.`);
            setPairingBusy(false);
            return;
          }
        }
      } catch (permErr) {
        console.warn('[KidsGuard] Permission check/request error:', permErr);
      }
    }

    try {
      const response = await send(payload);

      if (!response?.ok) {
        setDeviceError(response?.error ?? 'Pairing failed. Check code and network.');
      } else {
        if (pairingCodeInput) pairingCodeInput.value = '';
        renderDeviceStatus(response.device);
        setDeviceError(null);
        // Automatically sync policy after successful pairing and start live polling
        void autoSync();
        startAutoSync();
      }
    } catch (error) {
      setDeviceError(error.message || 'Unable to communicate with the extension service worker.');
    } finally {
      setPairingBusy(false);
    }
  }

  function init() {
    presetCloudBtn?.addEventListener('click', () => {
      if (apiUrlInput) {
        apiUrlInput.value = 'https://balakavach-be.onrender.com/api/v1';
        presetCloudBtn.classList.add('active');
        presetLocalBtn?.classList.remove('active');
      }
    });

    presetLocalBtn?.addEventListener('click', () => {
      if (apiUrlInput) {
        apiUrlInput.value = 'http://localhost:5000/api/v1';
        presetLocalBtn.classList.add('active');
        presetCloudBtn?.classList.remove('active');
      }
    });

    apiUrlInput?.addEventListener('input', () => {
      const val = apiUrlInput.value?.trim() || '';
      if (presetCloudBtn && presetLocalBtn) {
        presetCloudBtn.classList.toggle('active', val.includes('onrender.com'));
        presetLocalBtn.classList.toggle('active', val.includes('localhost') || val.includes('127.0.0.1'));
      }
    });

    pairingForm?.addEventListener('submit', (event) => {
      void handlePairingSubmit(event);
    });

    if (syncButton) {
      syncButton.addEventListener('click', () => {
        void handleSync();
      });
    }

    if (syncHistoryButton) {
      syncHistoryButton.addEventListener('click', () => {
        void handleSyncHistory();
      });
    }

    // Clean up timer on popup unload
    window?.addEventListener?.('unload', () => {
      stopAutoSync();
    });

    // Immediate sync on window focus or visibility change
    window?.addEventListener?.('focus', () => {
      void autoSync();
    });
    document?.addEventListener?.('visibilitychange', () => {
      if (!document.hidden) {
        void autoSync();
      }
    });

    // Listen to storage changes so if background worker syncs, UI updates immediately
    if (chrome?.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          void loadState();
        }
      });
    }

    void loadState().then((state) => {
      if (state?.device?.isPaired) {
        void autoSync();
      }
      startAutoSync();
    });
  }

  return {
    init,
    loadState,
    autoSync,
    handleSync,
    handleSyncHistory,
    startAutoSync,
    stopAutoSync,
    handlePairingSubmit,
    renderDeviceStatus,
    renderDomainList,
    showState,
    setDeviceError,
  };
}

if (typeof document !== 'undefined') {
  const controller = createPopupController({ document, chrome });
  controller.init();
}
