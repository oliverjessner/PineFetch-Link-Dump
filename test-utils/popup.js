'use strict';

const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const vm = require('node:vm');

async function loadPopupTestApi(overrides = {}) {
    const [source, { initOJ }] = await Promise.all([
        readFile(resolve('popup.js'), 'utf8'),
        import('oj-designsystem'),
    ]);
    // The extension imports its local vendor module; inject the installed
    // implementation so VM tests exercise the same public behavior.
    const popupSource = source.replace(/^import \{ initOJ \} from '\.\/vendor\/oj-designsystem\/index\.js';\r?\n/m, '');
    const context = {
        AbortController,
        Blob,
        URL,
        clearTimeout,
        setTimeout,
        document: { addEventListener() {} },
        globalThis: {},
        window: { clearTimeout, setTimeout },
        initOJ,
        ...overrides,
    };
    context.globalThis = context;

    vm.runInNewContext(
        `${popupSource}\n;globalThis.popupTestApi = {
            REQUEST_TIMEOUT_MS,
            analyzeCurrentTab,
            bindEvents,
            buildExportFilename,
            buildPineFetchRequestUrl,
            buildTxtFilename,
            createExportArtifact,
            createEmptyPageInfo,
            clearSecretValidation,
            cacheElements,
            escapeCsvCell,
            executePageAnalysis,
            exportPageInfo,
            exportTxt,
            formatLinkCount,
            getActiveTab,
            getModeLabel,
            getProviderForUrl,
            getSelectedExportFormat,
            getSendErrorState,
            getStoredSettings,
            getSupportedNetworkLabels,
            handleExportClick,
            handleSendClick,
            initDesignSystem,
            initPopup,
            normalizePageInfo,
            postToPineFetch,
            renderPageInfo,
            sanitizeFilename,
            saveStoredSettings,
            sendToPineFetch,
            setLoading,
            setBadge,
            setSendButtonState,
            setStatus,
            shortenUrl,
            switchPopupView,
            uniquePreserveOrder,
            updateExportButtonLabel,
            setElements(value) { Object.assign(elements, value); },
            setLoadingValue(value) { isLoading = value; },
            setCurrentPageInfo(value) { currentPageInfo = value; },
        };`,
        context,
        { filename: resolve('popup.js') },
    );

    return { api: context.popupTestApi, context };
}

function createClassList() {
    const values = new Set();
    return {
        values,
        add(value) { values.add(value); },
        remove(value) { values.delete(value); },
        toggle(value, enabled) {
            if (enabled) values.add(value);
            else values.delete(value);
        },
    };
}

function createPopupElements({ endpoint = 'http://127.0.0.1:2255', secret = 'secret' } = {}) {
    const makeElement = () => ({
        attributes: {},
        classList: createClassList(),
        className: '',
        dataset: {},
        disabled: false,
        focus() { this.focused = true; },
        getAttribute(name) { return this.attributes[name] ?? null; },
        removeAttribute(name) { delete this.attributes[name]; },
        setAttribute(name, value) { this.attributes[name] = value; },
        textContent: '',
    });
    const sendTab = makeElement();
    sendTab.dataset.ojView = 'send';
    const settingsTab = makeElement();
    settingsTab.dataset.ojView = 'settings';
    const sendPanel = { hidden: false };
    const settingsPanel = { hidden: true };
    const viewTabs = [sendTab, settingsTab];
    for (const tab of viewTabs) {
        tab.click = function () {
            for (const other of viewTabs) {
                const selected = other === this;
                other.setAttribute('aria-selected', String(selected));
                other.tabIndex = selected ? 0 : -1;
            }
            sendPanel.hidden = this !== sendTab;
            settingsPanel.hidden = this !== settingsTab;
        };
    }

    return {
        endpointInput: { ...makeElement(), value: endpoint },
        secretInput: { ...makeElement(), value: secret },
        secretError: { ...makeElement(), hidden: true },
        viewTabs,
        sendPanel,
        settingsPanel,
        sendButton: makeElement(),
        exportButton: makeElement(),
        exportFormatTrigger: { ...makeElement(), value: 'txt' },
        exportFormatDropdown: makeElement(),
        exportFormatMenu: { ...makeElement(), hidden: true },
        exportFormatLabel: { ...makeElement(), textContent: 'TXT' },
        exportFormatItems: ['txt', 'json', 'csv'].map(format => ({
            ...makeElement(),
            dataset: { ojValue: format },
            attributes: { 'aria-checked': String(format === 'txt') },
            textContent: format.toUpperCase(),
        })),
        stateBadge: makeElement(),
        statusMessage: makeElement(),
        feedbackPanel: makeElement(),
        previewMode: makeElement(),
        previewCount: makeElement(),
        previewLinks: {
            children: [],
            append(value) { this.children.push(value); },
            replaceChildren(...values) { this.children = values; },
        },
    };
}

async function loadPopupDomTestApi(overrides = {}) {
    const { JSDOM } = require('jsdom');
    const html = await readFile(resolve('popup.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'chrome-extension://popup-test/popup.html' });
    // Let jsdom finish its document event before loading the module. Tests
    // initialize explicitly once markup is available, as the popup does.
    if (dom.window.document.readyState === 'loading') {
        await new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    const { api, context } = await loadPopupTestApi({
        document: dom.window.document,
        navigator: dom.window.navigator,
        window: dom.window,
        ...overrides,
    });

    return {
        api,
        context,
        dom,
        document: dom.window.document,
        window: dom.window,
        dispose() {
            dom.window.dispatchEvent(new dom.window.Event('pagehide'));
            dom.window.close();
        },
    };
}

function createChromeMock(overrides = {}) {
    return {
        runtime: { lastError: null },
        storage: {
            local: {
                get(defaults, callback) { callback(defaults); },
                set(_value, callback) { callback(); },
            },
        },
        ...overrides,
    };
}

module.exports = { createChromeMock, createClassList, createPopupElements, loadPopupDomTestApi, loadPopupTestApi };
