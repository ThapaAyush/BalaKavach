import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const androidRoot = path.resolve(__dirname, '..');

test('Android contract: Child app has NO domain editing or unpairing controls', () => {
  const layoutPath = path.join(androidRoot, 'app/src/main/res/layout/activity_main.xml');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  // Verify unpair button is absent
  assert.equal(
    layoutContent.includes('btnUnpair'),
    false,
    'activity_main.xml must not contain btnUnpair'
  );

  // Verify domain editing controls and cards are absent
  assert.equal(
    layoutContent.includes('btnAddDomain'),
    false,
    'activity_main.xml must not contain btnAddDomain'
  );
  assert.equal(
    layoutContent.includes('editDomainInput'),
    false,
    'activity_main.xml must not contain editDomainInput'
  );
  assert.equal(
    layoutContent.toLowerCase().includes('local domain blocklist'),
    false,
    'activity_main.xml must not contain Local Domain Blocklist'
  );
  assert.equal(
    layoutContent.toUpperCase().includes('BLOCKED DOMAINS'),
    false,
    'activity_main.xml must not contain BLOCKED DOMAINS tab or section'
  );
  assert.equal(
    layoutContent.includes('cardDomainBlocklist'),
    false,
    'activity_main.xml must not contain cardDomainBlocklist'
  );

  // Verify strings.xml does not declare unpair or domain management strings
  const stringsPath = path.join(androidRoot, 'app/src/main/res/values/strings.xml');
  const stringsContent = fs.readFileSync(stringsPath, 'utf8');

  assert.equal(
    stringsContent.includes('unpair_dialog_title'),
    false,
    'strings.xml must not define unpair_dialog_title'
  );
  assert.equal(
    stringsContent.includes('btn_unpair'),
    false,
    'strings.xml must not define btn_unpair'
  );
  assert.equal(
    stringsContent.toLowerCase().includes('local domain blocklist'),
    false,
    'strings.xml must not define Local Domain Blocklist'
  );
  assert.equal(
    stringsContent.toUpperCase().includes('BLOCKED DOMAINS'),
    false,
    'strings.xml must not define BLOCKED DOMAINS'
  );
  assert.equal(
    stringsContent.includes('tab_blocked_domains'),
    false,
    'strings.xml must not define tab_blocked_domains'
  );
  assert.equal(
    stringsContent.includes('btn_add_domain'),
    false,
    'strings.xml must not define btn_add_domain'
  );

  // Verify MainViewModel has no unpairDevice or domain mutation methods
  const viewModelPath = path.join(androidRoot, 'app/src/main/java/com/kidsguard/child/ui/MainViewModel.kt');
  const viewModelContent = fs.readFileSync(viewModelPath, 'utf8');

  assert.equal(
    viewModelContent.includes('fun unpairDevice'),
    false,
    'MainViewModel must not expose unpairDevice method'
  );
  assert.equal(
    viewModelContent.includes('fun addDomain'),
    false,
    'MainViewModel must not expose addDomain method'
  );
  assert.equal(
    viewModelContent.includes('fun removeDomain'),
    false,
    'MainViewModel must not expose removeDomain method'
  );
});

test('Android contract: Child navigation tabs reflow cleanly and exclude domain management', () => {
  const mainActivityPath = path.join(androidRoot, 'app/src/main/java/com/kidsguard/child/ui/MainActivity.kt');
  const mainActivityContent = fs.readFileSync(mainActivityPath, 'utf8');

  // Verify resolveTabTitles strictly specifies standard tabs without blocked domains
  assert.equal(
    mainActivityContent.toLowerCase().includes('tab_blocked_domains'),
    false,
    'MainActivity.kt must not reference tab_blocked_domains'
  );
  assert.equal(
    mainActivityContent.includes('tabBlockedDomains'),
    false,
    'MainActivity.kt must not declare tabBlockedDomains parameter'
  );

  // Verify layout sets tabMode="fixed" to evenly reflow remaining tabs across screen width
  const layoutPath = path.join(androidRoot, 'app/src/main/res/layout/activity_main.xml');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');
  assert.equal(
    layoutContent.includes('app:tabMode="fixed"'),
    true,
    'TabLayout must configure app:tabMode="fixed" to evenly reflow tabs across screen'
  );
});
