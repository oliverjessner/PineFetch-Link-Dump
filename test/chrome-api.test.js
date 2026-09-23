'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createChromeMock, createPopupElements, loadPopupTestApi } = require('../test-utils/popup.js');

test('getActiveTab handles active, missing, incomplete, runtime-error, and thrown results', async t => {
    const samples = [
        { name: 'active tab', tabs: [{ id: 7, url: 'https://example.com' }], expected: { id: 7, url: 'https://example.com' } },
        { name: 'no tab', tabs: [], expected: null },
        { name: 'tab without ID', tabs: [{ url: 'https://example.com' }], expected: { url: 'https://example.com' } },
        { name: 'tab without URL', tabs: [{ id: 7 }], expected: { id: 7 } },
    ];

    for (const sample of samples) {
        await t.test(sample.name, async () => {
            const chrome = createChromeMock({ tabs: { query(_query, callback) { callback(sample.tabs); } } });
            const { api } = await loadPopupTestApi({ chrome });
            const actual = await api.getActiveTab();
            assert.deepEqual(actual, sample.expected);
        });
    }

    await t.test('runtime.lastError', async () => {
        const chrome = createChromeMock({
            tabs: { query(_query, callback) { chrome.runtime.lastError = { message: 'denied' }; callback([{ id: 7 }]); } },
        });
        const { api } = await loadPopupTestApi({ chrome });
        assert.equal(await api.getActiveTab(), null);
    });

    await t.test('query throws', async () => {
        const chrome = createChromeMock({ tabs: { query() { throw new Error('API unavailable'); } } });
        const { api } = await loadPopupTestApi({ chrome });
        assert.equal(await api.getActiveTab(), null);
    });
});

test('executePageAnalysis handles success, empty results, undefined result, exceptions, and runtime errors', async t => {
    const cases = [
        { name: 'success', results: [{ result: { urls: ['one'] } }], expectedLength: 1 },
        { name: 'empty result', results: [], expectedLength: 0 },
        { name: 'undefined results', results: undefined, expectedLength: 0 },
        { name: 'undefined page result', results: [{ result: undefined }], expectedLength: 1 },
    ];

    for (const sample of cases) {
        await t.test(sample.name, async () => {
            let injection;
            const chrome = createChromeMock({
                scripting: { executeScript(value, callback) { injection = value; callback(sample.results); } },
            });
            const { api } = await loadPopupTestApi({ chrome });
            const collector = () => ({ urls: [] });
            const result = await api.executePageAnalysis(42, collector);
            assert.equal(result.length, sample.expectedLength);
            assert.equal(injection.target.tabId, 42);
            assert.equal(injection.func, collector);
        });
    }

    await t.test('executeScript exception', async () => {
        const chrome = createChromeMock({ scripting: { executeScript() { throw new Error('blocked'); } } });
        const { api } = await loadPopupTestApi({ chrome });
        await assert.rejects(api.executePageAnalysis(1, () => {}), /blocked/);
    });

    await t.test('runtime.lastError for forbidden page', async () => {
        const chrome = createChromeMock({
            scripting: {
                executeScript(_value, callback) {
                    chrome.runtime.lastError = { message: 'Cannot access a chrome:// URL' };
                    callback([]);
                },
            },
        });
        const { api } = await loadPopupTestApi({ chrome });
        await assert.rejects(api.executePageAnalysis(1, () => {}), error => error.message.includes('chrome://'));
    });
});

test('storage reads defaults and values and survives Chrome errors', async t => {
    const cases = [
        { name: 'stored settings', result: { endpointBase: 'http://localhost:9999/api', secret: 'abc' }, expectedEndpoint: 'http://localhost:9999/api', expectedSecret: 'abc' },
        { name: 'missing settings', result: {}, expectedEndpoint: 'http://127.0.1:2255', expectedSecret: '' },
        { name: 'empty values', result: { endpointBase: '', secret: '' }, expectedEndpoint: 'http://127.0.1:2255', expectedSecret: '' },
        { name: 'undefined result', result: undefined, expectedEndpoint: 'http://127.0.1:2255', expectedSecret: '' },
    ];

    for (const sample of cases) {
        await t.test(sample.name, async () => {
            const chrome = createChromeMock({ storage: { local: { get(_defaults, callback) { callback(sample.result); } } } });
            const { api } = await loadPopupTestApi({ chrome });
            const result = await api.getStoredSettings();
            assert.equal(result.endpointBase, sample.expectedEndpoint);
            assert.equal(result.secret, sample.expectedSecret);
        });
    }

    await t.test('runtime.lastError', async () => {
        const chrome = createChromeMock({
            storage: { local: { get(_defaults, callback) { chrome.runtime.lastError = { message: 'failed' }; callback({ secret: 'leak' }); } } },
        });
        const { api } = await loadPopupTestApi({ chrome });
        const result = await api.getStoredSettings();
        assert.equal(result.endpointBase, 'http://127.0.1:2255');
        assert.equal(result.secret, '');
    });

    await t.test('get throws', async () => {
        const chrome = createChromeMock({ storage: { local: { get() { throw new Error('failed'); } } } });
        const { api } = await loadPopupTestApi({ chrome });
        assert.equal((await api.getStoredSettings()).secret, '');
    });
});

