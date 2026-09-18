'use strict';

(function registerFacebookProvider() {
    function matches(url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            return host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch';
        } catch (error) {
            return false;
        }
    }

    function normalizeVideoUrl(url) {
        try {
            const parsed = new URL(url);
            if (!matches(parsed.href)) return null;
            if (parsed.hostname.toLowerCase() === 'fb.watch') {
                const code = parsed.pathname.match(/^\/([a-z0-9_-]+)\/?$/i)?.[1];
                return code ? `https://fb.watch/${code}/` : null;
            }
            const reel = parsed.pathname.match(/^\/reel\/(\d+)(?:\/|$)/i);
            if (reel) return `https://www.facebook.com/reel/${reel[1]}/`;
            const video = parsed.pathname.match(/^\/(?:[^/]+\/)?videos\/(?:[^/]+\/)?(\d+)(?:\/|$)/i);
            if (video) return `https://www.facebook.com/videos/${video[1]}/`;
            if (/^\/(?:watch\/?|video\.php)$/i.test(parsed.pathname)) {
                const id = parsed.searchParams.get('v');
                return id && /^\d+$/.test(id) ? `https://www.facebook.com/watch/?v=${id}` : null;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    function cleanTitle(value) {
        return String(value || '').replace(/\s*[|·-]\s*Facebook\s*$/i, '').trim();
    }

    async function collectPageInfo() {
        function normalize(url) {
            try {
                const parsed = new URL(url, window.location.origin);
                const host = parsed.hostname.toLowerCase();
                if (host === 'fb.watch') {
                    const code = parsed.pathname.match(/^\/([a-z0-9_-]+)\/?$/i)?.[1];
                    return code ? `https://fb.watch/${code}/` : null;
                }
                if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return null;
                const reel = parsed.pathname.match(/^\/reel\/(\d+)(?:\/|$)/i);
                if (reel) return `https://www.facebook.com/reel/${reel[1]}/`;
                const video = parsed.pathname.match(/^\/(?:[^/]+\/)?videos\/(?:[^/]+\/)?(\d+)(?:\/|$)/i);
                if (video) return `https://www.facebook.com/videos/${video[1]}/`;
                if (/^\/(?:watch\/?|video\.php)$/i.test(parsed.pathname)) {
                    const id = parsed.searchParams.get('v');
                    return id && /^\d+$/.test(id) ? `https://www.facebook.com/watch/?v=${id}` : null;
                }
                return null;
            } catch (error) {
                return null;
            }
        }

        const pageUrl = window.location.href;
        const singleUrl = normalize(pageUrl);
        const path = new URL(pageUrl).pathname;
        const ownerName = path.match(/^\/([^/]+)\/(?:videos|reels)\/?$/i)?.[1] || 'facebook';
        const urls = singleUrl ? [singleUrl] : [...new Set(
            Array.from(document.querySelectorAll('a[href*="/reel/"], a[href*="/videos/"], a[href*="/watch/"], a[href*="video.php"], a[href*="fb.watch/"]'))
                .map(anchor => normalize(anchor.href || anchor.getAttribute('href') || ''))
                .filter(Boolean),
        )];
        const title = String(document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.title || '')
            .replace(/\s*[|·-]\s*Facebook\s*$/i, '').trim();

        return {
            provider: 'facebook', providerLabel: 'Facebook',
            mode: singleUrl ? 'single' : urls.length ? 'list' : 'unknown',
            pageUrl, title, ownerName, collectionName: 'Videos', urls,
        };
    }

    globalThis.PineFetchLinkProviders = globalThis.PineFetchLinkProviders || [];
    globalThis.PineFetchLinkProviders.push({
        id: 'facebook', label: 'Facebook', matches, normalizeVideoUrl, cleanTitle, collectPageInfo,
        createFallbackPageInfo(tab) {
            const url = normalizeVideoUrl(tab?.url || '');
            return {
                provider: 'facebook', providerLabel: 'Facebook', mode: url ? 'single' : 'unknown',
                pageUrl: tab?.url || '', title: cleanTitle(tab?.title || ''),
                ownerName: '', collectionName: 'Videos', urls: url ? [url] : [],
            };
        },
    });
})();
