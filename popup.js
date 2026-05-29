'use strict';

const DEFAULT_ENDPOINT_BASE = 'http://127.0.1:2255';
const SINGLE_LINK_PATH = '/addYoutubeLinkToQueue/';
const MULTI_LINK_PATH = '/addYoutubeLinksToQueue/';
const STORAGE_DEFAULTS = {
    endpointBase: DEFAULT_ENDPOINT_BASE,
    secret: '',
};

let currentPageInfo = null;
let isLoading = false;
let saveSettingsTimer = null;

const elements = {};

document.addEventListener('DOMContentLoaded', initPopup);

async function initPopup() {
    cacheElements();
    bindEvents();
    setBadge('Idle', 'muted');
    setStatus('Ready.');
    setVersionLabel(await loadPackageVersion());

    const settings = await getStoredSettings();
    elements.endpointInput.value = settings.endpointBase || DEFAULT_ENDPOINT_BASE;
    elements.secretInput.value = settings.secret || '';

    currentPageInfo = await analyzeCurrentTab();
}

function cacheElements() {
    elements.endpointInput = document.getElementById('pfEndpointInput');
    elements.secretInput = document.getElementById('pfSecretInput');
    elements.sendButton = document.getElementById('pfSendButton');
    elements.exportButton = document.getElementById('pfExportButton');
    elements.stateBadge = document.getElementById('pfStateBadge');
    elements.previewMode = document.getElementById('pfPreviewMode');
    elements.previewCount = document.getElementById('pfPreviewCount');
    elements.previewLinks = document.getElementById('pfPreviewLinks');
    elements.statusMessage = document.getElementById('pfStatusMessage');
    elements.versionLabel = document.getElementById('pfVersionLabel');
}

function bindEvents() {
    elements.endpointInput.addEventListener('input', scheduleSettingsSave);
    elements.secretInput.addEventListener('input', scheduleSettingsSave);
    elements.endpointInput.addEventListener('change', persistCurrentSettings);
    elements.secretInput.addEventListener('change', persistCurrentSettings);
    elements.sendButton.addEventListener('click', handleSendClick);
    elements.exportButton.addEventListener('click', handleExportClick);
}

function scheduleSettingsSave() {
    window.clearTimeout(saveSettingsTimer);
    saveSettingsTimer = window.setTimeout(persistCurrentSettings, 200);
}

async function persistCurrentSettings() {
    window.clearTimeout(saveSettingsTimer);
    await saveStoredSettings({
        endpointBase: elements.endpointInput.value.trim() || DEFAULT_ENDPOINT_BASE,
        secret: elements.secretInput.value,
    });
}

async function handleSendClick() {
    setLoading(true);
    setStatus('Working...');

    try {
        await persistCurrentSettings();
        const pageInfo = await analyzeCurrentTab();
        await sendToPineFetch(pageInfo);
    } finally {
        setLoading(false);
    }
}

async function handleExportClick() {
    setLoading(true);
    setStatus('Working...');

    try {
        const pageInfo = await analyzeCurrentTab();

        if (!pageInfo.urls.length) {
            if (isYoutubeTabUrl(pageInfo.pageUrl)) {
                setStatus('No YouTube links found.', 'error');
            } else {
                setStatus('No links found.', 'error');
            }
            setBadge('Error', 'danger');
            return;
        }

        await exportTxt(pageInfo);
    } finally {
        setLoading(false);
    }
}

function setStatus(message, type = 'default') {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = 'pf-status';

    if (type === 'success') {
        elements.statusMessage.classList.add('pf-status-success');
    }

    if (type === 'error') {
        elements.statusMessage.classList.add('pf-status-error');
    }

    if (type === 'warning') {
        elements.statusMessage.classList.add('pf-status-warning');
    }
}

function setBadge(label, type = 'default') {
    elements.stateBadge.textContent = label;
    elements.stateBadge.className = 'pf-badge pf-non-select';

    if (type === 'muted') {
        elements.stateBadge.classList.add('pf-badge-muted');
    }

    if (type === 'warning') {
        elements.stateBadge.classList.add('pf-badge-warning');
    }

    if (type === 'danger') {
        elements.stateBadge.classList.add('pf-badge-danger');
    }
}

