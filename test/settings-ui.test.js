'use strict';

const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createChromeMock, loadPopupDomTestApi } = require('../test-utils/popup.js');

const VIDEO_URLS = ['https://www.youtube.com/watch?v=one', 'https://www.youtube.com/watch?v=two'];
const TEST_PROVIDER = { id: 'youtube', label: 'YouTube', matches: () => true, collectPageInfo() {} };

function createStorageState(initial = {}) {
    return { values: { ...initial }, reads: [], writes: [], failWrites: false };
}

async function createUi(t, {
    storage = createStorageState({ endpointBase: 'http://localhost:2255', secret: 'secret' }),
    urls = VIDEO_URLS,
    providers = [TEST_PROVIDER],
    initialize = true,
    readSettings,
} = {}) {
    const requests = [];
    const chrome = createChromeMock({
        runtime: {
            lastError: null,
            getURL: name => `chrome-extension://popup-test/${name}`,
            getManifest: () => ({ version: '1.1.1' }),
        },
        storage: {
            local: {
                get(defaults, callback) {
                    storage.reads.push({ ...defaults });
                    if (readSettings) readSettings(defaults, callback);
                    else callback({ ...defaults, ...storage.values });
                },
                set(value, callback) {
                    storage.writes.push({ ...value });
                    if (storage.failWrites) chrome.runtime.lastError = { message: 'Storage unavailable' };
                    else Object.assign(storage.values, value);
                    callback();
                    chrome.runtime.lastError = null;
                },
            },
        },
        tabs: {
            query(_query, callback) {
                callback([{ id: 1, url: 'https://www.youtube.com/@example/videos', title: 'Example videos' }]);
            },
        },
        scripting: {
            executeScript(_options, callback) {
                callback([{ result: { mode: urls.length === 1 ? 'single' : 'list', urls } }]);
            },
        },
    });
    const ui = await loadPopupDomTestApi({
        chrome,
        PineFetchLinkProviders: providers,
        fetch: async (url, options) => {
            if (url.endsWith('/package.json')) {
                return { ok: true, async json() { return { version: '1.1.1' }; } };
            }
            requests.push({ url, options });
            return { ok: true, status: 200, headers: { get() { return 'application/json'; } }, async json() { return {}; } };
        },
    });
    t.after(() => ui.dispose());
    ui.get = id => ui.document.getElementById(id);
    ui.storage = storage;
    ui.requests = requests;
    if (initialize) await ui.api.initPopup();
    return ui;
}

function installSettingsClock(ui) {
    let time = 0;
    let nextId = 0;
    const timers = new Map();
    ui.window.setTimeout = (callback, delay) => {
        const id = ++nextId;
        timers.set(id, { callback, due: time + delay });
        return id;
    };
    ui.window.clearTimeout = id => timers.delete(id);
    return {
        async advance(duration) {
            const target = time + duration;
            for (;;) {
                const next = [...timers.entries()]
                    .filter(([, timer]) => timer.due <= target)
                    .sort((left, right) => left[1].due - right[1].due)[0];
                if (!next) break;
                const [id, timer] = next;
                timers.delete(id);
                time = timer.due;
                timer.callback();
            }
            time = target;
            await Promise.resolve();
        },
    };
}

function dispatch(ui, element, event) {
    element.dispatchEvent(new ui.window.Event(event, { bubbles: true }));
}

