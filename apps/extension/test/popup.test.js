import test from 'node:test';
import assert from 'node:assert/strict';
import { createPopupController } from '../popup.js';

function createMockElement(tagName = 'div', initial = {}) {
  const listeners = {};
  const children = [];
  const element = {
    tagName: tagName.toUpperCase(),
    value: initial.value ?? '',
    textContent: initial.textContent ?? '',
    hidden: initial.hidden ?? false,
    disabled: initial.disabled ?? false,
    className: initial.className ?? '',
    dataset: { ...initial.dataset },
    focusCalled: false,
    focus() { element.focusCalled = true; },
    setAttribute(k, v) { element[k] = v; },
    getAttribute(k) { return element[k]; },
    addEventListener(event, fn) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    async triggerEvent(type, eventObj = {}) {
      const event = { type, preventDefault() {}, ...eventObj };
      for (const fn of listeners[type] || []) {
        await fn(event);
      }
    },
    replaceChildren(...newChildren) {
      children.length = 0;
      children.push(...newChildren);
    },
    append(...newChildren) {
      children.push(...newChildren);
    },
    querySelectorAll(sel) {
      const results = [];
      function traverse(node) {
        if (!node) return;
        if (sel === 'button' && node.tagName === 'BUTTON') results.push(node);
        if (sel === 'span' && node.tagName === 'SPAN') results.push(node);
        for (const child of node.children || []) traverse(child);
      }
      for (const child of children) traverse(child);
      return results;
    },
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all[0] ?? null;
    },
    get children() { return children; },
  };
  return element;
}

function createMockPopupDom() {
  const elements = {
    '#domain-list': createMockElement('ul'),
    '#status': createMockElement('p'),
    '#pairing-form': createMockElement('form'),
    '#pairing-code-input': createMockElement('input'),
    '#device-name-input': createMockElement('input', { value: 'Chrome Browser' }),
    '#pair-button': createMockElement('button', { textContent: 'Pair device' }),
    '#device-status-badge': createMockElement('span', { textContent: 'Unpaired' }),
    '#device-status-message': createMockElement('p'),
    '#device-meta-list': createMockElement('dl', { hidden: true }),
    '#device-name-display': createMockElement('dd'),
    '#device-id-display': createMockElement('dd'),
    '#device-platform-display': createMockElement('dd'),
    '#device-heartbeat-display': createMockElement('dd'),
    '#device-policy-display': createMockElement('dd', { textContent: 'v0' }),
    '#device-sync-display': createMockElement('dd', { textContent: 'Never' }),
    '#device-sync-mode': createMockElement('dd', { textContent: 'Automatic (live)' }),
    '#sync-button': createMockElement('button', { textContent: 'Sync with parent policy', hidden: true }),
    '#device-error': createMockElement('p', { hidden: true }),
  };

  const document = {
    createElement: (tag) => createMockElement(tag),
    querySelector: (sel) => elements[sel] ?? null,
    elements,
  };

  return { document, elements };
}

function createMockChrome(handler) {
  const sentMessages = [];
  const chrome = {
    runtime: {
      sentMessages,
      sendMessage(message, callback) {
        sentMessages.push(message);
        Promise.resolve().then(async () => {
          try {
            const res = await handler(message);
            callback(res);
          } catch (err) {
            callback({ ok: false, error: err.message });
          }
        });
      },
    },
  };
  return chrome;
}

test('initial state renders unpaired status and domain list without editing controls', async () => {
  const { document, elements } = createMockPopupDom();
  const chrome = createMockChrome(async (msg) => {
    if (msg.action === 'getState') {
      return {
        ok: true,
        applied: true,
        configuredDomains: ['example.com'],
        appliedDomains: ['example.com'],
        device: {
          isPaired: false,
          pairingStatus: 'unpaired',
        },
      };
    }
    return { ok: false };
  });

  const controller = createPopupController({ document, chrome });
  await controller.loadState();

  // 1. Device status is Unpaired
  assert.equal(elements['#device-status-badge'].textContent, 'Unpaired');
  assert.equal(elements['#device-status-badge'].className, 'badge badge-unpaired');
  assert.equal(elements['#pairing-form'].hidden, false);
  assert.equal(elements['#sync-button'].hidden, true);
  assert.equal(elements['#device-meta-list'].hidden, true);

  // 2. Parent-managed blocklist is rendered read-only
  assert.equal(elements['#domain-list'].children.length, 1);
  const firstItem = elements['#domain-list'].children[0];
  assert.equal(firstItem.querySelectorAll('button').length, 0, 'No remove buttons on domain items');
  assert.equal(elements['#status'].dataset.kind, 'success');
  assert.match(elements['#status'].textContent, /Rules applied for 1 domain/u);
});

