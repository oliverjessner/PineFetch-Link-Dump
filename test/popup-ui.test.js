'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createChromeMock, loadPopupDomTestApi } = require('../test-utils/popup.js');

const VIDEO_URLS = ['https://video.example/1', 'https://video.example/2'];

function response(status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get() { return 'application/json'; } },
        async json() { return { queued: status === 200 }; },
    };
}

async function createUi(t, {
    secret = 'secret',
    urls = VIDEO_URLS,
    sendRequest = async () => response(),
    download = (_options, callback) => callback(1),
} = {}) {
    const settings = { endpointBase: 'http://localhost:2255', secret };
    const chrome = createChromeMock({
        runtime: {
            lastError: null,
            getURL: name => `chrome-extension://popup-test/${name}`,
            getManifest: () => ({ version: '1.1.0' }),
        },
        storage: {
            local: {
                get(_defaults, callback) { callback(settings); },
                set(value, callback) { Object.assign(settings, value); callback(); },
            },
        },
        tabs: {
            query(_query, callback) {
                callback([{ id: 1, url: 'https://video.example/profile', title: 'Video profile' }]);
            },
        },
        scripting: {
            executeScript(_options, callback) {
                callback([{ result: { mode: 'list', urls } }]);
            },
        },
        downloads: { download },
    });
    const ui = await loadPopupDomTestApi({
        chrome,
        PineFetchLinkProviders: [{ id: 'example', label: 'Example', matches: () => true, collectPageInfo() {} }],
        fetch: async (url, options) => url.endsWith('/package.json')
            ? { ok: true, async json() { return { version: '1.1.0' }; } }
            : sendRequest(url, options),
    });
    t.after(() => ui.dispose());
    ui.originalTabs = Array.from(ui.document.querySelectorAll('[role="tab"], [role="tabpanel"]'), element => ({
        element,
        attributes: Object.fromEntries(['aria-selected', 'tabindex', 'hidden'].map(name => [name, element.getAttribute(name)])),
    }));
    await ui.api.initPopup();
    ui.get = id => ui.document.getElementById(id);
    return ui;
}

function assertView(ui, view) {
    const send = view === 'send';
    assert.equal(ui.get('pfSendPanel').hidden, !send);
    assert.equal(ui.get('pfSettingsPanel').hidden, send);
    assert.equal(ui.get('pfSendTab').getAttribute('aria-selected'), String(send));
    assert.equal(ui.get('pfSettingsTab').getAttribute('aria-selected'), String(!send));
    assert.equal(ui.get('pfSendTab').tabIndex, send ? 0 : -1);
    assert.equal(ui.get('pfSettingsTab').tabIndex, send ? -1 : 0);
}

function pressKey(ui, element, key) {
    const event = new ui.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event;
}

function getFormatItems(ui) {
    return Array.from(ui.get('pfExportFormatMenu').querySelectorAll('[role="menuitemradio"]'));
}

function assertSelectedFormat(ui, format) {
    const label = format.toUpperCase();
    assert.equal(ui.get('pfExportFormat').value, format);
    assert.equal(ui.api.getSelectedExportFormat(), format);
    assert.equal(ui.get('pfExportFormatLabel').textContent, label);
    assert.equal(ui.get('pfExportFormat').getAttribute('aria-label'), `Export format: ${label}`);
    assert.equal(ui.get('pfExportButtonLabel').textContent, `Export ${label}`);
    for (const item of getFormatItems(ui)) {
        const selected = item.dataset.ojValue === format;
        assert.equal(item.getAttribute('aria-checked'), String(selected));
        assert.equal(item.querySelector('.fa-check').hidden, !selected);
    }
}

function selectFormatWithKeyboard(ui, format, key = 'Enter') {
    const items = getFormatItems(ui);
    pressKey(ui, ui.get('pfExportFormat'), 'ArrowDown');
    for (let index = 0; index < items.findIndex(item => item.dataset.ojValue === format); index += 1) {
        pressKey(ui, ui.document.activeElement, 'ArrowDown');
    }
    assert.equal(ui.document.activeElement.dataset.ojValue, format);
    assert.equal(pressKey(ui, ui.document.activeElement, key).defaultPrevented, true);
}

