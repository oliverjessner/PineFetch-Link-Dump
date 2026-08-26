'use strict';

const DEFAULT_ENDPOINT_BASE = 'http://127.0.1:2255';
const SINGLE_LINK_PATH = '/addVideoLinkToQueue/';
const MULTI_LINK_PATH = '/addVideoLinksToQueue/';
const STORAGE_DEFAULTS = { endpointBase: DEFAULT_ENDPOINT_BASE, secret: '' };

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
    elements.previewMode.addEventListener('click', copyCurrentPreviewLinks);
    elements.previewMode.addEventListener('keydown', handlePreviewModeCopyKeydown);
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
        await sendToPineFetch(await analyzeCurrentTab());
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
            setStatus(`No ${pageInfo.providerLabel} links found.`, 'error');
            setBadge('Error', 'danger');
            return;
        }

        await exportTxt(pageInfo);
    } finally {
        setLoading(false);
    }
}

async function handlePreviewModeCopyKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    await copyCurrentPreviewLinks();
}

async function copyCurrentPreviewLinks() {
    const urls = uniquePreserveOrder(currentPageInfo?.urls || []);

    if (!urls.length) {
        setStatus('No links to copy.', 'warning');
        return;
    }

    try {
        await writeTextToClipboard(urls.join('\n'));
        setStatus(`Copied ${urls.length} ${urls.length === 1 ? 'link' : 'links'} to clipboard.`, 'success');
    } catch (error) {
        setStatus('Copy failed.', 'error');
    }
}

async function writeTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            // Fall back to the textarea copy path below.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.append(textarea);
    textarea.select();

    try {
        if (!document.execCommand('copy')) throw new Error('Clipboard copy failed');
    } finally {
        textarea.remove();
    }
}

function setStatus(message, type = 'default') {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = 'pf-status';
    if (type !== 'default') elements.statusMessage.classList.add(`pf-status-${type}`);
}

function setBadge(label, type = 'default') {
    elements.stateBadge.textContent = label;
    elements.stateBadge.className = 'pf-badge pf-non-select';
    if (type !== 'default') elements.stateBadge.classList.add(`pf-badge-${type}`);
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
        const response = await fetch(chrome.runtime.getURL('package.json'), { cache: 'no-store' });

        if (response.ok) {
            const version = String((await response.json()).version || '').trim();
            if (version) return version;
        }
    } catch (error) {
        // Fall back to the manifest version below.
    }

    try {
        return chrome.runtime.getManifest().version || '';
    } catch (error) {
        return '';
    }
}

async function getActiveTab() {
    const tabs = await new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, result => resolve(result || []));
    });
    return tabs[0] || null;
}

function getProviderForUrl(url) {
    return (globalThis.PineFetchLinkProviders || []).find(provider => provider.matches(url)) || null;
}

async function analyzeCurrentTab() {
    const tab = await getActiveTab();
    const provider = getProviderForUrl(tab?.url || '');

    if (!tab || typeof tab.id !== 'number' || !provider) {
        const pageInfo = createEmptyPageInfo(tab, provider);
        renderPageInfo(pageInfo);

        if (!isLoading) {
            setBadge('Idle', 'muted');
            setStatus('No tab detected.', 'warning');
        }

        currentPageInfo = pageInfo;
        return pageInfo;
    }

    try {
        const results = await executePageAnalysis(tab.id, provider.collectPageInfo);
        const pageInfo = normalizePageInfo(results?.[0]?.result, tab, provider);
        renderPageInfo(pageInfo);
        setAnalysisState(pageInfo);
        currentPageInfo = pageInfo;
        return pageInfo;
    } catch (error) {
        const pageInfo = normalizePageInfo(provider.createFallbackPageInfo(tab), tab, provider);
        renderPageInfo(pageInfo);

        if (pageInfo.urls.length) {
            setAnalysisState(pageInfo);
        } else {
            setBadge('Error', 'danger');
            setStatus(`No ${provider.label} links found.`, 'error');
        }

        currentPageInfo = pageInfo;
        return pageInfo;
    }
}

function executePageAnalysis(tabId, collectPageInfo) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript({ target: { tabId }, func: collectPageInfo }, results => {
            const runtimeError = chrome.runtime.lastError;

            if (runtimeError) {
                reject(runtimeError);
                return;
            }

            resolve(results || []);
        });
    });
}

function createEmptyPageInfo(tab, provider) {
    return {
        provider: provider?.id || 'unknown',
        providerLabel: provider?.label || 'video',
        mode: 'unknown',
        pageUrl: tab?.url || '',
        title: tab?.title || '',
        ownerName: '',
        collectionName: 'Videos',
        urls: [],
        count: 0,
    };
}