function setLoading(loading) {
    isLoading = loading;
    elements.sendButton.disabled = loading;
    elements.exportButton.disabled = loading;
    elements.sendButton.classList.toggle('pf-btn-loading', loading);
    elements.sendButton.setAttribute('aria-busy', String(loading));
    elements.exportButton.setAttribute('aria-busy', String(loading));
}

function setVersionLabel(version) {
    elements.versionLabel.textContent = version ? `v${version}` : '';
}

async function loadPackageVersion() {
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            const response = await fetch(chrome.runtime.getURL('package.json'), {
                cache: 'no-store',
            });

            if (response.ok) {
                const packageData = await response.json();
                const packageVersion = String(packageData.version || '').trim();

                if (packageVersion) {
                    return packageVersion;
                }
            }
        }
    } catch (error) {
        // Fall back to the manifest version when package.json is not readable.
    }

    try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
            return chrome.runtime.getManifest().version || '';
        }
    } catch (error) {
        return '';
    }

    return '';
}

async function getActiveTab() {
    const tabs = await new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, result => {
            resolve(result || []);
        });
    });

    return tabs[0] || null;
}

async function analyzeCurrentTab() {
    const tab = await getActiveTab();

    if (!tab || !tab.id || !isYoutubeTabUrl(tab.url)) {
        const pageInfo = createEmptyPageInfo(tab);
        renderPageInfo(pageInfo);

        if (!isLoading) {
            setBadge('Idle', 'muted');
            setStatus('No YouTube tab detected.', 'warning');
        }

        currentPageInfo = pageInfo;
        return pageInfo;
    }

    try {
        const results = await executePageAnalysis(tab.id);
        const pageInfo = normalizePageInfo(results?.[0]?.result, tab);
        renderPageInfo(pageInfo);
        setAnalysisState(pageInfo);
        currentPageInfo = pageInfo;
        return pageInfo;
    } catch (error) {
        const pageInfo = createFallbackPageInfo(tab);
        renderPageInfo(pageInfo);

        if (pageInfo.urls.length) {
            setAnalysisState(pageInfo);
        } else {
            setBadge('Error', 'danger');
            setStatus('No links found.', 'error');
        }

        currentPageInfo = pageInfo;
        return pageInfo;
    }
}

function executePageAnalysis(tabId) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                func: collectYoutubePageInfo,
            },
            results => {
                const runtimeError = chrome.runtime.lastError;

                if (runtimeError) {
                    reject(runtimeError);
                    return;
                }

                resolve(results || []);
            },
        );
    });
}

function createEmptyPageInfo(tab) {
    return {
        mode: 'unknown',
        pageUrl: tab?.url || '',
        title: tab?.title || '',
        channelName: '',
        activeTabName: '',
        urls: [],
        count: 0,
    };
}

function createFallbackPageInfo(tab) {
    const normalizedUrl = normalizeSingleYoutubeVideoUrl(tab.url || '');
    const urls = normalizedUrl ? [normalizedUrl] : [];

    return {
        mode: urls.length ? 'single' : 'unknown',
        pageUrl: tab.url || '',
        title: cleanYoutubeTitle(tab.title || ''),
        channelName: '',
        activeTabName: '',
        urls,
        count: urls.length,
    };
}

function normalizePageInfo(value, tab) {
    const urls = uniquePreserveOrder(Array.isArray(value?.urls) ? value.urls : []);
    const mode = value?.mode === 'single' || value?.mode === 'list' ? value.mode : 'unknown';

    return {
        mode,
        pageUrl: value?.pageUrl || tab.url || '',
        title: cleanYoutubeTitle(value?.title || tab.title || ''),
        channelName: value?.channelName || '',
        activeTabName: value?.activeTabName || '',
        urls,
        count: urls.length,
    };
}

function setAnalysisState(pageInfo) {
    if (isLoading) {
        return;
    }

    if (pageInfo.mode === 'single' && pageInfo.urls.length === 1) {
        setBadge('Video');
        setStatus('Ready.', 'success');
        return;
    }

    if (pageInfo.mode === 'list' && pageInfo.urls.length > 0) {
        setBadge('List');
        setStatus('Ready.', 'success');
        return;
    }

    if (isYoutubeTabUrl(pageInfo.pageUrl)) {
        setBadge('Ready', 'warning');
        setStatus('No YouTube links found. Scroll the page to load more videos.', 'warning');
        return;
    }

    setBadge('Idle', 'muted');
    setStatus('No YouTube tab detected.', 'warning');
}