test('Settings groups complete accessible fields before platform information', async t => {
    const ui = await createUi(t);
    ui.get('pfSettingsTab').click();
    assert.equal(ui.get('pfSettingsPanel').hidden, false);
    assert.equal(ui.get('pfSendPanel').hidden, true);

    const endpoint = ui.get('pfEndpointInput');
    const secret = ui.get('pfSecretInput');
    const endpointField = endpoint.closest('.oj-field');
    const secretField = secret.closest('.oj-field');
    const fields = endpointField.parentElement;
    assert.equal(fields.classList.contains('oj-stack'), true);
    assert.equal(secretField.parentElement, fields);
    assert.equal(endpointField.nextElementSibling, secretField);
    assert.equal(fields.nextElementSibling, ui.get('pfSupportedPlatforms'));

    for (const [input, helpId, label] of [
        [endpoint, 'pfEndpointHelp', 'PineFetch Endpoint'],
        [secret, 'pfSecretHelp', 'PineFetch Secret'],
    ]) {
        const field = input.closest('.oj-field');
        assert.equal(field.firstElementChild, input.labels[0]);
        assert.equal(input.labels[0].textContent, label);
        assert.equal(input.labels[0].classList.contains('oj-label'), true);
        assert.equal(input.labels[0].nextElementSibling, input);
        assert.equal(input.nextElementSibling, ui.get(helpId));
        assert.equal(input.classList.contains('oj-input'), true);
        assert.equal(ui.get(helpId).classList.contains('oj-helper'), true);
        assert.equal(input.getAttribute('aria-describedby').split(/\s+/).includes(helpId), true);
    }
    assert.equal(secret.type, 'password');
    assert.equal(endpoint.type, 'url');
    assert.equal(ui.get('pfSecretError').hidden, true);
});

test('common header and footer stay contextual while page badge and live status belong to Send', async t => {
    const ui = await createUi(t);
    const header = ui.document.querySelector('.popup-header');
    assert.equal(header.classList.contains('oj-toolbar'), true);
    assert.equal(header.querySelector('.oj-inline').contains(ui.get('pfPopupTitle')), true);
    assert.equal(header.querySelector('.oj-inline').contains(header.querySelector('img')), true);
    assert.equal(header.querySelector('#pfStateBadge'), null);
    assert.equal(ui.get('pfStateBadge').closest('[aria-label="Detected video links"]') !== null, true);
    assert.equal(ui.get('pfStateBadge').closest('[role="tabpanel"]'), ui.get('pfSendPanel'));
    assert.equal(ui.get('pfStatusMessage').closest('[role="tabpanel"]'), ui.get('pfSendPanel'));
    assert.equal(ui.get('pfFeedbackPanel').contains(ui.get('pfStatusMessage')), true);
    assert.equal(ui.get('pfStatusMessage').classList.contains('oj-status'), true);
    assert.equal(ui.get('pfStatusMessage').getAttribute('role'), 'status');
    assert.equal(ui.get('pfStatusMessage').getAttribute('aria-live'), 'polite');
    assert.equal(ui.get('pfStatusMessage').getAttribute('aria-atomic'), 'true');
    assert.equal(ui.get('pfStateBadge').textContent, 'YouTube');
    const footer = ui.document.querySelector('footer');
    assert.deepEqual(Array.from(footer.children), [ui.get('pfVersionLabel')]);
    assert.equal(ui.get('pfVersionLabel').textContent, 'v1.1.1');
    assert.equal(ui.get('pfVersionLabel').classList.contains('oj-small'), true);
    assert.equal(ui.get('pfVersionLabel').classList.contains('oj-muted'), true);

    ui.get('pfSettingsTab').click();
    assert.equal(header.closest('[hidden]'), null);
    assert.equal(footer.closest('[hidden]'), null);
    assert.equal(ui.get('pfStateBadge').closest('[hidden]'), ui.get('pfSendPanel'));
    assert.equal(ui.get('pfStatusMessage').closest('[hidden]'), ui.get('pfSendPanel'));
});

