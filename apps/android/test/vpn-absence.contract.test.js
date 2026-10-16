import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const androidRoot = path.resolve(__dirname, '..');

test('Android contract: VPN service, permissions, and declarations are completely absent', () => {
  const manifestPath = path.join(androidRoot, 'app/src/main/AndroidManifest.xml');
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');

  // Verify BIND_VPN_SERVICE is not declared
  assert.equal(
    manifestContent.includes('android.permission.BIND_VPN_SERVICE'),
    false,
    'AndroidManifest.xml must not declare BIND_VPN_SERVICE'
  );

  // Verify VpnService intent-filter is not declared
  assert.equal(
    manifestContent.includes('android.net.VpnService'),
    false,
    'AndroidManifest.xml must not declare android.net.VpnService'
  );

  // Verify KidsGuardVpnService is not declared
  assert.equal(
    manifestContent.includes('KidsGuardVpnService'),
    false,
    'AndroidManifest.xml must not declare KidsGuardVpnService'
  );

  // Verify FOREGROUND_SERVICE_SPECIAL_USE for VPN is removed
  assert.equal(
    manifestContent.includes('FOREGROUND_SERVICE_SPECIAL_USE'),
    false,
    'AndroidManifest.xml must not declare FOREGROUND_SERVICE_SPECIAL_USE'
  );

  // Verify PACKAGE_USAGE_STATS permission is declared
  assert.equal(
    manifestContent.includes('android.permission.PACKAGE_USAGE_STATS'),
    true,
    'AndroidManifest.xml must declare PACKAGE_USAGE_STATS'
  );

  // Verify no service/vpn directory exists in app/src/main/java
  const vpnDir = path.join(androidRoot, 'app/src/main/java/com/kidsguard/child/service/vpn');
  assert.equal(fs.existsSync(vpnDir), false, 'service/vpn directory must not exist');
});
