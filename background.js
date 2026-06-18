// Ticketmaster Watcher — background service worker.
//
// Watches every URL the user configured in the popup. Each URL gets its own
// background tab that reloads on an interval; after each load we read the page
// text and look for the configured "sold out" keyword. When the keyword is gone
// for a URL, we fire a notification whose click jumps straight to THAT page.

const DEFAULT_KEYWORD = 'esgotado';
const DEFAULT_INTERVAL_MS = 5000;
const NOTIF_PREFIX = 'tm-available:';

let isWatching = false;
let keyword = DEFAULT_KEYWORD;
let intervalMs = DEFAULT_INTERVAL_MS;
let watchTabs = {};               // tabId -> url
const reloadTimers = new Map();   // tabId -> setTimeout handle
const notifTargets = {};          // notifId -> { tabId, url }

// ---- settings & state persistence --------------------------------------

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { urls: [], keyword: DEFAULT_KEYWORD, intervalMs: DEFAULT_INTERVAL_MS },
      (s) => resolve({
        urls: Array.isArray(s.urls) ? s.urls.filter(Boolean) : [],
        keyword: (s.keyword || DEFAULT_KEYWORD).toLowerCase(),
        intervalMs: s.intervalMs > 0 ? s.intervalMs : DEFAULT_INTERVAL_MS,
      })
    );
  });
}

function persist() {
  chrome.storage.local.set({ isWatching, watchTabs });
}

async function setLastCheck(url, info) {
  const { lastChecks = {} } = await chrome.storage.local.get({ lastChecks: {} });
  lastChecks[url] = info;
  await chrome.storage.local.set({ lastChecks });
}

// Restore state when the service worker restarts mid-watch.
async function restore() {
  const data = await chrome.storage.local.get({
    isWatching: false,
    watchTabs: {},
    keyword: DEFAULT_KEYWORD,
    intervalMs: DEFAULT_INTERVAL_MS,
  });
  keyword = (data.keyword || DEFAULT_KEYWORD).toLowerCase();
  intervalMs = data.intervalMs > 0 ? data.intervalMs : DEFAULT_INTERVAL_MS;

  if (!data.isWatching) return;

  const restored = {};
  for (const [tabIdStr, url] of Object.entries(data.watchTabs || {})) {
    const tabId = Number(tabIdStr);
    try {
      await chrome.tabs.get(tabId);
      restored[tabId] = url;
    } catch {
      // Tab no longer exists — drop it.
    }
  }
  watchTabs = restored;
  isWatching = Object.keys(restored).length > 0;
  persist();
}
restore();

// Keepalive: if the worker was killed mid-watch, the alarm wakes it and we
// restart any reload chains that lost their in-memory timer.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'keepalive' || !isWatching) return;
  for (const tabId of Object.keys(watchTabs).map(Number)) {
    if (!reloadTimers.has(tabId)) resumeTab(tabId);
  }
});

async function resumeTab(tabId) {
  try {
    await chrome.tabs.get(tabId);
    chrome.tabs.reload(tabId);
  } catch {
    removeTab(tabId);
    broadcast();
  }
}

// ---- core reload → check loop ------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (isWatching && watchTabs[tabId] && changeInfo.status === 'complete') {
    checkTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (watchTabs[tabId]) {
    removeTab(tabId);
    broadcast();
  }
});

async function checkTab(tabId) {
  const url = watchTabs[tabId];
  if (!url || !isWatching) return;

  // Cancel any pending reload — we're checking right now.
  const pending = reloadTimers.get(tabId);
  if (pending) { clearTimeout(pending); reloadTimers.delete(tabId); }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body.innerText.toLowerCase(),
    });

    const text = results?.[0]?.result ?? '';
    const found = text.includes(keyword);
    const time = new Date().toLocaleTimeString('pt-BR');

    await setLastCheck(url, { time, found });
    broadcast();

    if (!found) {
      // Keyword gone → tickets may be available. Notify for THIS url and stop
      // reloading this tab so the loaded page stays on the available state.
      notifyAvailable(tabId, url);
      playAlertSound();
      removeTab(tabId, /* closeTab */ false);
      broadcast();
      return;
    }
  } catch (e) {
    console.warn('[Ticketmaster Watcher] check error:', e.message);
  }

  // Still sold out → schedule the next reload for this tab.
  if (isWatching && watchTabs[tabId]) {
    const t = setTimeout(() => {
      if (watchTabs[tabId] && isWatching) {
        chrome.tabs.reload(tabId).catch(() => {});
      }
    }, intervalMs);
    reloadTimers.set(tabId, t);
  }
}

