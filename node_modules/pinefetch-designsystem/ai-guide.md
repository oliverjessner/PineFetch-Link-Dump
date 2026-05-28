# PineFetch Design System AI Guide

## Purpose

This design system extracts the reusable UI language from PineFetch into a small, dependency-free CSS layer for browser extensions, Tauri mini-tools, local admin panels, utility websites, and internal tools.

It is not a rebuild of the PineFetch app. Do not copy PineFetch screens, app IDs, queue/history/download selectors, Tauri logic, or JavaScript.

## Installation and CSS Files

- Install the package with `npm install pinefetch-designsystem`.
- In bundled apps, import `pinefetch-designsystem/dist/pinefetch.css` from the app entrypoint.
- In static HTML tools without a bundler, copy or link the installed `dist/pinefetch.css` file.
- Use `dist/pinefetch.css` as the distributed CSS entrypoint when embedding the design system in another app or package.
- Use `design-system/pinefetch.css` when reading, reviewing, or changing the source styles.
- Use `design-system/example.html` as the component reference page.
- Do not import `design-system/pinefetch.css` from consuming apps; it is the readable source file, not the package entrypoint.

## Visual Language

PineFetch uses a dark monospace interface with soft panels, cyan-green accent states, compact spacing, pill badges, restrained glow on focus/hover, and clear utility-tool controls. The UI should feel technical, focused, and compact enough for Chrome extension popups around 360px to 420px wide.

## Core Rules

When building a new UI with this design system:

- Always start with `.pf-app-shell` or `.pf-panel`.
- Use `.pf-app-shell-narrow` for popup-like UIs.
- Use `.pf-btn pf-btn-primary` for the main action.
- Use `.pf-btn pf-btn-ghost` for secondary quiet actions.
- Use `.pf-btn pf-btn-danger` for destructive actions.
- Use `.pf-badge` for short status labels.
- Use `.pf-field`, `.pf-label`, `.pf-input`, `.pf-select`, and `.pf-textarea` for form controls.
- Use `.pf-toggle` for binary settings.
- Use `.pf-segmented` and `.pf-segmented-btn` for small mode selectors.
- Use `.pf-hint` for helper copy and `.pf-status` for live result text.
- Use existing CSS variables instead of hardcoded colors.
- Do not use PineFetch app-specific IDs or selectors.
- Do not introduce public classes unless they start with `pf-`.

## Available Classes

Layout:

- `.pf-app-shell`: Main centered page or app wrapper.
- `.pf-app-shell-narrow`: Sets the shell width to 420px for extension popups.
- `.pf-stack`: Vertical layout with standard spacing.
- `.pf-stack-sm`: Tighter vertical layout.
- `.pf-row`: Wrapping horizontal row.
- `.pf-field-row`: Horizontal row for a field plus an adjacent control.
- `.pf-toolbar`: Horizontal row with space between groups.
- `.pf-grid`: Responsive auto-fit grid.
- `.pf-panel`: Main framed surface.
- `.pf-panel-soft`: Smaller nested surface for grouped details.
- `.pf-panel-header`: Header row for a panel.
- `.pf-panel-heading`: Title and subtitle stack inside a header.

Typography:

- `.pf-title`: Product or view title.
- `.pf-subtitle`: Muted secondary text.
- `.pf-section-title`: Uppercase panel heading.
- `.pf-text`: Normal compact paragraph text.
- `.pf-muted`: Muted text color.

Forms:

- `.pf-field`: Label plus control stack.
- `.pf-label`: Form label.
- `.pf-input`: Text-like input.
- `.pf-select`: Styled select with custom arrow.
- `.pf-textarea`: Multiline input.
- `.pf-is-invalid`: Error state for input, select, or textarea.

Buttons:

- `.pf-btn`: Base button.
- `.pf-btn-primary`: Main action button.
- `.pf-btn-ghost`: Transparent secondary button.
- `.pf-btn-danger`: Destructive button.
- `.pf-btn-loading`: Loading state with spinner.
- `.pf-is-active`: Active button state.

Badges:

- `.pf-badge`: Default accent badge.
- `.pf-badge-muted`: Neutral badge.
- `.pf-badge-warning`: Warning badge.
- `.pf-badge-danger`: Error or destructive badge.

Toggles:

- `.pf-toggle`: Clickable toggle row.
- `.pf-toggle-copy`: Text stack inside a toggle.
- `.pf-toggle-title`: Toggle title.
- `.pf-toggle-hint`: Toggle helper text.
- `.pf-toggle-input`: Checkbox input.
- `.pf-toggle-track`: Visible switch track.

Segmented controls:

- `.pf-segmented`: Pill container for mode buttons.
- `.pf-segmented-btn`: One segment button.
- `.pf-is-active`, `aria-pressed="true"`, or `aria-selected="true"`: Active segment state.

Hints and status:

- `.pf-hint`: Muted helper text with accent rule.
- `.pf-status`: Small status line.
- `.pf-status-success`: Success status color.
- `.pf-status-error`: Error status color.
- `.pf-status-warning`: Warning status color.
- `.pf-divider`: Thin divider line.

Utilities:

- `.pf-w-full`: Full width.
- `.pf-grow`: Flexible growth in rows.
- `.pf-truncate`: Single-line truncation.
- `.pf-scroll-area`: Scrollable area.
- `.pf-visually-hidden`: Accessible hidden text.
- `.pf-text-accent`, `.pf-text-danger`, `.pf-text-warning`: Token-based text colors.