test('pairing code input validates 22-character base64url format client-side before sending', async () => {
  const { document, elements } = createMockPopupDom();
  const chrome = createMockChrome(async () => ({ ok: true }));

  const controller = createPopupController({ document, chrome });

  // 1. Invalid code (too short)
  elements['#pairing-code-input'].value = 'too-short';
  await controller.handlePairingSubmit();
  assert.equal(chrome.runtime.sentMessages.length, 0, 'Must not send message on bad code');
  assert.equal(elements['#device-error'].hidden, false);
  assert.match(elements['#device-error'].textContent, /22-character base64url string/u);
  assert.equal(elements['#pairing-code-input'].focusCalled, true);

  // 2. Invalid code (invalid characters)
  elements['#pairing-code-input'].value = 'INVALID_CODE_WITH_$$$$';
  await controller.handlePairingSubmit();
  assert.equal(chrome.runtime.sentMessages.length, 0);

  // 3. Invalid device name
  elements['#pairing-code-input'].value = 'ABCDEFabcdef01234567-_';
  elements['#device-name-input'].value = '';
  await controller.handlePairingSubmit();
  assert.equal(chrome.runtime.sentMessages.length, 0);
  assert.match(elements['#device-error'].textContent, /Device name must be between 1 and 60 characters/u);
});

test('successful pairing updates UI, clears pairing code, and shows paired status with sync button', async () => {
  const { document, elements } = createMockPopupDom();
  const validCode = 'ABCDEFabcdef01234567-_';

  const chrome = createMockChrome(async (msg) => {
    if (msg.action === 'redeemPairingCode') {
      return {
        ok: true,
        device: {
          isPaired: true,
          pairingStatus: 'paired',
          deviceId: 'dev-999',
          deviceName: 'Alex Chromebook',
          platform: 'linux',
          pairedAt: '2026-10-14T10:00:00.000Z',
          lastSeenAt: '2026-10-14T10:00:00.000Z',
          lastHeartbeatStatus: 'ok',
          acknowledgedPolicyVersion: 3,
        },
      };
    }
    if (msg.action === 'syncPolicy') {
      return {
        ok: true,
        applied: true,
        configuredDomains: ['blocked.example'],
        appliedDomains: ['blocked.example'],
        device: {
          isPaired: true,
          pairingStatus: 'paired',
          deviceId: 'dev-999',
          deviceName: 'Alex Chromebook',
          platform: 'linux',
          acknowledgedPolicyVersion: 3,
          lastPolicySyncAt: '2026-10-14T10:05:00.000Z',
        },
      };
    }
    return { ok: false };
  });

  const controller = createPopupController({ document, chrome });
  elements['#pairing-code-input'].value = validCode;
  elements['#device-name-input'].value = 'Alex Chromebook';

  await controller.handlePairingSubmit();

  // 1. Sent redeemPairingCode message
  assert.ok(chrome.runtime.sentMessages.length >= 1);
  assert.deepEqual(chrome.runtime.sentMessages[0], {
    action: 'redeemPairingCode',
    code: validCode,
    name: 'Alex Chromebook',
    platform: 'unknown',
  });

  // 2. Sensitive code input cleared
  assert.equal(elements['#pairing-code-input'].value, '');

  // 3. UI updated to paired
  assert.equal(elements['#device-status-badge'].textContent, 'Paired');
  assert.equal(elements['#device-status-badge'].className, 'badge badge-paired');
  assert.equal(elements['#device-name-display'].textContent, 'Alex Chromebook');
  assert.equal(elements['#device-id-display'].textContent, 'dev-999');
  assert.equal(elements['#pairing-form'].hidden, true);
  assert.equal(elements['#sync-button'].hidden, true, 'Manual sync button is hidden/removed');
  assert.equal(elements['#device-sync-mode'].textContent, 'Automatic (live)');
  assert.equal(elements['#device-error'].hidden, true);
});

