# PineFetch Link Dump

This extension detects YouTube video links on the current YouTube page and can either export them as a TXT file or send them directly to a local [PineFetch](https://oliverjessner.at/pinefetch/) instance.

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

Channel/list page:

1. Open a YouTube channel tab, for example `/streams`, `/videos`, or `/shorts`.
2. If you need more links, scroll further down on YouTube.
3. Open the extension.
4. Click "Send to PineFetch" or "Export TXT".

## Look and feel

![](/assets/images/example.webp)