## Token Rules

The source CSS centralizes design values in `:root` tokens. Component rules should reuse `--pf-` variables for colors, spacing, radii, sizing, typography, shadows, and motion values instead of hardcoded literals.

Use these variables instead of hardcoded colors:

```css
var(--pf-bg)
var(--pf-panel)
var(--pf-panel-soft)
var(--pf-border)
var(--pf-text)
var(--pf-muted)
var(--pf-accent)
var(--pf-accent-dim)
var(--pf-danger)
var(--pf-warning)
var(--pf-glow)
```

You may override tokens in `:root` or on a wrapper for theming, but keep the `--pf-` prefix.

## Typical HTML

Basic panel:

```html
<section class="pf-panel">
    <header class="pf-panel-header">
        <div class="pf-panel-heading">
            <h2 class="pf-section-title">Settings</h2>
            <p class="pf-subtitle">Compact controls for a small tool.</p>
        </div>
        <span class="pf-badge">Ready</span>
    </header>
</section>
```

Field:

```html
<label class="pf-field">
    <span class="pf-label">Endpoint</span>
    <input class="pf-input" type="url" placeholder="https://example.com" />
    <span class="pf-status">Waiting for input.</span>
</label>
```

Buttons:

```html
<div class="pf-row">
    <button class="pf-btn pf-btn-primary" type="button">Run</button>
    <button class="pf-btn pf-btn-ghost" type="button">Preview</button>
    <button class="pf-btn pf-btn-danger" type="button">Reset</button>
</div>
```

Toggle:

```html
<label class="pf-toggle">
    <span class="pf-toggle-copy">
        <span class="pf-toggle-title">Auto sync</span>
        <span class="pf-toggle-hint">Run when the popup opens.</span>
    </span>
    <input class="pf-toggle-input" type="checkbox" checked />
    <span class="pf-toggle-track" aria-hidden="true"></span>
</label>
```

Segmented control:

```html
<div class="pf-segmented" role="tablist" aria-label="Mode">
    <button class="pf-segmented-btn pf-is-active" type="button" aria-selected="true">Fast</button>
    <button class="pf-segmented-btn" type="button" aria-selected="false">Full</button>
</div>
```

## Chrome Extension Popup Example

```html
<main class="pf-app-shell pf-app-shell-narrow">
    <section class="pf-panel">
        <header class="pf-panel-header">
            <div class="pf-panel-heading">
                <h1 class="pf-title">Link Helper</h1>
                <p class="pf-subtitle">Prepare the current tab.</p>
            </div>
            <span class="pf-badge">Idle</span>
        </header>

        <label class="pf-field">
            <span class="pf-label">Target URL</span>
            <input class="pf-input" type="url" placeholder="https://..." />
        </label>

        <label class="pf-toggle">
            <span class="pf-toggle-copy">
                <span class="pf-toggle-title">Read clipboard</span>
                <span class="pf-toggle-hint">Use a copied link when the field is empty.</span>
            </span>
            <input class="pf-toggle-input" type="checkbox" checked />
            <span class="pf-toggle-track" aria-hidden="true"></span>
        </label>

        <button class="pf-btn pf-btn-primary pf-w-full" type="button">Queue link</button>
        <p class="pf-hint">Only process content the user has permission to access.</p>
    </section>
</main>
```

## Tool Panel Example

```html
<main class="pf-app-shell">
    <section class="pf-panel">
        <header class="pf-toolbar">
            <h2 class="pf-section-title">Batch Utility</h2>
            <div class="pf-segmented" aria-label="Run mode">
                <button class="pf-segmented-btn pf-is-active" type="button">Quick</button>
                <button class="pf-segmented-btn" type="button">Detailed</button>
            </div>
        </header>

        <div class="pf-grid">
            <label class="pf-field">
                <span class="pf-label">Preset</span>
                <select class="pf-select">
                    <option>Balanced</option>
                    <option>Fast</option>
                </select>
            </label>
            <label class="pf-field">
                <span class="pf-label">Notes</span>
                <textarea class="pf-textarea" placeholder="Optional notes"></textarea>
            </label>
        </div>

        <div class="pf-row">
            <button class="pf-btn pf-btn-primary" type="button">Start</button>
            <button class="pf-btn pf-btn-ghost" type="button">Save draft</button>
            <button class="pf-btn pf-btn-danger" type="button">Clear</button>
        </div>
        <p class="pf-status pf-status-success">Ready.</p>
    </section>
</main>
```

## Do

- Keep UI compact and control-focused.
- Use `.pf-panel` for the main surface and `.pf-panel-soft` for grouped details.
- Use badges only for short labels like "Ready", "Beta", "3 queued", or "Error".
- Use semantic HTML first, then add `pf-` classes.
- Prefer `aria-pressed`, `aria-selected`, `aria-invalid`, and `disabled` for states.
- Keep extension popups within `.pf-app-shell pf-app-shell-narrow`.

## Don't

- Do not use IDs from PineFetch such as `#startDownloadBtn`, `#queueList`, `#historyView`, `#settingsView`, `#magicImportEnabled`, or `#urlInput`.
- Do not use old unprefixed classes such as `.btn`, `.badge`, `.panel`, `.field`, `.hint`, or `.view-toggle`.
- Do not add queue-specific, history-specific, download-specific, or Tauri-specific selectors.
- Do not introduce hardcoded colors when a `--pf-` token exists.
- Do not create global public classes without the `pf-` prefix.
- Do not rely on images, build steps, or external libraries.
