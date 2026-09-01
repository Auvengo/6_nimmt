const EMOJIS = ["🐮","🐂","🐄","🤠","🐃","🐷","🐶","🐱","🦊","🐭","🐹","🐰","🐻","🐼","🐨","🐯","🦁","🐸","🐵","🐔","🐧","🐦","🐺","🐗","🐴","🐝","🐛","🐌","🐞","🐜","🐢","🐍","🦂","🦀","🐙","🐬","🐳","🌵","🌽","🎲","🃏","⭐","🔥","🍀","🌙","⚡","🍉","🌈","🚀"];
const LIMIT = 10;
const WIN_LINE = 66;
const root = document.querySelector("#app");
const cfg = window.KOROVA_CONFIG || {};
const cloudMode = /^https:\/\//.test(cfg.SUPABASE_URL || "") && Boolean(cfg.SUPABASE_ANON_KEY);

let roomCode = getRoomCode();
let state = null;
let tab = "game";
let modal = null;
let selectedEmoji = EMOJIS[0];
let busy = false;
let toastTimer;
let lastStateHash = "";
let editingRoundId = null;
let celebrationGame = null;
let deferredInstallPrompt = null;

const ICON_PATHS = {
  share: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  cards: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 17h6M12 10v4"/>',
  archive: '<path d="M4 7h16v13H4zM3 3h18v4H3z"/><path d="M9 11h6"/>',
  userPlus: '<circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 6-6h1M17 11v6M14 14h6"/>',
  save: '<path d="M5 3h12l3 3v15H4V3z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6v1"/>',
  refresh: '<path d="M20 7v5h-5"/><path d="M18.5 16a8 8 0 1 1 .5-8l1 4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM9 20h6M12 13v7"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4"/>',
  edit: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20zM13.5 8.5l3 3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  flag: '<path d="M5 21V4M5 5h11l-2 4 2 4H5"/>'
};
function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ""}</svg>`;
}

function getRoomCode() {
  const url = new URL(location.href);
  let code = (url.searchParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (code.length < 4) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    url.searchParams.set("room", code);
    history.replaceState({}, "", url);
  }
  return code;
}

const api = cloudMode ? createCloudApi() : createLocalApi();

function createCloudApi() {
  async function rpc(name, payload = {}) {
    const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || data.hint || `Ошибка сервера: ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    ensure: () => rpc("korova_ensure_room", { p_code: roomCode }),
    getState: () => rpc("korova_get_state", { p_code: roomCode }),
    addPlayer: (name, emoji) => rpc("korova_add_player", { p_code: roomCode, p_name: name, p_emoji: emoji }),
    removePlayer: (playerId) => rpc("korova_remove_player", { p_code: roomCode, p_player_id: playerId }),
    addRound: (scores) => rpc("korova_add_round", { p_code: roomCode, p_scores: scores }),
    updateRound: (roundId, scores) => rpc("korova_update_round", { p_code: roomCode, p_round_id: roundId, p_scores: scores }),
    undoRound: () => rpc("korova_undo_last_round", { p_code: roomCode }),
    newGame: (keepPlayers) => rpc("korova_new_game", { p_code: roomCode, p_keep_players: keepPlayers })
  };
}

