'use strict';

const assert = require('node:assert/strict');
const { access, readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const test = require('node:test');

test('package and manifest describe the same extension release', async () => {
    const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(resolve('manifest.json'), 'utf8'));
    assert.equal(packageJson.version, manifest.version);
});

test('manifest v3 contains the required capabilities and valid entry files', async () => {
    const manifest = JSON.parse(await readFile(resolve('manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    for (const permission of ['activeTab', 'scripting', 'downloads', 'storage']) {
        assert.equal(manifest.permissions.includes(permission), true, `missing ${permission}`);
    }
    assert.equal(typeof manifest.action.default_popup, 'string');
    await access(resolve(manifest.action.default_popup));

    for (const path of [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]) {
        await access(resolve(path));
    }
});

test('every popup provider script exists and the generic fallback remains last', async () => {
    const html = await readFile(resolve('popup.html'), 'utf8');
    const providers = [...html.matchAll(/<script src="(providers\/[^"]+)" defer><\/script>/g)]
        .map(match => match[1]);
    assert.equal(providers.at(-1), 'providers/standard-video.js');
    for (const path of providers) await access(resolve(path));
});

test('CI and project check scripts run tests and builds', async () => {
    const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
    const workflow = await readFile(resolve('.github/workflows/test.yml'), 'utf8');
    assert.match(packageJson.scripts.check, /npm test/);
    assert.match(packageJson.scripts.check, /npm run build/);
    assert.match(workflow, /push:/);
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /npm ci/);
    assert.match(workflow, /npm run check/);
});
