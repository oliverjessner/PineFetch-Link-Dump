'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createChromeMock, createPopupElements, loadPopupTestApi } = require('../test-utils/popup.js');

function response({ status = 200, contentType = 'application/json', json = {}, text = '' } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
        async json() {
            if (json instanceof Error) throw json;
            return json;
        },
        async text() { return text; },
    };
}

test('buildPineFetchRequestUrl accepts local HTTP endpoints and base paths', async t => {
    const { api } = await loadPopupTestApi();
    const cases = [
        ['http://localhost:2255', '/addVideoLinkToQueue/', 'http://localhost:2255/addVideoLinkToQueue/'],
        ['http://127.0.0.1:2255', '/addVideoLinksToQueue/', 'http://127.0.0.1:2255/addVideoLinksToQueue/'],
        ['http://127.0.1:2255', '/addVideoLinkToQueue/', 'http://127.0.0.1:2255/addVideoLinkToQueue/'],
        [' http://localhost:2255/ ', '/addVideoLinkToQueue/', 'http://localhost:2255/addVideoLinkToQueue/'],
        ['http://localhost:2255/api', '/addVideoLinkToQueue/', 'http://localhost:2255/api/addVideoLinkToQueue/'],
        ['http://localhost:2255/api/', 'addVideoLinksToQueue/', 'http://localhost:2255/api/addVideoLinksToQueue/'],
        ['http://localhost:2255//api///', '///addVideoLinkToQueue/', 'http://localhost:2255/api/addVideoLinkToQueue/'],
        ['http://localhost', '/addVideoLinkToQueue/', 'http://localhost/addVideoLinkToQueue/'],
        ['http://localhost:65535', '/addVideoLinkToQueue/', 'http://localhost:65535/addVideoLinkToQueue/'],
    ];

    for (const [base, path, expected] of cases) {
        await t.test(base, () => assert.equal(api.buildPineFetchRequestUrl(base, path), expected));
    }
});

test('buildPineFetchRequestUrl rejects external, ambiguous, and malformed endpoints', async t => {
    const { api } = await loadPopupTestApi();
    const invalid = [
        '', '   ', 'not a URL', 'https://example.com', 'http://example.com',
        'http://localhost.evil.com', 'http://127.0.0.1.evil.com', 'ftp://localhost:2255',
        'javascript:alert(1)', 'data:text/plain,test', 'http://user@localhost:2255',
        'http://user:pass@127.0.0.1:2255', 'http://localhost:2255?target=example.com',
        'http://localhost:2255/#fragment', 'http://localhost:99999',
        'http://localhost.:2255', 'http://[::1]:2255',
    ];

    for (const value of invalid) {
        await t.test(value || '(empty)', () => {
            assert.throws(() => api.buildPineFetchRequestUrl(value, '/addVideoLinkToQueue/'), /Invalid|URL/);
        });
    }
});

test('postToPineFetch sends JSON and parses JSON, text, malformed, and empty responses', async t => {
    const { api, context } = await loadPopupTestApi();
    const samples = [
        { name: 'JSON', value: response({ json: { queued: true } }), expected: { queued: true } },
        { name: 'text', value: response({ contentType: 'text/plain', text: 'queued' }), expected: { text: 'queued' } },
        { name: 'broken JSON', value: response({ json: new Error('bad json') }), expected: null },
        { name: 'empty response', value: response({ status: 204, contentType: '', text: '' }), expected: { text: '' } },
    ];

    for (const sample of samples) {
        await t.test(sample.name, async () => {
            let request;
            context.fetch = async (url, options) => {
                request = { url, options };
                return sample.value;
            };
            const result = await api.postToPineFetch(
                'http://localhost:2255', '/addVideoLinkToQueue/', { url: 'https://video.example/1', secret: 's' }, 50,
            );
            assert.equal(result.ok, true);
            assert.equal(result.status, sample.value.status);
            assert.deepEqual(JSON.parse(JSON.stringify(result.data)), sample.expected);
            assert.equal(request.url, 'http://localhost:2255/addVideoLinkToQueue/');
            assert.equal(request.options.method, 'POST');
            assert.deepEqual(JSON.parse(request.options.body), { url: 'https://video.example/1', secret: 's' });
            assert.equal(request.options.headers['Content-Type'], 'application/json');
            assert.equal(request.options.signal instanceof AbortSignal, true);
        });
    }
});

