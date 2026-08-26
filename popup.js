'use strict';

const DEFAULT_ENDPOINT_BASE = 'http://127.0.1:2255';
const SINGLE_LINK_PATH = '/addVideoLinkToQueue/';
const MULTI_LINK_PATH = '/addVideoLinksToQueue/';
const STORAGE_DEFAULTS = { endpointBase: DEFAULT_ENDPOINT_BASE, secret: '' };
const SEND_BUTTON_RESET_DELAY_MS = 3500;

let currentPageInfo = null;
let isLoading = false;
let saveSettingsTimer = null;
let sendFeedbackTimer = null;
const elements = {};

document.addEventListener('DOMContentLoaded', initPopup);

async function initPopup() {
    cacheElements();
    bindEvents();
    switchPopupView('send');
    renderSupportedNetworks();
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
    elements.viewTabs = Array.from(document.querySelectorAll('[data-popup-view]'));
    elements.sendPanel = document.getElementById('pfSendPanel');
    elements.settingsPanel = document.getElementById('pfSettingsPanel');
    elements.supportedNetworks = document.getElementById('pfSupportedNetworks');
    elements.sendButton = document.getElementById('pfSendButton');
    elements.exportButton = document.getElementById('pfExportButton');
    elements.stateBadge = document.getElementById('pfStateBadge');
    elements.previewMode = document.getElementById('pfPreviewMode');
    elements.previewCount = document.getElementById('pfPreviewCount');
    elements.previewLinks = document.getElementById('pfPreviewLinks');
    elements.statusMessage = document.getElementById('pfStatusMessage');
    elements.feedbackPanel = document.getElementById('pfFeedbackPanel');
    elements.versionLabel = document.getElementById('pfVersionLabel');
}

function bindEvents() {
    for (const tab of elements.viewTabs) {
        tab.addEventListener('click', handleViewTabClick);
        tab.addEventListener('keydown', handleViewTabKeydown);
    }

    elements.endpointInput.addEventListener('input', scheduleSettingsSave);
    elements.secretInput.addEventListener('input', scheduleSettingsSave);
    elements.secretInput.addEventListener('input', clearSecretValidation);
    elements.endpointInput.addEventListener('change', persistCurrentSettings);
    elements.secretInput.addEventListener('change', persistCurrentSettings);
    elements.sendButton.addEventListener('click', handleSendClick);
    elements.exportButton.addEventListener('click', handleExportClick);
    elements.previewMode.addEventListener('click', copyCurrentPreviewLinks);
    elements.previewMode.addEventListener('keydown', handlePreviewModeCopyKeydown);
}

function handleViewTabClick(event) {
    switchPopupView(event.currentTarget.dataset.popupView);
}

function handleViewTabKeydown(event) {
    const supportedKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!supportedKeys.includes(event.key)) return;

    event.preventDefault();
    const currentIndex = elements.viewTabs.indexOf(event.currentTarget);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + elements.viewTabs.length) % elements.viewTabs.length;
    }
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % elements.viewTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = elements.viewTabs.length - 1;

    switchPopupView(elements.viewTabs[nextIndex].dataset.popupView, true);
}

