'use strict';

(function registerRedditProvider() {
    function normalizePostUrl(url) {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase();
            if (host === 'redd.it') {
                const id = parsed.pathname.match(/^\/([a-z0-9]+)\/?$/i)?.[1];
                return id ? `https://www.reddit.com/comments/${id.toLowerCase()}/` : null;
            }
            if (host !== 'reddit.com' && !host.endsWith('.reddit.com')) return null;

            const match = parsed.pathname.match(/^\/(?:r\/([a-z0-9_]+)\/|user\/([a-z0-9_-]+)\/)?comments\/([a-z0-9]+)(?:\/|$)/i);
            if (!match) return null;
            const prefix = match[1] ? `r/${match[1]}/` : match[2] ? `user/${match[2]}/` : '';
            return `https://www.reddit.com/${prefix}comments/${match[3].toLowerCase()}/`;
        } catch (error) {
            return null;
        }
    }

    function matches(url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            return host === 'redd.it' || host === 'reddit.com' || host.endsWith('.reddit.com');
        } catch (error) {
            return false;
        }
    }

    function cleanTitle(value) {
        return String(value || '').replace(/\s*[:|-]\s*Reddit\s*$/i, '').trim();
    }

    async function collectPageInfo() {
        function normalize(url) {
            try {
                const parsed = new URL(url, window.location.origin);
                const host = parsed.hostname.toLowerCase();
                if (host === 'redd.it') {
                    const id = parsed.pathname.match(/^\/([a-z0-9]+)\/?$/i)?.[1];
                    return id ? `https://www.reddit.com/comments/${id.toLowerCase()}/` : null;
                }
                if (host !== 'reddit.com' && !host.endsWith('.reddit.com')) return null;
                const match = parsed.pathname.match(/^\/(?:r\/([a-z0-9_]+)\/|user\/([a-z0-9_-]+)\/)?comments\/([a-z0-9]+)(?:\/|$)/i);
                if (!match) return null;
                const prefix = match[1] ? `r/${match[1]}/` : match[2] ? `user/${match[2]}/` : '';
                return `https://www.reddit.com/${prefix}comments/${match[3].toLowerCase()}/`;
            } catch (error) {
                return null;
            }
        }

        const pageUrl = window.location.href;
        const singleUrl = normalize(pageUrl);
        const path = new URL(pageUrl).pathname;
        const ownerName = path.match(/^\/(?:r|user)\/([^/]+)/i)?.[1] || 'reddit';
        const urls = singleUrl ? [singleUrl] : [...new Set(
            Array.from(document.querySelectorAll('a[href*="/comments/"], a[href*="redd.it/"]'))
                .map(anchor => normalize(anchor.href || anchor.getAttribute('href') || ''))
                .filter(Boolean),
        )];
        const title = String(document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.title || '')
            .replace(/\s*[:|-]\s*Reddit\s*$/i, '').trim();

        return {
            provider: 'reddit', providerLabel: 'Reddit',
            mode: singleUrl ? 'single' : urls.length ? 'list' : 'unknown',
            pageUrl, title, ownerName, collectionName: 'Posts', urls,
        };
    }

    globalThis.PineFetchLinkProviders = globalThis.PineFetchLinkProviders || [];
    globalThis.PineFetchLinkProviders.push({
        id: 'reddit', label: 'Reddit', matches, normalizePostUrl, cleanTitle, collectPageInfo,
        createFallbackPageInfo(tab) {
            const url = normalizePostUrl(tab?.url || '');
            return {
                provider: 'reddit', providerLabel: 'Reddit', mode: url ? 'single' : 'unknown',
                pageUrl: tab?.url || '', title: cleanTitle(tab?.title || ''),
                ownerName: '', collectionName: 'Posts', urls: url ? [url] : [],
            };
        },
    });
})();
