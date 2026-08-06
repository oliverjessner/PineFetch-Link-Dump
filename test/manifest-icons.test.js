'use strict';

const assert = require('node:assert/strict');
const { access, readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const sizes = [16, 32, 48, 128];

test('binds the generated icon sizes in the manifest and action', async () => {
    const manifest = JSON.parse(await readFile(resolve('manifest.json'), 'utf8'));

    for (const size of sizes) {
        const path = `assets/icons/icon-${size}.png`;
        assert.equal(manifest.icons[String(size)], path);
        assert.equal(manifest.action.default_icon[String(size)], path);
    }
});

for (const size of sizes) {
    test(`contains a square ${size}px icon`, async () => {
        const path = resolve(`assets/icons/icon-${size}.png`);
        await access(path);

        const metadata = await sharp(path).metadata();
        assert.equal(metadata.width, size);
        assert.equal(metadata.height, size);
    });
}
