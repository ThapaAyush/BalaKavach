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

  // Verify domain editing controls are absent
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

  // Verify strings.xml does not declare unpair confirmation dialog or button
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

  // Verify MainViewModel has no unpairDevice or addDomain methods
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