function createLocalApi() {
  const key = `korova-room-${roomCode}`;
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  function fresh() {
    return {
      room: { code: roomCode, createdAt: new Date().toISOString() },
      currentGame: { id: uid(), startedAt: new Date().toISOString(), players: [], rounds: [] },
      archive: []
    };
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(key)) || fresh(); } catch { return fresh(); }
  }
  function save(value) { localStorage.setItem(key, JSON.stringify(value)); return structuredClone(value); }
  return {
    ensure: async () => { if (!localStorage.getItem(key)) save(fresh()); },
    getState: async () => structuredClone(load()),
    addPlayer: async (name, emoji) => {
      const s = load();
      if (s.currentGame.players.length >= LIMIT) throw new Error("В игре уже 10 игроков");
      if (s.currentGame.rounds.length) throw new Error("Игроков можно менять только до первого раунда");
      s.currentGame.players.push({ id: uid(), name, emoji, seat: s.currentGame.players.length + 1 });
      return save(s);
    },
    removePlayer: async (id) => {
      const s = load();
      if (s.currentGame.rounds.length) throw new Error("Игроков можно менять только до первого раунда");
      s.currentGame.players = s.currentGame.players.filter(p => p.id !== id).map((p, i) => ({ ...p, seat: i + 1 }));
      return save(s);
    },
    addRound: async (scores) => {
      const s = load();
      if (s.currentGame.players.length < 2) throw new Error("Добавьте минимум двух игроков");
      s.currentGame.rounds.push({ id: uid(), number: s.currentGame.rounds.length + 1, createdAt: new Date().toISOString(), scores });
      return save(s);
    },
    updateRound: async (roundId, scores) => {
      const s = load();
      const round = s.currentGame.rounds.find(r => r.id === roundId);
      if (!round) throw new Error("Раунд не найден");
      round.scores = scores;
      return save(s);
    },
    undoRound: async () => { const s = load(); s.currentGame.rounds.pop(); return save(s); },
    newGame: async (keepPlayers) => {
      const s = load();
      const old = s.currentGame;
      if (old.rounds.length) s.archive.unshift({ ...old, finishedAt: new Date().toISOString() });
      s.currentGame = {
        id: uid(), startedAt: new Date().toISOString(), rounds: [],
        players: keepPlayers ? old.players.map((p, i) => ({ ...p, id: uid(), seat: i + 1 })) : []
      };
      return save(s);
    }
  };
}

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}
function totalFor(playerId, game = state.currentGame) {
  return game.rounds.reduce((sum, r) => sum + Number(r.scores?.[playerId] || 0), 0);
}
function ranking(game = state.currentGame) {
  return [...game.players].map(p => ({ ...p, total: totalFor(p.id, game) })).sort((a, b) => a.total - b.total || a.seat - b.seat);
}
function statistics() {
  const byName = new Map();
  for (const game of state.archive) {
    const ranks = ranking(game);
    const bestScore = ranks[0]?.total;
    for (const player of ranks) {
      const key = player.name.trim().toLocaleLowerCase("ru");
      const item = byName.get(key) || { name: player.name, emoji: player.emoji, games: 0, wins: 0, points: 0, best: Infinity };
      item.name = player.name;
      item.emoji = player.emoji;
      item.games += 1;
      item.points += player.total;
      item.best = Math.min(item.best, player.total);
      if (player.total === bestScore) item.wins += 1;
      byName.set(key, item);
    }
  }
  return [...byName.values()].map(item => ({ ...item, average: Math.round(item.points / item.games * 10) / 10 }))
    .sort((a, b) => b.wins - a.wins || a.average - b.average || b.games - a.games);
}
function formatDate(iso) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function cowMarks(score) {
  const n = Math.min(5, Math.max(1, Math.ceil(Number(score) / 15)));
  return `<span class="cow-marks" aria-hidden="true">${"●".repeat(n)}</span>`;
}
function showToast(message, kind = "ok") {
  clearTimeout(toastTimer);
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  toastTimer = setTimeout(() => el.remove(), 3200);
}

async function mutate(action, success) {
  if (busy) return;
  busy = true;
  render();
  try {
    const result = await action();
    state = result?.currentGame ? result : await api.getState();
    lastStateHash = JSON.stringify(state);
    modal = null;
    busy = false;
    render();
    if (success) showToast(success);
  } catch (error) {
    busy = false;
    render();
    showToast(error.message || "Что-то пошло не так", "error");
  }
}

