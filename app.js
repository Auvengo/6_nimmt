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
let editingPlayerId = null;
let celebrationGame = null;
let deferredInstallPrompt = null;
let statsPeriod = "all";
let selectedProfileId = null, selectedOpponentId = null, manualImport = null;
let gamificationTab = "temporary";
let awardsOpen = false;
let olderArchiveOpen = false, archiveShown = 10, selectedArchiveId = null;
let insightIndex = 0, insightTouch = null;
const pendingKey = `korova-pending-${roomCode}`;
let pendingWrites = JSON.parse(localStorage.getItem(pendingKey) || "[]");
const adminKey=`korova-admin-${roomCode}`;let adminSession=JSON.parse(localStorage.getItem(adminKey)||"null");
function isAdmin(){return !cloudMode||!!(adminSession?.token&&new Date(adminSession.expiresAt)>new Date())}
function adminToken(){return adminSession?.token||"local"}

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
  const code = "EXBVHN";
  const url = new URL(location.href);
  if (url.searchParams.get("room") !== code) {
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
    adminLogin: (pin) => rpc("korova_admin_login",{p_code:roomCode,p_pin:pin}),
    updateProfile: (profileId,name,emoji) => rpc("korova_admin_update_profile",{p_code:roomCode,p_token:adminToken(),p_profile_id:profileId,p_name:name,p_emoji:emoji}),
    deleteGame: gameId => rpc("korova_admin_delete_game",{p_code:roomCode,p_token:adminToken(),p_game_id:gameId}),
    mergeProfiles: (source,target) => rpc("korova_admin_merge_profiles",{p_code:roomCode,p_token:adminToken(),p_source:source,p_target:target}),
    ensure: () => rpc("korova_ensure_room", { p_code: roomCode }),
    getState: async () => { const s=await rpc("korova_get_state",{p_code:roomCode});s.currentGame.draftScores=await rpc("korova_get_draft_scores",{p_code:roomCode});return s; },
    addPlayer: (name,emoji)=>rpc("korova_add_player",{p_code:roomCode,p_name:name,p_emoji:emoji}),
    removePlayer: playerId=>rpc("korova_remove_player",{p_code:roomCode,p_player_id:playerId}),
    addExistingPlayer: profileId=>rpc("korova_add_existing_player",{p_code:roomCode,p_profile_id:profileId}),
    updatePlayerIcon: (playerId,emoji)=>rpc("korova_update_player_icon",{p_code:roomCode,p_player_id:playerId,p_emoji:emoji}),
    addRound: (scores) => rpc("korova_add_round", { p_code: roomCode, p_scores: scores }),
    setDraftScore: (playerId, score) => rpc("korova_set_draft_score", { p_code: roomCode, p_player_id: playerId, p_score: score }),
    clearDraftScore: (playerId) => rpc("korova_clear_draft_score", { p_code: roomCode, p_player_id: playerId }),
    finalizeRound: ()=>rpc("korova_finalize_round",{p_code:roomCode}),
    importGame: (playedAt,profiles,rounds)=>rpc("korova_import_game",{p_code:roomCode,p_played_at:playedAt,p_profiles:profiles,p_rounds:rounds}),
    updateRound: (roundId,scores)=>rpc("korova_update_round",{p_code:roomCode,p_round_id:roundId,p_scores:scores}),
    undoRound: ()=>rpc("korova_undo_last_round",{p_code:roomCode}),
    newGame: keepPlayers=>rpc("korova_new_game",{p_code:roomCode,p_keep_players:keepPlayers})
  };
}