function switchPopupView(view, focusTab = false) {
    if (!['send', 'settings'].includes(view)) return;

    for (const tab of elements.viewTabs) {
        const isActive = tab.dataset.popupView === view;
        tab.classList.toggle('pf-is-active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
        tab.tabIndex = isActive ? 0 : -1;

        if (isActive && focusTab) tab.focus();
    }

    elements.sendPanel.hidden = view !== 'send';
    elements.settingsPanel.hidden = view !== 'settings';
}

function getSupportedNetworkLabels(providers = globalThis.PineFetchLinkProviders || []) {
    return providers
        .filter(provider => provider.id !== 'standard-video')
        .map(provider => String(provider.label || '').trim())
        .filter(Boolean);
}

function renderSupportedNetworks() {
    const badges = getSupportedNetworkLabels().map(label => {
        const badge = document.createElement('span');
        badge.className = 'pf-badge pf-non-select';
        badge.textContent = label;
        return badge;
    });

    elements.supportedNetworks.replaceChildren(...badges);
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
    clearSendFeedbackTimer();
    setLoading(true, 'send');
    setSendButtonState('checking');
    setBadge('Sending');
    setStatus('Checking the current page...');

    try {
        await persistCurrentSettings();
        const pageInfo = await analyzeCurrentTab();
        const linkCount = uniquePreserveOrder(pageInfo.urls || []).length;

        if (linkCount) {
            setSendButtonState('sending', linkCount);
            setStatus(`Sending ${formatLinkCount(linkCount)} to PineFetch...`);
        }

        const result = await sendToPineFetch(pageInfo);
        setSendButtonState(result.ok ? 'success' : getSendErrorState(result.reason), linkCount);
    } catch (error) {
        setBadge('Error', 'danger');
        setStatus('Something went wrong. Please try again.', 'error');
        setSendButtonState('error');
    } finally {
        setLoading(false, 'send');
        scheduleSendButtonReset();
    }
}

async function handleExportClick() {
    setLoading(true, 'export');
    elements.exportButton.textContent = 'Exporting...';
    setStatus('Preparing the TXT export...');

    try {
        const pageInfo = await analyzeCurrentTab();

        if (!pageInfo.urls.length) {
            setStatus(`No ${pageInfo.providerLabel} links found.`, 'error');
            setBadge('Error', 'danger');
            return;
        }

        await exportTxt(pageInfo);
    } finally {
        setLoading(false, 'export');
        elements.exportButton.textContent = 'Export TXT';
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

    if (elements.feedbackPanel) {
        elements.feedbackPanel.dataset.status = type;
    }
}

function setBadge(label, type = 'default') {
    elements.stateBadge.textContent = label;
    elements.stateBadge.className = 'pf-badge pf-non-select';
    if (type !== 'default') elements.stateBadge.classList.add(`pf-badge-${type}`);
}

function setLoading(loading, action = '') {
    isLoading = loading;
    elements.sendButton.disabled = loading;
    elements.exportButton.disabled = loading;
    elements.sendButton.classList.toggle('pf-btn-loading', loading && action === 'send');
    elements.exportButton.classList.toggle('pf-btn-loading', loading && action === 'export');
    elements.sendButton.setAttribute('aria-busy', String(loading && action === 'send'));
    elements.exportButton.setAttribute('aria-busy', String(loading && action === 'export'));
}

function setSendButtonState(state, count = 0) {
    const labels = {
        default: 'Send to PineFetch',
        checking: 'Checking page...',
        sending: `Sending ${formatLinkCount(count)}...`,
        success: `✓ Queued ${formatLinkCount(count)}`,
        secret: 'Enter secret',
        empty: 'No links found',
        error: 'Try again',
    };

    elements.sendButton.textContent = labels[state] || labels.default;
    elements.sendButton.dataset.state = state;
    elements.sendButton.classList.toggle('pf-send-success', state === 'success');
    elements.sendButton.classList.toggle('pf-send-error', ['secret', 'empty', 'error'].includes(state));
}

function getSendErrorState(reason) {
    if (reason === 'secret') return 'secret';
    if (reason === 'no-links') return 'empty';
    return 'error';
}

function formatLinkCount(count) {
    return `${count} ${count === 1 ? 'link' : 'links'}`;
}

function clearSendFeedbackTimer() {
    window.clearTimeout(sendFeedbackTimer);
    sendFeedbackTimer = null;
}

function scheduleSendButtonReset() {
    clearSendFeedbackTimer();
    sendFeedbackTimer = window.setTimeout(() => {
        if (!isLoading) setSendButtonState('default');
    }, SEND_BUTTON_RESET_DELAY_MS);
}

function clearSecretValidation() {
    elements.secretInput.removeAttribute('aria-invalid');

    if (elements.sendButton?.dataset.state === 'secret') {
        clearSendFeedbackTimer();
        setSendButtonState('default');
    }
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
        switchPopupView('settings');
        elements.secretInput.setAttribute('aria-invalid', 'true');
        elements.secretInput.focus();
        setBadge('Error', 'danger');
        setStatus('Enter your PineFetch secret, then try again.', 'error');
        return { ok: false, reason: 'secret' };
    }

    elements.secretInput.removeAttribute('aria-invalid');

    const urls = uniquePreserveOrder(pageInfo?.urls || []);

    if (!urls.length) {
        setBadge('Error', 'danger');
        setStatus('No video links found. Scroll the page to load more, then try again.', 'error');
        return { ok: false, reason: 'no-links' };
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
            response.reason === 'http'
                ? `PineFetch rejected the request${response.status ? ` (HTTP ${response.status})` : ''}.`
                : `Could not reach PineFetch at ${endpointBase}. Is it running?`,
            'error',
        );
        return response;
    }

    setBadge('Queued');
    setStatus(`${formatLinkCount(urls.length)} queued successfully in PineFetch.`, 'success');
    return { ok: true, count: urls.length };
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