function render() {
  if (!state) {
    root.innerHTML = `<main class="loading"><div class="logo-card mini">🐮<b>006</b></div><p>Раскладываем карты…</p></main>`;
    return;
  }
  const game = state.currentGame;
  const ranks = ranking(game);
  const leader = ranks[0];
  const danger = ranks.some(p => p.total >= WIN_LINE);
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="?room=${roomCode}" aria-label="Коровосчёт — текущая партия">
          <span class="brand-card"><span>🐮</span><b>006</b></span>
          <span><strong>Коровосчёт</strong><small>Не бери шестую</small></span>
        </a>
        <div class="room-tools">
          <span class="room-label">Комната <b>${roomCode}</b></span>
          <button class="icon-btn" data-action="open-share" title="Поделиться и установить" aria-label="Поделиться и установить">${icon("share")}</button>
        </div>
      </header>

      ${!cloudMode ? `<aside class="demo-banner"><span>Локальный режим</span> Данные видны только на этом устройстве. Для мультидоступа подключите Supabase по README.</aside>` : ""}

      <nav class="tabs" aria-label="Разделы">
        <button class="tab ${tab === "game" ? "active" : ""}" data-tab="game">${icon("cards")} Текущая игра</button>
        <button class="tab ${tab === "archive" ? "active" : ""}" data-tab="archive">${icon("archive")} Архив <span>${state.archive.length}</span></button>
        <button class="tab ${tab === "stats" ? "active" : ""}" data-tab="stats">${icon("chart")} Статистика</button>
      </nav>

      <main>
        ${tab === "game" ? renderGame(game, ranks, leader, danger) : tab === "archive" ? renderArchive() : renderStatistics()}
      </main>
      <footer><span>🐮</span> Меньше коров — ближе победа</footer>
    </div>
    ${renderModal()}
  `;
}

function renderGame(game, ranks, leader, danger) {
  return `
    <section class="hero-panel">
      <div>
        <span class="eyebrow">Партия от ${formatDate(game.startedAt)}</span>
        <h1>${game.rounds.length ? `Раунд ${game.rounds.length + 1}` : "Соберите стадо"}</h1>
        <p>${game.players.length < 2 ? "Добавьте от 2 до 10 игроков, чтобы начать." : game.rounds.length ? `${esc(leader.emoji)} ${esc(leader.name)} сейчас впереди — ${leader.total} очк.` : "Все готовы. Внесите штрафные очки первого раунда."}</p>
      </div>
      <div class="hero-stats">
        <div><b>${game.players.length}</b><span>игроков</span></div>
        <div><b>${game.rounds.length}</b><span>раундов</span></div>
        <div><b>${danger ? "66+" : WIN_LINE}</b><span>${danger ? "игра продолжается" : "ориентир"}</span></div>
      </div>
    </section>

    <div class="section-heading">
      <div><span class="section-no">01</span><h2>Таблица игроков</h2></div>
      ${game.players.length < LIMIT && !game.rounds.length ? `<button class="button secondary" data-action="open-add">${icon("userPlus")} Добавить игрока</button>` : ""}
    </div>

    ${game.players.length ? `<section class="players-grid">${ranks.map((p, i) => renderPlayerCard(p, i, game)).join("")}</section>` : renderEmptyPlayers()}

    ${game.players.length >= 2 ? renderScoreEntry(game, danger) : ""}
    ${game.rounds.length ? renderRounds(game) : ""}
  `;
}

function renderPlayerCard(player, rank, game) {
  const last = game.rounds.at(-1)?.scores?.[player.id];
  return `<article class="player-card ${rank === 0 && game.rounds.length ? "leader" : ""} ${!game.rounds.length ? "editable" : ""}">
    <div class="card-corner"><b>${player.total}</b><span>🐮</span></div>
    <div class="player-icon">${esc(player.emoji)}</div>
    <div class="player-copy">
      <span class="rank">${game.rounds.length ? `${rank + 1} место` : `игрок ${player.seat}`}</span>
      <h3>${esc(player.name)}</h3>
      <p>${last == null ? "Очков пока нет" : `В прошлом раунде +${last}`}</p>
    </div>
    <div class="total"><strong>${player.total}</strong><span>итого</span>${cowMarks(player.total)}</div>
    ${!game.rounds.length ? `<button class="remove" data-action="remove-player" data-id="${player.id}" title="Убрать игрока" aria-label="Убрать ${esc(player.name)}">×</button>` : ""}
  </article>`;
}

function renderEmptyPlayers() {
  return `<section class="empty-state">
    <div class="empty-cards" aria-hidden="true"><i>17</i><i>55</i><i>104</i></div>
    <h3>За столом пока пусто</h3>
    <p>Добавьте имена и выберите каждому персонажа.</p>
    <button class="button primary" data-action="open-add">${icon("userPlus")} Добавить первого игрока</button>
  </section>`;
}

function renderScoreEntry(game, reached66) {
  return `<section class="score-section">
    <div class="section-heading light">
      <div><span class="section-no">02</span><h2>Очки раунда</h2></div>
      <span class="hint">Введите штрафные коровы</span>
    </div>
    ${reached66 ? `<div class="game-over continue"><span>🐮</span><div><b>Рубеж 66 пройден</b><small>Игра продолжается, пока вы сами не нажмёте «Завершить игру».</small></div></div>` : ""}
    <form id="round-form" class="score-form">
      <div class="score-inputs">
        ${[...game.players].sort((a,b) => a.seat-b.seat).map(p => `<label class="score-row">
          <span class="score-person"><i>${esc(p.emoji)}</i><b>${esc(p.name)}</b><small>сейчас ${totalFor(p.id)}</small></span>
          <span class="number-wrap"><span>＋</span><input inputmode="numeric" pattern="[0-9]*" min="0" max="999" type="number" name="${p.id}" placeholder="0" aria-label="Очки игрока ${esc(p.name)}" required></span>
        </label>`).join("")}
      </div>
      <div class="score-actions">
        <button class="button primary large" type="submit" ${busy ? "disabled" : ""}>${icon("save")} ${busy ? "Сохраняем…" : "Записать раунд"}</button>
        ${game.rounds.length ? `<button class="button ghost" type="button" data-action="undo">${icon("undo")} Отменить последний</button>` : ""}
        <button class="button ghost" type="button" data-action="open-reset">${icon("refresh")} Новая игра</button>
        <button class="button finish" type="button" data-action="open-finish" ${game.rounds.length ? "" : 'disabled title="Сначала запишите хотя бы один раунд"'}>${icon("flag")} Завершить игру</button>
      </div>
    </form>
  </section>`;
}

function renderRounds(game) {
  const players = [...game.players].sort((a,b) => a.seat-b.seat);
  return `<section class="rounds-section">
    <div class="section-heading"><div><span class="section-no">03</span><h2>Ход партии</h2></div><span class="hint">Нажмите карандаш, чтобы исправить раунд</span></div>
    <div class="round-table-wrap">
      <table class="round-table">
        <thead><tr><th>Раунд</th>${players.map(p => `<th><span>${esc(p.emoji)}</span>${esc(p.name)}</th>`).join("")}</tr></thead>
        <tbody>
          ${game.rounds.map(r => `<tr><td><b>${r.number}</b><small>${new Date(r.createdAt).toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"})}</small><button class="round-edit" data-action="open-edit-round" data-id="${r.id}" title="Редактировать раунд ${r.number}" aria-label="Редактировать раунд ${r.number}">${icon("edit")}</button></td>${players.map(p => `<td>+${r.scores[p.id] ?? 0}</td>`).join("")}</tr>`).join("")}
          <tr class="sum-row"><td>Итого</td>${players.map(p => `<td>${totalFor(p.id)}</td>`).join("")}</tr>
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderArchive() {
  if (!state.archive.length) return `<section class="archive-empty"><div class="empty-trophy">${icon("trophy")}</div><h1>Архив ещё пуст</h1><p>Завершённые партии появятся здесь вместе с датой, составом и финальным счётом.</p><button class="button primary" data-tab="game">${icon("cards")} Вернуться к игре</button></section>`;
  return `<section class="archive-page">
    <div class="archive-title"><span class="eyebrow">История стола</span><h1>Прошлые игры</h1><p>Победитель — игрок с наименьшим количеством штрафных очков.</p></div>
    <div class="archive-list">${state.archive.map((game, index) => renderArchiveGame(game, index)).join("")}</div>
  </section>`;
}

function renderArchiveGame(game, index) {
  const ranks = ranking(game);
  const best = ranks[0]?.total;
  const winners = ranks.filter(p => p.total === best);
  return `<article class="archive-card">
    <div class="archive-head">
      <div><span class="archive-index">Партия ${state.archive.length - index}</span><h2>${formatDate(game.finishedAt || game.startedAt)}</h2><small>${game.rounds.length} ${plural(game.rounds.length,"раунд","раунда","раундов")} · ${game.players.length} ${plural(game.players.length,"игрок","игрока","игроков")}</small></div>
      <div class="winner-badge"><span>${esc(winners[0]?.emoji || "🏆")}</span><div><small>${winners.length > 1 ? "Победители" : "Победитель"}</small><b>${winners.map(p => esc(p.name)).join(", ") || "—"}</b></div></div>
    </div>
    <ol class="archive-results">
      ${ranks.map((p, i) => `<li class="${p.total === best ? "winner" : ""}"><span class="place">${i + 1}</span><span class="avatar">${esc(p.emoji)}</span><b>${esc(p.name)}</b><strong>${p.total}<small> очк.</small></strong></li>`).join("")}
    </ol>
  </article>`;
}

function renderStatistics() {
  const items = statistics();
  if (!items.length) return `<section class="archive-empty"><div class="empty-trophy">${icon("chart")}</div><h1>Нужна хотя бы одна партия</h1><p>Статистика появится после первого ручного завершения игры.</p><button class="button primary" data-tab="game">${icon("cards")} Вернуться к игре</button></section>`;
  const totalGames = state.archive.length;
  const champion = items[0];
  return `<section class="stats-page">
    <div class="archive-title"><span class="eyebrow">Личная история</span><h1>Статистика игроков</h1><p>Считаются только завершённые партии этой комнаты.</p></div>
    <div class="stats-summary">
      <div><span>${icon("archive")}</span><b>${totalGames}</b><small>${plural(totalGames,"партия","партии","партий")}</small></div>
      <div><span>${icon("userPlus")}</span><b>${items.length}</b><small>${plural(items.length,"игрок","игрока","игроков")}</small></div>
      <div><span>${esc(champion.emoji)}</span><b>${esc(champion.name)}</b><small>лидер по победам</small></div>
    </div>
    <div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>Игрок</th><th>Игры</th><th>Победы</th><th>Среднее</th><th>Лучший счёт</th></tr></thead><tbody>
      ${items.map((p,i)=>`<tr><td><span class="stat-rank">${i+1}</span><span class="avatar">${esc(p.emoji)}</span><b>${esc(p.name)}</b></td><td>${p.games}</td><td><strong>${p.wins}</strong></td><td>${p.average}</td><td>${p.best}</td></tr>`).join("")}
    </tbody></table></div>
  </section>`;
}

function renderModal() {
  if (!modal) return "";
  const shell = body => `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" data-modal><button class="modal-close" data-action="close-modal" aria-label="Закрыть">×</button>${body}</section></div>`;
  if (modal === "add") return shell(`<span class="eyebrow">Новый участник</span><h2>Кто сегодня играет?</h2><form id="player-form">
    <label class="field-label" for="player-name">Имя игрока</label><input class="text-input" id="player-name" name="name" maxlength="24" autocomplete="off" placeholder="Например, Андрей" required autofocus>
    <span class="field-label">Выберите персонажа</span><div class="emoji-grid">${EMOJIS.map(e => `<button type="button" class="emoji-choice ${e === selectedEmoji ? "selected" : ""}" data-action="emoji" data-emoji="${e}" aria-label="Выбрать ${e}">${e}</button>`).join("")}</div>
    <button class="button primary large full" type="submit" ${busy ? "disabled" : ""}>${icon("userPlus")} Добавить игрока</button></form>`);
  if (modal === "edit") {
    const round = state.currentGame.rounds.find(r => r.id === editingRoundId);
    if (!round) return "";
    return shell(`<span class="eyebrow">Исправление результата</span><h2>Раунд ${round.number}</h2><p class="modal-text">Измените нужные значения — общий счёт пересчитается автоматически.</p><form id="edit-round-form" class="edit-round-form">
      ${[...state.currentGame.players].sort((a,b)=>a.seat-b.seat).map(p=>`<label class="edit-score"><span><i>${esc(p.emoji)}</i><b>${esc(p.name)}</b></span><input type="number" inputmode="numeric" min="0" max="999" name="${p.id}" value="${round.scores[p.id] ?? 0}" required></label>`).join("")}
      <button class="button primary large full" type="submit" ${busy ? "disabled" : ""}>${icon("save")} Сохранить изменения</button></form>`);
  }
  if (modal === "share") return shell(`<span class="eyebrow">Комната ${roomCode}</span><h2>Позвать игроков</h2><div class="qr-card"><img src="${"https:"+"//api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data="+encodeURIComponent(location.href)}" alt="QR-код ссылки на комнату"><div><b>Наведите камеру</b><small>Все откроют ту же комнату</small></div></div><div class="share-actions"><button class="button primary full" data-action="copy-link">${icon("copy")} Скопировать ссылку</button><button class="button secondary full" data-action="install-app">${icon("download")} Установить приложение</button></div><p class="install-note">На iPhone: откройте сайт в Safari → «Поделиться» → «На экран Домой». На Android нажмите кнопку установки выше.</p>`);
  if (modal === "reset") return shell(`<span class="eyebrow">Новая партия</span><h2>Начать новую игру?</h2><p class="modal-text">${state.currentGame.rounds.length ? "Текущий результат сохранится в архиве без праздничного экрана." : "Текущий пустой стол будет сброшен."}</p><label class="check-row"><input id="keep-players" type="checkbox" checked><span><b>Оставить тех же игроков</b><small>Счёт начнётся с нуля</small></span></label><button class="button primary large full" data-action="reset-game" ${busy ? "disabled" : ""}>${icon("refresh")} Начать новую игру</button>`);
  if (modal === "finish") return shell(`<span class="eyebrow">Финиш партии</span><h2>Завершить игру?</h2><p class="modal-text">Результат попадёт в архив и статистику. Победит игрок с наименьшим счётом.</p><label class="check-row"><input id="keep-players" type="checkbox" checked><span><b>Оставить тех же игроков</b><small>Новая партия начнётся с нулевого счёта</small></span></label><button class="button finish large full" data-action="finish-game" ${busy ? "disabled" : ""}>${icon("flag")} Завершить и показать победителя</button>`);
  if (modal === "winner" && celebrationGame) {
    const ranks = ranking(celebrationGame); const best = ranks[0]?.total; const winners = ranks.filter(p=>p.total===best);
    return `<div class="modal-backdrop winner-backdrop"><div class="confetti" aria-hidden="true">${Array.from({length:28},(_,i)=>`<i style="--i:${i}"></i>`).join("")}</div><section class="modal winner-modal" role="dialog" aria-modal="true" data-modal><span class="winner-crown">🏆</span><span class="eyebrow">Партия завершена</span><h2>${winners.length>1?"Победители":"Победитель"}: ${winners.map(p=>esc(p.name)).join(", ")}</h2><div class="winner-avatars">${winners.map(p=>`<span>${esc(p.emoji)}</span>`).join("")}</div><p>Лучший результат — <b>${best} очк.</b></p><ol class="mini-results">${ranks.map((p,i)=>`<li><span>${i+1}. ${esc(p.emoji)} ${esc(p.name)}</span><b>${p.total}</b></li>`).join("")}</ol><button class="button primary large full" data-action="close-winner">${icon("cards")} Перейти к новой игре</button></section></div>`;
  }
  return "";
}

function plural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? few : many;
}

