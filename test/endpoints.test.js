'use strict';

const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const test = require('node:test');

test('uses the platform-neutral PineFetch video endpoints', async () => {
    const popupSource = await readFile(resolve('popup.js'), 'utf8');

    assert.match(popupSource, /const SINGLE_LINK_PATH = '\/addVideoLinkToQueue\/';/);
    assert.match(popupSource, /const MULTI_LINK_PATH = '\/addVideoLinksToQueue\/';/);
    assert.doesNotMatch(popupSource, /addYoutube/);
});
