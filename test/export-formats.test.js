'use strict';

const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { createChromeMock, createPopupElements, loadPopupTestApi } = require('../test-utils/popup.js');

const collectedAt = '2026-09-23T12:34:56.000Z';
const pageInfo = {
    provider: 'tiktok',
    mode: 'list',
    pageUrl: 'https://www.tiktok.com/@research',
    title: ' Research, "quotes" ',
    ownerName: 'research',
    collectionName: 'Videos',
    urls: [
        'https://www.tiktok.com/@research/video/1',
        'https://www.tiktok.com/@research/video/2',
        'https://www.tiktok.com/@research/video/1',
    ],
};

test('popup offers TXT, JSON, and CSV through an accessible OJ dropdown', async () => {
    const html = await readFile(resolve('popup.html'), 'utf8');
    const dom = new JSDOM(html);
    const document = dom.window.document;
    try {
        const dropdown = document.getElementById('pfExportFormatDropdown');
        assert.equal(dropdown.classList.contains('oj-dropdown'), true);
        assert.equal(dropdown.hasAttribute('data-oj-dropdown'), true);
        const trigger = document.getElementById('pfExportFormat');
        assert.equal(trigger.tagName, 'BUTTON');
        assert.equal(trigger.type, 'button');
        assert.equal(trigger.hasAttribute('data-oj-dropdown-trigger'), true);
        assert.equal(trigger.value, 'txt');
        assert.equal(trigger.getAttribute('aria-label'), 'Export format: TXT');
        const menu = document.getElementById('pfExportFormatMenu');
        assert.equal(menu.classList.contains('oj-menu'), true);
        assert.equal(menu.hasAttribute('data-oj-dropdown-menu'), true);
        assert.equal(menu.getAttribute('role'), 'menu');
        assert.equal(menu.getAttribute('aria-label'), 'Export format');
        assert.equal(menu.hidden, true);
        const items = Array.from(menu.querySelectorAll('.oj-menu-item'));
        assert.deepEqual(items.map(item => item.dataset.ojValue), ['txt', 'json', 'csv']);
        for (const item of items) {
            assert.equal(item.tagName, 'BUTTON');
            assert.equal(item.type, 'button');
            assert.equal(item.getAttribute('role'), 'menuitemradio');
            assert.equal(item.getAttribute('aria-checked'), String(item.dataset.ojValue === 'txt'));
            assert.equal(item.textContent.trim(), item.dataset.ojValue.toUpperCase());
        }
    } finally {
        dom.window.close();
    }
});

test('TXT artifact remains a unique newline-delimited URL list', async () => {
    const { api } = await loadPopupTestApi();
    const artifact = api.createExportArtifact(pageInfo, 'txt', collectedAt);
    assert.equal(artifact.filename, 'research-Videos.txt');
    assert.equal(artifact.mimeType, 'text/plain;charset=utf-8');
    assert.equal(
        artifact.content,
        'https://www.tiktok.com/@research/video/1\nhttps://www.tiktok.com/@research/video/2\n',
    );
});

test('JSON artifact contains stable research metadata and unique links', async () => {
    const { api } = await loadPopupTestApi();
    const artifact = api.createExportArtifact(pageInfo, 'json', collectedAt);
    assert.equal(artifact.filename, 'research-Videos.json');
    assert.equal(artifact.mimeType, 'application/json;charset=utf-8');
    assert.deepEqual(JSON.parse(artifact.content), {
        source: 'tiktok',
        page: 'https://www.tiktok.com/@research',
        title: 'Research, "quotes"',
        collectedAt,
        amountOfLinks: 2,
        links: [
            'https://www.tiktok.com/@research/video/1',
            'https://www.tiktok.com/@research/video/2',
        ],
    });
    assert.equal(artifact.content.endsWith('\n'), true);
});

test('CSV artifact emits one metadata-rich row per unique link', async () => {
    const { api } = await loadPopupTestApi();
    const artifact = api.createExportArtifact(pageInfo, 'csv', collectedAt);
    assert.equal(artifact.filename, 'research-Videos.csv');
    assert.equal(artifact.mimeType, 'text/csv;charset=utf-8');
    assert.equal(artifact.content.split('\r\n').length, 4);
    assert.match(artifact.content, /^"source","page","title","collectedAt","url"\r\n/);
    assert.match(artifact.content, /"Research, ""quotes"""/);
    assert.match(artifact.content, /"https:\/\/www\.tiktok\.com\/@research\/video\/1"/);
    assert.match(artifact.content, /"https:\/\/www\.tiktok\.com\/@research\/video\/2"/);
});

test('CSV escaping handles delimiters, line breaks, quotes, and formula prefixes', async () => {
    const { api } = await loadPopupTestApi();
    assert.equal(api.escapeCsvCell('one,two'), '"one,two"');
    assert.equal(api.escapeCsvCell('line 1\nline 2'), '"line 1\nline 2"');
    assert.equal(api.escapeCsvCell('say "hello"'), '"say ""hello"""');
    assert.equal(api.escapeCsvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
    assert.equal(api.escapeCsvCell('+cmd'), '"\'+cmd"');
    assert.equal(api.escapeCsvCell('  =hidden'), '"\'  =hidden"');
});

test('artifact creation rejects missing links and unknown formats', async () => {
    const { api } = await loadPopupTestApi();
    assert.throws(() => api.createExportArtifact({ urls: [] }, 'json', collectedAt), /NO_LINKS/);
    assert.throws(() => api.createExportArtifact(pageInfo, 'xml', collectedAt), /UNSUPPORTED_EXPORT_FORMAT/);
});

test('exportPageInfo downloads JSON and CSV with matching content types', async t => {
    for (const format of ['json', 'csv']) {
        await t.test(format, async () => {
            let options;
            let blob;
            const chrome = createChromeMock({
                downloads: {
                    download(value, callback) {
                        options = value;
                        callback(7);
                    },
                },
            });
            const { api, context } = await loadPopupTestApi({ chrome });
            const elements = createPopupElements();
            api.setElements(elements);
            const originalCreate = context.URL.createObjectURL;
            const originalRevoke = context.URL.revokeObjectURL;
            context.URL.createObjectURL = value => { blob = value; return 'blob:export'; };
            context.URL.revokeObjectURL = () => {};
            context.window.setTimeout = callback => callback();

            try {
                await api.exportPageInfo(pageInfo, format);
                assert.equal(options.filename, `research-Videos.${format}`);
                assert.equal(blob.type, format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8');
                assert.match(elements.statusMessage.textContent, new RegExp(`as ${format.toUpperCase()}`));
            } finally {
                context.URL.createObjectURL = originalCreate;
                context.URL.revokeObjectURL = originalRevoke;
            }
        });
    }
});

test('format trigger updates the export label and disables every format while loading', async () => {
    const { api } = await loadPopupTestApi();
    const elements = createPopupElements();
    api.setElements(elements);
    elements.exportFormatTrigger.value = 'json';
    api.updateExportButtonLabel();
    assert.equal(elements.exportButton.textContent, 'Export JSON');
    api.setLoading(true, 'export');
    assert.equal(elements.exportFormatTrigger.disabled, true);
    assert.equal(elements.exportFormatItems.every(item => item.disabled), true);
    api.setLoading(false, 'export');
    assert.equal(elements.exportFormatTrigger.disabled, false);
    assert.equal(elements.exportFormatItems.every(item => !item.disabled), true);
    elements.exportFormatTrigger.value = 'unexpected';
    assert.equal(api.getSelectedExportFormat(), 'txt');
});