async function finishCurrentGame(keepPlayers) {
  if (busy || !state.currentGame.rounds.length) return;
  const finished = structuredClone(state.currentGame);
  busy = true; render();
  try {
    const result = await api.newGame(keepPlayers);
    state = result?.currentGame ? result : await api.getState();
    lastStateHash = JSON.stringify(state);
    celebrationGame = finished;
    modal = "winner";
    busy = false; render();
  } catch (error) {
    busy = false; render(); showToast(error.message || "Не удалось завершить игру", "error");
  }
}

root.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action], [data-tab]");
  if (!button) return;
  if (button.dataset.modal != null) return;
  if (button.dataset.tab) { tab = button.dataset.tab; render(); scrollTo({ top: 0, behavior: "smooth" }); return; }
  const action = button.dataset.action;
  if (action === "open-add") { selectedEmoji = EMOJIS[state.currentGame.players.length % EMOJIS.length]; modal = "add"; render(); setTimeout(() => document.querySelector("#player-name")?.focus(), 0); }
  if (action === "close-modal" && (button.classList.contains("modal-close") || !event.target.closest("[data-modal]"))) { modal = null; editingRoundId = null; render(); }
  if (action === "emoji") { const name = document.querySelector("#player-name")?.value || ""; selectedEmoji = button.dataset.emoji; render(); const input = document.querySelector("#player-name"); if (input) { input.value = name; input.focus(); } }
  if (action === "remove-player") { const player = state.currentGame.players.find(p => p.id === button.dataset.id); if (confirm(`Убрать игрока «${player?.name}»?`)) mutate(() => api.removePlayer(button.dataset.id), "Игрок удалён"); }
  if (action === "undo" && confirm("Удалить результаты последнего раунда?")) mutate(() => api.undoRound(), "Последний раунд отменён");
  if (action === "open-edit-round") { editingRoundId = button.dataset.id; modal = "edit"; render(); }
  if (action === "open-reset") { modal = "reset"; render(); }
  if (action === "reset-game") { const keep = document.querySelector("#keep-players")?.checked ?? true; mutate(() => api.newGame(keep), "Новая игра началась"); }
  if (action === "open-finish") { if (state.currentGame.rounds.length) { modal = "finish"; render(); } }
  if (action === "finish-game") { const keep = document.querySelector("#keep-players")?.checked ?? true; finishCurrentGame(keep); }
  if (action === "close-winner") { celebrationGame = null; modal = null; tab = "game"; render(); }
  if (action === "open-share") { modal = "share"; render(); }
  if (action === "copy-link") { try { await navigator.clipboard.writeText(location.href); showToast("Ссылка на комнату скопирована"); } catch { prompt("Скопируйте ссылку", location.href); } }
  if (action === "install-app") {
    if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; modal = null; render(); }
    else showToast("Откройте меню браузера и выберите «Установить приложение»", "ok");
  }
});

