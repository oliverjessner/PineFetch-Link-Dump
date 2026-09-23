'use strict';

const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

globalThis.PineFetchLinkProviders = [];
for (const name of ['youtube', 'tiktok', 'instagram', 'reddit', 'x', 'facebook', 'standard-video']) {
    require(`../providers/${name}.js`);
}
const providers = Object.fromEntries(globalThis.PineFetchLinkProviders.map(provider => [provider.id, provider]));

async function collectFixture(providerId, fixture, url, beforeCollect) {
    const html = await readFile(resolve('test/fixtures', fixture), 'utf8');
    const dom = new JSDOM(html, { url });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    try {
        if (beforeCollect) beforeCollect(dom.window);
        return await providers[providerId].collectPageInfo();
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
        dom.window.close();
    }
}

test('YouTube channel fixture exercises list selectors', async () => {
    const info = await collectFixture('youtube', 'youtube-channel.html', 'https://www.youtube.com/@pinefetch/videos');
    assert.equal(info.mode, 'list');
    assert.equal(info.ownerName, 'PineFetch Channel');
    assert.equal(info.collectionName, 'Videos');
    assert.deepEqual(info.urls, [
        'https://www.youtube.com/watch?v=channel-one',
        'https://www.youtube.com/watch?v=channel-two',
    ]);
});

test('YouTube video fixture exercises title selector and single URL', async () => {
    const info = await collectFixture('youtube', 'youtube-video.html', 'https://music.youtube.com/watch?v=music-one&list=liked');
    assert.equal(info.mode, 'single');
    assert.equal(info.title, 'Fixture video');
    assert.deepEqual(info.urls, ['https://www.youtube.com/watch?v=music-one']);
});

test('TikTok profile fixture filters other handles and malformed links', async () => {
    const info = await collectFixture('tiktok', 'tiktok-profile.html', 'https://www.tiktok.com/@oliver');
    assert.equal(info.mode, 'list');
    assert.equal(info.ownerName, 'Oliver');
    assert.deepEqual(info.urls, ['https://www.tiktok.com/@oliver/video/100']);
});

test('TikTok music fixture gathers all loaded TikTok video links', async () => {
    const info = await collectFixture('tiktok', 'tiktok-music.html', 'https://www.tiktok.com/music/original-sound-123');
    assert.equal(info.collectionName, 'Music');
    assert.equal(info.ownerName, 'Original Sound');
    assert.deepEqual(info.urls, [
        'https://www.tiktok.com/@first/video/101',
        'https://www.tiktok.com/@second/video/202',
    ]);
});

test('Instagram fixture scopes collection to profile content', async () => {
    const info = await collectFixture('instagram', 'instagram-profile.html', 'https://www.instagram.com/pinefetch/reels/');
    assert.equal(info.ownerName, 'pinefetch');
    assert.equal(info.collectionName, 'Reels');
    assert.deepEqual(info.urls, [
        'https://www.instagram.com/p/POST_ONE/',
        'https://www.instagram.com/reel/REEL_TWO/',
    ]);
});

test('X fixture normalizes timeline status links', async () => {
    const info = await collectFixture('x', 'x-timeline.html', 'https://x.com/pinefetch/media');
    assert.equal(info.ownerName, 'pinefetch');
    assert.equal(info.collectionName, 'Media');
    assert.deepEqual(info.urls, [
        'https://x.com/pinefetch/status/123456',
        'https://x.com/i/status/789012',
    ]);
});

test('Reddit fixture normalizes full and short post URLs', async () => {
    const info = await collectFixture('reddit', 'reddit-list.html', 'https://www.reddit.com/r/videos/');
    assert.equal(info.ownerName, 'videos');
    assert.deepEqual(info.urls, [
        'https://www.reddit.com/r/videos/comments/abc123/',
        'https://www.reddit.com/comments/def456/',
    ]);
});

test('Facebook fixture limits collection to video URL forms', async () => {
    const info = await collectFixture('facebook', 'facebook-videos.html', 'https://www.facebook.com/pinefetch/videos/');
    assert.equal(info.ownerName, 'pinefetch');
    assert.deepEqual(info.urls, [
        'https://www.facebook.com/videos/123456/',
        'https://www.facebook.com/reel/789012/',
        'https://www.facebook.com/watch/?v=345678',
    ]);
});

test('standard-video fixture returns only unique HTTP(S) media', async () => {
    const info = await collectFixture('standard-video', 'standard-video.html', 'https://example.com/watch/page');
    assert.equal(info.mode, 'list');
    assert.equal(info.title, 'Fixture videos');
    assert.deepEqual(info.urls, [
        'https://example.com/media/first.mp4',
        'https://cdn.example.com/second.webm',
    ]);
});
