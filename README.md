# PineFetch Link Dump

This extension detects video links on the current page and can either export them as a TXT file or send them directly to a local [PineFetch](https://oliverjessner.at/pinefetch/) instance.

Supported sources:

- YouTube videos, shorts, live videos, channels, and list pages
- TikTok videos and all currently loaded videos on a profile page
- Instagram posts, reels, and all currently loaded posts on profile, reels, or tagged pages
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

Instagram profile page:

1. Open an Instagram profile or its `/reels/` or `/tagged/` tab.
2. Sign in if the profile requires it, then scroll until Instagram has loaded the posts you want.
3. Open the extension.
4. Click "Send to PineFetch" or "Export TXT". Single `/p/`, `/reel/`, and legacy `/tv/` URLs are also supported.

## Provider architecture

Source-specific page detection is isolated in `providers/`:

- `youtube.js`
- `tiktok.js`
- `instagram.js`
- `standard-video.js` (fallback for regular HTML5 video pages)

To add another social platform, register its provider before the standard-video fallback and add the script to `popup.html`.

## Icons

```bash
npm run generate:icons
```

The icon generator reads `assets/images/logo.png`, scales it proportionally with `contain`, and writes transparent square PNGs at 16, 32, 48, and 128 pixels to `assets/icons/`. The manifest uses these generated files for both the extension and toolbar action. `npm test` regenerates and validates them automatically.

## Look and feel

![](/assets/images/example.webp)
