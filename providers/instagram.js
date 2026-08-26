'use strict';

(function registerInstagramProvider() {
    const RESERVED_PROFILE_PATHS = new Set([
        'about',
        'accounts',
        'api',
        'challenge',
        'developer',
        'direct',
        'directory',
        'emails',
        'explore',
        'legal',
        'p',
        'privacy',
        'reel',
        'reels',
        'stories',
        'terms',
        'tv',
        'web',
    ]);

    function isInstagramUrl(url) {
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            return hostname === 'instagram.com' || hostname.endsWith('.instagram.com');
        } catch (error) {
            return false;
        }
    }

    function normalizeContentUrl(url) {
        try {
            const parsed = new URL(url);

            if (!isInstagramUrl(parsed.href)) {
                return null;
            }

            const match = parsed.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)(?:\/|$)/i);
            return match ? `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/` : null;
        } catch (error) {
            return null;
        }
    }

    function getProfileHandle(url) {
        try {
            const parsed = new URL(url);

            if (!isInstagramUrl(parsed.href)) {
                return '';
            }

            const match = parsed.pathname.match(/^\/([A-Za-z0-9._]+)(?:\/(?:reels|tagged))?\/?$/i);
            const handle = match?.[1] || '';
            return handle && !RESERVED_PROFILE_PATHS.has(handle.toLowerCase()) ? handle : '';
        } catch (error) {
            return '';
        }
    }

    function cleanTitle(value) {
        return String(value || '')
            .replace(/\s*[•|\-]\s*Instagram(?:\s+photos\s+and\s+videos)?\s*$/i, '')
            .trim();
    }

    async function collectPageInfo() {
        const reservedProfilePaths = new Set([
            'about',
            'accounts',
            'api',
            'challenge',
            'developer',
            'direct',
            'directory',
            'emails',
            'explore',
            'legal',
            'p',
            'privacy',
            'reel',
            'reels',
            'stories',
            'terms',
            'tv',
            'web',
        ]);

        function isInstagramHost(hostname) {
            const normalizedHostname = String(hostname || '').toLowerCase();
            return normalizedHostname === 'instagram.com' || normalizedHostname.endsWith('.instagram.com');
        }

        function normalizeInstagramContentUrl(url) {
            try {
                const parsed = new URL(url, window.location.origin);
                const match = parsed.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)(?:\/|$)/i);

                if (!isInstagramHost(parsed.hostname) || !match) {
                    return null;
                }

                return `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/`;
            } catch (error) {
                return null;
            }
        }

        function getInstagramProfileHandle(url) {
            try {
                const parsed = new URL(url, window.location.origin);

                if (!isInstagramHost(parsed.hostname)) {
                    return '';
                }

                const match = parsed.pathname.match(/^\/([A-Za-z0-9._]+)(?:\/(?:reels|tagged))?\/?$/i);
                const handle = match?.[1] || '';
                return handle && !reservedProfilePaths.has(handle.toLowerCase()) ? handle : '';
            } catch (error) {
                return '';
            }
        }

        function cleanInstagramTitle(value) {
            return String(value || '')
                .replace(/\s*[•|\-]\s*Instagram(?:\s+photos\s+and\s+videos)?\s*$/i, '')
                .trim();
        }

        function readMetaContent(selector) {
            return document.querySelector(selector)?.getAttribute('content')?.trim() || '';
        }

        function getCollectionName(pageUrl) {
            try {
                const segments = new URL(pageUrl).pathname.split('/').filter(Boolean);
                return segments[1]?.toLowerCase() === 'reels'
                    ? 'Reels'
                    : segments[1]?.toLowerCase() === 'tagged'
                      ? 'Tagged'
                      : 'Posts';
            } catch (error) {
                return 'Posts';
            }
        }

        const pageUrl = window.location.href;
        const singleUrl = normalizeInstagramContentUrl(pageUrl);
        const profileHandle = getInstagramProfileHandle(pageUrl);
        let urls = [];

        if (singleUrl) {
            urls = [singleUrl];
        } else if (profileHandle) {
            const profileRoot = document.querySelector('main') || document;
            urls = Array.from(profileRoot.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]'))
                .map(anchor => normalizeInstagramContentUrl(anchor.href || anchor.getAttribute('href') || ''));
            urls = [...new Set(urls.filter(Boolean))];
        }

        const metaTitle = readMetaContent('meta[property="og:title"]');
        const title = cleanInstagramTitle(metaTitle || document.title);

        return {
            provider: 'instagram',
            providerLabel: 'Instagram',
            mode: singleUrl ? 'single' : urls.length ? 'list' : 'unknown',
            pageUrl,
            title,
            ownerName: profileHandle || cleanInstagramTitle(metaTitle) || 'instagram-profile',
            collectionName: getCollectionName(pageUrl),
            urls,
        };
    }

    globalThis.PineFetchLinkProviders = globalThis.PineFetchLinkProviders || [];
    globalThis.PineFetchLinkProviders.push({
        id: 'instagram',
        label: 'Instagram',
        matches: isInstagramUrl,
        normalizeContentUrl,
        getProfileHandle,
        cleanTitle,
        collectPageInfo,
        createFallbackPageInfo(tab) {
            const normalizedUrl = normalizeContentUrl(tab?.url || '');
            const handle = getProfileHandle(tab?.url || '');

            return {
                provider: 'instagram',
                providerLabel: 'Instagram',
                mode: normalizedUrl ? 'single' : 'unknown',
                pageUrl: tab?.url || '',
                title: cleanTitle(tab?.title || ''),
                ownerName: handle,
                collectionName: 'Posts',
                urls: normalizedUrl ? [normalizedUrl] : [],
            };
        },
    });
})();
