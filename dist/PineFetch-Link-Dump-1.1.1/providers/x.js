'use strict';

(function registerXProvider() {
    function matches(url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            return host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com');
        } catch (error) {
            return false;
        }
    }

    function normalizePostUrl(url) {
        try {
            const parsed = new URL(url);
            if (!matches(parsed.href)) return null;
            const match = parsed.pathname.match(/^\/([a-z0-9_]{1,15}|i)\/status\/(\d+)(?:\/|$)/i);
            return match ? `https://x.com/${match[1]}/status/${match[2]}` : null;
        } catch (error) {
            return null;
        }
    }

    function cleanTitle(value) {
        return String(value || '').replace(/\s*(?:\/ X|\| X|on X|\/ Twitter|\| Twitter)\s*$/i, '').trim();
    }

    async function collectPageInfo() {
        function normalize(url) {
            try {
                const parsed = new URL(url, window.location.origin);
                const host = parsed.hostname.toLowerCase();
                if (host !== 'x.com' && !host.endsWith('.x.com') && host !== 'twitter.com' && !host.endsWith('.twitter.com')) return null;
                const match = parsed.pathname.match(/^\/([a-z0-9_]{1,15}|i)\/status\/(\d+)(?:\/|$)/i);
                return match ? `https://x.com/${match[1]}/status/${match[2]}` : null;
            } catch (error) {
                return null;
            }
        }

        const pageUrl = window.location.href;
        const singleUrl = normalize(pageUrl);
        const path = new URL(pageUrl).pathname;
        const profileHandle = path.match(/^\/([a-z0-9_]{1,15})(?:\/(?:media|with_replies))?\/?$/i)?.[1] || '';
        const urls = singleUrl ? [singleUrl] : [...new Set(
            Array.from(document.querySelectorAll('a[href*="/status/"]'))
                .map(anchor => normalize(anchor.href || anchor.getAttribute('href') || ''))
                .filter(Boolean),
        )];
        const title = String(document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.title || '')
            .replace(/\s*(?:\/ X|\| X|on X|\/ Twitter|\| Twitter)\s*$/i, '').trim();

        return {
            provider: 'x', providerLabel: 'X',
            mode: singleUrl ? 'single' : urls.length ? 'list' : 'unknown',
            pageUrl, title, ownerName: profileHandle || 'x',
            collectionName: path.endsWith('/media') ? 'Media' : 'Posts', urls,
        };
    }

    globalThis.PineFetchLinkProviders = globalThis.PineFetchLinkProviders || [];
    globalThis.PineFetchLinkProviders.push({
        id: 'x', label: 'X', matches, normalizePostUrl, cleanTitle, collectPageInfo,
        createFallbackPageInfo(tab) {
            const url = normalizePostUrl(tab?.url || '');
            return {
                provider: 'x', providerLabel: 'X', mode: url ? 'single' : 'unknown',
                pageUrl: tab?.url || '', title: cleanTitle(tab?.title || ''),
                ownerName: '', collectionName: 'Posts', urls: url ? [url] : [],
            };
        },
    });
})();