test('invalid pairing code and API failure renders accessible role="alert" error', async () => {
  const { document, elements } = createMockPopupDom();
  const chrome = createMockChrome(async (msg) => {
    if (msg.action === 'redeemPairingCode') {
      return {
        ok: false,
        error: 'Pairing code is invalid or has expired.',
      };
    }
    return { ok: false };
  });

  const controller = createPopupController({ document, chrome });
  elements['#pairing-code-input'].value = 'ABCDEFabcdef01234567-_';
  elements['#device-name-input'].value = 'Alex Chromebook';

  await controller.handlePairingSubmit();

  assert.equal(elements['#device-error'].hidden, false);
  assert.equal(elements['#device-error'].textContent, 'Pairing code is invalid or has expired.');
  assert.equal(elements['#device-status-badge'].textContent, 'Unpaired');
  assert.equal(elements['#pairing-form'].hidden, false);
});

test('prevents duplicate submissions while pairing request is in progress', async () => {
  const { document, elements } = createMockPopupDom();
  let resolvePairing;
  const pairingPromise = new Promise((r) => { resolvePairing = r; });
  const chrome = createMockChrome(async (msg) => {
    if (msg.action === 'redeemPairingCode') {
      await pairingPromise;
      return {
        ok: true,
        device: { isPaired: true, pairingStatus: 'paired', deviceId: 'dev-1' },
      };
    }
    if (msg.action === 'syncPolicy') {
      return { ok: true, applied: true, configuredDomains: [] };
    }
    return { ok: false };
  });

  const controller = createPopupController({ document, chrome });
  elements['#pairing-code-input'].value = 'ABCDEFabcdef01234567-_';
  elements['#device-name-input'].value = 'Alex Chromebook';

  // Start first submission
  const p1 = controller.handlePairingSubmit();
  assert.equal(elements['#pair-button'].disabled, true);
  assert.equal(elements['#pair-button'].textContent, 'Pairing device…');

  // Attempt duplicate submission while busy
  const p2 = controller.handlePairingSubmit();
  assert.equal(chrome.runtime.sentMessages.length, 1, 'Duplicate submission must be ignored');

  // Resolve first submission
  resolvePairing();
  await Promise.all([p1, p2]);

  assert.equal(elements['#pair-button'].disabled, false);
  assert.equal(elements['#pair-button'].textContent, 'Pair device');
});

test('renders invalid_session neutrally as re-auth required without claiming parent revocation', async () => {
  const { document, elements } = createMockPopupDom();
  const controller = createPopupController({ document });

  controller.renderDeviceStatus({
    isPaired: false,
    pairingStatus: 'invalid_session',
    deviceId: 'dev-123',
    deviceName: 'Alex Chromebook',
    platform: 'linux',
    lastHeartbeatStatus: 'invalid_session',
    acknowledgedPolicyVersion: 2,
  });

  assert.equal(elements['#device-status-badge'].textContent, 'Re-auth required');
  assert.equal(elements['#device-status-badge'].className, 'badge badge-invalid_session');
  assert.match(elements['#device-status-message'].textContent, /invalid or expired\. Re-pairing is required/u);
  assert.doesNotMatch(elements['#device-status-message'].textContent, /revoked/iu);
  assert.equal(elements['#pairing-form'].hidden, false);
  assert.equal(elements['#sync-button'].hidden, true);
  assert.equal(elements['#device-policy-display'].textContent, 'v2');
});