root.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "player-form") { const name = new FormData(event.target).get("name")?.trim(); if (name) mutate(() => api.addPlayer(name, selectedEmoji), `${name} за столом`); }
  if (event.target.id === "round-form" || event.target.id === "edit-round-form") {
    const form = new FormData(event.target); const scores = {};
    for (const player of state.currentGame.players) {
      const raw = form.get(player.id);
      if (raw === "" || raw == null || Number(raw) < 0 || !Number.isInteger(Number(raw))) { showToast(`Укажите целые очки для игрока ${player.name}`, "error"); return; }
      scores[player.id] = Number(raw);
    }
    if (event.target.id === "edit-round-form") mutate(() => api.updateRound(editingRoundId, scores), "Результат раунда исправлен");
    else mutate(() => api.addRound(scores), "Раунд записан");
  }
});

window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; });
window.addEventListener("appinstalled", () => showToast("Коровосчёт установлен"));
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));

document.addEventListener("keydown", (event) => { if (event.key === "Escape" && modal) { modal = null; render(); } });
window.addEventListener("storage", async () => { if (!cloudMode) { state = await api.getState(); render(); } });

let syncTimer = null;
let syncInFlight = false;
let syncRetryDelay = 5000;

function scheduleSync(delay = 5000) {
  clearTimeout(syncTimer);
  if (!cloudMode || document.hidden) return;
  syncTimer = setTimeout(syncStateNow, delay);
}