test('postToPineFetch classifies HTTP statuses without throwing', async t => {
    const { api, context } = await loadPopupTestApi();
    for (const status of [400, 401, 403, 404, 500]) {
        await t.test(`HTTP ${status}`, async () => {
            context.fetch = async () => response({ status, json: { error: 'rejected' } });
            const result = await api.postToPineFetch('http://localhost:2255', '/addVideoLinkToQueue/', {}, 50);
            assert.equal(result.ok, false);
            assert.equal(result.reason, 'http');
            assert.equal(result.status, status);
            assert.deepEqual(result.data, { error: 'rejected' });
        });
    }
});

test('postToPineFetch distinguishes network failures, timeout, and invalid endpoints', async () => {
    const { api, context } = await loadPopupTestApi();
    context.fetch = async () => { throw new TypeError('connection refused'); };
    let result = await api.postToPineFetch('http://localhost:2255', '/addVideoLinkToQueue/', {}, 50);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'network');

    context.fetch = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        });
    });
    result = await api.postToPineFetch('http://localhost:2255', '/addVideoLinkToQueue/', {}, 5);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'timeout');

    let called = false;
    context.fetch = async () => { called = true; return response(); };
    result = await api.postToPineFetch('https://example.com', '/addVideoLinkToQueue/', {}, 50);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'network');
    assert.equal(called, false);
});

test('sendToPineFetch sends exact single and multi payloads', async t => {
    for (const sample of [
        {
            name: 'single',
            pageInfo: { mode: 'single', urls: ['https://video.example/1', 'https://video.example/1'] },
            path: '/addVideoLinkToQueue/',
            payload: { url: 'https://video.example/1', secret: ' secret with spaces ' },
            count: 1,
        },
        {
            name: 'multi',
            pageInfo: { mode: 'list', urls: ['https://video.example/1', 'https://video.example/2', 'https://video.example/1'] },
            path: '/addVideoLinksToQueue/',
            payload: { urls: ['https://video.example/1', 'https://video.example/2'], secret: ' secret with spaces ' },
            count: 2,
        },
    ]) {
        await t.test(sample.name, async () => {
            let request;
            const chrome = createChromeMock();
            const { api, context } = await loadPopupTestApi({ chrome });
            const elements = createPopupElements({ secret: ' secret with spaces ' });
            api.setElements(elements);
            context.fetch = async (url, options) => {
                request = { url, options };
                return response({ json: { ok: true } });
            };

            const result = await api.sendToPineFetch(sample.pageInfo);
            assert.equal(result.ok, true);
            assert.equal(result.count, sample.count);
            assert.equal(request.url, `http://127.0.0.1:2255${sample.path}`);
            assert.deepEqual(JSON.parse(request.options.body), sample.payload);
            assert.match(elements.statusMessage.textContent, /queued successfully/);
        });
    }
});

test('sendToPineFetch does not request without a secret, URLs, or valid endpoint', async t => {
    const samples = [
        { name: 'missing secret', secret: '', endpoint: 'http://localhost:2255', urls: ['https://video.example/1'], reason: 'secret' },
        { name: 'whitespace secret', secret: '   ', endpoint: 'http://localhost:2255', urls: ['https://video.example/1'], reason: 'secret' },
        { name: 'no URLs', secret: 'secret', endpoint: 'http://localhost:2255', urls: [], reason: 'no-links' },
        { name: 'invalid endpoint', secret: 'secret', endpoint: 'https://example.com', urls: ['https://video.example/1'], reason: 'network' },
    ];

    for (const sample of samples) {
        await t.test(sample.name, async () => {
            let requests = 0;
            const { api, context } = await loadPopupTestApi({ chrome: createChromeMock() });
            const elements = createPopupElements({ endpoint: sample.endpoint, secret: sample.secret });
            api.setElements(elements);
            context.fetch = async () => { requests += 1; return response(); };
            const result = await api.sendToPineFetch({ mode: 'list', urls: sample.urls });
            assert.equal(result.ok, false);
            assert.equal(result.reason, sample.reason);
            assert.equal(requests, 0);
        });
    }
});

test('sendToPineFetch shows a specific timeout message', async () => {
    const { api, context } = await loadPopupTestApi({ chrome: createChromeMock() });
    const elements = createPopupElements();
    api.setElements(elements);
    context.fetch = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        });
    });

    const original = api.REQUEST_TIMEOUT_MS;
    assert.equal(original, 5000);
    // Exercise the UI branch with a fast timeout through the lower-level result shape.
    context.fetch = async () => { throw Object.assign(new Error('abort'), { name: 'AbortError' }); };
    const result = await api.sendToPineFetch({ mode: 'single', urls: ['https://video.example/1'] });
    assert.equal(result.reason, 'timeout');
    assert.match(elements.statusMessage.textContent, /did not respond in time/);
});