test('OJ export dropdown opens with keyboard keys and moves focus through all formats', async t => {
    const ui = await createUi(t);
    const trigger = ui.get('pfExportFormat');
    const menu = ui.get('pfExportFormatMenu');
    const items = getFormatItems(ui);
    assertSelectedFormat(ui, 'txt');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'menu');
    assert.equal(trigger.getAttribute('aria-controls'), menu.id);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(items.every(item => item.tabIndex === -1), true);

    for (const [key, focusedIndex] of [['ArrowDown', 0], ['ArrowUp', 2], ['Enter', 0], [' ', 0]]) {
        trigger.focus();
        assert.equal(pressKey(ui, trigger, key).defaultPrevented, true);
        assert.equal(menu.hidden, false);
        assert.equal(trigger.getAttribute('aria-expanded'), 'true');
        assert.equal(ui.document.activeElement, items[focusedIndex]);
        pressKey(ui, ui.document.activeElement, 'Escape');
        assert.equal(menu.hidden, true);
        assert.equal(ui.document.activeElement, trigger);
    }

    pressKey(ui, trigger, 'ArrowDown');
    for (const [key, focusedIndex] of [
        ['ArrowDown', 1], ['ArrowDown', 2], ['ArrowDown', 0],
        ['ArrowUp', 2], ['Home', 0], ['End', 2],
    ]) {
        assert.equal(pressKey(ui, ui.document.activeElement, key).defaultPrevented, true);
        assert.equal(ui.document.activeElement, items[focusedIndex]);
        assertSelectedFormat(ui, 'txt');
    }
});

test('OJ export dropdown Enter and Space select formats and restore trigger focus', async t => {
    const ui = await createUi(t);
    const selected = [];
    ui.get('pfExportFormatDropdown').addEventListener('oj:select', event => selected.push(event.detail.value));
    for (const [format, key] of [['json', 'Enter'], ['csv', ' '], ['txt', 'Enter']]) {
        selectFormatWithKeyboard(ui, format, key);
        assertSelectedFormat(ui, format);
        assert.equal(ui.get('pfExportFormatMenu').hidden, true);
        assert.equal(ui.get('pfExportFormat').getAttribute('aria-expanded'), 'false');
        assert.equal(ui.document.activeElement, ui.get('pfExportFormat'));
    }
    assert.deepEqual(selected, ['json', 'csv', 'txt']);
});

test('OJ export dropdown dismisses with Escape, Tab, and outside clicks', async t => {
    const ui = await createUi(t);
    const trigger = ui.get('pfExportFormat');
    const menu = ui.get('pfExportFormatMenu');
    let closes = 0;
    ui.get('pfExportFormatDropdown').addEventListener('oj:close', () => { closes += 1; });
    for (const key of ['Escape', 'Tab']) {
        trigger.click();
        assert.equal(menu.hidden, false);
        const event = pressKey(ui, ui.document.activeElement, key);
        assert.equal(event.defaultPrevented, key === 'Escape');
        assert.equal(menu.hidden, true);
        assert.equal(trigger.getAttribute('aria-expanded'), 'false');
        assert.equal(ui.document.activeElement, trigger);
        assertSelectedFormat(ui, 'txt');
    }

    trigger.click();
    const outside = ui.get('pfSettingsTab');
    outside.focus();
    outside.click();
    assert.equal(menu.hidden, true);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(ui.document.activeElement, outside);
    assert.equal(closes, 3);
    assertSelectedFormat(ui, 'txt');
});

test('export downloads the format selected through the OJ keyboard menu', async t => {
    const downloads = [];
    const blobs = [];
    const ui = await createUi(t, { download(options, callback) { downloads.push(options); callback(downloads.length); } });
    ui.context.URL = class extends URL {
        static createObjectURL(blob) { blobs.push(blob); return `blob:export-${blobs.length}`; }
        static revokeObjectURL() {}
    };

    for (const format of ['json', 'csv', 'txt']) {
        selectFormatWithKeyboard(ui, format);
        await ui.api.handleExportClick();
        const options = downloads.at(-1);
        const blob = blobs.at(-1);
        assert.equal(options.filename.endsWith(`.${format}`), true);
        assert.equal(options.url, `blob:export-${downloads.length}`);
        assert.equal(options.saveAs, true);
        assert.equal(blob.type, {
            txt: 'text/plain;charset=utf-8',
            json: 'application/json;charset=utf-8',
            csv: 'text/csv;charset=utf-8',
        }[format]);
        const content = await blob.text();
        if (format === 'json') {
            assert.deepEqual(JSON.parse(content).links, VIDEO_URLS);
        } else if (format === 'csv') {
            assert.match(content, /^"source","page","title","collectedAt","url"\r\n/);
            assert.equal(content.split('\r\n').length, VIDEO_URLS.length + 2);
            for (const url of VIDEO_URLS) assert.equal(content.includes(`"${url}"`), true);
        } else {
            assert.equal(content, `${VIDEO_URLS.join('\n')}\n`);
        }
        assertSelectedFormat(ui, format);
        assert.equal(ui.get('pfExportFormat').disabled, false);
        assert.equal(getFormatItems(ui).every(item => !item.disabled), true);
    }
});