test('popup loads existing values without saving or claiming a verified connection', async t => {
    const storage = createStorageState({ endpointBase: 'http://localhost:9999/api', secret: ' existing secret ' });
    let releaseSettings;
    let settingsRequested;
    const requested = new Promise(resolve => { settingsRequested = resolve; });
    const ui = await createUi(t, {
        storage,
        initialize: false,
        readSettings(_defaults, callback) { releaseSettings = callback; settingsRequested(); },
    });
    const opening = ui.api.initPopup();
    await requested;
    assert.equal(ui.get('pfStatusMessage').textContent, 'Checking the current page...');
    assert.equal(ui.get('pfStatusMessage').classList.contains('oj-status-success'), false);
    assert.deepEqual(storage.reads, [{ endpointBase: 'http://127.0.1:2255', secret: '' }]);
    releaseSettings(storage.values);
    await opening;
    assert.equal(ui.get('pfEndpointInput').value, storage.values.endpointBase);
    assert.equal(ui.get('pfSecretInput').value, storage.values.secret);
    assert.equal(ui.get('pfStatusMessage').textContent, '2 links detected. Choose Send or Export.');
    assert.doesNotMatch(ui.document.body.textContent, /Connected to PineFetch|Ready\./);
    assert.deepEqual(storage.writes, []);
    assert.deepEqual(ui.requests, []);
});

test('input keeps the 200ms autosave debounce and change saves immediately with unchanged storage keys', async t => {
    const storage = createStorageState({ endpointBase: 'http://localhost:2255', secret: 'old-secret' });
    const ui = await createUi(t, { storage });
    const clock = installSettingsClock(ui);
    const endpoint = ui.get('pfEndpointInput');
    const secret = ui.get('pfSecretInput');
    endpoint.value = '  http://localhost:9999/api  ';
    dispatch(ui, endpoint, 'input');
    await clock.advance(150);
    secret.value = ' secret with spaces ';
    dispatch(ui, secret, 'input');
    await clock.advance(199);
    assert.deepEqual(storage.writes, []);
    await clock.advance(1);
    assert.deepEqual(storage.writes, [{ endpointBase: 'http://localhost:9999/api', secret: ' secret with spaces ' }]);

    secret.value = ' changed secret ';
    dispatch(ui, secret, 'input');
    dispatch(ui, secret, 'change');
    assert.deepEqual(storage.writes.at(-1), { endpointBase: 'http://localhost:9999/api', secret: ' changed secret ' });
    assert.equal(storage.writes.length, 2);
    await clock.advance(200);
    assert.equal(storage.writes.length, 2, 'change cancels the pending debounced write');

    endpoint.value = '  http://localhost:8888  ';
    dispatch(ui, endpoint, 'change');
    assert.deepEqual(storage.writes.at(-1), { endpointBase: 'http://localhost:8888', secret: ' changed secret ' });
    ui.dispose();
    const reopened = await createUi(t, { storage });
    assert.equal(reopened.get('pfEndpointInput').value, 'http://localhost:8888');
    assert.equal(reopened.get('pfSecretInput').value, ' changed secret ');
    assert.equal(storage.writes.length, 3, 'reopening reads values without an extra write');
});

test('a failed autosave does not announce successful storage or a verified connection', async t => {
    const storage = createStorageState({ endpointBase: 'http://localhost:2255', secret: 'old-secret' });
    const ui = await createUi(t, { storage });
    storage.failWrites = true;
    ui.get('pfSecretInput').value = 'unsaved-secret';
    dispatch(ui, ui.get('pfSecretInput'), 'change');
    await Promise.resolve();
    assert.equal(storage.values.secret, 'old-secret');
    assert.equal(storage.writes.length, 1);
    assert.equal(ui.get('pfStatusMessage').textContent, '2 links detected. Choose Send or Export.');
    assert.doesNotMatch(ui.document.body.textContent, /Settings saved|Saved successfully|Connected to PineFetch/);
    assert.deepEqual(ui.requests, []);
});

