# PineFetch Link Dump

This extension detects video links on the current page and can either export them as a TXT file or send them directly to a local [PineFetch](https://oliverjessner.at/pinefetch/) instance.

Supported sources:

- YouTube videos, shorts, live videos, channels, and list pages
- TikTok videos and all currently loaded videos on a profile page
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

PineFetch currently uses its existing endpoint names for every supported URL:

```txt
POST /addYoutubeLinkToQueue/
POST /addYoutubeLinksToQueue/
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

## Provider architecture

Source-specific page detection is isolated in `providers/`:

- `youtube.js`
- `tiktok.js`
- `standard-video.js` (fallback for regular HTML5 video pages)

To add another social platform, register its provider before the standard-video fallback and add the script to `popup.html`.

## Look and feel

![](/assets/images/example.webp)