test('busy export blocks open-menu keyboard, click, and selection-event format changes', async t => {
    let releaseDownload;
    let downloadStarted;
    const started = new Promise(resolve => { downloadStarted = resolve; });
    const ui = await createUi(t, {
        download(_options, callback) { releaseDownload = callback; downloadStarted(); },
    });
    ui.context.URL = class extends URL {
        static createObjectURL() { return 'blob:busy-export'; }
        static revokeObjectURL() {}
    };
    selectFormatWithKeyboard(ui, 'json');
    pressKey(ui, ui.get('pfExportFormat'), 'ArrowDown');
    const exporting = ui.api.handleExportClick();
    await started;
    assert.equal(ui.get('pfExportFormat').disabled, true);
    assert.equal(getFormatItems(ui).every(item => item.disabled), true);
    const csv = getFormatItems(ui).find(item => item.dataset.ojValue === 'csv');
    csv.click();
    pressKey(ui, csv, 'Enter');
    pressKey(ui, csv, ' ');
    ui.get('pfExportFormatDropdown').dispatchEvent(new ui.window.CustomEvent('oj:select', {
        bubbles: true,
        cancelable: true,
        detail: { item: csv, value: 'csv' },
    }));
    assert.equal(ui.api.getSelectedExportFormat(), 'json');
    assert.equal(ui.get('pfExportFormatLabel').textContent, 'JSON');
    assert.equal(ui.get('pfExportButtonLabel').textContent, 'Exporting JSON...');
    for (const item of getFormatItems(ui)) {
        assert.equal(item.getAttribute('aria-checked'), String(item.dataset.ojValue === 'json'));
    }

    pressKey(ui, ui.document.activeElement, 'Escape');
    pressKey(ui, ui.get('pfExportFormat'), 'ArrowDown');
    assert.equal(ui.get('pfExportFormatMenu').hidden, true);
    releaseDownload(1);
    await exporting;
    assertSelectedFormat(ui, 'json');
    assert.equal(ui.get('pfExportFormat').disabled, false);
    assert.equal(getFormatItems(ui).every(item => !item.disabled), true);
    selectFormatWithKeyboard(ui, 'csv');
    assertSelectedFormat(ui, 'csv');
});

test('unknown or nested selection events preserve the current export format', async t => {
    const ui = await createUi(t);
    selectFormatWithKeyboard(ui, 'json');
    const dropdown = ui.get('pfExportFormatDropdown');
    dropdown.dispatchEvent(new ui.window.CustomEvent('oj:select', { bubbles: true, detail: { value: 'xml' } }));
    ui.get('pfExportFormatMenu').dispatchEvent(new ui.window.CustomEvent('oj:select', {
        bubbles: true,
        detail: { value: 'csv' },
    }));
    assertSelectedFormat(ui, 'json');
});

test('OJ tabs activate with arrows, Home, End, and the popup view helper', async t => {
    const ui = await createUi(t);
    assertView(ui, 'send');
    let changes = 0;
    ui.document.querySelector('[data-oj-tabs]').addEventListener('oj:change', () => { changes += 1; });

    for (const [origin, key, destination] of [
        ['pfSendTab', 'ArrowRight', 'settings'],
        ['pfSettingsTab', 'ArrowRight', 'send'],
        ['pfSendTab', 'ArrowLeft', 'settings'],
        ['pfSettingsTab', 'Home', 'send'],
        ['pfSendTab', 'End', 'settings'],
    ]) {
        const event = new ui.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        ui.get(origin).dispatchEvent(event);
        assert.equal(event.defaultPrevented, true);
        assertView(ui, destination);
        assert.equal(ui.document.activeElement, ui.get(destination === 'send' ? 'pfSendTab' : 'pfSettingsTab'));
    }
    assert.equal(changes, 5);

    ui.api.switchPopupView('send', true);
    assertView(ui, 'send');
    assert.equal(ui.document.activeElement, ui.get('pfSendTab'));
    ui.api.switchPopupView('unknown');
    assertView(ui, 'send');
});

test('missing secret opens Settings, focuses the field, and clears its readable error on input', async t => {
    let requests = 0;
    const ui = await createUi(t, { secret: '', sendRequest: async () => { requests += 1; return response(); } });
    await ui.api.handleSendClick();

    assertView(ui, 'settings');
    const secret = ui.get('pfSecretInput');
    const error = ui.get('pfSecretError');
    assert.equal(ui.document.activeElement, secret);
    assert.equal(secret.getAttribute('aria-invalid'), 'true');
    assert.equal(error.hidden, false);
    assert.match(error.textContent, /secret/i);
    assert.equal(secret.getAttribute('aria-describedby').split(/\s+/).includes(error.id), true);
    assert.equal(ui.get('pfSendButton').dataset.ojState, 'secret');
    assert.equal(requests, 0);

    secret.value = 'new-secret';
    secret.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    assert.equal(secret.hasAttribute('aria-invalid'), false);
    assert.equal(error.hidden, true);
    assert.equal(ui.get('pfSendButton').dataset.ojState, 'default');
});