function normalizePageInfo(value, tab, provider) {
    const urls = uniquePreserveOrder(Array.isArray(value?.urls) ? value.urls : []);

    return {
        provider: value?.provider || provider.id,
        providerLabel: value?.providerLabel || provider.label,
        mode: urls.length && (value?.mode === 'single' || value?.mode === 'list') ? value.mode : 'unknown',
        pageUrl: value?.pageUrl || tab?.url || '',
        title: String(value?.title || tab?.title || '').trim(),
        ownerName: String(value?.ownerName || '').trim(),
        collectionName: String(value?.collectionName || 'Videos').trim(),
        urls,
        count: urls.length,
    };
}

function setAnalysisState(pageInfo) {
    if (isLoading) return;

    if ((pageInfo.mode === 'single' || pageInfo.mode === 'list') && pageInfo.urls.length) {
        setBadge(pageInfo.providerLabel);
        setStatus('Ready.', 'success');
        return;
    }

    setBadge('Ready', 'warning');
    setStatus(`No ${pageInfo.providerLabel} links found. Scroll the page to load more videos.`, 'warning');
}

function renderPageInfo(pageInfo) {
    elements.previewMode.textContent = getModeLabel(pageInfo);
    elements.previewMode.className = 'pf-badge pf-non-select pf-copy-badge';
    elements.previewMode.setAttribute('aria-disabled', String(!pageInfo.urls.length));
    elements.previewMode.tabIndex = pageInfo.urls.length ? 0 : -1;
    elements.previewMode.title = pageInfo.urls.length ? 'Copy links to clipboard' : 'No links to copy';

    if (pageInfo.urls.length) {
        elements.previewMode.setAttribute('role', 'button');
        elements.previewMode.setAttribute(
            'aria-label',
            `Copy ${pageInfo.urls.length} ${pageInfo.urls.length === 1 ? 'link' : 'links'} to clipboard`,
        );
    } else {
        elements.previewMode.removeAttribute('role');
        elements.previewMode.removeAttribute('aria-label');
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
    if (pageInfo.mode === 'single') return `${pageInfo.providerLabel} video`;
    if (pageInfo.mode === 'list') return `${pageInfo.providerLabel} list`;
    return 'No links';
}

function shortenUrl(url) {
    return url.length <= 72 ? url : `${url.slice(0, 44)}...${url.slice(-20)}`;
}

function uniquePreserveOrder(values) {
    return [...new Set(values.filter(Boolean))];
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

    if (!filename) filename = 'video-links';
    return `${filename}.txt`;
}

function buildTxtFilename(pageInfo) {
    if (pageInfo.mode === 'single') {
        return sanitizeFilename(pageInfo.title || `${pageInfo.provider}-video`);
    }

    return sanitizeFilename(
        `${pageInfo.ownerName || `${pageInfo.provider}-profile`}-${pageInfo.collectionName || 'Videos'}`,
    );
}

async function exportTxt(pageInfo) {
    const urls = uniquePreserveOrder(pageInfo?.urls || []);
    if (!urls.length) throw new Error('NO_LINKS');

    const content = `${urls.join('\n')}\n`;
    const objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));

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
        setStatus('No links found.', 'error');
        return;
    }

    const isSingle = pageInfo.mode === 'single';
    const response = await postToPineFetch(
        endpointBase,
        isSingle ? SINGLE_LINK_PATH : MULTI_LINK_PATH,
        isSingle ? { url: urls[0], secret } : { urls, secret },
    );

    if (!response.ok) {
        setBadge('Error', 'danger');
        setStatus(
            response.reason === 'http' ? 'PineFetch rejected the request.' : 'Could not connect to PineFetch.',
            'error',
        );
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        let data = null;

        try {
            data = (response.headers.get('content-type') || '').includes('application/json')
                ? await response.json()
                : { text: await response.text() };
        } catch (error) {
            data = null;
        }

        return response.ok
            ? { ok: true, status: response.status, data }
            : { ok: false, reason: 'http', status: response.status, data };
    } catch (error) {
        return { ok: false, reason: 'network' };
    }
}

async function getStoredSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(STORAGE_DEFAULTS, result => {
            if (chrome.runtime.lastError) {
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
            resolve,
        );
    });
}

function buildPineFetchRequestUrl(endpointBase, path) {
    const parsedBase = new URL(String(endpointBase || DEFAULT_ENDPOINT_BASE).trim());
    const allowedHosts = new Set(['127.0.1', '127.0.0.1', 'localhost']);

    if (parsedBase.protocol !== 'http:' || !allowedHosts.has(parsedBase.hostname)) {
        throw new Error('Invalid PineFetch endpoint');
    }

    const cleanBase = `${parsedBase.origin}${parsedBase.pathname.replace(/\/+$/, '')}`;
    const cleanPath = `/${String(path || '').replace(/^\/+/, '')}`;
    return `${cleanBase}${cleanPath}`;
}
