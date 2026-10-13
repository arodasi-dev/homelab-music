const POLL_MS = 3000;
const APP_VERSION = "2026-10-12.9";
const RESTART_AFTER_S = 3;
const LINK = /^https?:\/\//i;

const ICONS = {
  play: '<path d="M6 4v16l13-8z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>',
  prev: '<path d="M19 5v14L8 12z" fill="currentColor"/><path d="M5 5v14"/>',
  next: '<path d="M5 5v14l11-7z" fill="currentColor"/><path d="M19 5v14"/>',
  shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  queue: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  library: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  retry: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado: pede de novo */ } },
};

const state = { showCover: store.get("showCover") !== "0", tracks: [], results: [], current: null, shuffle: false, repeat: "off", queueOpen: false, seeking: false, view: "player" };
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

const mediaUrl = (id, kind, extra = "") => `${baseUrl}/tracks/${id}/${kind}?t=${encodeURIComponent(token)}${extra}`;
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
  loadAccount();
  if (state.tracks.some((t) => t.status === "downloading")) pollTimer = setTimeout(loadTracks, POLL_MS);
}

// Servidor antigo (sem contas) não tem /me: aí a linha da conta simplesmente não aparece.
async function loadAccount() {
  try {
    const me = await api("/me");
    $("account").textContent = `Conta: ${me.name} · ${me.count} de ${me.limit} músicas`;
    $("account").hidden = false;
  } catch {
    $("account").hidden = true;
  }
}

// ---- player ----

function play(id) {
  const track = byId(id);
  if (!track || !["ready", "downloading"].includes(track.status)) return;
  state.current = id;
  // Baixando: o servidor repassa o áudio direto do YouTube (`live=1`) até o arquivo ficar pronto.
  audio.src = mediaUrl(id, "audio", track.status === "downloading" ? "&live=1" : "");
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
    artwork: state.showCover
      ? [{ src: mediaUrl(track.id, "thumb"), sizes: "480x360", type: "image/jpeg" }]
      : [{ src: new URL("icons/icon-512.png", location.href).href, sizes: "512x512", type: "image/png" }],
  });
  // O iOS monta os botões da tela de bloqueio quando a sessão de mídia fica ativa, então registra de novo aqui.
  setupMediaSession();
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
    seekto: (d) => { audio.currentTime = d.seekTime; },
    // Sem esses dois, o iOS mostra "próxima/anterior" na tela de bloqueio em vez de "pular 10 s".
    seekbackward: null,
    seekforward: null,
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

function renderCover(track) {
  const img = $("cover-img");
  const key = `${track.id}:${track.status}`; // a capa só existe depois do download, então tenta de novo ao ficar pronta
  if (state.showCover && img.dataset.id !== key) {
    img.dataset.id = key;
    img.dataset.failed = "";
    img.onerror = () => { img.dataset.failed = "1"; renderCover(track); };
    img.src = mediaUrl(track.id, "thumb");
  }
  const showImage = state.showCover && !img.dataset.failed;
  img.hidden = !showImage;
  $("cover-note").hidden = showImage;
}

function renderPlayer() {
  const track = byId(state.current);
  $("player-empty").hidden = !!track;
  $("player-body").hidden = !track;
  if (!track) return;
  $("btn-share").hidden = track.status !== "ready"; // o cartão usa a capa, que só existe depois do download
  $("now-title").textContent = track.title;
  $("now-channel").textContent = track.channel;
  renderCover(track);
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

function noteThumb(withIcon) {
  const box = el("div", "thumb note");
  if (withIcon) box.innerHTML = icon("note");
  return box;
}

function coverThumb(track) {
  const img = el("img", "thumb");
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => img.replaceWith(noteThumb(true)));
  img.src = mediaUrl(track.id, "thumb");
  return img;
}