function renderPageInfo(pageInfo) {
    const modeLabel = getModeLabel(pageInfo);
    elements.previewMode.textContent = modeLabel;
    elements.previewMode.className = 'pf-badge pf-non-select';

    if (pageInfo.mode === 'unknown') {
        elements.previewMode.classList.add('pf-badge-muted');
    }

    elements.previewCount.textContent = String(pageInfo.urls.length);
    elements.previewLinks.replaceChildren();

    if (!pageInfo.urls.length) {
        const message = document.createElement('p');
        message.className = 'pf-status';
        message.textContent = 'No links found.';
        elements.previewLinks.append(message);
        return;
    }

    for (const url of pageInfo.urls.slice(0, 3)) {
        const line = document.createElement('p');
        line.className = 'pf-status pf-truncate';
        line.textContent = shortenUrl(url);
        line.title = url;
        elements.previewLinks.append(line);
    }
}

function getModeLabel(pageInfo) {
    if (pageInfo.mode === 'single') {
        return 'Single video';
    }

    if (pageInfo.mode === 'list') {
        return 'Link list';
    }

    return 'No YouTube page';
}

function shortenUrl(url) {
    if (url.length <= 72) {
        return url;
    }

    return `${url.slice(0, 44)}...${url.slice(-20)}`;
}

function collectYoutubePageInfo() {
    function isYoutubeTabUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname === 'www.youtube.com' || parsed.hostname === 'youtu.be';
        } catch (error) {
            return false;
        }
    }

    function isSingleYoutubeVideoUrl(url) {
        return Boolean(normalizeSingleYoutubeVideoUrl(url));
    }

    function normalizeYoutubeUrl(url) {
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

            if (!videoId) {
                return null;
            }

            return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
        } catch (error) {
            return null;
        }
    }

    function normalizeSingleYoutubeVideoUrl(url) {
        if (!isYoutubeTabUrl(url)) {
            return null;
        }

        return normalizeYoutubeUrl(url);
    }

    function uniquePreserveOrder(values) {
        const seen = new Set();
        const uniqueValues = [];

        for (const value of values) {
            if (!value || seen.has(value)) {
                continue;
            }

            seen.add(value);
            uniqueValues.push(value);
        }

        return uniqueValues;
    }

    function extractYoutubeLinksFromAnchors() {
        const selectors = [
            'ytd-rich-item-renderer a',
            'ytd-grid-video-renderer a',
            'ytd-video-renderer a',
            "a.yt-simple-endpoint[href*='/watch']",
            "a.yt-simple-endpoint[href*='/shorts/']",
            "a.yt-simple-endpoint[href*='/live/']",
            'a#thumbnail',
        ];
        const anchors = document.querySelectorAll(selectors.join(','));
        const urls = Array.from(anchors)
            .map(anchor => anchor.href || anchor.getAttribute('href') || '')
            .map(normalizeYoutubeUrl)
            .filter(Boolean);

        return uniquePreserveOrder(urls);
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

    function getVideoTitle() {
        return cleanYoutubeTitle(
            readFirstText([
                'h1.ytd-watch-metadata yt-formatted-string',
                'h1.title yt-formatted-string',
                'h1 yt-formatted-string',
                'h1',
            ]) ||
                readMetaContent('meta[property="og:title"]') ||
                document.title,
        );
    }

    function getActiveTabName(pageUrl) {
        const selectedTabName = document
            .querySelector('yt-tab-shape[aria-selected="true"] .ytTabShapeTab')
            ?.textContent?.trim();

        if (selectedTabName) {
            return selectedTabName;
        }

        try {
            const parsed = new URL(pageUrl);
            const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() || '';
            const tabNames = {
                streams: 'Streams',
                videos: 'Videos',
                shorts: 'Shorts',
                live: 'Live',
            };

            return tabNames[lastSegment] || '';
        } catch (error) {
            return '';
        }
    }

    function getHandleFromUrl(pageUrl) {
        try {
            const parsed = new URL(pageUrl);
            const handle = parsed.pathname.split('/').find(segment => segment.startsWith('@'));
            return handle ? handle.replace(/^@/, '') : '';
        } catch (error) {
            return '';
        }
    }

    function getChannelName(pageUrl) {
        const visibleChannelName = readFirstText([
            'ytd-channel-name #text',
            '#channel-name #text',
            '#owner #channel-name a',
            'yt-page-header-renderer yt-dynamic-text-view-model h1',
            'yt-page-header-renderer h1',
            'ytd-c4-tabbed-header-renderer #channel-name',
            'ytd-channel-header-renderer #channel-name',
        ]);
        const metaTitle = cleanYoutubeTitle(readMetaContent('meta[property="og:title"]'));
        const pageTitle = cleanYoutubeTitle(document.title);
        const handle = getHandleFromUrl(pageUrl);

        return visibleChannelName || metaTitle || pageTitle || handle || 'youtube-channel';
    }

    const pageUrl = window.location.href;
    const singleUrl = normalizeSingleYoutubeVideoUrl(pageUrl);
    const mode = singleUrl ? 'single' : 'list';
    const urls = singleUrl ? [singleUrl] : extractYoutubeLinksFromAnchors();
    const finalMode = singleUrl ? mode : urls.length ? 'list' : 'unknown';
    const title = singleUrl
        ? getVideoTitle()
        : cleanYoutubeTitle(readMetaContent('meta[property="og:title"]') || document.title);

    return {
        mode: finalMode,
        pageUrl,
        title,
        channelName: getChannelName(pageUrl),
        activeTabName: getActiveTabName(pageUrl),
        urls,
        count: urls.length,
    };
}