// ---- notifications ------------------------------------------------------

function prettyUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.length > 1 ? `${u.host}${u.pathname}` : u.host;
  } catch {
    return url;
  }
}

function notifyAvailable(tabId, url) {
  const notifId = `${NOTIF_PREFIX}${url}`;
  notifTargets[notifId] = { tabId, url };
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '🎟 Ingresso disponível!',
    message: `"${keyword}" sumiu — corre lá!\n${prettyUrl(url)}`,
    priority: 2,
    requireInteraction: true,
  });
}

// Clicking the notification jumps to the exact page that became available.
chrome.notifications.onClicked.addListener((notifId) => {
  const target = notifTargets[notifId];
  chrome.notifications.clear(notifId);
  chrome.runtime.sendMessage({ action: 'stopSound' }).catch(() => {});
  if (!target) return;

  // Prefer focusing the already-loaded watch tab; fall back to opening fresh.
  chrome.tabs.get(target.tabId)
    .then((tab) => {
      chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
    })
    .catch(() => {
      chrome.tabs.create({ url: target.url });
    });

  delete notifTargets[notifId];
});

// ---- audio --------------------------------------------------------------

async function playAlertSound() {
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play alert sound when tickets are available',
    });
  } catch {
    // Document may already exist — that's fine.
  }
  chrome.runtime.sendMessage({ action: 'playSound' }).catch(() => {});
}

// ---- start / stop -------------------------------------------------------

async function startWatching() {
  if (isWatching) return;
  const settings = await getSettings();
  if (settings.urls.length === 0) {
    throw new Error('Nenhuma URL configurada');
  }
  keyword = settings.keyword;
  intervalMs = settings.intervalMs;

  watchTabs = {};
  for (const url of settings.urls) {
    const tab = await chrome.tabs.create({ url, active: false });
    watchTabs[tab.id] = url;
  }
  isWatching = true;
  await chrome.storage.local.set({ lastChecks: {} });
  persist();
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
}

function stopWatching() {
  for (const tabId of Object.keys(watchTabs).map(Number)) {
    const timer = reloadTimers.get(tabId);
    if (timer) { clearTimeout(timer); reloadTimers.delete(tabId); }
    chrome.tabs.remove(tabId).catch(() => {});
  }
  watchTabs = {};
  isWatching = false;
  chrome.alarms.clear('keepalive');
  persist();
}

// Stop watching one tab. By default the tab stays open (used when a page
// becomes available); closeTab=true is used by the full stop path.
function removeTab(tabId, closeTab = false) {
  const timer = reloadTimers.get(tabId);
  if (timer) { clearTimeout(timer); reloadTimers.delete(tabId); }
  if (closeTab) chrome.tabs.remove(tabId).catch(() => {});
  delete watchTabs[tabId];
  if (Object.keys(watchTabs).length === 0) {
    isWatching = false;
    chrome.alarms.clear('keepalive');
  }
  persist();
}

// ---- messaging ----------------------------------------------------------

async function broadcast() {
  const { lastChecks = {} } = await chrome.storage.local.get({ lastChecks: {} });
  chrome.runtime.sendMessage({
    type: 'statusUpdate',
    isWatching,
    watching: Object.values(watchTabs),
    lastChecks,
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'start') {
    startWatching()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.action === 'stop') {
    stopWatching();
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === 'stopSound') {
    chrome.runtime.sendMessage({ action: 'stopSound' }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === 'getStatus') {
    chrome.storage.local.get({ isWatching: false, lastChecks: {} }, (data) => {
      sendResponse({
        isWatching: isWatching || data.isWatching || false,
        lastChecks: data.lastChecks || {},
      });
    });
    return true;
  }
});
