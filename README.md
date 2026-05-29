# PineFetch Link Dump

## Was ist PineFetch YouTube Connector?

Die Extension erkennt YouTube-Video-Links auf der aktuellen YouTube-Seite und kann sie entweder als TXT exportieren oder direkt an eine lokale PineFetch-Instanz senden.

## Installation

1. Chrome öffnen.
2. `chrome://extensions` öffnen.
3. Developer Mode aktivieren.
4. "Load unpacked" klicken.
5. Den Extension-Ordner auswählen.

## PineFetch konfigurieren

PineFetch muss lokal laufen. Der Standard-Endpoint ist:

```txt
http://127.0.1:2255
```

Das Secret in der Extension muss mit dem PineFetch-Secret übereinstimmen. Alternativ können auch `http://127.0.0.1:2255` oder `http://localhost:2255` als Endpoint eingetragen werden.

## Verwendete Endpoints

```txt
POST /addYoutubeLinkToQueue/
POST /addYoutubeLinksToQueue/
```

Payload für ein einzelnes Video:

```json
{
    "url": "https://www.youtube.com/watch?v=...",
    "secret": "..."
}
```

Payload für mehrere Videos:

```json
{
    "urls": ["https://www.youtube.com/watch?v=..."],
    "secret": "..."
}
```

## Nutzung

Einzelvideo:

1. YouTube-Video öffnen.
2. Extension öffnen.
3. "Send to PineFetch" klicken.

Channel-/Listen-Seite:

1. YouTube-Channel-Tab öffnen, zum Beispiel `/streams`, `/videos` oder `/shorts`.
2. Falls mehr Links gebraucht werden, auf YouTube weiter nach unten scrollen.
3. Extension öffnen.
4. "Send to PineFetch" oder "Export TXT" klicken.

## Look and feel

![](/assets/images/example.webp)
