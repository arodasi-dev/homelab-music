const POLL_MS = 3000;
const SKIP_S = 10;
const RESTART_AFTER_S = 3;

const ICONS = {
  play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>',
  prev: '<path d="M19 5v14L8 12z" fill="currentColor"/><path d="M5 5v14"/>',
  next: '<path d="M5 5v14l11-7z" fill="currentColor"/><path d="M19 5v14"/>',
  shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  queue: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  library: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  retry: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado: pede de novo */ } },
};

const state = { tracks: [], current: null, shuffle: false, repeat: "off", queueOpen: false, seeking: false, view: "player" };
let baseUrl = store.get("agentUrl");
let token = store.get("token");
let pollTimer = null;
const audio = $("audio");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// ---- servidor ----

async function api(path, options = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(baseUrl + path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || (res.status === 401 ? "Token recusado." : `Erro ${res.status}`));
  }
  return res.status === 204 ? null : res.json();
}

const mediaUrl = (id, kind) => `${baseUrl}/tracks/${id}/${kind}?t=${encodeURIComponent(token)}`;
const byId = (id) => state.tracks.find((t) => t.id === id);
const readyTracks = () => state.tracks.filter((t) => t.status === "ready");

function showConnection(message) {
  $("conn").hidden = !message;
  $("conn").textContent = message || "";
  $("conn").className = "notice error";
}

async function loadTracks() {
  clearTimeout(pollTimer);
  if (!baseUrl || !token) return;
  try {
    state.tracks = await api("/tracks");
    showConnection("");
  } catch (err) {
    showConnection(`Sem conexão com o servidor. ${err.message}`);
  }
  renderAll();
  if (state.tracks.some((t) => t.status === "downloading")) pollTimer = setTimeout(loadTracks, POLL_MS);
}

// ---- player ----

function play(id) {
  const track = byId(id);
  if (!track || track.status !== "ready") return;
  state.current = id;
  audio.src = mediaUrl(id, "audio");
  audio.play().catch(() => {});
  updateMediaSession(track);
  renderAll();
}

function step(direction, auto) {
  const ready = readyTracks();
  if (!ready.length) return;
  if (auto && state.repeat === "one") {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  const index = ready.findIndex((t) => t.id === state.current);
  let next = index + direction;
  if (state.shuffle && ready.length > 1) {
    do { next = Math.floor(Math.random() * ready.length); } while (next === index);
  } else if (next < 0 || next >= ready.length) {
    if (auto && state.repeat !== "all") { audio.pause(); return; }
    next = (next + ready.length) % ready.length;
  }
  play(ready[next].id);
}

function previous() {
  if (audio.currentTime > RESTART_AFTER_S) audio.currentTime = 0;
  else step(-1, false);
}

function togglePlay() {
  if (audio.src && audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function updateMediaSession(track) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.channel,
    artwork: [{ src: mediaUrl(track.id, "thumb"), sizes: "480x360", type: "image/jpeg" }],
  });
}

function updatePosition() {
  if (!("mediaSession" in navigator) || !Number.isFinite(audio.duration)) return;
  try {
    navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: audio.playbackRate });
  } catch { /* posição fora do intervalo durante a troca de faixa */ }
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const handlers = {
    play: () => audio.play(),
    pause: () => audio.pause(),
    previoustrack: previous,
    nexttrack: () => step(1, false),
    seekbackward: () => { audio.currentTime = Math.max(0, audio.currentTime - SKIP_S); },
    seekforward: () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + SKIP_S); },
    seekto: (d) => { audio.currentTime = d.seekTime; },
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* ação sem suporte neste navegador */ }
  }
}

function renderSeek() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : (byId(state.current)?.duration || 0);
  const seek = $("seek");
  seek.max = Math.floor(duration);
  if (!state.seeking) seek.value = Math.floor(audio.currentTime);
  seek.style.setProperty("--progress", `${duration ? (seek.value / duration) * 100 : 0}%`);
  $("time-now").textContent = formatTime(seek.value);
  $("time-total").textContent = formatTime(duration);
}

