'use strict';

(function registerStandardVideoProvider() {
    function cleanTitle(value) {
        return String(value || '').trim();
    }

    async function collectPageInfo() {
        const VIDEO_ELEMENT_POLL_ATTEMPTS = 12;
        const VIDEO_ELEMENT_POLL_INTERVAL_MS = 250;

        function wait(ms) {
            return new Promise(resolve => window.setTimeout(resolve, ms));
        }

        function normalizeMediaUrl(url) {
            try {
                const value = String(url || '').trim();

                if (!value) {
                    return null;
                }

                const parsed = new URL(value, window.location.href);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
            } catch (error) {
                return null;
            }
        }

        function extractVideoUrls() {
            const candidates = Array.from(document.querySelectorAll('video')).flatMap(video => [
                video.currentSrc,
                video.src,
                video.getAttribute('src'),
                ...Array.from(video.querySelectorAll('source')).flatMap(source => [
                    source.src,
                    source.getAttribute('src'),
                ]),
            ]);

            return [...new Set(candidates.map(normalizeMediaUrl).filter(Boolean))];
        }

        let urls = [];

        for (let attempt = 0; attempt < VIDEO_ELEMENT_POLL_ATTEMPTS; attempt += 1) {
            urls = extractVideoUrls();

            if (urls.length || attempt === VIDEO_ELEMENT_POLL_ATTEMPTS - 1) {
                break;
            }

            await wait(VIDEO_ELEMENT_POLL_INTERVAL_MS);
        }

        return {
            provider: 'standard-video',
            providerLabel: 'Web video',
            mode: urls.length === 1 ? 'single' : urls.length > 1 ? 'list' : 'unknown',
            pageUrl: window.location.href,
            title: document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || document.title,
            ownerName: '',
            collectionName: 'Videos',
            urls,
        };
    }

    globalThis.PineFetchLinkProviders = globalThis.PineFetchLinkProviders || [];
    globalThis.PineFetchLinkProviders.push({
        id: 'standard-video',
        label: 'Web video',
        matches() {
            return true;
        },
        cleanTitle,
        collectPageInfo,
        createFallbackPageInfo(tab) {
            return {
                provider: 'standard-video',
                providerLabel: 'Web video',
                mode: 'unknown',
                pageUrl: tab?.url || '',
                title: cleanTitle(tab?.title || ''),
                ownerName: '',
                collectionName: 'Videos',
                urls: [],
            };
        },
    });
})();