function createLocalApi() {
  const key = `korova-room-${roomCode}`;
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  function fresh() {
    return {
      room: { code: roomCode, createdAt: new Date().toISOString() },
      knownPlayers: [],
      currentGame: { id: uid(), startedAt: new Date().toISOString(), players: [], rounds: [], draftScores: {} },
      archive: []
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(key)) || fresh();
      if (!Array.isArray(s.knownPlayers)) s.knownPlayers = [];
      if (!s.currentGame.draftScores) s.currentGame.draftScores = {};
      const allPlayers = [...(s.currentGame?.players || []), ...(s.archive || []).flatMap(g => g.players || [])];
      for (const player of allPlayers) {
        let profile = s.knownPlayers.find(x => x.id === player.profileId) || s.knownPlayers.find(x => x.name.trim().toLowerCase() === player.name.trim().toLowerCase());
        if (!profile) { profile = { id: uid(), name: player.name, emoji: player.emoji }; s.knownPlayers.push(profile); }
        player.profileId = profile.id;
      }
      localStorage.setItem(key, JSON.stringify(s));
      return s;
    } catch { return fresh(); }
  }
  function save(value) { localStorage.setItem(key, JSON.stringify(value)); return structuredClone(value); }
  return {
    adminLogin: async pin => ({token:"local",expiresAt:"2099-01-01T00:00:00Z"}),
    deleteGame: async gameId=>{const s=load();s.archive=s.archive.filter(g=>g.id!==gameId);return save(s)},
    mergeProfiles: async (source,target)=>{const s=load();for(const x of [s.currentGame,...s.archive].flatMap(g=>g.players||[]))if(x.profileId===source)x.profileId=target;s.knownPlayers=s.knownPlayers.filter(x=>x.id!==source);return save(s)},
    updateProfile: async (profileId,name,emoji)=>{const s=load(),pr=s.knownPlayers.find(x=>x.id===profileId);if(pr){pr.name=name;pr.emoji=emoji}for(const x of [s.currentGame,...s.archive].flatMap(g=>g.players||[]))if(x.profileId===profileId){x.name=name;x.emoji=emoji}return save(s)},
    ensure: async () => { if (!localStorage.getItem(key)) save(fresh()); },
    getState: async () => structuredClone(load()),
    addPlayer: async (name, emoji) => {
      const s = load();
      if (s.currentGame.players.length >= LIMIT) throw new Error("В игре уже 10 игроков");
      if (s.currentGame.rounds.length) throw new Error("Игроков можно менять только до первого раунда");
      let profile = s.knownPlayers.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (!profile) { profile = { id: uid(), name, emoji }; s.knownPlayers.push(profile); }
      if (s.currentGame.players.some(x => x.profileId === profile.id)) throw new Error("Этот игрок уже участвует");
      s.currentGame.players.push({ id: uid(), profileId: profile.id, name: profile.name, emoji: profile.emoji, seat: s.currentGame.players.length + 1 });
      return save(s);
    },
    addExistingPlayer: async (profileId) => {
      const s = load();
      if (s.currentGame.rounds.length) throw new Error("Игроков можно менять только до первого раунда");
      if (s.currentGame.players.length >= LIMIT) throw new Error("В игре уже 10 игроков");
      const profile = s.knownPlayers.find(x => x.id === profileId);
      if (!profile) throw new Error("Игрок не найден");
      if (s.currentGame.players.some(x => x.profileId === profile.id)) throw new Error("Этот игрок уже участвует");
      s.currentGame.players.push({ id: uid(), profileId: profile.id, name: profile.name, emoji: profile.emoji, seat: s.currentGame.players.length + 1 });
      return save(s);
    },
    updatePlayerIcon: async (playerId, emoji) => {
      const s = load(); const player = s.currentGame.players.find(x => x.id === playerId);
      if (!player) throw new Error("Игрок не найден");
      const profile = s.knownPlayers.find(x => x.id === player.profileId); if (profile) profile.emoji = emoji;
      for (const item of [s.currentGame, ...s.archive].flatMap(g => g.players || [])) if (item.profileId === player.profileId) item.emoji = emoji;
      return save(s);
    },
    removePlayer: async (id) => {
      const s = load();
      if (s.currentGame.rounds.length) throw new Error("Игроков можно менять только до первого раунда");
      s.currentGame.players = s.currentGame.players.filter(p => p.id !== id).map((p, i) => ({ ...p, seat: i + 1 }));
      return save(s);
    },
    setDraftScore: async (playerId, score) => { const s=load();s.currentGame.draftScores[playerId]=score;save(s);return structuredClone(s.currentGame.draftScores); },
    clearDraftScore: async (playerId) => { const s=load();delete s.currentGame.draftScores[playerId];save(s);return structuredClone(s.currentGame.draftScores); },
    importGame: async (playedAt, profiles, rounds) => { const s=load(),game={id:uid(),startedAt:playedAt,finishedAt:playedAt,players:profiles.map((id,i)=>{const p=s.knownPlayers.find(x=>x.id===id);return{id:uid(),profileId:id,name:p.name,emoji:p.emoji,seat:i+1}}),rounds:[]};game.rounds=rounds.map((r,i)=>({id:uid(),number:i+1,createdAt:playedAt,scores:Object.fromEntries(game.players.map(x=>[x.id,r[x.profileId]]))}));s.archive.push(game);s.archive.sort((x,y)=>new Date(y.finishedAt)-new Date(x.finishedAt));return save(s); },
    finalizeRound: async () => { const s=load(),scores=s.currentGame.draftScores||{};if(s.currentGame.players.some(x=>!Object.prototype.hasOwnProperty.call(scores,x.id)))throw new Error("Сначала каждый игрок должен внести свои очки");s.currentGame.rounds.push({id:uid(),number:s.currentGame.rounds.length+1,createdAt:new Date().toISOString(),scores:{...scores}});s.currentGame.draftScores={};return save(s); },
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
        players: keepPlayers ? old.players.map((p, i) => ({ ...p, id: uid(), seat: i + 1 })) : [], draftScores: {}
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
  const now=Date.now(),days=statsPeriod==="week"?7:statsPeriod==="month"?30:null;
  const games=[...state.archive].filter(g=>!days||now-new Date(g.finishedAt||g.startedAt).getTime()<=days*86400000).reverse();
  const map=new Map();
  for(const game of games){const ranks=ranking(game),best=ranks[0]?.total,winners=new Set(ranks.filter(x=>x.total===best).map(x=>x.profileId||x.name.toLowerCase()));for(const player of ranks){const key=player.profileId||player.name.toLowerCase();const won=winners.has(key);const x=map.get(key)||{profileId:player.profileId||key,name:player.name,emoji:player.emoji,games:0,wins:0,points:0,best:Infinity,streak:0,bestStreak:0,trend:[]};x.name=player.name;x.emoji=player.emoji;x.games++;x.points+=player.total;x.best=Math.min(x.best,player.total);x.trend.push(player.total);if(won){x.wins++;x.streak++;x.bestStreak=Math.max(x.bestStreak,x.streak)}else x.streak=0;map.set(key,x)}}
  const items=[...map.values()].map(x=>({...x,average:Math.round(x.points/x.games*10)/10,winRate:Math.round(x.wins/x.games*100)})).sort((a,b)=>b.wins-a.wins||a.average-b.average);
  return {items,games};
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
        <div class="room-tools"><button class="admin-pill ${isAdmin()?"active":""}" data-action="open-admin">${isAdmin()?"🔓 Организатор":"🔒 Войти"}</button><span class="sync-badge ${!navigator.onLine?"offline":pendingWrites.length?"pending":"saved"}">${!navigator.onLine?`Нет соединения · не отправлено ${pendingWrites.length}`:pendingWrites.length?`Не отправлено: ${pendingWrites.length}`:"Всё сохранено"}</span>
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

function buildDailyInsights(game){
  if(state.archive.length<3)return[];
  const active=(game.players||[]).map(x=>(state.knownPlayers||[]).find(p=>p.id===x.profileId)).filter(Boolean),pool=active.length>=2?active:(state.knownPlayers||[]).filter(p=>careerFor(p.id).games).slice(0,8),size=active.length>=2?active.length:null;
  if(pool.length<2)return[];
  const forecasts=pool.map(p=>{const all=careerFor(p.id),same=all.rows.filter(r=>!size||r.game.players.length===size),base=same.length>=3?same:all.rows,wins=base.filter(r=>r.won).length,raw=(wins+1)/(base.length+2);return{p,wins,games:base.length,raw,exact:Boolean(size&&same.length>=3)}}).sort((x,y)=>y.raw-x.raw),sum=forecasts.reduce((s,x)=>s+x.raw,0)||1;
  forecasts.forEach(x=>x.chance=Math.max(1,Math.round(x.raw/sum*100)));
  const top=forecasts[0],confidence=top.games>=10?"высокая":top.games>=5?"средняя":"низкая";
  const forecast={key:"forecast",kicker:"Прогноз на игру",title:size?`Кто фаворит за столом из ${size} игроков`:"Кто сегодня фаворит",body:`<div class="classic-forecast"><div class="forecast-star"><span>${esc(top.p.emoji)}</span><div><small>фаворит по истории</small><b>${esc(top.p.name)}</b><p>${top.exact?`партии с ${size} игроками`:"общая статистика"}</p></div><strong>${top.chance}%</strong></div><div class="forecast-podium">${forecasts.slice(0,3).map((x,i)=>`<div><i>${i+1}</i><span>${esc(x.p.emoji)} <b>${esc(x.p.name)}</b></span><strong>${x.chance}%</strong></div>`).join("")}</div><p class="deck-footnote">Достоверность: <b>${confidence}</b> · выборка ${top.games} игр</p></div>`};
  const formRows=pool.map(p=>{const c=careerFor(p.id),vals=c.rows.map(r=>r.total),recent=vals.slice(-3),prev=vals.slice(-6,-3),recentAvg=recent.length?recent.reduce((s,v)=>s+v,0)/recent.length:0,base=prev.length===3?prev.reduce((s,v)=>s+v,0)/3:c.average,delta=Math.round(base-recentAvg);return{p,c,recent,delta,recentAvg:Math.round(recentAvg)}}).filter(x=>x.recent.length>=2).sort((a,b)=>b.delta-a.delta),hot=formRows[0];
  const form={key:"form",kicker:"Текущая форма",title:hot&&hot.delta>0?`${esc(hot.p.name)} набирает ход`:"Кто сейчас в лучшей форме",body:`<div class="form-feature">${hot?`<div class="form-lead"><span>${esc(hot.p.emoji)}</span><div><small>лучшее движение</small><b>${hot.delta>0?`−${hot.delta} очк. к среднему`:`среднее ${hot.recentAvg}`}</b></div><em>${hot.delta>0?"↗":"→"}</em></div>`:""}<div class="form-ranking">${formRows.slice(0,3).map(x=>`<div><span>${esc(x.p.emoji)} <b>${esc(x.p.name)}</b></span><p>${x.recent.map(v=>`<i style="--v:${Math.min(100,v)}" title="${v}"></i>`).join("")}</p><strong class="${x.delta>=0?"up":"down"}">${x.delta>=0?"↑":"↓"} ${Math.abs(x.delta)}</strong></div>`).join("")}</div><p class="deck-footnote">Сравнение последних трёх партий с предыдущими</p></div>`};
  let rivalry=null;for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){const h=headToHead(pool[i].id,pool[j].id);if(h.shared<2)continue;const weight=h.shared*3-Math.abs(h.aw-h.bw);if(!rivalry||weight>rivalry.weight){const last=state.archive.find(g=>g.players.some(x=>x.profileId===pool[i].id)&&g.players.some(x=>x.profileId===pool[j].id));rivalry={a:pool[i],b:pool[j],h,last,weight}}}
  const lastText=rivalry?.last?(()=>{const pa=rivalry.last.players.find(x=>x.profileId===rivalry.a.id),pb=rivalry.last.players.find(x=>x.profileId===rivalry.b.id),at=totalFor(pa.id,rivalry.last),bt=totalFor(pb.id,rivalry.last);return at===bt?"Последняя встреча завершилась вничью":`Последнюю встречу выиграл ${esc(at<bt?rivalry.a.name:rivalry.b.name)}`})():"";
  const rivalryCard=rivalry?{key:"rivalry",kicker:"Дуэль вечера",title:`${esc(rivalry.a.name)} × ${esc(rivalry.b.name)}`,body:`<div class="duel-feature"><div class="duel-side"><span>${esc(rivalry.a.emoji)}</span><b>${esc(rivalry.a.name)}</b><strong>${rivalry.h.aw}</strong><small>${plural(rivalry.h.aw,"победа","победы","побед")}</small></div><div class="duel-center"><em>VS</em><p>${rivalry.h.shared} встреч</p><small>ничьи ${rivalry.h.ties}</small></div><div class="duel-side"><span>${esc(rivalry.b.emoji)}</span><b>${esc(rivalry.b.name)}</b><strong>${rivalry.h.bw}</strong><small>${plural(rivalry.h.bw,"победа","победы","побед")}</small></div></div><p class="duel-last">⚡ ${lastText}</p>`}:forecast;
  let biggest=null,closest=null,bestScore=null;for(const g of state.archive){const r=ranking(g);if(r.length<2)continue;const margin=r[1].total-r[0].total;if(!biggest||margin>biggest.margin)biggest={g,w:r[0],runner:r[1],margin};if(margin>0&&(!closest||margin<closest.margin))closest={g,w:r[0],runner:r[1],margin};if(!bestScore||r[0].total<bestScore.w.total)bestScore={g,w:r[0],runner:r[1],margin}}
  const milestones=pool.map(p=>{const c=careerFor(p.id),target=c.games<25?25:c.games<50?50:100;return{p,c,target,left:target-c.games}}).sort((a,b)=>a.left-b.left),near=milestones[0];
  const stories=[biggest&&{title:"Самый крупный отрыв",icon:"🏆",main:`${esc(biggest.w.emoji)} ${esc(biggest.w.name)}`,stat:`+${biggest.margin} очк.`,text:`${formatDate(biggest.g.finishedAt||biggest.g.startedAt)} · впереди ${esc(biggest.runner.name)}`},closest&&{title:"Самый близкий фотофиниш",icon:"🎯",main:`${esc(closest.w.emoji)} ${esc(closest.w.name)}`,stat:`+${closest.margin}`,text:`${formatDate(closest.g.finishedAt||closest.g.startedAt)} · победа на тоненького`},bestScore&&{title:"Лучший результат комнаты",icon:"✨",main:`${esc(bestScore.w.emoji)} ${esc(bestScore.w.name)}`,stat:`${bestScore.w.total}`,text:`${formatDate(bestScore.g.finishedAt||bestScore.g.startedAt)} · личная страница истории`},{title:"Ближайшая большая веха",icon:"🏅",main:`${esc(near.p.emoji)} ${esc(near.p.name)}`,stat:`${near.left}`,text:`${plural(near.left,"партия","партии","партий")} до отметки ${near.target}`}].filter(Boolean),day=Number(new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Minsk"}).replaceAll("-","")),story=stories[day%stories.length];
  const history={key:"history",kicker:"Сегодня из архива",title:story.title,body:`<div class="history-feature"><span>${story.icon}</span><div><small>история комнаты</small><b>${story.main}</b><p>${story.text}</p></div><strong>${story.stat}</strong></div><div class="history-timeline"><i></i><span>На основе ${state.archive.length} сохранённых партий</span><i></i></div>`};
  return[forecast,form,rivalryCard,history];
}
function dailyCard(game){const cards=buildDailyInsights(game);if(!cards.length)return"";insightIndex=((insightIndex%cards.length)+cards.length)%cards.length;const c=cards[insightIndex];return`<section class="daily-carousel insight-deck" data-card="${c.key}" aria-label="Аналитика перед игрой"><button class="deck-nav prev" data-action="insight-prev" aria-label="Предыдущая карточка">‹</button><header><div><span>🎴 ${c.kicker}</span><b>${c.title}</b></div><small>${insightIndex+1} / ${cards.length}</small></header><div class="insight-slide deck-body" data-insight-key="${c.key}">${c.body}</div><div class="deck-pagination"><div class="insight-dots">${cards.map((x,i)=>`<button class="${i===insightIndex?"active":""}" data-action="insight-go" data-index="${i}" aria-label="Карточка ${i+1}"></button>`).join("")}</div><small>листайте аналитику</small></div><button class="deck-nav next" data-action="insight-next" aria-label="Следующая карточка">›</button></section>`}

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

    ${dailyCard(game)}
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
    <button class="player-icon editable-icon" data-action="open-edit-icon" data-id="${player.id}" title="Изменить значок" aria-label="Изменить значок игрока ${esc(player.name)}">${esc(player.emoji)}<span>${icon("edit")}</span></button>
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
  const drafts=game.draftScores||{},players=[...game.players].sort((a,b)=>a.seat-b.seat),ready=players.every(p=>Object.prototype.hasOwnProperty.call(drafts,p.id));
  return `<section class="score-section"><div class="section-heading light"><div><span class="section-no">02</span><h2>Очки раунда</h2></div><span class="hint">Заполнено ${Object.keys(drafts).length} из ${players.length}</span></div><p class="score-collab">Заполняйте как удобно: один человек за всех или каждый со своего телефона.</p>${reached66?`<div class="game-over continue"><span>🐮</span><div><b>Рубеж 66 пройден</b><small>Игра продолжается до ручного завершения.</small></div></div>`:""}<form id="round-form" class="score-form"><div class="score-inputs">${players.map(p=>{const has=Object.prototype.hasOwnProperty.call(drafts,p.id);return `<label class="score-row ${has?"score-ready":""}"><span class="score-person"><i>${esc(p.emoji)}</i><b>${esc(p.name)}</b><small>${has?"результат сохранён":"значение не введено"}</small></span><span class="number-wrap"><span>${has?"✓":"＋"}</span><input data-draft-player="${p.id}" inputmode="numeric" min="0" max="999" type="number" value="${has?drafts[p.id]:""}" placeholder="—" aria-label="Очки игрока ${esc(p.name)}"></span></label>`}).join("")}</div><div class="score-actions"><button class="button primary large" type="submit" ${ready&&!busy?"":"disabled"}>${icon("save")} ${ready?"Завершить раунд":"Заполните все результаты"}</button>${game.rounds.length?`<button class="button ghost" type="button" data-action="undo">${icon("undo")} Отменить последний</button>`:""}<button class="button ghost" type="button" data-action="open-reset">${icon("refresh")} Новая игра</button><button class="button finish" type="button" data-action="open-finish" ${game.rounds.length?"":'disabled'}>${icon("flag")} Завершить игру</button></div></form></section>`;
}
function renderRounds(game) {
 const players=[...game.players].sort((a,b)=>a.seat-b.seat);
 return `<section class="rounds-section"><div class="section-heading"><div><span class="section-no">03</span><h2>Ход партии</h2></div><span class="hint">Нажмите раунд, чтобы раскрыть</span></div><div class="round-accordion always">${[...game.rounds].reverse().map((r,i)=>`<details ${i===0?"open":""}><summary><span>Раунд ${r.number}</span><b>${new Date(r.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</b></summary><div>${players.map(p=>`<p><span>${esc(p.emoji)} ${esc(p.name)}</span><strong>+${r.scores[p.id]??0}</strong></p>`).join("")}<button class="button secondary full" data-action="open-edit-round" data-id="${r.id}">${icon("edit")} Исправить раунд</button></div></details>`).join("")}<button class="undo-change" data-action="undo-change">${icon("undo")} Отменить последнее исправление</button></div></section>`;
}
function renderArchive(){
  if(!state.archive.length)return `<section class="archive-empty"><div class="empty-trophy">${icon("trophy")}</div><h1>Архив ещё пуст</h1><p>Завершённые партии появятся здесь вместе с датой, составом и финальным счётом.</p><button class="button primary" data-action="open-import">＋ Добавить прошлую партию</button></section>`;
  const recent=state.archive.slice(0,3),older=state.archive.slice(3),visible=older.slice(0,archiveShown);
  const compact=visible.map((game,i)=>{const ranks=ranking(game),best=ranks[0]?.total,winners=ranks.filter(x=>x.total===best);return `<button class="archive-compact-row" data-action="open-archive-game" data-id="${game.id}"><span class="compact-date">${formatDate(game.finishedAt||game.startedAt)}</span><span class="compact-winner">${esc(winners[0]?.emoji||"🏆")} <b>${winners.map(x=>esc(x.name)).join(", ")}</b></span><small>${game.players.length} ${plural(game.players.length,"игрок","игрока","игроков")} · ${game.rounds.length} ${plural(game.rounds.length,"раунд","раунда","раундов")}</small><strong>${best} очк.</strong><i>›</i></button>`}).join("");
  return `<section class="archive-page"><div class="archive-title archive-title-actions"><div><span class="eyebrow">История стола</span><h1>Прошлые игры</h1><p>Сразу показаны три последние партии. Остальные хранятся в компактном списке.</p></div><button class="button secondary" data-action="open-import">＋ Добавить прошлую партию</button></div><div class="recent-archive"><div class="archive-section-title"><b>Последние партии</b><span>${Math.min(3,state.archive.length)} из ${state.archive.length}</span></div><div class="archive-list">${recent.map((g,i)=>renderArchiveGame(g,i)).join("")}</div></div>${older.length?`<details class="archive-older" ${olderArchiveOpen?"open":""}><summary><span><b>Предыдущие партии</b><small>${older.length} ${plural(older.length,"партия","партии","партий")}</small></span><em>Открыть список</em></summary><div class="archive-compact-list">${compact}</div>${visible.length<older.length?`<button class="button secondary archive-more" data-action="show-more-archive">Показать ещё ${Math.min(10,older.length-visible.length)}</button>`:""}</details>`:""}</section>`;
}
function renderArchiveGame(game, index) {
  const ranks = ranking(game);
  const best = ranks[0]?.total;
  const winners = ranks.filter(p => p.total === best);
  return `<article class="archive-card">
    <div class="archive-head">
      <div><span class="archive-index">Партия ${state.archive.length - index}</span><h2>${formatDate(game.finishedAt || game.startedAt)}</h2><small>${game.rounds.length} ${plural(game.rounds.length,"раунд","раунда","раундов")} · ${game.players.length} ${plural(game.players.length,"игрок","игрока","игроков")}</small></div>
      <div class="winner-badge"><span>${esc(winners[0]?.emoji || "🏆")}</span><div><small>${winners.length > 1 ? "Победители" : "Победитель"}</small><b>${winners.map(p => esc(p.name)).join(", ") || "—"}</b></div></div>${isAdmin()?`<button class="archive-delete" data-action="delete-archive" data-id="${game.id}">Удалить</button>`:""}
    </div>
    <ol class="archive-results">
      ${ranks.map((p, i) => `<li class="${p.total === best ? "winner" : ""}"><span class="place">${i + 1}</span><span class="avatar">${esc(p.emoji)}</span><b>${esc(p.name)}</b><strong>${p.total}<small> очк.</small></strong></li>`).join("")}
    </ol>
  </article>`;
}

function renderStatistics() {
  const data=statistics(),items=data.items;
  if(!items.length)return `<section class="archive-empty"><div class="empty-trophy">${icon("chart")}</div><h1>Нет партий за период</h1><p>Выберите другой период или завершите игру.</p><div class="period-tabs">${renderPeriods()}</div></section>`;
  const renderTrend=p=>{const vals=p.trend.slice(-8),max=Math.max(...vals,1);return `<span class="mini-trend" aria-label="Последние результаты: ${vals.join(", ")}">${vals.map(v=>`<i style="height:${Math.max(8,Math.round(v/max*34))}px" title="${v} очк."></i>`).join("")}</span>`};
  const player=p=>`<button class="stat-player stat-player-open" data-action="open-player-card" data-id="${p.profileId||""}"><span class="stat-rank">${p.rank}</span><span class="avatar">${esc(p.emoji)}</span><b>${esc(p.name)}</b></button>`;
  const ranked=items.map((p,i)=>({...p,rank:i+1}));
  return `<section class="stats-page"><div class="archive-title"><span class="eyebrow">Личная история</span><h1>Статистика игроков</h1><div class="period-tabs">${renderPeriods()}</div></div>
  <div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>Игрок</th><th>Игры</th><th>Победы</th><th>% побед</th><th>Среднее</th><th>Рекорд</th><th>Серия</th><th>Динамика</th></tr></thead><tbody>${ranked.map(p=>`<tr><td>${player(p)}</td><td>${p.games}</td><td>${p.wins}</td><td><strong>${p.winRate}%</strong></td><td>${p.average}</td><td>${p.best}</td><td>${p.streak} <small>(макс. ${p.bestStreak})</small></td><td>${renderTrend(p)}</td></tr>`).join("")}</tbody></table></div>
  <div class="stats-mobile">${ranked.map(p=>`<article class="stat-card"><header>${player(p)}<strong>${p.winRate}%<small> побед</small></strong></header><div class="stat-card-grid"><div><small>Игры</small><b>${p.games}</b></div><div><small>Победы</small><b>${p.wins}</b></div><div><small>Среднее</small><b>${p.average}</b></div><div><small>Рекорд</small><b>${p.best}</b></div></div><footer><span>Серия: <b>${p.streak}</b> · максимум ${p.bestStreak}</span><span class="trend-box">${renderTrend(p)}<small>последние игры</small></span></footer></article>`).join("")}</div>
  <details class="stats-help"><summary>Что означают показатели?</summary><dl><div><dt>Среднее</dt><dd>Средний итоговый штрафной счёт за партию. Чем меньше, тем лучше.</dd></div><div><dt>Рекорд</dt><dd>Самый низкий итоговый счёт игрока за выбранный период.</dd></div><div><dt>Серия</dt><dd>Победы подряд сейчас; в скобках — лучшая серия за период.</dd></div><div><dt>Динамика</dt><dd>Последние результаты слева направо. Низкий столбик лучше высокого.</dd></div></dl></details>${renderAwardsHub()}</section>`;
}
function renderPeriods(){return [["week","Неделя"],["month","Месяц"],["all","Всё время"]].map(([id,label])=>`<button type="button" class="${statsPeriod===id?"active":""}" data-action="stats-period" data-period="${id}">${label}</button>`).join("")}

function careerFor(profileId){const games=[...state.archive].sort((a,b)=>new Date(a.finishedAt)-new Date(b.finishedAt)),rows=[];for(const g of games){const p=g.players.find(x=>x.profileId===profileId);if(!p)continue;const total=totalFor(p.id,g),best=Math.min(...ranking(g).map(x=>x.total));rows.push({game:g,total,won:total===best})}let streak=0,bestStreak=0;for(const r of rows){if(r.won){streak++;bestStreak=Math.max(bestStreak,streak)}else streak=0}return{rows,games:rows.length,wins:rows.filter(x=>x.won).length,average:rows.length?Math.round(rows.reduce((s,x)=>s+x.total,0)/rows.length*10)/10:0,best:rows.length?Math.min(...rows.map(x=>x.total)):0,streak,bestStreak}}
function playerAnalytics(profileId){const c=careerFor(profileId),vals=c.rows.map(x=>x.total),mean=c.average,variance=vals.length?vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length:0;let rounds=0,points=0,narrowWins=0,comebacks=0,zeroTriple=false;for(const row of c.rows){const g=row.game,p=g.players.find(x=>x.profileId===profileId),rank=ranking(g),second=rank[1]?.total??rank[0]?.total;if(row.won&&second-row.total<=3)narrowWins++;rounds+=g.rounds.length;points+=row.total;let z=0;for(const r of g.rounds){if((r.scores[p.id]??0)===0){z++;if(z>=3)zeroTriple=true}else z=0}if(row.won&&g.rounds.length>=2){const half=Math.max(1,Math.floor(g.rounds.length/2)),partial=g.players.map(x=>({id:x.id,total:g.rounds.slice(0,half).reduce((s,r)=>s+(r.scores[x.id]??0),0)})).sort((x,y)=>x.total-y.total);if(partial.at(-1)?.id===p.id)comebacks++}}const recent=vals.slice(-3),prev=vals.slice(-6,-3),improvement=recent.length===3&&prev.length===3?(prev.reduce((a,b)=>a+b,0)/3-recent.reduce((a,b)=>a+b,0)/3):0;return{...c,variance,avgRound:rounds?points/rounds:Infinity,narrowWins,comebacks,zeroTriple}}
function temporaryTitles(){const all=(state.knownPlayers||[]).map(p=>({p,m:playerAnalytics(p.id)})).filter(x=>x.m.games),eligible=all.filter(x=>x.m.games>=3);if(!all.length)return[];const one=(name,desc,list,sort)=>{if(!list.length)return{name,desc,holders:[]};const sorted=[...list].sort(sort),best=sorted[0],holders=sorted.filter(x=>sort(x,best)===0).map(x=>x.p);return{name,desc,holders}};let h2h=all.map(x=>{let net=0;for(const y of all)if(x!==y){const z=headToHead(x.p.id,y.p.id);net+=z.aw-z.bw}return{...x,net}});return[one("Укротитель коров","Лучшее среднее при 3+ играх",eligible,(a,b)=>a.m.average-b.m.average),one("Коровий магнит","Самое высокое среднее при 3+ играх",eligible,(a,b)=>b.m.average-a.m.average),one("Железное копыто","Больше всего сыгранных партий",all,(a,b)=>b.m.games-a.m.games),one("Снайпер шестого ряда","Самый низкий результат одной партии",all,(a,b)=>a.m.best-b.m.best),one("Победный галоп","Самая длинная серия побед",all,(a,b)=>b.m.bestStreak-a.m.bestStreak),one("Коровьи горки","Самые переменчивые результаты",eligible,(a,b)=>b.m.variance-a.m.variance),one("Коровий метроном","Самые стабильные результаты",eligible,(a,b)=>a.m.variance-b.m.variance),one("Тёмная лошадка","Лучшее улучшение последних трёх игр",eligible.filter(x=>x.m.improvement>0),(a,b)=>b.m.improvement-a.m.improvement),one("Мастер фотофиниша","Больше всего побед с разницей до 3 очков",all.filter(x=>x.m.narrowWins),(a,b)=>b.m.narrowWins-a.m.narrowWins),one("Экономист стада","Самое низкое среднее за раунд",eligible,(a,b)=>a.m.avgRound-b.m.avgRound),one("Гроза соперников","Лучший баланс личных встреч",h2h,(a,b)=>b.net-a.net)]}
const PERMANENT_RULES=[
 ["Три в ряд","Три победы подряд",m=>m.bestStreak>=3],["Пять в ряд","Пять побед подряд",m=>m.bestStreak>=5],["Ветеран стада","25 партий",m=>m.games>=25],["Старейшина стада","50 партий",m=>m.games>=50],["Легенда коровника","100 партий",m=>m.games>=100],["На одно копыто","Победа с преимуществом ровно в одно очко",m=>m.rows.some(r=>r.won&&((ranking(r.game)[1]?.total??r.total)-r.total===1))],["Разгромное мычание","Победа с преимуществом 20+ очков",m=>m.rows.some(r=>r.won&&((ranking(r.game)[1]?.total??r.total)-r.total>=20))],["Ровно 66","Закончить партию ровно с 66 очками",m=>m.rows.some(r=>r.total===66)],["Из последних в первые","Идти последним в середине партии и победить",m=>m.comebacks>0],["Нулевая диета","Три нулевых раунда подряд",m=>m.zeroTriple]];
function permanentAwards(profileId){const m=playerAnalytics(profileId);return PERMANENT_RULES.filter(x=>x[2](m)).map(x=>({name:x[0],desc:x[1]}))}
function awardsFor(profileId){return temporaryTitles().filter(t=>t.holders.some(p=>p.id===profileId)).map(t=>t.name)}
function renderAwardsHub(){const temps=temporaryTitles();const rows=gamificationTab==="temporary"?temps.map(t=>`<article class="title-row" title="${esc(t.desc)}"><div><b>${t.name}</b><small>${t.desc}</small></div><span>${t.holders.length?t.holders.map(p=>`${esc(p.emoji)} ${esc(p.name)}`).join(", "):"Пока не присвоен"}</span></article>`).join(""):PERMANENT_RULES.map(r=>{const holders=(state.knownPlayers||[]).filter(p=>permanentAwards(p.id).some(x=>x.name===r[0]));return`<article class="title-row" title="${esc(r[1])}"><div><b>${r[0]}</b><small>${r[1]}</small></div><span>${holders.length?holders.map(p=>`${esc(p.emoji)} ${esc(p.name)}`).join(", "):"Ещё никто"}</span></article>`}).join("");return`<details class="awards-shell" ${awardsOpen?"open":""}><summary><span><small>Зал наград</small><b>Номинации и достижения</b></span><em>Показать</em></summary><section class="awards-hub"><header><div class="award-tabs"><button class="${gamificationTab==="temporary"?"active":""}" data-action="award-tab" data-tab-id="temporary">Временные</button><button class="${gamificationTab==="permanent"?"active":""}" data-action="award-tab" data-tab-id="permanent">Постоянные</button></div></header><div class="title-list">${rows}</div></section></details>`}
function headToHead(a,b){let aw=0,bw=0,ties=0,shared=0;for(const g of state.archive){const pa=g.players.find(x=>x.profileId===a),pb=g.players.find(x=>x.profileId===b);if(!pa||!pb)continue;shared++;const at=totalFor(pa.id,g),bt=totalFor(pb.id,g);if(at<bt)aw++;else if(bt<at)bw++;else ties++}return{shared,aw,bw,ties}}
function browserHelp(){const ua=navigator.userAgent;if(/iPhone|iPad/i.test(ua))return"Safari: нажмите «Поделиться», затем «На экран Домой». Во встроенном браузере сначала выберите «Открыть в Safari».";if(/MiuiBrowser/i.test(ua))return"Браузер Xiaomi не всегда устанавливает приложение. Скопируйте ссылку, откройте её в Google Chrome и выберите меню ⋮, затем «Добавить на главный экран».";if(/SamsungBrowser/i.test(ua))return"Samsung Internet: откройте меню ☰, выберите «Добавить страницу в», затем «Главный экран».";return"Google Chrome на Android: откройте меню ⋮ и выберите «Добавить на главный экран» или «Установить приложение»."}

function renderModal() {
  if (!modal) return "";
  const shell = body => `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" data-modal><button class="modal-close" data-action="close-modal" aria-label="Закрыть">×</button>${body}</section></div>`;

  if(modal==="admin"){return shell(`<span class="eyebrow">Режим организатора</span><h2>${isAdmin()?"Доступ открыт":"Введите PIN"}</h2>${isAdmin()?`<p class="modal-text">Административные действия доступны до ${formatDate(adminSession.expiresAt)}.</p><button class="button secondary full" data-action="admin-logout">Выйти из режима организатора</button><details class="admin-merge"><summary>Объединить дубли профилей</summary><form id="merge-profiles-form"><select name="source">${(state.knownPlayers||[]).map(p=>`<option value="${p.id}">${esc(p.emoji)} ${esc(p.name)}</option>`).join("")}</select><span>→</span><select name="target">${(state.knownPlayers||[]).map(p=>`<option value="${p.id}">${esc(p.emoji)} ${esc(p.name)}</option>`).join("")}</select><button class="button primary full" type="submit">Объединить</button></form></details>`:`<form id="admin-login-form"><label class="field-label">Шестизначный PIN</label><input class="text-input admin-pin" name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus><button class="button primary full" type="submit">Войти</button></form>`}`)}
  if(modal==="archive-game"){const game=state.archive.find(g=>g.id===selectedArchiveId);if(!game)return"";const ranks=ranking(game),best=ranks[0]?.total;return shell(`<span class="eyebrow">Архивная партия</span><h2>${formatDate(game.finishedAt||game.startedAt)}</h2><p class="modal-text">${game.players.length} ${plural(game.players.length,"игрок","игрока","игроков")} · ${game.rounds.length} ${plural(game.rounds.length,"раунд","раунда","раундов")}</p><ol class="archive-results archive-modal-results">${ranks.map((p,i)=>`<li class="${p.total===best?"winner":""}"><span class="place">${i+1}</span><span class="avatar">${esc(p.emoji)}</span><b>${esc(p.name)}</b><strong>${p.total}<small> очк.</small></strong></li>`).join("")}</ol>${isAdmin()?`<button class="archive-delete button secondary full" data-action="delete-archive" data-id="${game.id}">Удалить ошибочную партию</button>`:""}`)}
  if(modal==="import"){const known=state.knownPlayers||[];return shell(`<span class="eyebrow">Ручной архив</span><h2>Добавить прошлую партию</h2><form id="import-setup-form"><label class="field-label">Дата игры</label><input class="text-input" type="date" name="date" max="${new Date().toISOString().slice(0,10)}" required><span class="field-label">Участники</span><div class="import-profiles">${known.map(p=>`<label><input type="checkbox" name="profile" value="${p.id}"><span>${esc(p.emoji)} ${esc(p.name)}</span></label>`).join("")}</div><button class="button primary full" type="submit">Продолжить к раундам</button></form>`)}
  if(modal==="import-rounds"){const profiles=manualImport.profileIds.map(id=>state.knownPlayers.find(p=>p.id===id)),quick=manualImport.quick;return shell(`<div class="import-head"><div><span class="eyebrow">${manualImport.date}</span><h2>${quick?"Быстрый ввод итогов":"Таблица как в блокноте"}</h2></div><button class="button secondary" data-action="toggle-import-mode">${quick?"Указать раунды":"Только итоги"}</button></div><form id="import-game-form">${quick?`<div class="quick-totals">${profiles.map(p=>`<label><span>${esc(p.emoji)} <b>${esc(p.name)}</b></span><input type="number" min="0" max="999" name="r0-${p.id}" placeholder="Итог" required></label>`).join("")}</div>`:`<div class="import-sheet-wrap"><table class="import-sheet"><thead><tr><th>Раунд</th>${profiles.map(p=>`<th>${esc(p.emoji)}<br>${esc(p.name)}</th>`).join("")}</tr></thead><tbody>${Array.from({length:manualImport.roundCount},(_,i)=>`<tr><th>${i+1}</th>${profiles.map(p=>`<td><input type="number" min="0" max="999" inputmode="numeric" name="r${i}-${p.id}"></td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr><th>Итого</th>${profiles.map(p=>`<td><b data-import-total="${p.id}">0</b></td>`).join("")}</tr></tfoot></table></div><div class="import-actions"><button type="button" class="button secondary" data-action="import-add-round">＋ Раунд</button><button type="button" class="button secondary" data-action="import-remove-round">− Раунд</button></div>`}<button class="button primary full" type="submit">Сохранить прошлую партию</button></form>`)}
  if(modal==="player-card"){const p=(state.knownPlayers||[]).find(x=>x.id===selectedProfileId);if(!p)return"";const c=playerAnalytics(p.id),titles=temporaryTitles().filter(t=>t.holders.some(x=>x.id===p.id)),permanent=permanentAwards(p.id),opponents=(state.knownPlayers||[]).filter(x=>x.id!==p.id&&state.archive.some(g=>g.players.some(y=>y.profileId===p.id)&&g.players.some(y=>y.profileId===x.id))),opp=opponents.find(x=>x.id===selectedOpponentId)||opponents[0],h=opp?headToHead(p.id,opp.id):null,next=c.games<25?25:c.games<50?50:100;return shell(`<section class="premium-profile"><div class="premium-glow"></div><header><div class="premium-avatar">${esc(p.emoji)}</div><div><span class="eyebrow">Личная карточка</span><h2>${esc(p.name)}</h2><small>${c.games?`${Math.round(c.wins/c.games*100)}% побед · ${c.games} игр`:"Новый игрок"}</small></div></header><div class="premium-metrics"><div><b>${c.games}</b><small>игр</small></div><div><b>${c.wins}</b><small>побед</small></div><div><b>${c.average}</b><small>среднее</small></div><div><b>${c.best}</b><small>рекорд</small></div></div><details class="profile-titles"><summary>Временные титулы <span>${titles.length}</span></summary><div>${titles.length?titles.map(t=>`<article title="${esc(t.desc)}"><b>✦ ${t.name}</b><small>${t.desc}</small></article>`).join(""):`<small>Титулы ещё впереди</small>`}</div></details>${opponents.length?`<div class="premium-h2h"><div class="compact-heading"><h3>Личные встречи</h3><small>${opponents.length} соперников</small></div><label class="opponent-select-wrap"><span>Соперник</span><select id="opponent-select">${opponents.map(x=>`<option value="${x.id}" ${opp?.id===x.id?"selected":""}>${esc(x.emoji)} ${esc(x.name)}</option>`).join("")}</select></label>${h?`<div class="duel-card"><div class="duel-names"><span>${esc(p.name)}</span><span>${esc(opp.name)}</span></div><div class="duel-scoreline"><div><strong>${h.aw}</strong><small>${plural(h.aw,"победа","победы","побед")}</small></div><em>:</em><div><strong>${h.bw}</strong><small>${plural(h.bw,"победа","победы","побед")}</small></div></div><p>${h.shared} ${plural(h.shared,"общая встреча","общие встречи","общих встреч")} · ${h.ties} ${plural(h.ties,"ничья","ничьи","ничьих")}</p></div>`:""}</div>`:""}<details class="profile-achievements"><summary>Постоянные достижения <span>${permanent.length}</span></summary><div>${permanent.length?permanent.map(x=>`<span title="${esc(x.desc)}">🏅 ${x.name}</span>`).join(""):`<small>До следующей вехи ${Math.max(0,next-c.games)} игр</small>`}</div></details></section>`)}
  if (modal === "add") {
    const activeIds = new Set(state.currentGame.players.map(p => p.profileId));
    const returning = (state.knownPlayers || []).filter(p => !activeIds.has(p.id));
    return shell(`<span class="eyebrow">Состав партии</span><h2>Кто сегодня играет?</h2>${returning.length ? `<span class="field-label">Уже играл��</span><div class="known-players">${returning.map(p => `<button class="known-player" data-action="add-existing" data-id="${p.id}"><span>${esc(p.emoji)}</span><b>${esc(p.name)}</b><small>Добавить</small></button>`).join("")}</div><div class="or-divider"><span>или новый игрок</span></div>` : ""}<form id="player-form">
      <label class="field-label" for="player-name">Имя нового игрока</label><input class="text-input" id="player-name" name="name" maxlength="24" autocomplete="off" placeholder="Например, Андрей" required autofocus>
      <span class="field-label">Выберите персонажа</span><div class="emoji-grid">${EMOJIS.map(e => `<button type="button" class="emoji-choice ${e === selectedEmoji ? "selected" : ""}" data-action="emoji" data-emoji="${e}" aria-label="Выбрать ${e}">${e}</button>`).join("")}</div>
      <button class="button primary large full" type="submit" ${busy ? "disabled" : ""}>${icon("userPlus")} Добавить нового игрока</button></form>`);
  }
  if (modal === "edit-icon") {
    const player = state.currentGame.players.find(p => p.id === editingPlayerId);
    if (!player) return "";
    return shell(`<span class="eyebrow">Профиль игрока</span><h2>${esc(player.name)}</h2><form id="edit-profile-form"><label class="field-label">Имя</label><input class="text-input" name="name" value="${esc(player.name)}" maxlength="24" required><span class="field-label">Значок</span><div class="emoji-grid">${EMOJIS.map(e => `<button type="button" class="emoji-choice ${e === selectedEmoji ? "selected" : ""}" data-action="emoji" data-emoji="${e}" aria-label="Выбрать ${e}">${e}</button>`).join("")}</div><button class="button primary large full" type="submit">${icon("save")} Сохранить профиль</button></form>`);
  }
  if (modal === "edit") {
    const round = state.currentGame.rounds.find(r => r.id === editingRoundId);
    if (!round) return "";
    return shell(`<span class="eyebrow">Исправление результата</span><h2>Раунд ${round.number}</h2><p class="modal-text">Измените нужные значения — общий счёт пересчитается автоматически.</p><form id="edit-round-form" class="edit-round-form">
      ${[...state.currentGame.players].sort((a,b)=>a.seat-b.seat).map(p=>`<label class="edit-score"><span><i>${esc(p.emoji)}</i><b>${esc(p.name)}</b></span><input type="number" inputmode="numeric" min="0" max="999" name="${p.id}" value="${round.scores[p.id] ?? 0}" required></label>`).join("")}
      <button class="button primary large full" type="submit" ${busy ? "disabled" : ""}>${icon("save")} Сохранить изменения</button></form>`);
  }
  if (modal === "share") return shell(`<span class="eyebrow">Комната ${roomCode}</span><h2>Позвать игроков</h2><div class="qr-card"><img src="${"https:"+"//api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data="+encodeURIComponent(location.href)}" alt="QR-код ссылки на комнату"><div><b>Наведите камеру</b><small>Все откроют ту же комнату</small></div></div><div class="share-actions"><button class="button primary full" data-action="copy-link">${icon("copy")} Скопировать ссылку</button><button class="button secondary full" data-action="install-app">${icon("download")} Установить приложение</button></div><p class="install-note">${browserHelp()}</p>`);
  if (modal === "reset") return shell(`<span class="eyebrow">Новая партия</span><h2>Начать новую игру?</h2><p class="modal-text">${state.currentGame.rounds.length ? "Текущий результат сохранится в архиве без праздничного экрана." : "Текущий пустой стол будет сброшен."}</p><label class="check-row"><input id="keep-players" type="checkbox" checked><span><b>Оставить тех же игроков</b><small>Счёт начнётся с нуля</small></span></label><button class="button primary large full" data-action="reset-game" ${busy ? "disabled" : ""}>${icon("refresh")} Начать новую игру</button>`);
  if (modal === "finish") return shell(`<span class="eyebrow">Финиш партии</span><h2>Завершить игру?</h2><p class="modal-text">Результат попадёт в архив и статистику. Победит игрок с на��меньшим счётом.</p><label class="check-row"><input id="keep-players" type="checkbox" checked><span><b>Оставить тех же игроков</b><small>Новая партия начнётся с нулевого счёта</small></span></label><button class="button finish large full" data-action="finish-game" ${busy ? "disabled" : ""}>${icon("flag")} Завершить и показать победителя</button>`);
  if (modal === "winner" && celebrationGame) {
    const ranks = ranking(celebrationGame); const best = ranks[0]?.total; const winners = ranks.filter(p=>p.total===best);
    return `<div class="modal-backdrop winner-backdrop"><div class="confetti" aria-hidden="true">${Array.from({length:28},(_,i)=>`<i style="--i:${i}"></i>`).join("")}</div><section class="modal winner-modal" role="dialog" aria-modal="true" data-modal><span class="winner-crown">🏆</span><span class="eyebrow">Партия завершена</span><h2>${winners.length>1?"Победители":"Победитель"}: ${winners.map(p=>esc(p.name)).join(", ")}</h2><div class="winner-avatars">${winners.map(p=>`<span>${esc(p.emoji)}</span>`).join("")}</div><p>Лучший результат — <b>${best} очк.</b></p><ol class="mini-results">${ranks.map((p,i)=>`<li><span>${i+1}. ${esc(p.emoji)} ${esc(p.name)}</span><b>${p.total}</b></li>`).join("")}</ol><div class="fun-awards">${funAwards(celebrationGame).map(x=>`<div title="${esc(x.desc)}"><span>🏅</span><p><b>${x.title}</b><small>${esc(x.player.emoji)} ${esc(x.player.name)} · ${x.desc}</small></p></div>`).join("")}</div><button class="button secondary large full" data-action="share-final-card">${icon("share")} Поделиться итогами</button><button class="button primary large full" data-action="close-winner">${icon("cards")} Перейти к новой игре</button></section></div>`;
  }
  return "";
}

function plural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? few : many;
}

function funAwards(game){const ranks=ranking(game),out=[];if(!ranks.length)return out;const winner=ranks[0],last=ranks.at(-1);out.push({title:"Не сегодня, коровы",player:winner,desc:"Лучший итог партии"});if(last.id!==winner.id)out.push({title:"Пылесос коров",player:last,desc:"Самый большой итог"});let biggest={player:null,value:-1},zeros=[],sixes=[];for(const p of game.players){let z=0,s=0;for(const r of game.rounds){const v=r.scores[p.id]??0;if(v===0)z++;if(v===6)s++;if(v>biggest.value)biggest={player:p,value:v}}zeros.push({p,v:z});sixes.push({p,v:s})}if(biggest.player)out.push({title:"Главный животновод",player:biggest.player,desc:`Самый крупный раунд: +${biggest.value}`});const zero=zeros.sort((a,b)=>b.v-a.v)[0];if(zero?.v)out.push({title:"Мимо проходило стадо",player:zero.p,desc:`Нулевых раундов: ${zero.v}`});const six=sixes.sort((a,b)=>b.v-a.v)[0];if(six?.v)out.push({title:"Шестое чувство",player:six.p,desc:`Раундов ровно на 6: ${six.v}`});const closest=[...ranks].sort((a,b)=>Math.abs(a.total-66)-Math.abs(b.total-66))[0];out.push({title:"На грани фола",player:closest,desc:`Ближе всех к 66: ${closest.total}`});if(ranks[1]&&ranks[1].total-winner.total<=3)out.push({title:"Фотофиниш",player:winner,desc:`Победа с разницей ${ranks[1].total-winner.total}`});return out.slice(0,6)}

function shareFinalCard(game){const ranks=ranking(game),c=document.createElement("canvas");c.width=1080;c.height=1350;const x=c.getContext("2d");x.fillStyle="#123e32";x.fillRect(0,0,1080,1350);x.fillStyle="#f8cb49";x.fillRect(70,70,940,250);x.fillStyle="#201e1b";x.font="bold 70px Arial";x.fillText("Коровосчёт",120,180);x.font="36px Arial";x.fillText("Итоги партии",120,250);x.fillStyle="#fffaf0";x.fillRect(70,360,940,900);ranks.forEach((p,i)=>{x.fillStyle="#201e1b";x.font="42px Arial";x.fillText(`${i+1}. ${p.emoji} ${p.name}`,120,470+i*90);x.font="bold 48px Arial";x.fillText(String(p.total),850,470+i*90)});c.toBlob(async b=>{const file=new File([b],"korova-result.png",{type:"image/png"});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file]});else{const u=URL.createObjectURL(b),q=document.createElement("a");q.href=u;q.download=file.name;q.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}})}

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
  if(action==="open-admin"){modal="admin";render();return}
  if(action==="admin-logout"){adminSession=null;localStorage.removeItem(adminKey);modal=null;render();return}

  if(action==="insight-prev"){const cards=buildDailyInsights(state.currentGame);insightIndex=(insightIndex-1+cards.length)%cards.length;render();return}
  if(action==="insight-next"){const cards=buildDailyInsights(state.currentGame);insightIndex=(insightIndex+1)%cards.length;render();return}
  if(action==="insight-go"){insightIndex=Number(button.dataset.index)||0;render();return}
  if(action==="open-archive-game"){selectedArchiveId=button.dataset.id;olderArchiveOpen=true;modal="archive-game";render();return}
  if(action==="show-more-archive"){olderArchiveOpen=true;archiveShown+=10;render();return}
  if(action==="award-tab"){gamificationTab=button.dataset.tabId;awardsOpen=true;render();return}
  if(action==="toggle-import-mode"){manualImport.quick=!manualImport.quick;manualImport.roundCount=manualImport.quick?1:5;render();return}
  if(action==="delete-archive"&&confirm("Удалить эту архивную партию?")){mutate(()=>api.deleteGame(button.dataset.id),"Партия удалена");return}
  if(action==="share-final-card"&&celebrationGame){shareFinalCard(celebrationGame);return}
  if(action==="open-import"){manualImport=null;modal="import";render();return}
  if(action==="import-add-round"){manualImport.roundCount++;render();return}
  if(action==="import-remove-round"&&manualImport.roundCount>1){manualImport.roundCount--;render();return}
  if(action==="open-player-card"){selectedProfileId=button.dataset.id;selectedOpponentId=null;modal="player-card";render();return}
  if(action==="select-opponent"){selectedOpponentId=button.dataset.id;render();return}
  if (action === "stats-period") { statsPeriod = button.dataset.period || "all"; render(); return; }
  if (action === "open-add") { selectedEmoji = EMOJIS[state.currentGame.players.length % EMOJIS.length]; modal = "add"; render(); setTimeout(() => document.querySelector("#player-name")?.focus(), 0); }
  if (action === "close-modal" && (button.classList.contains("modal-close") || !event.target.closest("[data-modal]"))) { modal = null; editingRoundId = null; editingPlayerId = null; render(); }
  if (action === "emoji") { const name = document.querySelector("#player-name")?.value || ""; selectedEmoji = button.dataset.emoji; render(); const input = document.querySelector("#player-name"); if (input) { input.value = name; input.focus(); } }
  if (action === "add-existing") { mutate(() => api.addExistingPlayer(button.dataset.id), "Игрок добавлен в состав"); }
  if (action === "open-edit-icon") { const player = state.currentGame.players.find(p => p.id === button.dataset.id); editingPlayerId = button.dataset.id; selectedEmoji = player?.emoji || EMOJIS[0]; modal = "edit-icon"; render(); }
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
    else showToast(browserHelp(), "ok");
  }
});

