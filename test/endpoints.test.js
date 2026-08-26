'use strict';

const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

async function loadPopupTestApi() {
    const popupSource = await readFile(resolve('popup.js'), 'utf8');
    const context = {
        document: { addEventListener() {} },
        globalThis: {},
    };

    vm.runInNewContext(
        `${popupSource}\n;globalThis.popupTestApi = {
            formatLinkCount,
            getSupportedNetworkLabels,
            getSendErrorState,
            setSendButtonState,
            switchPopupView,
            setElements(value) { Object.assign(elements, value); },
        };`,
        context,
    );

    return context.globalThis.popupTestApi;
}

test('uses the platform-neutral PineFetch video endpoints', async () => {
    const popupSource = await readFile(resolve('popup.js'), 'utf8');

    assert.match(popupSource, /const SINGLE_LINK_PATH = '\/addVideoLinkToQueue\/';/);
    assert.match(popupSource, /const MULTI_LINK_PATH = '\/addVideoLinksToQueue\/';/);
    assert.doesNotMatch(popupSource, /addYoutube/);
});

test('lists registered social networks without the generic web-video fallback', async () => {
    const popup = await loadPopupTestApi();

    assert.deepEqual(
        Array.from(
            popup.getSupportedNetworkLabels([
                { id: 'youtube', label: 'YouTube' },
                { id: 'tiktok', label: 'TikTok' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'standard-video', label: 'Web video' },
            ]),
        ),
        ['YouTube', 'TikTok', 'Instagram'],
    );
});

test('switches between accessible Send and Settings panels', async () => {
    const popup = await loadPopupTestApi();
    const makeTab = view => {
        const classes = new Set();
        const attributes = {};

        return {
            attributes,
            classes,
            dataset: { popupView: view },
            focused: false,
            tabIndex: -1,
            classList: {
                toggle(name, enabled) {
                    if (enabled) classes.add(name);
                    else classes.delete(name);
                },
            },
            focus() {
                this.focused = true;
            },
            setAttribute(name, value) {
                attributes[name] = value;
            },
        };
    };
    const sendTab = makeTab('send');
    const settingsTab = makeTab('settings');
    const sendPanel = { hidden: false };
    const settingsPanel = { hidden: true };
    popup.setElements({ viewTabs: [sendTab, settingsTab], sendPanel, settingsPanel });

    popup.switchPopupView('settings', true);

    assert.equal(sendPanel.hidden, true);
    assert.equal(settingsPanel.hidden, false);
    assert.equal(sendTab.attributes['aria-selected'], 'false');
    assert.equal(settingsTab.attributes['aria-selected'], 'true');
    assert.equal(settingsTab.classes.has('pf-is-active'), true);
    assert.equal(settingsTab.tabIndex, 0);
    assert.equal(settingsTab.focused, true);
});

test('shows distinct send button states for progress, success, and errors', async () => {
    const popup = await loadPopupTestApi();
    const classes = new Set();
    const sendButton = {
        classList: {
            toggle(name, enabled) {
                if (enabled) classes.add(name);
                else classes.delete(name);
            },
        },
        dataset: {},
        textContent: '',
    };
    popup.setElements({ sendButton });

    popup.setSendButtonState('sending', 3);
    assert.equal(sendButton.textContent, 'Sending 3 links...');

    popup.setSendButtonState('success', 3);
    assert.equal(sendButton.textContent, '✓ Queued 3 links');
    assert.equal(classes.has('pf-send-success'), true);

    popup.setSendButtonState('error');
    assert.equal(sendButton.textContent, 'Try again');
    assert.equal(classes.has('pf-send-error'), true);
    assert.equal(classes.has('pf-send-success'), false);
    assert.equal(popup.getSendErrorState('secret'), 'secret');
    assert.equal(popup.getSendErrorState('no-links'), 'empty');
});
