'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.PineFetchLinkProviders = [];
for (const name of ['youtube', 'tiktok', 'instagram', 'reddit', 'x', 'facebook', 'standard-video']) {
    require(`../providers/${name}.js`);
}
const providers = Object.fromEntries(globalThis.PineFetchLinkProviders.map(provider => [provider.id, provider]));

test('YouTube URL matrix', async t => {
    const valid = [
        ['https://youtube.com/watch?v=abc123', 'https://www.youtube.com/watch?v=abc123'],
        ['https://www.youtube.com/watch?v=abc123&utm_source=test', 'https://www.youtube.com/watch?v=abc123'],
        ['https://m.youtube.com/watch?v=abc123&list=PL123', 'https://www.youtube.com/watch?v=abc123'],
        ['https://music.youtube.com/watch?v=abc123&list=LM', 'https://www.youtube.com/watch?v=abc123'],
        ['https://youtu.be/abc123?t=12', 'https://www.youtube.com/watch?v=abc123'],
        ['https://youtube.com/shorts/short-one?feature=share', 'https://www.youtube.com/watch?v=short-one'],
        ['https://youtube.com/live/live-one?si=tracking', 'https://www.youtube.com/watch?v=live-one'],
    ];
    for (const [url, expected] of valid) {
        await t.test(url, () => {
            assert.equal(providers.youtube.matches(url), true);
            assert.equal(providers.youtube.normalizeVideoUrl(url), expected);
        });
    }

    for (const url of [
        'https://youtube.com/watch?v=', 'https://youtube.com/@pinefetch/videos', 'https://youtube.com/channel/UC123',
        'https://youtube.com.evil.example/watch?v=abc', 'https://example.com/watch?v=abc', 'not a url',
    ]) {
        await t.test(`reject ${url}`, () => assert.equal(providers.youtube.normalizeVideoUrl(url), null));
    }
});

test('TikTok URL matrix and redirect-only short-link limitation', async t => {
    const video = 'https://www.tiktok.com/@creator/video/7494649516273011990';
    assert.equal(providers.tiktok.normalizeVideoUrl(`${video}?lang=en`), video);
    assert.equal(providers.tiktok.matches('https://www.tiktok.com/@creator'), true);
    assert.equal(providers.tiktok.matches('https://m.tiktok.com/@creator/video/123'), true);
    assert.equal(providers.tiktok.getProfileHandle('https://www.tiktok.com/@creator'), 'creator');
    assert.equal(providers.tiktok.getProfileHandle('https://www.tiktok.com/music/song-123'), '');

    for (const url of [
        'https://www.tiktok.com/@creator/video/not-a-number',
        'https://www.tiktok.com/@creator/video/',
        'https://tiktok.com.evil.example/@creator/video/123',
        'not a url',
    ]) {
        await t.test(`reject ${url}`, () => assert.equal(providers.tiktok.normalizeVideoUrl(url), null));
    }

    for (const url of ['https://vm.tiktok.com/ABC123/', 'https://vt.tiktok.com/ABC123/']) {
        await t.test(`short link ${url}`, () => {
            assert.equal(providers.tiktok.matches(url), true);
            assert.equal(providers.tiktok.normalizeVideoUrl(url), null);
        });
    }
});

test('Instagram URL matrix', async t => {
    const valid = [
        ['https://instagram.com/p/POST_1/?utm_source=share', 'https://www.instagram.com/p/POST_1/'],
        ['https://www.instagram.com/reel/REEL-2/?igsh=abc', 'https://www.instagram.com/reel/REEL-2/'],
        ['https://www.instagram.com/tv/TV3/', 'https://www.instagram.com/tv/TV3/'],
        ['https://www.instagram.com/creator/reel/REEL4/', 'https://www.instagram.com/reel/REEL4/'],
    ];
    for (const [url, expected] of valid) {
        await t.test(url, () => assert.equal(providers.instagram.normalizeContentUrl(url), expected));
    }

    assert.equal(providers.instagram.getProfileHandle('https://instagram.com/creator/'), 'creator');
    assert.equal(providers.instagram.getProfileHandle('https://instagram.com/creator/reels/'), 'creator');
    assert.equal(providers.instagram.getProfileHandle('https://instagram.com/creator/tagged/?x=1'), 'creator');
    for (const path of ['p', 'reel', 'reels', 'tv', 'explore', 'accounts']) {
        assert.equal(providers.instagram.getProfileHandle(`https://instagram.com/${path}/`), '');
    }
    assert.equal(providers.instagram.normalizeContentUrl('https://instagram.com.evil.example/p/ONE/'), null);
    assert.equal(providers.instagram.normalizeContentUrl('https://example.com/reel/ONE/'), null);
});