root.addEventListener("touchstart",event=>{if(!event.target.closest(".daily-carousel"))return;const t=event.touches[0];insightTouch={x:t.clientX,y:t.clientY}},{passive:true});
root.addEventListener("touchend",event=>{if(!insightTouch||!event.target.closest(".daily-carousel"))return;const t=event.changedTouches[0],dx=t.clientX-insightTouch.x,dy=t.clientY-insightTouch.y;insightTouch=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){const cards=buildDailyInsights(state.currentGame);insightIndex=(insightIndex+(dx<0?1:-1)+cards.length)%cards.length;render()}},{passive:true});

function refreshDraftUi() {
  const drafts=state.currentGame.draftScores||{},players=state.currentGame.players;
  document.querySelectorAll("[data-draft-player]").forEach(input=>{
    const has=Object.prototype.hasOwnProperty.call(drafts,input.dataset.draftPlayer),row=input.closest(".score-row");
    row?.classList.toggle("score-ready",has);
    const status=row?.querySelector(".score-person small"),mark=row?.querySelector(".number-wrap > span");
    if(status)status.textContent=has?"результат сохра��ён":"значение не введено";
    if(mark)mark.textContent=has?"✓":"＋";
    if(document.activeElement!==input)input.value=has?drafts[input.dataset.draftPlayer]:"";
    input.disabled=false;
  });
  const count=Object.keys(drafts).length,ready=players.length>0&&players.every(p=>Object.prototype.hasOwnProperty.call(drafts,p.id));
  const hint=document.querySelector(".score-section .section-heading .hint");if(hint)hint.textContent=`Заполнено ${count} из ${players.length}`;
  const button=document.querySelector('#round-form button[type="submit"]');if(button){button.disabled=!ready||busy||!navigator.onLine||pendingWrites.length>0;button.innerHTML=`${icon("save")} ${ready?"Завершить раунд":"Заполните все результаты"}`;}
}