function trackRow(track, { actions }) {
  const row = el("li", `row${track.id === state.current ? " playing" : ""}`);
  const main = el("button", "row-main");
  const ready = track.status === "ready";
  const downloading = track.status === "downloading";
  const thumb = ready && state.showCover ? coverThumb(track) : noteThumb(ready || downloading);
  const text = el("div", "row-text");
  text.append(el("span", "row-title", track.title));
  if (downloading) {
    text.append(el("span", "row-sub", "Baixando… toque pra ouvir"));
    text.append(Object.assign(el("div", "bar"), { innerHTML: "<i></i>" }));
    main.addEventListener("click", () => { play(track.id); if (actions) show("player"); });
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

function renderResults() {
  const inLibrary = (id) => state.tracks.some((t) => t.id === id && t.status !== "error");
  $("results").replaceChildren(...state.results.map((r) => {
    const row = el("li", "row");
    const main = el("div", "row-main");
    const thumb = el("img", "thumb wide");
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.src = r.thumbnail;
    const text = el("div", "row-text");
    const sub = r.duration ? `${r.channel} · ${formatTime(r.duration)}` : r.channel;
    text.append(el("span", "row-title", r.title), el("span", "row-sub", sub));
    main.append(thumb, text);
    row.append(main);
    row.append(inLibrary(r.id)
      ? Object.assign(el("span", "icon-btn on"), { innerHTML: icon("check") })
      : rowButton("add", "Adicionar à biblioteca", () => addUrl(`https://www.youtube.com/watch?v=${r.id}`)));
    return row;
  }));
}

function renderAll() {
  renderPlayer();
  renderLibrary();
  renderDownloading();
  renderResults();
}

// ---- compartilhar nos stories ----

let shareFile = null;
let shareUrl = "";
let shareRun = 0; // se a pessoa liga/desliga a capa rápido, só a montagem mais recente vale

function openShare() {
  if (!byId(state.current)) return;
  $("share-cover").checked = store.get("shareCover") === "1"; // sem capa por padrão
  $("share").showModal();
  buildShare();
}

async function buildShare() {
  const track = byId(state.current);
  const withCover = $("share-cover").checked;
  const run = ++shareRun;
  shareFile = null;
  $("share-img").hidden = true;
  $("share-status").textContent = "Montando a imagem…";
  // O `&cors=1` separa essa imagem da já guardada pelo <img> comum, que veio sem cabeçalho de CORS.
  const canvas = await buildShareCard(track, withCover ? mediaUrl(track.id, "thumb", "&cors=1") : null);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (run !== shareRun) return;
  shareFile = new File([blob], `ouvindo-${track.id}.png`, { type: "image/png" });
  if (shareUrl) URL.revokeObjectURL(shareUrl);
  shareUrl = URL.createObjectURL(blob);
  $("share-img").src = shareUrl;
  $("share-img").hidden = false;
  $("share-status").textContent = "Escolha o Instagram (ou Salvar imagem) na próxima tela.";
}

function saveShareImage() {
  const link = Object.assign(document.createElement("a"), { href: shareUrl, download: shareFile.name });
  link.click();
}

// O share() precisa de um toque do usuário; por isso a imagem é montada antes e este botão só envia.
async function sendShare() {
  if (!shareFile) return;
  if (!navigator.canShare?.({ files: [shareFile] })) { saveShareImage(); return; }
  try {
    await navigator.share({ files: [shareFile] });
  } catch (err) {
    if (err.name !== "AbortError") saveShareImage();
  }
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
  try {
    const track = await api("/tracks", { method: "POST", body: JSON.stringify({ url }) });
    setAddMessage(track.status === "ready" ? "Essa música já está na biblioteca." : "Baixando em segundo plano. Ela aparece na biblioteca quando terminar.", false);
    await loadTracks();
    return true;
  } catch (err) {
    setAddMessage(err.message, true);
    return false;
  }
}

async function search(query) {
  setAddMessage("Buscando…", false);
  try {
    state.results = await api(`/search?q=${encodeURIComponent(query)}`);
    setAddMessage(state.results.length ? "" : "Nenhum resultado.", false);
  } catch (err) {
    state.results = [];
    setAddMessage(err.message, true);
  }
  renderResults();
}

function updateSubmitLabel() {
  $("add-submit").textContent = LINK.test($("add-url").value.trim()) ? "Adicionar à biblioteca" : "Buscar";
}

async function submitAdd() {
  const value = $("add-url").value.trim();
  if (!value) { setAddMessage("Digite o que buscar ou cole um link.", true); return; }
  if (!LINK.test(value)) { await search(value); return; }
  state.results = [];
  renderResults();
  if (await addUrl(value)) {
    $("add-url").value = "";
    updateSubmitLabel();
  }
}

// ---- navegação ----

const TABS = { player: ["play", "Player"], library: ["library", "Biblioteca"], add: ["add", "Adicionar"] };

function show(view) {
  state.view = view;
  for (const name of Object.keys(TABS)) $(`view-${name}`).hidden = name !== view;
  for (const tab of document.querySelectorAll(".tabs button")) tab.classList.toggle("on", tab.dataset.view === view);
  $("tab-indicator").style.transform = `translateX(${Object.keys(TABS).indexOf(view) * 100}%)`;
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
  const buttons = { "btn-share": "share", "toggle-queue": "queue", "btn-shuffle": "shuffle", "btn-prev": "prev", "btn-next": "next", "btn-repeat": "repeat", "open-settings": "settings" };
  for (const [id, name] of Object.entries(buttons)) $(id).innerHTML = icon(name);

  $("btn-share").addEventListener("click", openShare);
  $("share-go").addEventListener("click", sendShare);
  $("share-cover").addEventListener("change", () => {
    store.set("shareCover", $("share-cover").checked ? "1" : "0");
    buildShare();
  });
  $("share-close").addEventListener("click", () => $("share").close());
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
  audio.addEventListener("error", () => {
    if (audio.getAttribute("src")) $("now-channel").textContent = "Não consegui tocar agora. Tente de novo em instantes.";
  });
  setupMediaSession();

  $("add-form").addEventListener("submit", (e) => { e.preventDefault(); submitAdd(); });
  $("add-url").addEventListener("input", updateSubmitLabel);
  $("paste").addEventListener("click", async () => {
    try {
      $("add-url").value = await navigator.clipboard.readText();
      updateSubmitLabel();
    } catch { setAddMessage("Não consegui ler a área de transferência. Cole no campo.", true); }
  });

  $("cover-note").innerHTML = icon("note");
  $("set-cover").checked = state.showCover;
  $("set-cover").addEventListener("change", () => {
    state.showCover = $("set-cover").checked;
    store.set("showCover", state.showCover ? "1" : "0");
    if (byId(state.current)) updateMediaSession(byId(state.current));
    renderAll();
  });
  $("app-version").textContent = `Versão ${APP_VERSION}`;
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

  // O Safari do iPhone ignora o viewport pra zoom de pinça; esse evento (só dele) bloqueia.
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  // Sem isso o iOS "estica" a tela nas abas que cabem inteiras; só deixa arrastar onde há o que rolar.
  document.addEventListener("touchmove", (e) => {
    if (e.target.closest('input[type="range"], dialog')) return;
    const scroller = e.target.closest("main");
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) e.preventDefault();
  }, { passive: false });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadTracks(); });

  renderAll();
  show("library");
  if (!baseUrl || !token) openSettings(true);
  else loadTracks();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
