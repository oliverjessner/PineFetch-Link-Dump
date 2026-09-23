'use strict';

const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const vm = require('node:vm');

async function loadPopupTestApi(overrides = {}) {
    const popupSource = await readFile(resolve('popup.js'), 'utf8');
    const context = {
        AbortController,
        Blob,
        URL,
        clearTimeout,
        setTimeout,
        document: { addEventListener() {} },
        globalThis: {},
        window: { clearTimeout, setTimeout },
        ...overrides,
    };
    context.globalThis = context;

    vm.runInNewContext(
        `${popupSource}\n;globalThis.popupTestApi = {
            REQUEST_TIMEOUT_MS,
            analyzeCurrentTab,
            buildPineFetchRequestUrl,
            buildTxtFilename,
            createEmptyPageInfo,
            executePageAnalysis,
            exportTxt,
            formatLinkCount,
            getActiveTab,
            getModeLabel,
            getProviderForUrl,
            getSendErrorState,
            getStoredSettings,
            getSupportedNetworkLabels,
            handleExportClick,
            handleSendClick,
            normalizePageInfo,
            postToPineFetch,
            sanitizeFilename,
            saveStoredSettings,
            sendToPineFetch,
            setLoading,
            setSendButtonState,
            shortenUrl,
            switchPopupView,
            uniquePreserveOrder,
            setElements(value) { Object.assign(elements, value); },
            setLoadingValue(value) { isLoading = value; },
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
        removeAttribute(name) { delete this.attributes[name]; },
        setAttribute(name, value) { this.attributes[name] = value; },
        textContent: '',
    });
    const sendTab = makeElement();
    sendTab.dataset.popupView = 'send';
    const settingsTab = makeElement();
    settingsTab.dataset.popupView = 'settings';

    return {
        endpointInput: { ...makeElement(), value: endpoint },
        secretInput: { ...makeElement(), value: secret },
        viewTabs: [sendTab, settingsTab],
        sendPanel: { hidden: false },
        settingsPanel: { hidden: true },
        sendButton: makeElement(),
        exportButton: makeElement(),
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

module.exports = { createChromeMock, createClassList, createPopupElements, loadPopupTestApi };
