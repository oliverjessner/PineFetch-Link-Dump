'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.PineFetchLinkProviders = [];
require('../providers/standard-video.js');
const provider = globalThis.PineFetchLinkProviders[0];

async function withDom({ videos, queryVideos, setTimeout = globalThis.setTimeout }, callback) {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    globalThis.window = { location: { href: 'https://example.com/path/page' }, setTimeout };
    globalThis.document = {
        title: 'Page title',
        querySelector(selector) {
            return selector === 'meta[property="og:title"]'
                ? { getAttribute: () => ' Meta title ' }
                : null;
        },
        querySelectorAll(selector) {
            assert.equal(selector, 'video');
            return queryVideos ? queryVideos() : videos;
        },
    };
    try {
        return await callback();
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
}

function video({ currentSrc = '', src = '', attribute = '', sources = [] } = {}) {
    return {
        currentSrc,
        src,
        getAttribute: name => name === 'src' ? attribute : null,
        querySelectorAll: selector => {
            assert.equal(selector, 'source');
            return sources;
        },
    };
}

function source(src, attribute = src) {
    return { src, getAttribute: name => name === 'src' ? attribute : null };
}

test('collector reads currentSrc, video src, and multiple sources defensively', async () => {
    const videos = [
        video({
            currentSrc: 'https://cdn.example.com/current.mp4',
            src: 'https://cdn.example.com/video.mp4',
            attribute: '/relative.mp4',
            sources: [
                source('https://cdn.example.com/source.webm'),
                source('', '../fallback.ogv'),
                source('https://cdn.example.com/current.mp4'),
                source('blob:https://example.com/id'),
                source('data:video/mp4;base64,AAAA'),
            ],
        }),
        video({ src: 'https://cdn.example.com/second.mp4' }),
    ];
    const info = await withDom({ videos }, () => provider.collectPageInfo());
    assert.equal(info.title, 'Meta title');
    assert.equal(info.mode, 'list');
    assert.deepEqual(info.urls, [
        'https://cdn.example.com/current.mp4',
        'https://cdn.example.com/video.mp4',
        'https://example.com/relative.mp4',
        'https://cdn.example.com/source.webm',
        'https://example.com/fallback.ogv',
        'https://cdn.example.com/second.mp4',
    ]);
});

test('collector polls for a delayed video without real waiting', async () => {
    let queries = 0;
    const info = await withDom({
        queryVideos() {
            queries += 1;
            return queries < 3 ? [] : [video({ src: 'https://cdn.example.com/delayed.mp4' })];
        },
        setTimeout(callback) { callback(); },
    }, () => provider.collectPageInfo());
    assert.equal(queries, 3);
    assert.equal(info.mode, 'single');
    assert.deepEqual(info.urls, ['https://cdn.example.com/delayed.mp4']);
});

test('collector stops after its bounded attempts when no video exists', async () => {
    let queries = 0;
    const info = await withDom({
        queryVideos() { queries += 1; return []; },
        setTimeout(callback) { callback(); },
    }, () => provider.collectPageInfo());
    assert.equal(queries, 12);
    assert.equal(info.mode, 'unknown');
    assert.deepEqual(info.urls, []);
});
