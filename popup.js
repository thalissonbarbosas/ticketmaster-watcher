const $ = (id) => document.getElementById(id);

const els = {
  urls: $('urls'),
  keyword: $('keyword'),
  interval: $('interval'),
  saveBtn: $('save-btn'),
  savedFlash: $('saved-flash'),
  addCurrentBtn: $('add-current-btn'),
  addFlash: $('add-flash'),
  statusList: $('status-list'),
  toggleBtn: $('toggle-btn'),
  muteBtn: $('mute-btn'),
};

const DEFAULT_KEYWORD = 'esgotado';
const DEFAULT_INTERVAL_MS = 5000;

let watching = false;

function prettyUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.length > 1 ? `${u.host}${u.pathname}` : u.host;
  } catch {
    return url;
  }
}

// ---- settings ----------------------------------------------------------

function loadSettings() {
  chrome.storage.local.get(
    { urls: [], keyword: DEFAULT_KEYWORD, intervalMs: DEFAULT_INTERVAL_MS },
    (s) => {
      els.urls.value = (s.urls || []).join('\n');
      els.keyword.value = s.keyword || DEFAULT_KEYWORD;
      els.interval.value = Math.round((s.intervalMs || DEFAULT_INTERVAL_MS) / 1000);
    }
  );
}

function parseUrls(text) {
  const valid = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const u = new URL(trimmed);
      if (u.protocol === 'http:' || u.protocol === 'https:') valid.push(trimmed);
    } catch {
      // Skip lines that aren't valid URLs.
    }
  }
  return valid;
}

function saveSettings() {
  const urls = parseUrls(els.urls.value);
  const keyword = (els.keyword.value.trim() || DEFAULT_KEYWORD).toLowerCase();
  const seconds = parseInt(els.interval.value, 10);
  const intervalMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_INTERVAL_MS;

  return new Promise((resolve) => {
    chrome.storage.local.set({ urls, keyword, intervalMs }, () => {
      // Normalize the textarea to what we actually stored.
      els.urls.value = urls.join('\n');
      resolve({ urls, keyword, intervalMs });
    });
  });
}

// ---- rendering ---------------------------------------------------------

function renderStatus(isWatching, lastChecks) {
  watching = isWatching;
  els.toggleBtn.disabled = false;

  const urls = parseUrls(els.urls.value);

  if (isWatching) {
    els.toggleBtn.textContent = 'Parar monitoramento';
    els.toggleBtn.className = 'btn-stop';
    setEditingEnabled(false);
  } else {
    els.toggleBtn.textContent = 'Iniciar monitoramento';
    els.toggleBtn.className = 'btn-start';
    setEditingEnabled(true);
  }

  // Show the mute button only when some page just became available.
  const anyAvailable = Object.values(lastChecks || {}).some((c) => c && c.found === false);
  els.muteBtn.style.display = anyAvailable && !isWatching ? 'block' : 'none';

  if (urls.length === 0) {
    els.statusList.innerHTML = '<div class="status-empty">Nenhuma URL configurada.</div>';
    return;
  }

  els.statusList.innerHTML = '';
  for (const url of urls) {
    const check = (lastChecks || {})[url];
    const row = document.createElement('div');
    row.className = 'url-row';

    const dot = document.createElement('div');
    let meta = 'Inativo';
    if (isWatching && !check) {
      dot.className = 'dot watching';
      meta = 'Verificando…';
    } else if (check && check.found === false) {
      dot.className = 'dot available';
      meta = `Disponível! · ${check.time}`;
    } else if (check && check.found === true) {
      dot.className = isWatching ? 'dot soldout' : 'dot';
      meta = `Esgotado · ${check.time}`;
    } else {
      dot.className = 'dot';
    }

    const info = document.createElement('div');
    info.className = 'url-info';
    const name = document.createElement('div');
    name.className = 'url-name';
    name.textContent = prettyUrl(url);
    name.title = url;
    const metaEl = document.createElement('div');
    metaEl.className = 'url-meta';
    metaEl.textContent = meta;
    info.appendChild(name);
    info.appendChild(metaEl);

    row.appendChild(dot);
    row.appendChild(info);
    els.statusList.appendChild(row);
  }
}

function setEditingEnabled(enabled) {
  els.urls.disabled = !enabled;
  els.keyword.disabled = !enabled;
  els.interval.disabled = !enabled;
  els.saveBtn.disabled = !enabled;
  els.addCurrentBtn.disabled = !enabled;
}

// ---- events ------------------------------------------------------------

function flash(el, text, ms = 1400) {
  el.textContent = text;
  setTimeout(() => (el.textContent = ''), ms);
}

els.addCurrentBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url;
    if (!url || !/^https?:\/\//.test(url)) {
      flash(els.addFlash, 'URL inválida');
      return;
    }
    const existing = parseUrls(els.urls.value);
    if (existing.includes(url)) {
      flash(els.addFlash, 'já está na lista');
      return;
    }
    existing.push(url);
    els.urls.value = existing.join('\n');
    saveSettings().then(() => {
      flash(els.addFlash, '✓ adicionada');
      refreshStatus();
    });
  });
});

els.saveBtn.addEventListener('click', async () => {
  await saveSettings();
  els.savedFlash.textContent = '✓';
  setTimeout(() => (els.savedFlash.textContent = ''), 1200);
  refreshStatus();
});

els.muteBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopSound' }, () => {
    els.muteBtn.style.display = 'none';
  });
});

els.toggleBtn.addEventListener('click', async () => {
  els.toggleBtn.disabled = true;

  if (watching) {
    chrome.runtime.sendMessage({ action: 'stop' }, () => refreshStatus());
    return;
  }

  // Starting: persist whatever is in the form first, then start.
  const settings = await saveSettings();
  if (settings.urls.length === 0) {
    els.toggleBtn.disabled = false;
    els.statusList.innerHTML = '<div class="status-empty">Adicione ao menos uma URL válida.</div>';
    return;
  }
  chrome.runtime.sendMessage({ action: 'start' }, (res) => {
    if (res && !res.ok) {
      els.statusList.innerHTML = `<div class="status-empty">Erro: ${res.error}</div>`;
    }
    refreshStatus();
  });
});

function refreshStatus() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (res) => {
    if (res) renderStatus(res.isWatching, res.lastChecks);
  });
}

// Live updates while the popup is open.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'statusUpdate') {
    renderStatus(msg.isWatching, msg.lastChecks);
  }
});

loadSettings();
// Render once settings are in the textarea so the status list matches.
setTimeout(refreshStatus, 50);
