'use strict';

const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const test = require('node:test');
const { createPopupElements, loadPopupTestApi } = require('../test-utils/popup.js');

test('uses the platform-neutral PineFetch video endpoints', async () => {
    const popupSource = await readFile(resolve('popup.js'), 'utf8');

    assert.match(popupSource, /const SINGLE_LINK_PATH = '\/addVideoLinkToQueue\/';/);
    assert.match(popupSource, /const MULTI_LINK_PATH = '\/addVideoLinksToQueue\/';/);
    assert.doesNotMatch(popupSource, /addYoutube/);
});

test('lists registered social networks without the generic web-video fallback', async () => {
    const { api: popup } = await loadPopupTestApi();

    assert.deepEqual(
        Array.from(
            popup.getSupportedNetworkLabels([
                { id: 'youtube', label: 'YouTube' },
                { id: 'tiktok', label: 'TikTok' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'reddit', label: 'Reddit' },
                { id: 'x', label: 'X' },
                { id: 'facebook', label: 'Facebook' },
                { id: 'standard-video', label: 'Web video' },
            ]),
        ),
        ['YouTube', 'TikTok', 'Instagram', 'Reddit', 'X', 'Facebook'],
    );
});

test('shows distinct send button states for progress, success, and errors', async () => {
    const { api: popup } = await loadPopupTestApi();
    const elements = createPopupElements();
    const { sendButton } = elements;
    popup.setElements(elements);

    popup.setSendButtonState('sending', 3);
    assert.equal(sendButton.textContent, 'Sending 3 links...');

    popup.setSendButtonState('success', 3);
    assert.equal(sendButton.textContent, 'Queued 3 links');
    assert.equal(sendButton.dataset.ojState, 'success');

    popup.setSendButtonState('error');
    assert.equal(sendButton.textContent, 'Try again');
    assert.equal(sendButton.dataset.ojState, 'error');
    assert.equal(popup.getSendErrorState('secret'), 'secret');
    assert.equal(popup.getSendErrorState('no-links'), 'empty');
});
