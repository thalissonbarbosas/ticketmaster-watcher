# Ticketmaster Watcher

A small Chrome (Manifest V3) extension that watches one or more Ticketmaster
event pages and alerts you the moment a "sold out" keyword disappears — i.e.
when tickets may have just become available.

It reloads each watched page on an interval and scans the page text for a
configurable keyword (default `esgotado`, for the Brazilian Ticketmaster). When
that keyword is gone for a page, it fires a desktop notification with a sound;
clicking the notification jumps straight to **that** page.

## Features

- **Multiple URLs** — watch any number of event pages at once. Each gets its own
  background tab and its own reload loop, so one page going live doesn't stop the
  others.
- **Configurable keyword** — defaults to `esgotado`; set it to whatever your
  locale's Ticketmaster shows for a sold-out event.
- **Configurable interval** — how often each page reloads (default 5s).
- **Targeted alerts** — the notification tells you which page opened up and takes
  you there on click.
- **Audible alert** — a short chime plays via an offscreen document; mutable.

Nothing is hardcoded — URLs, keyword, and interval all live in the popup settings
(`chrome.storage.local`).

## Install (unpacked)

1. Run `python3 generate_icons.py` once to create the icons (optional — icons are
   committed).
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Open the popup, paste your event URLs (one per line), set the keyword and
   interval, **Salvar**, then **Iniciar monitoramento**.

> Keep the watched tabs/window open for the extension to keep checking.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, Ticketmaster host patterns |
| `background.js` | Service worker: per-URL reload→check loop, notifications |
| `popup.html` / `popup.js` | Settings UI + per-URL status |
| `offscreen.html` / `offscreen.js` | Plays the alert chime |
| `generate_icons.py` | Generates the placeholder icons (pure stdlib) |

## Notes

This is a personal utility, not affiliated with or endorsed by Ticketmaster.
Use it responsibly and within the site's terms of service.
