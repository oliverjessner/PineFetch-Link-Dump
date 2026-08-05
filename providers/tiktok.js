'use strict';

(function registerTikTokProvider() {
    function isTikTokUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            return hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com');
        } catch (error) {
            return false;
        }
    }

    function normalizeVideoUrl(url) {
        try {
            const parsed = new URL(url);

            if (!isTikTokUrl(parsed.href)) {
                return null;
            }

            const match = parsed.pathname.match(/^\/(?:@([^/]+))\/video\/(\d+)/i);
            return match ? `https://www.tiktok.com/@${match[1]}/video/${match[2]}` : null;
        } catch (error) {
            return null;
        }
    }

    function getProfileHandle(url) {
        try {
            const match = new URL(url).pathname.match(/^\/@([^/]+)\/?$/i);
            return match?.[1] || '';
        } catch (error) {
            return '';
        }
    }

    function cleanTitle(value) {
        return String(value || '')
            .replace(/\s*\|\s*TikTok\s*$/i, '')
            .replace(/\s*-\s*TikTok\s*$/i, '')
            .trim();
    }

    async function collectPageInfo() {
        function isTikTokHost(hostname) {
            return hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com');
        }

        function normalizeTikTokVideoUrl(url) {
            try {
                const parsed = new URL(url, window.location.origin);
                const match = parsed.pathname.match(/^\/@([^/]+)\/video\/(\d+)/i);

                if (!isTikTokHost(parsed.hostname) || !match) {
                    return null;
                }

                return `https://www.tiktok.com/@${match[1]}/video/${match[2]}`;
            } catch (error) {
                return null;
            }
        }

        function cleanTikTokTitle(value) {
            return String(value || '')
                .replace(/\s*\|\s*TikTok\s*$/i, '')
                .replace(/\s*-\s*TikTok\s*$/i, '')
                .trim();
        }

        function readMetaContent(selector) {
            return document.querySelector(selector)?.getAttribute('content')?.trim() || '';
        }

        function readFirstText(selectors) {
            for (const selector of selectors) {
                const text = document.querySelector(selector)?.textContent?.trim();

                if (text) {
                    return text;
                }
            }

            return '';
        }

        const pageUrl = window.location.href;
        const pathMatch = new URL(pageUrl).pathname.match(/^\/@([^/]+)(?:\/video\/(\d+))?/i);
        const profileHandle = pathMatch?.[1] || '';
        const singleUrl = normalizeTikTokVideoUrl(pageUrl);
        let urls = [];

        if (singleUrl) {
            urls = [singleUrl];
        } else if (profileHandle) {
            const expectedHandle = profileHandle.toLowerCase();
            urls = Array.from(document.querySelectorAll('a[href*="/video/"]'))
                .map(anchor => normalizeTikTokVideoUrl(anchor.href || anchor.getAttribute('href') || ''))
                .filter(url => {
                    if (!url) {
                        return false;
                    }

                    const handle = new URL(url).pathname.split('/')[1]?.replace(/^@/, '').toLowerCase();
                    return handle === expectedHandle;
                });
            urls = [...new Set(urls)];
        }

        const title = cleanTikTokTitle(readMetaContent('meta[property="og:title"]') || document.title);
        const ownerName =
            readFirstText(['h1[data-e2e="user-title"]', 'h2[data-e2e="user-subtitle"]']) ||
            readMetaContent('meta[property="og:title"]') ||
            profileHandle ||
            'tiktok-profile';

        return {
            provider: 'tiktok',
            providerLabel: 'TikTok',
            mode: singleUrl ? 'single' : urls.length ? 'list' : 'unknown',
            pageUrl,
            title,
            ownerName: cleanTikTokTitle(ownerName),
            collectionName: 'Videos',
            urls,
        };
    }

    globalThis.PineFetchLinkProviders = globalThis.PineFetchLinkProviders || [];
    globalThis.PineFetchLinkProviders.push({
        id: 'tiktok',
        label: 'TikTok',
        matches: isTikTokUrl,
        normalizeVideoUrl,
        getProfileHandle,
        cleanTitle,
        collectPageInfo,
        createFallbackPageInfo(tab) {
            const normalizedUrl = normalizeVideoUrl(tab?.url || '');
            const handle = getProfileHandle(tab?.url || '');

            return {
                provider: 'tiktok',
                providerLabel: 'TikTok',
                mode: normalizedUrl ? 'single' : 'unknown',
                pageUrl: tab?.url || '',
                title: cleanTitle(tab?.title || ''),
                ownerName: handle || '',
                collectionName: 'Videos',
                urls: normalizedUrl ? [normalizedUrl] : [],
            };
        },
    });
})();