root.addEventListener("input",event=>{if(!event.target.closest("#import-game-form"))return;for(const id of manualImport.profileIds){let sum=0;document.querySelectorAll(`[name$="-${id}"]`).forEach(x=>sum+=Number(x.value)||0);const out=document.querySelector(`[data-import-total="${id}"]`);if(out)out.textContent=sum}});

function updateSyncBadge(){const el=document.querySelector(".sync-badge");if(!el)return;el.className=`sync-badge ${!navigator.onLine?"offline":pendingWrites.length?"pending":"saved"}`;el.textContent=!navigator.onLine?`Нет соединения · не отправлено ${pendingWrites.length}`:pendingWrites.length?`Не отправлено: ${pendingWrites.length}`:"Всё сохранено"}
function queueDraft(type,playerId,score){pendingWrites=pendingWrites.filter(x=>x.playerId!==playerId);pendingWrites.push({type,playerId,score});localStorage.setItem(pendingKey,JSON.stringify(pendingWrites));if(type==="clear")delete state.currentGame.draftScores[playerId];else state.currentGame.draftScores[playerId]=score;refreshDraftUi();updateSyncBadge()}
async function flushPending(){if(!cloudMode||!navigator.onLine||!pendingWrites.length)return;for(const op of [...pendingWrites]){try{op.type==="clear"?await api.clearDraftScore(op.playerId):await api.setDraftScore(op.playerId,op.score);pendingWrites=pendingWrites.filter(x=>x!==op);localStorage.setItem(pendingKey,JSON.stringify(pendingWrites))}catch{break}}updateSyncBadge();if(!pendingWrites.length)syncStateNow()}
root.addEventListener("change", async event => {const opponent=event.target.closest("#opponent-select");if(opponent){selectedOpponentId=opponent.value;render();return}const input=event.target.closest("[data-draft-player]");if(!input)return;const raw=input.value.trim(),score=Number(raw),type=raw===""?"clear":"set";if(raw!==""&&(!Number.isInteger(score)||score<0||score>999)){showToast("Введите целое число от 0 до 999","error");return}if(cloudMode&&!navigator.onLine){queueDraft(type,input.dataset.draftPlayer,score);showToast("Нет соединения — сохранили на устройстве");return}try{input.disabled=true;updateSyncBadge();const drafts=type==="clear"?await api.clearDraftScore(input.dataset.draftPlayer):await api.setDraftScore(input.dataset.draftPlayer,score);state.currentGame.draftScores=drafts;lastStateHash=JSON.stringify(state);refreshDraftUi();updateSyncBadge();showToast(type==="clear"?"Результат очищен":"Результат сохранён")}catch(e){if(cloudMode){queueDraft(type,input.dataset.draftPlayer,score);showToast("Не отправлено — повторим автоматически","error")}else{input.disabled=false;showToast(e.message||"Не удалось сохранить","error")}}});

