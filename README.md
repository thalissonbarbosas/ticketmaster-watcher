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
- **Add current URL** — one click in the popup adds the active tab's URL to the
  watch list (deduped) and saves it, so you don't have to copy/paste.
- **Configurable keyword** — defaults to `esgotado`; set it to whatever your
  locale's Ticketmaster shows for a sold-out event.
- **Configurable interval** — how often each page reloads (default 5s).
- **Targeted alerts** — the notification tells you which page opened up and takes
  you there on click.
- **Audible alert** — a short chime plays via an offscreen document; mutable.
- **Per-URL status** — the popup shows each URL with a live dot: checking,
  sold out, or available.

Nothing is hardcoded — URLs, keyword, and interval all live in the popup settings
(`chrome.storage.local`). The UI is themed in Ticketmaster blue, and the toolbar
icon is a white **T** on that blue.

## Install (unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open the popup and add the pages you want to watch — either paste event URLs
   (one per line) or hit **+ Adicionar URL atual** on each event tab.
4. Set the keyword and interval, click **Salvar**, then **Iniciar
   monitoramento**.

> The icons are already generated and committed — nothing to build. You only
> need `generate_icons.py` if you want to change the icon design.

> Keep the watched tabs/window open for the extension to keep checking.

## How it works

On start, the service worker opens one background tab per configured URL and
reloads each on the interval. After every load it reads the page's text and looks
for the keyword. While the keyword is present the page is treated as **sold out**
and reloading continues. The moment the keyword is *absent*, that page is treated
as **available**: a notification + chime fire, reloading for that URL stops (so
the loaded available page is preserved), and clicking the notification focuses
that exact tab. Other URLs keep being watched independently.

A keepalive alarm re-arms the reload loops if Chrome suspends the service worker
mid-watch.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, Ticketmaster host patterns |
| `background.js` | Service worker: per-URL reload→check loop, notifications |
| `popup.html` / `popup.js` | Settings UI + per-URL status |
| `offscreen.html` / `offscreen.js` | Plays the alert chime |
| `generate_icons.py` | Regenerates the committed icons — optional (pure stdlib) |

## Notes

This is a personal utility, not affiliated with or endorsed by Ticketmaster.
Use it responsibly and within the site's terms of service.