function renderPlayer() {
  const track = byId(state.current);
  $("player-empty").hidden = !!track;
  $("player-body").hidden = !track;
  if (!track) return;
  $("now-title").textContent = track.title;
  $("now-channel").textContent = track.channel;
  const cover = $("cover-img");
  if (cover.dataset.id !== track.id) {
    cover.dataset.id = track.id;
    cover.hidden = false;
    cover.onerror = () => { cover.hidden = true; };
    cover.src = mediaUrl(track.id, "thumb");
  }
  $("btn-play").innerHTML = icon(audio.paused ? "play" : "pause");
  $("btn-play").setAttribute("aria-label", audio.paused ? "Tocar" : "Pausar");
  $("btn-shuffle").classList.toggle("on", state.shuffle);
  $("btn-repeat").classList.toggle("on", state.repeat !== "off");
  $("btn-repeat").dataset.mode = state.repeat;
  $("queue").hidden = !state.queueOpen;
  $("toggle-queue").classList.toggle("on", state.queueOpen);
  if (state.queueOpen) renderRows($("queue"), readyTracks(), { actions: false });
  renderSeek();
}

// ---- listas ----

function trackRow(track, { actions }) {
  const row = el("li", `row${track.id === state.current ? " playing" : ""}`);
  const main = el("button", "row-main");
  const thumb = track.status === "ready" ? el("img", "thumb") : el("div", "thumb");
  if (track.status === "ready") {
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.addEventListener("error", () => thumb.replaceWith(el("div", "thumb")));
    thumb.src = mediaUrl(track.id, "thumb");
  }
  const text = el("div", "row-text");
  text.append(el("span", "row-title", track.title));
  if (track.status === "downloading") {
    text.append(el("span", "row-sub", "Baixando…"));
    text.append(Object.assign(el("div", "bar"), { innerHTML: "<i></i>" }));
  } else if (track.status === "error") {
    text.append(el("span", "row-sub error", `Falhou: ${track.error || "erro desconhecido"}`));
  } else {
    text.append(el("span", "row-sub", `${track.channel} · ${formatTime(track.duration)}`));
    main.addEventListener("click", () => { play(track.id); if (actions) show("player"); });
  }
  main.prepend(thumb);
  main.append(text);
  row.append(main);
  if (actions) {
    if (track.status === "error") row.append(rowButton("retry", "Tentar de novo", () => addUrl(`https://www.youtube.com/watch?v=${track.id}`)));
    if (track.status !== "downloading") row.append(rowButton("trash", "Apagar", () => removeTrack(track)));
  }
  return row;
}

function rowButton(name, label, onClick) {
  const button = el("button", "icon-btn");
  button.innerHTML = icon(name);
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

function renderRows(list, tracks, options) {
  list.replaceChildren(...tracks.map((t) => trackRow(t, options)));
}

function renderLibrary() {
  renderRows($("library"), state.tracks, { actions: true });
  $("library-empty").hidden = state.tracks.length > 0 || !$("conn").hidden;
}

function renderDownloading() {
  const pending = state.tracks.filter((t) => t.status !== "ready");
  renderRows($("downloading"), pending, { actions: true });
  $("downloading-empty").hidden = pending.length > 0;
}

function renderAll() {
  renderPlayer();
  renderLibrary();
  renderDownloading();
}

// ---- ações ----

async function removeTrack(track) {
  if (!confirm(`Apagar "${track.title}"?`)) return;
  if (track.id === state.current) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    state.current = null;
  }
  try {
    await api(`/tracks/${track.id}`, { method: "DELETE" });
  } catch (err) {
    showConnection(err.message);
  }
  loadTracks();
}

function setAddMessage(text, isError) {
  const msg = $("add-msg");
  msg.hidden = !text;
  msg.textContent = text || "";
  msg.className = isError ? "notice error" : "notice";
}

async function addUrl(url) {
  setAddMessage("");
  $("add-submit").textContent = "Adicionando…";
  try {
    const track = await api("/tracks", { method: "POST", body: JSON.stringify({ url }) });
    $("add-url").value = "";
    setAddMessage(track.status === "ready" ? "Essa música já está na biblioteca." : "Baixando em segundo plano. Ela aparece na biblioteca quando terminar.", false);
    await loadTracks();
  } catch (err) {
    setAddMessage(err.message, true);
  } finally {
    $("add-submit").textContent = "Adicionar à biblioteca";
  }
}

