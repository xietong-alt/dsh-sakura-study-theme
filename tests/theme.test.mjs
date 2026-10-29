import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { browserHarness } from './browser-harness.mjs';
import { buildTheme, projectRoot } from '../scripts/build-theme.mjs';

const scratchRoot = path.resolve(projectRoot, 'work');
async function scratch(t) {
  await fs.mkdir(scratchRoot, { recursive: true });
  const dir = await fs.mkdtemp(path.join(scratchRoot, 'test-'));
  t.after(async () => {
    const resolved = path.resolve(dir);
    assert.equal(path.dirname(resolved), scratchRoot);
    assert.ok(path.basename(resolved).startsWith('test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return dir;
}

test('build preserves original image bytes and emits a complete installable bundle', async t => {
  const out = await scratch(t);
  const result = await buildTheme({ out });
  assert.equal(result.mime, 'image/jpeg');
  const original = await fs.readFile(path.join(projectRoot, 'assets/wallpaper.jpg'));
  const source = await fs.readFile(path.join(out, 'client.js'), 'utf8');
  const encoded = source.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/);
  assert.ok(encoded);
  assert.deepEqual(Buffer.from(encoded[1], 'base64'), original);
  assert.deepEqual(await fs.readFile(path.join(out, 'assets/wallpaper.jpg')), original);
  const manifest = JSON.parse(await fs.readFile(path.join(out, 'package.json'), 'utf8'));
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(manifest.dsh.client.immediately, true);
  for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json', 'styles/theme.css', 'styles/dark-palette.css', 'LICENSE', 'ASSET_LICENSE.md', 'THIRD_PARTY_LICENSES.txt']) await fs.access(path.join(out, file));
});

test('theme mounting and disposal restore pre-existing page state', async t => {
  const out = await scratch(t);
  await buildTheme({ out });
  const source = await fs.readFile(path.join(out, 'client.js'), 'utf8');
  const browser = browserHarness();
  browser.attrs.set('data-sakura-study', 'previous-owner');
  browser.run(source);
  assert.equal(browser.styles.length, 1);
  assert.equal(browser.attrs.get('data-sakura-study'), 'true');
  assert.ok(browser.styles[0].textContent.includes('html body[data-sakura-study]'));
  browser.dispose();
  assert.equal(browser.styles.length, 0);
  assert.equal(browser.attrs.get('data-sakura-study'), 'previous-owner');
  const cleanBrowser = browserHarness();
  cleanBrowser.run(source);
  cleanBrowser.dispose();
  assert.equal(cleanBrowser.attrs.has('data-sakura-study'), false);
});

test('custom image is detected from its bytes and private source path is not embedded', async t => {
  const dir = await scratch(t);
  const image = path.join(dir, 'private-picture.dat');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=', 'base64');
  await fs.writeFile(image, png);
  const out = path.join(dir, 'bundle');
  const result = await buildTheme({ image, out, config: { sidebarOpacity: 0.7, composerBlur: 8 } });
  assert.equal(result.mime, 'image/png');
  assert.deepEqual(await fs.readFile(path.join(out, 'assets/wallpaper.png')), png);
  const source = await fs.readFile(path.join(out, 'client.js'), 'utf8');
  assert.ok(source.includes('data:image/png;base64,'));
  assert.ok(source.includes('rgba(18,20,34,0.7)'));
  assert.ok(source.includes('blur(8px)'));
  assert.equal(source.includes(image), false);
  const config = JSON.parse(await fs.readFile(path.join(out, 'theme.config.json'), 'utf8'));
  assert.equal(config.wallpaper, 'assets/wallpaper.png');
});

test('invalid opacity is refused before creating output files', async t => {
  const dir = await scratch(t);
  const out = path.join(dir, 'not-created');
  await assert.rejects(buildTheme({ out, config: { sidebarOpacity: 2 } }), /between 0 and 1/);
  await assert.rejects(fs.access(out));
});

test('non-image content is refused before creating output files', async t => {
  const dir = await scratch(t);
  const image = path.join(dir, 'fake.jpg');
  const out = path.join(dir, 'not-created');
  await fs.writeFile(image, '<svg onload="alert(1)"></svg>');
  await assert.rejects(buildTheme({ image, out }), /JPEG, PNG\/APNG, GIF, WebP, MP4 or WebM/);
  await assert.rejects(fs.access(out));
});

test('output cannot overwrite an ancestor of the source checkout', async () => {
  await assert.rejects(buildTheme({ out: path.dirname(projectRoot) }), /ancestor/);
});