test('Reddit URL matrix', async t => {
    const valid = [
        ['https://reddit.com/r/videos/comments/AbC123/title/?utm_source=share', 'https://www.reddit.com/r/videos/comments/abc123/'],
        ['https://www.reddit.com/user/test-user/comments/DEF456/title/', 'https://www.reddit.com/user/test-user/comments/def456/'],
        ['https://old.reddit.com/comments/GHI789/title/', 'https://www.reddit.com/comments/ghi789/'],
        ['https://redd.it/JkL012?share_id=abc', 'https://www.reddit.com/comments/jkl012/'],
    ];
    for (const [url, expected] of valid) {
        await t.test(url, () => assert.equal(providers.reddit.normalizePostUrl(url), expected));
    }
    for (const url of [
        'https://reddit.com/r/videos/', 'https://reddit.com/user/name/', 'https://redd.it/not_valid!',
        'https://reddit.com.evil.example/r/x/comments/abc/', 'not a url',
    ]) {
        await t.test(`reject ${url}`, () => assert.equal(providers.reddit.normalizePostUrl(url), null));
    }
});

test('X and Twitter URL matrix', async t => {
    const valid = [
        ['https://x.com/user/status/123456?s=20', 'https://x.com/user/status/123456'],
        ['https://twitter.com/user/status/123456/video/1', 'https://x.com/user/status/123456'],
        ['https://x.com/i/status/987654', 'https://x.com/i/status/987654'],
    ];
    for (const [url, expected] of valid) {
        await t.test(url, () => assert.equal(providers.x.normalizePostUrl(url), expected));
    }
    assert.equal(providers.x.matches('https://x.com/user/media'), true);
    assert.equal(providers.x.matches('https://twitter.com/user/with_replies'), true);
    for (const url of [
        'https://x.com/user/status/not-a-number', 'https://x.com/user/status/',
        'https://x.com.evil.example/user/status/123', 'https://example.com/user/status/123',
    ]) {
        await t.test(`reject ${url}`, () => assert.equal(providers.x.normalizePostUrl(url), null));
    }
});

test('Facebook URL matrix', async t => {
    const valid = [
        ['https://facebook.com/reel/123456/?ref=share', 'https://www.facebook.com/reel/123456/'],
        ['https://www.facebook.com/creator/videos/234567/?ref=share', 'https://www.facebook.com/videos/234567/'],
        ['https://m.facebook.com/videos/345678/', 'https://www.facebook.com/videos/345678/'],
        ['https://facebook.com/watch/?v=456789&t=1', 'https://www.facebook.com/watch/?v=456789'],
        ['https://facebook.com/video.php?v=567890&ref=share', 'https://www.facebook.com/watch/?v=567890'],
        ['https://fb.watch/Ab_C-123/?tracking=1', 'https://fb.watch/Ab_C-123/'],
    ];
    for (const [url, expected] of valid) {
        await t.test(url, () => assert.equal(providers.facebook.normalizeVideoUrl(url), expected));
    }
    for (const url of [
        'https://facebook.com/creator/posts/123', 'https://facebook.com/watch/?v=bad',
        'https://facebook.com/reel/not-a-number', 'https://facebook.com.evil.example/reel/123',
    ]) {
        await t.test(`reject ${url}`, () => assert.equal(providers.facebook.normalizeVideoUrl(url), null));
    }
});

test('standard-video matches only ordinary HTTP(S) pages', async t => {
    const cases = [
        ['https://example.com', true], ['http://example.com', true],
        ['chrome://extensions', false], ['chrome://settings', false], ['about:blank', false],
        ['file:///tmp/video.html', false], ['data:text/html,test', false], ['javascript:alert(1)', false],
        ['', false], ['not a URL', false],
    ];
    for (const [url, expected] of cases) {
        await t.test(url || '(empty)', () => assert.equal(providers['standard-video'].matches(url), expected));
    }
});
