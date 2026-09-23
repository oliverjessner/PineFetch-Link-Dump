# PineFetch Link Dump

This extension detects video links on the current page and can either export them as a TXT file or send them directly to a local [PineFetch](https://oliverjessner.at/pinefetch/) instance.

See the [changelog](docs/changelog.md) for release notes and version history.

Supported sources:

- YouTube videos, shorts, live videos, channels, and list pages
- TikTok videos and all currently loaded videos on profile or music pages
- Instagram posts, reels, and all currently loaded posts on profile, reels, or tagged pages
- Reddit posts and loaded post links on subreddit or user pages
- X posts and loaded post links on timelines or media pages (including twitter.com links)
- Facebook reels, videos, watch links, and loaded video links on pages
- Direct HTTP(S) sources from standard HTML5 `<video>` elements

## Installation

1. Open Chrome.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Click "Load unpacked".
5. Select the extension folder.

## Configure PineFetch

[PineFetch](https://oliverjessner.at/pinefetch/) must be running locally. The default endpoint is:

```txt
http://127.0.1:2255
```

![](/assets/images/settings_tiktok.webp)

## Used Endpoints

PineFetch uses these endpoints for every supported video URL:

```txt
POST /addVideoLinkToQueue/
POST /addVideoLinksToQueue/
```

Payload for a single video:

```json
{
    "url": "https://www.youtube.com/watch?v=...",
    "secret": "..."
}
```

Payload for multiple videos:

```json
{
    "urls": ["https://www.youtube.com/watch?v=..."],
    "secret": "..."
}
```

## Usage

Single video:

1. Open a YouTube video.
2. Open the extension.
3. Click "Send to PineFetch".

YouTube channel/list page:

1. Open a YouTube channel tab, for example `/streams`, `/videos`, or `/shorts`.
2. If you need more links, scroll further down on YouTube.
3. Open the extension.
4. Click "Send to PineFetch" or "Export TXT".

TikTok profile page:

1. Open a profile, for example `https://www.tiktok.com/@oliverjessner`.
2. Scroll down until TikTok has loaded the videos you want.
3. Open the extension.
4. Click "Send to PineFetch" or "Export TXT". Only video URLs belonging to the opened profile are included.

TikTok music page:

1. Open a TikTok `/music/...` page.
2. Scroll until TikTok has loaded the videos you want.
3. Open the extension and click "Send to PineFetch" or "Export TXT".

TikTok `vm.tiktok.com` and `vt.tiktok.com` links only contain redirect tokens, so the
extension cannot resolve them reliably without a network redirect. Open the short
link first and run the extension on the resulting canonical TikTok page.

Instagram profile page:

1. Open an Instagram profile or its `/reels/` or `/tagged/` tab.
2. Sign in if the profile requires it, then scroll until Instagram has loaded the posts you want.
3. Open the extension.
4. Click "Send to PineFetch" or "Export TXT". Single `/p/`, `/reel/`, and legacy `/tv/` URLs are also supported.

Reddit, X, or Facebook:

1. Open a post or video page, or scroll a listing to load more links.
2. Open the extension and click "Send to PineFetch" or "Export TXT". Reddit and X listings collect post links, including posts without video; those links may fail when PineFetch processes them.

## Provider architecture

Source-specific page detection is isolated in `providers/`:

- `youtube.js`
- `tiktok.js`
- `instagram.js`
- `reddit.js`
- `x.js`
- `facebook.js`
- `standard-video.js` (fallback for regular HTML5 video pages)

To add another social platform, register its provider before the standard-video fallback and add the script to `popup.html`.

## Permission hardening note

The extension currently retains `<all_urls>` host permission. Page-script injection
is also gated by `activeTab`, but PineFetch endpoint requests and injection behavior
must be verified in a packaged Chrome build before narrowing the persistent host
patterns. This remains a manual browser-hardening check; automated Node tests cannot
prove Chrome's permission behavior on arbitrary sites.

## Look and feel

### Youtube

![](/assets/images/send_youtube.webp)

### Instagram

![](/assets/images/send_instagram.webp)

### TikTok

![](/assets/images/send_tiktok.webp)