test('Supported platforms is a closed native disclosure with every registered platform badge', async t => {
    const html = await readFile(resolve('popup.html'), 'utf8');
    const scripts = Array.from(html.matchAll(/<script src="(providers\/[^"]+)" defer><\/script>/g), match => match[1]);
    const sources = await Promise.all(scripts.map(path => readFile(resolve(path), 'utf8')));
    const providerContext = { URL };
    for (const source of sources) vm.runInNewContext(source, providerContext);
    const providers = providerContext.PineFetchLinkProviders;
    const expected = Array.from(providers.filter(provider => provider.id !== 'standard-video'), provider => provider.label);
    const ui = await createUi(t, { providers });
    const accordion = ui.get('pfSupportedPlatforms');
    assert.equal(accordion.tagName, 'DETAILS');
    assert.equal(accordion.classList.contains('oj-accordion'), true);
    assert.equal(accordion.open, false);
    assert.equal(accordion.hasAttribute('open'), false);
    assert.equal(accordion.firstElementChild.tagName, 'SUMMARY');
    assert.equal(accordion.firstElementChild.textContent, 'Supported platforms');
    assert.equal(accordion.firstElementChild.id, 'pfSupportedNetworksTitle');
    assert.equal(accordion.firstElementChild.getAttribute('role'), null);
    const badges = ui.get('pfSupportedNetworks');
    assert.equal(badges.classList.contains('oj-cluster'), true);
    assert.equal(badges.closest('.oj-accordion-body').parentElement, accordion);
    assert.deepEqual(Array.from(badges.children, badge => badge.textContent), expected);
    assert.equal(expected.length, 6);
    assert.equal(Array.from(badges.children).every(badge => badge.className === 'oj-badge'), true);
    ui.get('pfSettingsTab').click();
    assert.equal(accordion.open, false, 'opening Settings does not expand supplementary information');
});

test('missing-secret feedback remains visible and fully actionable after opening Settings', async t => {
    const ui = await createUi(t, { storage: createStorageState({ endpointBase: 'http://localhost:2255', secret: '' }) });
    await ui.api.handleSendClick();
    const secret = ui.get('pfSecretInput');
    const error = ui.get('pfSecretError');
    assert.equal(ui.get('pfSettingsPanel').hidden, false);
    assert.equal(ui.get('pfSendPanel').hidden, true);
    assert.equal(ui.document.activeElement, secret);
    assert.equal(secret.getAttribute('aria-invalid'), 'true');
    assert.equal(secret.getAttribute('aria-describedby').split(/\s+/).includes(error.id), true);
    assert.equal(error.hidden, false);
    assert.equal(error.closest('[hidden]'), null);
    assert.equal(error.textContent, 'Enter your PineFetch secret, then try again.');
    assert.equal(error.closest('.oj-field'), secret.closest('.oj-field'));
    assert.equal(ui.get('pfStatusMessage').closest('[hidden]'), ui.get('pfSendPanel'));
    assert.equal(ui.get('pfStatusMessage').classList.contains('oj-status-danger'), true);
    assert.deepEqual(ui.requests, []);

    secret.value = 'replacement-secret';
    dispatch(ui, secret, 'input');
    assert.equal(secret.hasAttribute('aria-invalid'), false);
    assert.equal(error.hidden, true);
    assert.equal(ui.get('pfSendButton').dataset.ojState, 'default');
});

test('analysis status describes detected links and the empty-page result without ambiguous readiness', async t => {
    for (const [urls, status, badge, kind] of [
        [VIDEO_URLS.slice(0, 1), '1 link detected. Choose Send or Export.', 'YouTube', 'success'],
        [VIDEO_URLS, '2 links detected. Choose Send or Export.', 'YouTube', 'success'],
        [[], 'No YouTube links found. Scroll the page to load more videos.', 'No links', 'warning'],
    ]) {
        await t.test(`${urls.length} links`, async t => {
            const ui = await createUi(t, { urls });
            assert.equal(ui.get('pfStatusMessage').textContent, status);
            assert.equal(ui.get('pfStatusMessage').classList.contains(`oj-status-${kind}`), true);
            assert.equal(ui.get('pfStateBadge').textContent, badge);
            assert.deepEqual(ui.requests, [], 'page analysis does not probe the PineFetch connection');
        });
    }
});