test('heartbeat display shows offline state with local filtering notice', async () => {
  const { document, elements } = createMockPopupDom();
  const controller = createPopupController({ document });

  controller.renderDeviceStatus({
    isPaired: true,
    pairingStatus: 'paired',
    deviceId: 'dev-123',
    deviceName: 'Alex Chromebook',
    platform: 'linux',
    lastSeenAt: '2026-10-14T10:00:00.000Z',
    lastHeartbeatStatus: 'offline',
    acknowledgedPolicyVersion: 5,
  });

  assert.match(elements['#device-heartbeat-display'].textContent, /offline - local rules active/u);
  assert.equal(elements['#device-policy-display'].textContent, 'v5');
});

test('automatic policy sync triggers policy sync and updates rule display without manual clicks', async () => {
  const { document, elements } = createMockPopupDom();
  const chrome = createMockChrome(async (msg) => {
    if (msg.action === 'syncPolicy') {
      return {
        ok: true,
        applied: true,
        configuredDomains: ['youtube.com', 'tiktok.com'],
        appliedDomains: ['youtube.com', 'tiktok.com'],
        device: {
          isPaired: true,
          pairingStatus: 'paired',
          deviceId: 'dev-123',
          acknowledgedPolicyVersion: 4,
          lastPolicySyncAt: '2026-10-14T12:00:00.000Z',
        },
      };
    }
    return { ok: false };
  });

  const controller = createPopupController({ document, chrome });
  await controller.autoSync();

  assert.equal(chrome.runtime.sentMessages.length, 1);
  assert.deepEqual(chrome.runtime.sentMessages[0], { action: 'syncPolicy' });
  assert.equal(elements['#domain-list'].children.length, 2);
  assert.equal(elements['#device-policy-display'].textContent, 'v4');
  assert.match(elements['#status'].textContent, /Rules applied for 2 domains/u);
});

test('automatic policy synchronization runs on init when device is paired and live timer polls', async () => {
  const { document, elements } = createMockPopupDom();
  let syncCount = 0;
  const chrome = createMockChrome(async (msg) => {
    if (msg.action === 'getState') {
      return {
        ok: true,
        applied: true,
        configuredDomains: ['initial.com'],
        appliedDomains: ['initial.com'],
        device: {
          isPaired: true,
          pairingStatus: 'paired',
          deviceId: 'dev-123',
          acknowledgedPolicyVersion: 1,
        },
      };
    }
    if (msg.action === 'syncPolicy') {
      syncCount++;
      return {
        ok: true,
        applied: true,
        configuredDomains: ['initial.com', 'updated-by-parent.com'],
        appliedDomains: ['initial.com', 'updated-by-parent.com'],
        device: {
          isPaired: true,
          pairingStatus: 'paired',
          deviceId: 'dev-123',
          acknowledgedPolicyVersion: 2,
          lastPolicySyncAt: '2026-10-17T12:00:00.000Z',
        },
      };
    }
    return { ok: false };
  });

  const controller = createPopupController({ document, chrome, autoSyncIntervalMs: 50 });
  controller.init();

  // Wait briefly for init and timer promises to resolve
  await new Promise((r) => setTimeout(r, 120));
  controller.stopAutoSync();

  assert.ok(syncCount >= 1, 'autoSync should have been executed automatically without user interaction');
  assert.equal(elements['#device-policy-display'].textContent, 'v2');
  assert.equal(elements['#domain-list'].children.length, 2);
  assert.equal(elements['#device-sync-mode'].textContent, 'Automatic (live)');
});

test('credentials are never disclosed across popup DOM elements or state', async () => {
  const { document, elements } = createMockPopupDom();
  const rawCredential = 'secret-device-credential-43chars-long-token';
  const controller = createPopupController({ document });

  controller.renderDeviceStatus({
    isPaired: true,
    pairingStatus: 'paired',
    deviceId: 'dev-123',
    deviceName: 'Alex Chromebook',
    deviceCredential: rawCredential,
    acknowledgedPolicyVersion: 1,
  });

  for (const [sel, el] of Object.entries(elements)) {
    assert.equal(
      (el.textContent || '').includes(rawCredential),
      false,
      `Element ${sel} textContent must not contain credential`,
    );
    assert.equal(
      (el.value || '').includes(rawCredential),
      false,
      `Element ${sel} value must not contain credential`,
    );
  }
});