// ---- navegação ----

const TABS = { player: ["play", "Player"], library: ["library", "Biblioteca"], add: ["add", "Adicionar"] };

function show(view) {
  state.view = view;
  for (const name of Object.keys(TABS)) $(`view-${name}`).hidden = name !== view;
  for (const tab of document.querySelectorAll(".tabs button")) tab.classList.toggle("on", tab.dataset.view === view);
}

function openSettings(firstTime) {
  $("set-url").value = baseUrl;
  $("set-token").value = token;
  $("settings-msg").hidden = true;
  $("settings-cancel").hidden = firstTime;
  $("settings").showModal();
}

function init() {
  for (const tab of document.querySelectorAll(".tabs button")) {
    const [iconName, label] = TABS[tab.dataset.view];
    tab.innerHTML = `${icon(iconName)}<span>${label}</span>`;
    tab.addEventListener("click", () => show(tab.dataset.view));
  }
  for (const link of document.querySelectorAll("[data-go]")) link.addEventListener("click", () => show(link.dataset.go));
  const buttons = { "toggle-queue": "queue", "btn-shuffle": "shuffle", "btn-prev": "prev", "btn-next": "next", "btn-repeat": "repeat", "open-settings": "settings" };
  for (const [id, name] of Object.entries(buttons)) $(id).innerHTML = icon(name);

  $("btn-play").addEventListener("click", togglePlay);
  $("btn-prev").addEventListener("click", previous);
  $("btn-next").addEventListener("click", () => step(1, false));
  $("btn-shuffle").addEventListener("click", () => { state.shuffle = !state.shuffle; renderPlayer(); });
  $("btn-repeat").addEventListener("click", () => {
    state.repeat = { off: "all", all: "one", one: "off" }[state.repeat];
    renderPlayer();
  });
  $("toggle-queue").addEventListener("click", () => { state.queueOpen = !state.queueOpen; renderPlayer(); });

  const seek = $("seek");
  seek.addEventListener("input", () => { state.seeking = true; renderSeek(); });
  seek.addEventListener("change", () => { audio.currentTime = Number(seek.value); state.seeking = false; });

  audio.addEventListener("timeupdate", renderSeek);
  audio.addEventListener("play", () => { renderPlayer(); updatePosition(); });
  audio.addEventListener("pause", () => { renderPlayer(); updatePosition(); });
  audio.addEventListener("loadedmetadata", () => { renderSeek(); updatePosition(); });
  audio.addEventListener("seeked", updatePosition);
  audio.addEventListener("ended", () => step(1, true));
  setupMediaSession();

  $("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = $("add-url").value.trim();
    if (!url) { setAddMessage("Cole um link do YouTube.", true); return; }
    addUrl(url);
  });
  $("paste").addEventListener("click", async () => {
    try { $("add-url").value = await navigator.clipboard.readText(); } catch { setAddMessage("Não consegui ler a área de transferência. Cole no campo.", true); }
  });

  $("open-settings").addEventListener("click", () => openSettings(false));
  $("settings-cancel").addEventListener("click", () => $("settings").close());
  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = $("set-url").value.trim().replace(/\/+$/, "");
    const tokenValue = $("set-token").value.trim();
    if (!/^https:\/\//.test(url) || !tokenValue) {
      $("settings-msg").textContent = "Informe o endereço (https://…) e o token.";
      $("settings-msg").className = "notice error";
      $("settings-msg").hidden = false;
      return;
    }
    baseUrl = url;
    token = tokenValue;
    store.set("agentUrl", url);
    store.set("token", tokenValue);
    $("settings").close();
    loadTracks();
  });
  $("settings").addEventListener("cancel", (e) => { if (!baseUrl || !token) e.preventDefault(); });

  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadTracks(); });

  renderAll();
  show("library");
  if (!baseUrl || !token) openSettings(true);
  else loadTracks();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