root.addEventListener("submit", (event) => {
  event.preventDefault();
  if(event.target.id==="merge-profiles-form"){const fd=new FormData(event.target),s=fd.get("source"),t=fd.get("target");if(s===t){showToast("Выберите разные профили","error");return}if(confirm("Объединить профили? История будет перенесена."))mutate(()=>api.mergeProfiles(s,t),"Профили объединены");return}
  if(event.target.id==="admin-login-form"){const pin=new FormData(event.target).get("pin");mutate(async()=>{adminSession=await api.adminLogin(pin);localStorage.setItem(adminKey,JSON.stringify(adminSession));return api.getState()},"Режим организатора включён");return}
  if(event.target.id==="import-setup-form"){const fd=new FormData(event.target),ids=fd.getAll("profile"),date=fd.get("date");if(ids.length<2){showToast("Выберите минимум двух игроков","error");return}manualImport={date,profileIds:ids,roundCount:1,quick:true};modal="import-rounds";render();return}
  if(event.target.id==="import-game-form"){const fd=new FormData(event.target),rounds=[];for(let i=0;i<manualImport.roundCount;i++){const row={};let any=false,all=true;for(const id of manualImport.profileIds){const v=fd.get(`r${i}-${id}`);if(v!==""){any=true;row[id]=Number(v)}else all=false}if(any&&!all){showToast(`Заполните весь раунд ${i+1}`,"error");return}if(any)rounds.push(row)}if(!rounds.length){showToast("Добавьте хотя бы один раунд","error");return}mutate(()=>api.importGame(`${manualImport.date}T12:00:00`,manualImport.profileIds,rounds),"Прошлая партия добавлена");return}
  if (event.target.id === "player-form") { const name = new FormData(event.target).get("name")?.trim(); if (name) mutate(() => api.addPlayer(name, selectedEmoji), `${name} за столом`); }
  if(event.target.id==="edit-profile-form"){const pl=state.currentGame.players.find(x=>x.id===editingPlayerId),name=new FormData(event.target).get("name")?.trim();if(name!==pl.name&&!isAdmin()){modal="admin";render();showToast("Переименование доступно организатору");return}mutate(()=>name!==pl.name?api.updateProfile(pl.profileId,name,selectedEmoji):api.updatePlayerIcon(pl.id,selectedEmoji),"Профиль обновлён");}
  if (event.target.id === "round-form") mutate(() => api.finalizeRound(), "Раунд завершён");
  if (event.target.id === "edit-round-form") { const form=new FormData(event.target),scores={};for(const player of state.currentGame.players){const raw=form.get(player.id);if(raw===""||raw==null||Number(raw)<0||!Number.isInteger(Number(raw))){showToast(`Укажите очки для ${player.name}`,"error");return}scores[player.id]=Number(raw)}mutate(()=>api.updateRound(editingRoundId,scores),"Результат раунда исправлен"); }
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
    scheduleSync(5000);flushPending();
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
window.addEventListener("online", () => { syncRetryDelay=5000;updateSyncBadge();flushPending(); });
window.addEventListener("offline",()=>{updateSyncBadge();refreshDraftUi()});

async function init() {
  render();
  try {
    await api.ensure();
    state = await api.getState();
    lastStateHash = JSON.stringify(state);
    render();
    scheduleSync(5000);
  } catch (error) {
    root.innerHTML = `<main class="fatal"><div class="logo-card mini">��<b>006</b></div><h1>Не удалось открыть комнату</h1><p>${esc(error.message)}</p><button class="button primary" onclick="location.reload()">Попробовать снова</button></main>`;
  }
}
init();
