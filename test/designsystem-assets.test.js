'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'vendor', 'oj-designsystem');
const packageRoot = path.dirname(require.resolve('oj-designsystem/package.json'));

async function directoryFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? directoryFiles(file) : [file];
    }));
    return files.flat();
}

test('vendored oj-designsystem retains the complete published distribution and attribution', async () => {
    const dist = path.join(packageRoot, 'dist');
    const expected = [
        ...(await directoryFiles(dist)).map(file => path.relative(dist, file)),
        'LICENSE',
        'THIRD-PARTY-NOTICES.md',
    ].sort();
    const actual = (await directoryFiles(vendor)).map(file => path.relative(vendor, file)).sort();
    assert.deepEqual(actual, expected);

    for (const file of expected) {
        const source = path.join(['LICENSE', 'THIRD-PARTY-NOTICES.md'].includes(file) ? packageRoot : dist, file);
        assert.deepEqual(await fs.readFile(path.join(vendor, file)), await fs.readFile(source), `${file} must remain unchanged`);
    }
});

test('all design-system stylesheet assets resolve locally with preserved relative paths', async () => {
    const stylesheets = (await directoryFiles(vendor)).filter(file => file.endsWith('.css'));
    const assets = new Set();
    for (const stylesheet of stylesheets) {
        const css = await fs.readFile(stylesheet, 'utf8');
        for (const match of css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/g)) {
            const url = match[1] ?? match[2] ?? match[3];
            assert.match(url, /^\.\/assets\//, `external or absolute asset URL in ${path.basename(stylesheet)}: ${url}`);
            const asset = path.resolve(path.dirname(stylesheet), url);
            assert.equal((await fs.stat(asset)).isFile(), true, `missing ${url}`);
            assets.add(asset);
        }
    }
    assert.ok(assets.size > 0, 'local font and icon assets are included');
    assert.ok([...assets].some(file => file.includes('fontawesome')));
    assert.ok([...assets].some(file => file.includes('comfortaa')));
    assert.ok([...assets].some(file => file.includes('jetbrains-mono')));
});

test('popup references the local oj-designsystem stylesheet and removes the old distribution', async () => {
    const html = await fs.readFile(path.join(root, 'popup.html'), 'utf8');
    assert.match(html, /href="vendor\/oj-designsystem\/styles\.css"/);
    assert.doesNotMatch(html, /vendor\/pinefetch\.css/);
    await assert.rejects(fs.access(path.join(root, 'vendor', 'pinefetch.css')), { code: 'ENOENT' });
});
