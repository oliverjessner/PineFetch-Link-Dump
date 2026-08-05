'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.PineFetchLinkProviders = [];
require('../providers/youtube.js');
require('../providers/tiktok.js');
require('../providers/standard-video.js');

const providers = Object.fromEntries(globalThis.PineFetchLinkProviders.map(provider => [provider.id, provider]));

test('registers specific providers before the standard-video fallback', () => {
    assert.deepEqual(
        globalThis.PineFetchLinkProviders.map(provider => provider.id),
        ['youtube', 'tiktok', 'standard-video'],
    );
    assert.equal(providers.youtube.matches('https://www.youtube.com/@pinefetch/videos'), true);
    assert.equal(providers.tiktok.matches('https://www.tiktok.com/@oliverjessner'), true);
    assert.equal(providers['standard-video'].matches('https://example.com/video'), true);
});

test('normalizes supported YouTube video URL variants', () => {
    assert.equal(
        providers.youtube.normalizeVideoUrl('https://youtu.be/abc123?t=10'),
        'https://www.youtube.com/watch?v=abc123',
    );
    assert.equal(
        providers.youtube.normalizeVideoUrl('https://www.youtube.com/shorts/xyz789?feature=share'),
        'https://www.youtube.com/watch?v=xyz789',
    );
    assert.equal(providers.youtube.normalizeVideoUrl('https://www.youtube.com/@pinefetch/videos'), null);
});

test('YouTube list collector normalizes and deduplicates loaded video links', async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    globalThis.window = {
        location: {
            href: 'https://www.youtube.com/@pinefetch/videos',
            origin: 'https://www.youtube.com',
        },
    };
    globalThis.document = {
        title: 'PineFetch - YouTube',
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [
                { href: 'https://www.youtube.com/watch?v=one' },
                { href: 'https://www.youtube.com/shorts/two' },
                { href: 'https://www.youtube.com/watch?v=one&list=uploads' },
            ];
        },
    };

    try {
        const pageInfo = await providers.youtube.collectPageInfo();
        assert.equal(pageInfo.mode, 'list');
        assert.deepEqual(pageInfo.urls, [
            'https://www.youtube.com/watch?v=one',
            'https://www.youtube.com/watch?v=two',
        ]);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
});

test('normalizes TikTok video URLs and rejects lookalike domains', () => {
    assert.equal(
        providers.tiktok.normalizeVideoUrl('https://www.tiktok.com/@oliverjessner/video/7494649516273011990?lang=en'),
        'https://www.tiktok.com/@oliverjessner/video/7494649516273011990',
    );
    assert.equal(
        providers.tiktok.normalizeVideoUrl('https://www.tiktok.com.evil.example/@oliverjessner/video/123'),
        null,
    );
});

test('TikTok profile collector keeps only loaded links from the current handle', async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    globalThis.window = { location: { href: 'https://www.tiktok.com/@oliverjessner', origin: 'https://www.tiktok.com' } };
    globalThis.document = {
        title: 'Oliver Jessner (@oliverjessner) | TikTok',
        querySelector() {
            return null;
        },
        querySelectorAll(selector) {
            assert.equal(selector, 'a[href*="/video/"]');
            return [
                { href: 'https://www.tiktok.com/@oliverjessner/video/100?lang=en' },
                { href: 'https://www.tiktok.com/@other/video/200' },
                { href: 'https://www.tiktok.com/@oliverjessner/video/100' },
                { href: 'https://www.tiktok.com/@oliverjessner/video/300' },
            ];
        },
    };

    try {
        const pageInfo = await providers.tiktok.collectPageInfo();
        assert.equal(pageInfo.mode, 'list');
        assert.deepEqual(pageInfo.urls, [
            'https://www.tiktok.com/@oliverjessner/video/100',
            'https://www.tiktok.com/@oliverjessner/video/300',
        ]);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
});

test('standard-video collector returns all unique HTTP video sources', async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const source = { src: 'https://cdn.example.com/second.mp4', getAttribute: () => null };

    globalThis.window = {
        location: { href: 'https://example.com/page' },
        setTimeout,
    };
    globalThis.document = {
        title: 'Example',
        querySelector(selector) {
            return selector === 'meta[property="og:title"]' ? null : null;
        },
        querySelectorAll(selector) {
            if (selector !== 'video') return [];
            return [
                {
                    currentSrc: 'https://cdn.example.com/first.mp4',
                    src: '',
                    getAttribute: () => '',
                    querySelectorAll: () => [source],
                },
            ];
        },
    };

    try {
        const pageInfo = await providers['standard-video'].collectPageInfo();
        assert.equal(pageInfo.mode, 'list');
        assert.deepEqual(pageInfo.urls, [
            'https://cdn.example.com/first.mp4',
            'https://cdn.example.com/second.mp4',
        ]);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
});