function isSingleYoutubeVideoUrl(url) {
    return Boolean(normalizeSingleYoutubeVideoUrl(url));
}

function normalizeYoutubeUrl(url) {
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

        if (!videoId) {
            return null;
        }

        return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    } catch (error) {
        return null;
    }
}

function normalizeSingleYoutubeVideoUrl(url) {
    if (!isYoutubeTabUrl(url)) {
        return null;
    }

    return normalizeYoutubeUrl(url);
}

function extractYoutubeLinksFromAnchors() {
    const anchors = document.querySelectorAll(
        'ytd-rich-item-renderer a, ytd-grid-video-renderer a, ytd-video-renderer a, a#thumbnail',
    );
    const urls = Array.from(anchors)
        .map(anchor => anchor.href || anchor.getAttribute('href') || '')
        .map(normalizeYoutubeUrl)
        .filter(Boolean);

    return uniquePreserveOrder(urls);
}

function uniquePreserveOrder(values) {
    const seen = new Set();
    const uniqueValues = [];

    for (const value of values) {
        if (!value || seen.has(value)) {
            continue;
        }

        seen.add(value);
        uniqueValues.push(value);
    }

    return uniqueValues;
}

function sanitizeFilename(value) {
    let filename = String(value || '')
        .trim()
        .replace(/\.txt$/i, '')
        .replace(/[\/\\:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[.\s-]+|[.\s-]+$/g, '');

    if (!filename) {
        filename = 'youtube-links';
    }

    return `${filename}.txt`;
}

function buildTxtFilename(pageInfo) {
    if (pageInfo.mode === 'single') {
        return sanitizeFilename(pageInfo.title || 'youtube-video');
    }

    const channelName = pageInfo.channelName || 'youtube-channel';
    const activeTabName = pageInfo.activeTabName || 'Links';
    return sanitizeFilename(`${channelName}-${activeTabName}`);
}

async function exportTxt(pageInfo) {
    const urls = uniquePreserveOrder(pageInfo?.urls || []);

    if (!urls.length) {
        throw new Error('NO_LINKS');
    }

    const content = `${urls.join('\n')}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);

    try {
        await new Promise((resolve, reject) => {
            chrome.downloads.download(
                {
                    url: objectUrl,
                    filename: buildTxtFilename(pageInfo),
                    saveAs: true,
                    conflictAction: 'uniquify',
                },
                downloadId => {
                    const runtimeError = chrome.runtime.lastError;

                    if (runtimeError || typeof downloadId === 'undefined') {
                        reject(runtimeError || new Error('Download failed'));
                        return;
                    }

                    resolve(downloadId);
                },
            );
        });

        setBadge('Ready');
        setStatus(`Exported ${urls.length} ${urls.length === 1 ? 'link' : 'links'}.`, 'success');
    } catch (error) {
        setBadge('Error', 'danger');
        setStatus('Export failed.', 'error');
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
}

async function sendToPineFetch(pageInfo) {
    const settings = await getStoredSettings();
    const endpointBase = elements.endpointInput.value.trim() || settings.endpointBase || DEFAULT_ENDPOINT_BASE;
    const secret = elements.secretInput.value || settings.secret || '';

    if (!secret.trim()) {
        setBadge('Error', 'danger');
        setStatus('Please enter your PineFetch secret.', 'error');
        return;
    }

    const urls = uniquePreserveOrder(pageInfo?.urls || []);

    if (!urls.length) {
        setBadge('Error', 'danger');
        setStatus('No YouTube links found.', 'error');
        return;
    }

    const isSingle = pageInfo.mode === 'single';
    const path = isSingle ? SINGLE_LINK_PATH : MULTI_LINK_PATH;
    const payload = isSingle ? { url: urls[0], secret } : { urls, secret };
    const response = await postToPineFetch(endpointBase, path, payload);

    if (!response.ok) {
        setBadge('Error', 'danger');

        if (response.reason === 'http') {
            setStatus('PineFetch rejected the request.', 'error');
        } else {
            setStatus('Could not connect to PineFetch.', 'error');
        }

        return;
    }

    setBadge('Ready');
    setStatus(`Sent ${urls.length} ${urls.length === 1 ? 'link' : 'links'} to PineFetch.`, 'success');
}

async function postToPineFetch(endpointBase, path, payload) {
    let requestUrl;

    try {
        requestUrl = buildPineFetchRequestUrl(endpointBase, path);
    } catch (error) {
        return { ok: false, reason: 'network' };
    }

    try {
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        let data = null;
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (error) {
                data = null;
            }
        } else {
            try {
                const text = await response.text();
                data = text ? { text } : null;
            } catch (error) {
                data = null;
            }
        }

        if (!response.ok) {
            return {
                ok: false,
                reason: 'http',
                status: response.status,
                data,
            };
        }

        return {
            ok: true,
            status: response.status,
            data,
        };
    } catch (error) {
        return { ok: false, reason: 'network' };
    }
}

async function getStoredSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(STORAGE_DEFAULTS, result => {
            const runtimeError = chrome.runtime.lastError;

            if (runtimeError) {
                resolve({ ...STORAGE_DEFAULTS });
                return;
            }

            resolve({
                endpointBase: result.endpointBase || DEFAULT_ENDPOINT_BASE,
                secret: result.secret || '',
            });
        });
    });
}

async function saveStoredSettings(settings) {
    return new Promise(resolve => {
        chrome.storage.local.set(
            {
                endpointBase: settings.endpointBase || DEFAULT_ENDPOINT_BASE,
                secret: settings.secret || '',
            },
            () => {
                resolve();
            },
        );
    });
}

function buildPineFetchRequestUrl(endpointBase, path) {
    const base = String(endpointBase || DEFAULT_ENDPOINT_BASE).trim();
    const parsedBase = new URL(base);
    const allowedHosts = new Set(['127.0.1', '127.0.0.1', 'localhost']);

    if (parsedBase.protocol !== 'http:' || !allowedHosts.has(parsedBase.hostname)) {
        throw new Error('Invalid PineFetch endpoint');
    }

    const cleanBase = `${parsedBase.origin}${parsedBase.pathname.replace(/\/+$/, '')}`;
    const cleanPath = `/${String(path || '').replace(/^\/+/, '')}`;
    return `${cleanBase}${cleanPath}`;
}

function isYoutubeTabUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'www.youtube.com' || parsed.hostname === 'youtu.be';
    } catch (error) {
        return false;
    }
}

function cleanYoutubeTitle(value) {
    return String(value || '')
        .replace(/\s+-\s+YouTube\s*$/i, '')
        .replace(/\s*-\s*YouTube\s*$/i, '')
        .trim();
}