async function syncStateNow() {
  if (!cloudMode || document.hidden) return;
  if (syncInFlight || busy || modal || document.activeElement?.matches("input")) {
    scheduleSync(5000);
    return;
  }
  syncInFlight = true;
  try {
    const next = await api.getState();
    const hash = JSON.stringify(next);
    if (hash !== lastStateHash) {
      state = next;
      lastStateHash = hash;
      render();
    }
    syncRetryDelay = 5000;
  } catch {
    syncRetryDelay = Math.min(syncRetryDelay * 2, 30000);
  } finally {
    syncInFlight = false;
    scheduleSync(syncRetryDelay);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(syncTimer);
  else syncStateNow();
});
window.addEventListener("focus", () => { if (cloudMode && !document.hidden) syncStateNow(); });
window.addEventListener("online", () => { syncRetryDelay = 5000; syncStateNow(); });

async function init() {
  render();
  try {
    await api.ensure();
    state = await api.getState();
    lastStateHash = JSON.stringify(state);
    render();
    scheduleSync(5000);
  } catch (error) {
    root.innerHTML = `<main class="fatal"><div class="logo-card mini">🐮<b>006</b></div><h1>Не удалось открыть комнату</h1><p>${esc(error.message)}</p><button class="button primary" onclick="location.reload()">Попробовать снова</button></main>`;
  }
}
init();
