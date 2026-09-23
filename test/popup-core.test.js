'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadPopupTestApi } = require('../test-utils/popup.js');

test('uniquePreserveOrder accepts only unique non-empty strings', async t => {
    const { api } = await loadPopupTestApi();
    const cases = [
        { input: [], expected: [] },
        { input: null, expected: [] },
        { input: undefined, expected: [] },
        { input: [''], expected: [] },
        { input: ['url', 'url'], expected: ['url'] },
        { input: ['url1', 'url2', 'url1'], expected: ['url1', 'url2'] },
        { input: [null, 'url'], expected: ['url'] },
        { input: [undefined, 'url'], expected: ['url'] },
        { input: ['  ', ' url ', 123, {}, 'url2'], expected: ['url', 'url2'] },
    ];

    for (const { input, expected } of cases) {
        await t.test(JSON.stringify(input), () => {
            assert.deepEqual(Array.from(api.uniquePreserveOrder(input)), expected);
        });
    }
});

test('normalizePageInfo always returns the complete defensive contract', async t => {
    const { api } = await loadPopupTestApi();
    const tab = { url: 'https://example.com/page', title: ' Tab title ' };
    const provider = { id: 'example', label: 'Example' };
    const cases = [null, {}, { urls: null }, { urls: 'not-array' }, { urls: [] }, { mode: 'invalid' }];

    for (const value of cases) {
        await t.test(JSON.stringify(value), () => {
            const result = api.normalizePageInfo(value, tab, provider);
            assert.deepEqual(Object.keys(result), [
                'provider', 'providerLabel', 'mode', 'pageUrl', 'title',
                'ownerName', 'collectionName', 'urls', 'count',
            ]);
            assert.equal(result.provider, 'example');
            assert.equal(result.providerLabel, 'Example');
            assert.equal(result.mode, 'unknown');
            assert.equal(result.pageUrl, tab.url);
            assert.equal(result.title, 'Tab title');
            assert.deepEqual(Array.from(result.urls), []);
            assert.equal(result.count, 0);
        });
    }

    const normalized = api.normalizePageInfo(
        { mode: 'list', urls: ['a', '', null, 'a', ' b '] }, tab, provider,
    );
    assert.deepEqual(Array.from(normalized.urls), ['a', 'b']);
    assert.equal(normalized.count, 2);
    assert.equal(normalized.mode, 'list');

    const withoutProvider = api.normalizePageInfo({}, null, null);
    assert.equal(withoutProvider.provider, 'unknown');
    assert.equal(withoutProvider.providerLabel, 'video');
});

test('createEmptyPageInfo returns stable defaults', async () => {
    const { api } = await loadPopupTestApi();
    const result = api.createEmptyPageInfo({ url: 'https://example.com', title: 'Title' }, null);
    assert.equal(result.provider, 'unknown');
    assert.equal(result.providerLabel, 'video');
    assert.equal(result.mode, 'unknown');
    assert.equal(result.pageUrl, 'https://example.com');
    assert.equal(result.title, 'Title');
    assert.deepEqual(Array.from(result.urls), []);
    assert.equal(result.count, 0);
});

test('getProviderForUrl preserves order and ignores broken providers', async () => {
    const { api, context } = await loadPopupTestApi();
    const expected = { id: 'specific', matches: url => url === 'https://example.com' };
    context.PineFetchLinkProviders = [
        { id: 'broken', matches() { throw new Error('broken'); } },
        { id: 'missing' },
        expected,
        { id: 'fallback', matches: () => true },
    ];
    assert.equal(api.getProviderForUrl('https://example.com'), expected);
    assert.equal(api.getProviderForUrl(''), null);
    assert.equal(api.getProviderForUrl(null), null);
});

test('mode labels and URL shortening are stable', async () => {
    const { api } = await loadPopupTestApi();
    assert.equal(api.getModeLabel({ mode: 'single', providerLabel: 'YouTube' }), 'YouTube video');
    assert.equal(api.getModeLabel({ mode: 'list', providerLabel: 'TikTok' }), 'TikTok list');
    assert.equal(api.getModeLabel({ mode: 'unknown', providerLabel: 'video' }), 'No links');
    assert.equal(api.shortenUrl(null), '');
    assert.equal(api.shortenUrl('https://short.example'), 'https://short.example');
    const long = `https://example.com/${'a'.repeat(100)}/video`;
    assert.equal(api.shortenUrl(long), `${long.slice(0, 44)}...${long.slice(-20)}`);
});

test('sanitizeFilename handles unsafe names, defaults, Unicode, and length', async t => {
    const { api } = await loadPopupTestApi();
    const cases = [
        ['Normal title', 'Normal title.txt'],
        ['already.txt', 'already.txt'],
        [' / \\ : * ? " < > | ', 'video-links.txt'],
        ['... hidden ...', 'hidden.txt'],
        [' one   two ', 'one two.txt'],
        ['', 'video-links.txt'],
        [null, 'video-links.txt'],
        ['Übermäßig schöne 🎬 Datei', 'Übermäßig schöne 🎬 Datei.txt'],
        ['A/B:C*D?E"F<G>H|I', 'A-B-C-D-E-F-G-H-I.txt'],
    ];

    for (const [input, expected] of cases) {
        await t.test(String(input), () => assert.equal(api.sanitizeFilename(input), expected));
    }

    const long = api.sanitizeFilename('🎬'.repeat(250));
    assert.equal(Array.from(long.replace(/\.txt$/, '')).length, 180);
    assert.equal(long.endsWith('.txt'), true);
});

test('buildTxtFilename selects single titles and list owner names', async () => {
    const { api } = await loadPopupTestApi();
    assert.equal(api.buildTxtFilename({ mode: 'single', title: 'My/video', provider: 'youtube' }), 'My-video.txt');
    assert.equal(api.buildTxtFilename({ mode: 'single', title: '', provider: 'youtube' }), 'youtube-video.txt');
    assert.equal(api.buildTxtFilename({ mode: 'list', ownerName: 'alice', collectionName: 'Reels' }), 'alice-Reels.txt');
    assert.equal(api.buildTxtFilename(null), 'video-profile-Videos.txt');
});

test('buildExportFilename uses the requested safe extension', async () => {
    const { api } = await loadPopupTestApi();
    const pageInfo = { mode: 'list', ownerName: 'alice', collectionName: 'Research.csv' };
    assert.equal(api.buildExportFilename(pageInfo, 'json'), 'alice-Research.json');
    assert.equal(api.buildExportFilename(pageInfo, 'csv'), 'alice-Research.csv');
    assert.equal(api.sanitizeFilename('results.txt', 'json'), 'results.json');
    assert.equal(api.sanitizeFilename('results.json', 'csv'), 'results.csv');
    assert.equal(api.sanitizeFilename('results', 'exe'), 'results.txt');
});
