'use strict';

(function registerYoutubeProvider() {
    function isYoutubeUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            return hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
        } catch (error) {
            return false;
        }
    }

    function normalizeVideoUrl(url) {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.replace(/^m\./, 'www.');
            let videoId = '';

            if (host === 'youtu.be') {
                videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
            }

            if (host === 'www.youtube.com' || host === 'youtube.com') {
                if (parsed.pathname === '/watch') {
                    videoId = parsed.searchParams.get('v') || '';
                } else {
                    const match = parsed.pathname.match(/^\/(?:shorts|live)\/([^/?#]+)/);
                    videoId = match?.[1] || '';
                }
            }

            return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null;
        } catch (error) {
            return null;
        }
    }

    function cleanTitle(value) {
        return String(value || '')
            .replace(/\s+-\s+YouTube\s*$/i, '')
            .replace(/\s*-\s*YouTube\s*$/i, '')
            .trim();
    }

    async function collectPageInfo() {
        function normalizeYoutubeVideoUrl(url) {
            try {
                const parsed = new URL(url, window.location.origin);
                const host = parsed.hostname.replace(/^m\./, 'www.');
                let videoId = '';

                if (host === 'youtu.be') {
                    videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
                }

                if (host === 'www.youtube.com' || host === 'youtube.com') {
                    if (parsed.pathname === '/watch') {
                        videoId = parsed.searchParams.get('v') || '';
                    } else {
                        const match = parsed.pathname.match(/^\/(?:shorts|live)\/([^/?#]+)/);
                        videoId = match?.[1] || '';
                    }
                }

                return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null;
            } catch (error) {
                return null;
            }
        }

        function unique(values) {
            return [...new Set(values.filter(Boolean))];
        }

        function cleanYoutubeTitle(value) {
            return String(value || '')
                .replace(/\s+-\s+YouTube\s*$/i, '')
                .replace(/\s*-\s*YouTube\s*$/i, '')
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

        function getActiveTabName(pageUrl) {
            const selectedTabName = document
                .querySelector('yt-tab-shape[aria-selected="true"] .ytTabShapeTab')
                ?.textContent?.trim();

            if (selectedTabName) {
                return selectedTabName;
            }

            try {
                const lastSegment = new URL(pageUrl).pathname.split('/').filter(Boolean).pop() || '';
                return { streams: 'Streams', videos: 'Videos', shorts: 'Shorts', live: 'Live' }[lastSegment] || '';
            } catch (error) {
                return '';
            }
        }

        function getHandleFromUrl(pageUrl) {
            try {
                const handle = new URL(pageUrl).pathname.split('/').find(segment => segment.startsWith('@'));
                return handle ? handle.replace(/^@/, '') : '';
            } catch (error) {
                return '';
            }
        }

        const pageUrl = window.location.href;
        const singleUrl = normalizeYoutubeVideoUrl(pageUrl);
        const selectors = [
            'ytd-rich-item-renderer a',
            'ytd-grid-video-renderer a',
            'ytd-video-renderer a',
            "a.yt-simple-endpoint[href*='/watch']",
            "a.yt-simple-endpoint[href*='/shorts/']",
            "a.yt-simple-endpoint[href*='/live/']",
            'a#thumbnail',
        ];
        const urls = singleUrl
            ? [singleUrl]
            : unique(
                  Array.from(document.querySelectorAll(selectors.join(',')))
                      .map(anchor => anchor.href || anchor.getAttribute('href') || '')
                      .map(normalizeYoutubeVideoUrl),
              );
        const title = cleanYoutubeTitle(
            readFirstText([
                'h1.ytd-watch-metadata yt-formatted-string',
                'h1.title yt-formatted-string',
                'h1 yt-formatted-string',
                'h1',
            ]) ||
                readMetaContent('meta[property="og:title"]') ||
                document.title,
        );
        const ownerName =
            readFirstText([
                'ytd-channel-name #text',
                '#channel-name #text',
                '#owner #channel-name a',
                'yt-page-header-renderer yt-dynamic-text-view-model h1',
                'yt-page-header-renderer h1',
                'ytd-c4-tabbed-header-renderer #channel-name',
                'ytd-channel-header-renderer #channel-name',
            ]) ||
            cleanYoutubeTitle(readMetaContent('meta[property="og:title"]')) ||
            getHandleFromUrl(pageUrl) ||
            'youtube-channel';

        return {
            provider: 'youtube',
            providerLabel: 'YouTube',
            mode: singleUrl ? 'single' : urls.length ? 'list' : 'unknown',
            pageUrl,
            title,
            ownerName,
            collectionName: getActiveTabName(pageUrl) || 'Videos',
            urls,
        };
    }

    globalThis.PineFetchLinkProviders = globalThis.PineFetchLinkProviders || [];
    globalThis.PineFetchLinkProviders.push({
        id: 'youtube',
        label: 'YouTube',
        matches: isYoutubeUrl,
        normalizeVideoUrl,
        cleanTitle,
        collectPageInfo,
        createFallbackPageInfo(tab) {
            const normalizedUrl = normalizeVideoUrl(tab?.url || '');

            return {
                provider: 'youtube',
                providerLabel: 'YouTube',
                mode: normalizedUrl ? 'single' : 'unknown',
                pageUrl: tab?.url || '',
                title: cleanTitle(tab?.title || ''),
                ownerName: '',
                collectionName: 'Videos',
                urls: normalizedUrl ? [normalizedUrl] : [],
            };
        },
    });
})();