test('storage saves normalized settings and reports failures', async t => {
    await t.test('success', async () => {
        let saved;
        const chrome = createChromeMock({ storage: { local: { set(value, callback) { saved = value; callback(); } } } });
        const { api } = await loadPopupTestApi({ chrome });
        assert.equal(await api.saveStoredSettings({ endpointBase: '', secret: 'abc' }), true);
        assert.equal(saved.endpointBase, 'http://127.0.1:2255');
        assert.equal(saved.secret, 'abc');
    });

    await t.test('runtime.lastError', async () => {
        const chrome = createChromeMock({
            storage: { local: { set(_value, callback) { chrome.runtime.lastError = { message: 'quota' }; callback(); } } },
        });
        const { api } = await loadPopupTestApi({ chrome });
        assert.equal(await api.saveStoredSettings({}), false);
    });

    await t.test('set throws', async () => {
        const chrome = createChromeMock({ storage: { local: { set() { throw new Error('failed'); } } } });
        const { api } = await loadPopupTestApi({ chrome });
        assert.equal(await api.saveStoredSettings({}), false);
    });
});

test('exportTxt writes unique URLs and handles download failures', async t => {
    for (const sample of [
        { name: 'success', id: 12, lastError: null, expectedStatus: 'Exported 2 links.' },
        { name: 'missing download ID', id: undefined, lastError: null, expectedStatus: 'Export failed.' },
        { name: 'runtime.lastError', id: undefined, lastError: { message: 'denied' }, expectedStatus: 'Export failed.' },
    ]) {
        await t.test(sample.name, async () => {
            let options;
            let blob;
            let revoked;
            const chrome = createChromeMock({
                downloads: {
                    download(value, callback) {
                        options = value;
                        chrome.runtime.lastError = sample.lastError;
                        callback(sample.id);
                    },
                },
            });
            const { api, context } = await loadPopupTestApi({ chrome });
            const elements = createPopupElements();
            api.setElements(elements);
            const originalCreate = context.URL.createObjectURL;
            const originalRevoke = context.URL.revokeObjectURL;
            context.URL.createObjectURL = value => { blob = value; return 'blob:test'; };
            context.URL.revokeObjectURL = value => { revoked = value; };
            context.window.setTimeout = callback => callback();

            try {
                await api.exportTxt({
                    mode: 'list', provider: 'youtube', ownerName: 'alice', collectionName: 'Videos',
                    urls: ['https://example.com/1', 'https://example.com/1', 'https://example.com/2'],
                });
                assert.equal(await blob.text(), 'https://example.com/1\nhttps://example.com/2\n');
                assert.equal(options.filename, 'alice-Videos.txt');
                assert.equal(options.saveAs, true);
                assert.equal(revoked, 'blob:test');
                assert.equal(elements.statusMessage.textContent, sample.expectedStatus);
            } finally {
                context.URL.createObjectURL = originalCreate;
                context.URL.revokeObjectURL = originalRevoke;
            }
        });
    }

    const { api } = await loadPopupTestApi();
    await assert.rejects(api.exportTxt({ urls: [] }), /NO_LINKS/);
});

test('send handler always clears loading state after Chrome API failures', async () => {
    const chrome = createChromeMock({
        tabs: { query() { throw new Error('tabs unavailable'); } },
    });
    const { api, context } = await loadPopupTestApi({ chrome });
    const elements = createPopupElements();
    api.setElements(elements);
    context.window.setTimeout = callback => { callback(); return 1; };

    await api.handleSendClick();
    assert.equal(elements.sendButton.disabled, false);
    assert.equal(elements.exportButton.disabled, false);
    assert.equal(elements.sendButton.attributes['aria-busy'], 'false');
});