test('native preview button copies current links and cannot activate for an empty result', async t => {
    const ui = await createUi(t);
    const copied = [];
    Object.defineProperty(ui.window.navigator, 'clipboard', {
        value: { async writeText(value) { copied.push(value); } },
        configurable: true,
    });
    const button = ui.get('pfPreviewMode');
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.equal(button.disabled, false);
    assert.match(button.getAttribute('aria-label'), /Copy 2 links/);
    button.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(copied, [VIDEO_URLS.join('\n')]);
    assert.match(ui.get('pfStatusMessage').textContent, /Copied 2 links/);
    assert.equal(ui.get('pfStatusMessage').dataset.ojKind, 'success');

    const empty = ui.api.createEmptyPageInfo();
    ui.api.setCurrentPageInfo(empty);
    ui.api.renderPageInfo(empty);
    assert.equal(button.disabled, true);
    button.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(copied.length, 1);
    assert.equal(ui.get('pfPreviewCount').textContent, '0');
    assert.match(ui.get('pfPreviewLinks').textContent, /No links found/);
});

test('send progress disables controls and OJ feedback preserves success and HTTP error details', async t => {
    let releaseRequest;
    let requestStarted;
    const started = new Promise(resolve => { requestStarted = resolve; });
    const ui = await createUi(t, {
        sendRequest: () => {
            requestStarted();
            return new Promise(resolve => { releaseRequest = resolve; });
        },
    });
    const sending = ui.api.handleSendClick();
    await started;
    assert.equal(ui.get('pfSendButton').disabled, true);
    assert.equal(ui.get('pfExportButton').disabled, true);
    assert.equal(ui.get('pfExportFormat').disabled, true);
    assert.equal(getFormatItems(ui).every(item => item.disabled), true);
    assert.equal(ui.get('pfSendButton').getAttribute('aria-busy'), 'true');
    assert.equal(ui.get('pfExportButton').getAttribute('aria-busy'), 'false');
    assert.match(ui.get('pfSendButton').textContent, /Sending 2 links/);

    releaseRequest(response());
    await sending;
    assert.equal(ui.get('pfSendButton').disabled, false);
    assert.equal(ui.get('pfExportButton').disabled, false);
    assert.equal(ui.get('pfExportFormat').disabled, false);
    assert.equal(getFormatItems(ui).every(item => !item.disabled), true);
    assert.equal(ui.get('pfSendButton').getAttribute('aria-busy'), 'false');
    assert.equal(ui.get('pfSendButton').dataset.ojState, 'success');
    assert.match(ui.get('pfSendButton').textContent, /Queued 2 links/);
    assert.equal(ui.get('pfStatusMessage').dataset.ojKind, 'success');
    assert.equal(ui.get('pfStateBadge').classList.contains('oj-badge-success'), true);
    assert.equal(ui.get('pfSendButtonIcon').getAttribute('aria-hidden'), 'true');

    ui.context.fetch = async () => response(403);
    await ui.api.handleSendClick();
    assert.equal(ui.get('pfSendButton').dataset.ojState, 'error');
    assert.match(ui.get('pfSendButton').textContent, /Try again/);
    assert.equal(ui.get('pfStatusMessage').dataset.ojKind, 'error');
    assert.match(ui.get('pfStatusMessage').textContent, /HTTP 403/);
    assert.equal(ui.get('pfStateBadge').classList.contains('oj-badge-danger'), true);
});

test('pagehide cleans up OJ tab state, listeners, and generated tooltips', async t => {
    const ui = await createUi(t);
    ui.api.switchPopupView('settings');
    assertView(ui, 'settings');
    assert.equal(ui.get('pfSendPanel').tabIndex, 0);
    assert.equal(ui.document.querySelectorAll('.oj-tooltip').length > 0, true);

    ui.window.dispatchEvent(new ui.window.Event('pagehide'));
    for (const { element, attributes } of ui.originalTabs) {
        for (const [name, value] of Object.entries(attributes)) {
            assert.equal(element.getAttribute(name), value, `${element.id} ${name}`);
        }
    }
    assert.equal(ui.document.querySelectorAll('.oj-tooltip').length, 0);
    const hiddenBefore = ui.get('pfSettingsPanel').hidden;
    ui.get('pfSettingsTab').click();
    assert.equal(ui.get('pfSettingsPanel').hidden, hiddenBefore);
});
