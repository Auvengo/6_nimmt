const EMOJIS = ["🐮","🐂","🐄","🤠","🐃","🐷","🐶","🐱","🦊","🐭","🐹","🐰","🐻","🐼","🐨","🐯","🦁","🐸","🐵","🐔","🐧","🐦","🐺","🐗","🐴","🐝","🐛","🐌","🐞","🐜","🐢","🐍","🦂","🦀","🐙","🐬","🐳","🌵","🌽","🎲","🃏","⭐","🔥","🍀","🌙","⚡","🍉","🌈","🚀"];
const LIMIT = 10;
const WIN_LINE = 66;
const root = document.querySelector("#app");
const cfg = window.KOROVA_CONFIG || {};
const TV_MODE = new URLSearchParams(location.search).get("display") === "tv";
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
let winnerTab = "summary";
let deferredInstallPrompt = null;
let statsPeriod = "all";
let selectedProfileId = null, selectedOpponentId = null, manualImport = null;
let gamificationTab = "temporary";
let awardsOpen = false;
let olderArchiveOpen = false, archivePage = 0, selectedArchiveId = null;
let archiveFeed={items:[],nextCursor:null,hasMore:false,loading:false,loaded:false},archiveObserver=null;
const archiveDetails=new Map();
let historyLoaded=!cloudMode,historyLoading=null,statsMemo={key:null,value:null};
const draftSaveTimers = new Map();
let insightIndex = 0, insightTouch = null;
let insightTimer = null, insightPausedUntil = 0;
const INSIGHT_DELAY = 9000;
let tvCelebrationGame = null, tvCelebrationUntil = 0, tvCelebrationTimer = null;
let tvEventUntil = 0, tvEventTimer = null;
const pendingKey = `korova-pending-${roomCode}`;
let pendingWrites = JSON.parse(localStorage.getItem(pendingKey) || "[]");
const adminKey=`korova-admin-${roomCode}`;let adminSession=JSON.parse(localStorage.getItem(adminKey)||"null");
const importDraftKey=`korova-import-draft-${roomCode}`;
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
    getLiveState: () => rpc("korova_live_state",{p_code:roomCode}),
    getHistory: async()=>{try{return await rpc("korova_history_data",{p_code:roomCode})}catch{return (await rpc("korova_get_state",{p_code:roomCode})).archive||[]}},
    archivePage: async(cursor=null,limit=12)=>{try{return await rpc("korova_archive_page_v2",{p_code:roomCode,p_cursor:cursor,p_limit:limit})}catch(e){if(/archive_page_v2|schema cache|404/i.test(e.message))return rpc("korova_archive_page",{p_code:roomCode,p_before:cursor?.finishedAt||cursor,p_limit:limit});throw e}},
    gameDetail: gameId=>rpc("korova_game_detail",{p_code:roomCode,p_game_id:gameId}),
    addPlayer: (name,emoji)=>rpc("korova_add_player",{p_code:roomCode,p_name:name,p_emoji:emoji}),
    removePlayer: playerId=>rpc("korova_remove_player",{p_code:roomCode,p_player_id:playerId}),
    addExistingPlayer: profileId=>rpc("korova_add_existing_player",{p_code:roomCode,p_profile_id:profileId}),
    updatePlayerIcon: (playerId,emoji)=>rpc("korova_update_player_icon",{p_code:roomCode,p_player_id:playerId,p_emoji:emoji}),
    addRound: (scores) => rpc("korova_add_round", { p_code: roomCode, p_scores: scores }),
    setDraftScore: (playerId, score) => rpc("korova_set_draft_score", { p_code: roomCode, p_player_id: playerId, p_score: score }),
    clearDraftScore: (playerId) => rpc("korova_clear_draft_score", { p_code: roomCode, p_player_id: playerId }),
    finalizeRound: async token=>{try{return await rpc("korova_finalize_round_v2",{p_code:roomCode,p_client_token:token})}catch(e){if(/finalize_round_v2|schema cache|404/i.test(e.message))return rpc("korova_finalize_round",{p_code:roomCode});throw e}},
    importGame: async(playedAt,profiles,rounds,mode)=>{try{return await rpc("korova_import_game_v2",{p_code:roomCode,p_played_at:playedAt,p_profiles:profiles,p_rounds:rounds,p_score_mode:mode})}catch(e){if(mode==="rounds"&&/import_game_v2|schema cache|404/i.test(e.message))return rpc("korova_import_game",{p_code:roomCode,p_played_at:playedAt,p_profiles:profiles,p_rounds:rounds});throw e}},
    setGameScoreMode:(gameId,mode)=>rpc("korova_admin_set_game_score_mode",{p_code:roomCode,p_token:adminToken(),p_game_id:gameId,p_score_mode:mode}),
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
    setGameScoreMode:async(gameId,mode)=>{const s=load(),g=s.archive.find(x=>x.id===gameId);if(!g)throw new Error("Партия не найдена");g.scoreMode=mode;return save(s)},
    updateProfile: async (profileId,name,emoji)=>{const s=load(),pr=s.knownPlayers.find(x=>x.id===profileId);if(pr){pr.name=name;pr.emoji=emoji}for(const x of [s.currentGame,...s.archive].flatMap(g=>g.players||[]))if(x.profileId===profileId){x.name=name;x.emoji=emoji}return save(s)},
    ensure: async () => { if (!localStorage.getItem(key)) save(fresh()); },
    getState: async () => structuredClone(load()),
    getLiveState: async()=>{const s=structuredClone(load());s.archiveCount=s.archive.length;return s},
    getHistory: async()=>structuredClone(load().archive),
    archivePage: async(before=null,limit=12)=>{const games=load().archive.filter(g=>!before||new Date(g.finishedAt)<new Date(before)).slice(0,limit);return{items:games.map(g=>{const r=rankingFor(g),w=r[0];return{id:g.id,startedAt:g.startedAt,finishedAt:g.finishedAt,playerCount:g.players.length,roundCount:g.rounds.length,scoreMode:g.scoreMode||'rounds',winner:w?{profileId:w.profileId,name:w.name,emoji:w.emoji,total:w.total}:null}}),nextCursor:games.at(-1)?.finishedAt||null,hasMore:games.length===limit}},
    gameDetail: async gameId=>structuredClone(load().archive.find(g=>g.id===gameId)),
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
    importGame: async (playedAt, profiles, rounds, mode="rounds") => { const s=load(),game={id:uid(),startedAt:playedAt,finishedAt:playedAt,scoreMode:mode,players:profiles.map((id,i)=>{const p=s.knownPlayers.find(x=>x.id===id);return{id:uid(),profileId:id,name:p.name,emoji:p.emoji,seat:i+1}}),rounds:[]};game.rounds=rounds.map((r,i)=>({id:uid(),number:i+1,createdAt:playedAt,scores:Object.fromEntries(game.players.map(x=>[x.id,r[x.profileId]]))}));s.archive.push(game);s.archive.sort((x,y)=>new Date(y.finishedAt)-new Date(x.finishedAt));return save(s); },
    finalizeRound: async token => { const s=load(),scores=s.currentGame.draftScores||{};if(s.currentGame.players.some(x=>!Object.prototype.hasOwnProperty.call(scores,x.id)))throw new Error("Сначала каждый игрок должен внести свои очки");s.currentGame.rounds.push({id:uid(),number:s.currentGame.rounds.length+1,createdAt:new Date().toISOString(),scores:{...scores}});s.currentGame.draftScores={};return save(s); },
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

function rankingFor(game){return[...(game?.players||[])].map(p=>({...p,total:(game.rounds||[]).reduce((s,r)=>s+Number(r.scores?.[p.id]||0),0)})).sort((x,y)=>x.total-y.total||x.seat-y.seat)}
function hasRoundDetails(game){return game?.scoreMode!=="totals"}
function scoreModeLabel(game){return hasRoundDetails(game)?`${game.rounds?.length||game.roundCount||0} ${plural(game.rounds?.length||game.roundCount||0,"раунд","раунда","раундов")}`:"Только итоги"}
function setupArchiveAutoLoad(){archiveObserver?.disconnect();if(!cloudMode||tab!=="archive"||!archiveFeed.hasMore||archiveFeed.loading)return;const el=document.querySelector(".archive-auto-sentinel");if(!el||!window.IntersectionObserver)return;archiveObserver=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting))loadArchivePage(false)},{rootMargin:"220px"});archiveObserver.observe(el)}
function archiveTotal(){return Number(state?.archiveCount??state?.archive?.length??0)}
function mergeLive(next){const hasArchive=Array.isArray(next?.archive);if(hasArchive){historyLoaded=true;statsMemo={key:null,value:null}}const archive=hasArchive?next.archive:(historyLoaded?(state?.archive||[]):(state?.archive||[]));return{...next,archive,archiveCount:Number(next.archiveCount??(hasArchive?next.archive.length:null)??state?.archiveCount??archive.length)}}
async function getLive(){if(!cloudMode)return api.getLiveState();try{return await api.getLiveState()}catch{return api.getState()}}
async function ensureHistory(force=false){if(!cloudMode){historyLoaded=true;return state.archive}if(historyLoaded&&!force)return state.archive;if(historyLoading)return historyLoading;historyLoading=api.getHistory().then(rows=>{state.archive=Array.isArray(rows)?rows:[];state.archiveCount=state.archive.length;historyLoaded=true;statsMemo={key:null,value:null};lastStateHash=JSON.stringify({...state,archive:[]});render();return state.archive}).catch(e=>{showToast("Не удалось загрузить историю","error");throw e}).finally(()=>historyLoading=null);return historyLoading}
function invalidateHistory(){historyLoaded=!cloudMode;statsMemo={key:null,value:null};archiveFeed={items:[],nextCursor:null,hasMore:false,loading:false,loaded:false};archiveDetails.clear()}
async function loadArchivePage(reset=false){if(!cloudMode)return;if(archiveFeed.loading||(!reset&&archiveFeed.loaded&&!archiveFeed.hasMore))return;if(reset)archiveFeed={items:[],nextCursor:null,hasMore:false,loading:true,loaded:false};else archiveFeed.loading=true;render();try{const page=await api.archivePage(reset?null:archiveFeed.nextCursor,12),seen=new Set(archiveFeed.items.map(x=>x.id));archiveFeed.items=[...archiveFeed.items,...(page.items||[]).filter(x=>!seen.has(x.id))];archiveFeed.nextCursor=page.nextCursor||null;archiveFeed.hasMore=!!page.hasMore;archiveFeed.loaded=true}catch(e){showToast("Не удалось загрузить архив","error")}finally{archiveFeed.loading=false;render()}}
async function openArchiveGame(id){selectedArchiveId=id;olderArchiveOpen=true;const existing=archiveDetails.get(id)||(!cloudMode?(state.archive||[]).find(g=>g.id===id&&g.players&&g.rounds):null);if(existing){archiveDetails.set(id,existing);modal="archive-game";render();return}modal="archive-loading";render();try{const game=await api.gameDetail(id);if(!game)throw new Error("Партия не найдена");archiveDetails.set(id,game);modal="archive-game";render()}catch(e){modal=null;render();showToast(e.message||"Не удалось открыть партию","error")}}
function downloadText(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function exportBackup(format){await ensureHistory();const stamp=new Date().toISOString().slice(0,10);if(format==="json"){downloadText(`korova-${roomCode}-${stamp}.json`,JSON.stringify({version:"6.3",exportedAt:new Date().toISOString(),room:state.room,knownPlayers:state.knownPlayers,currentGame:state.currentGame,archive:state.archive},null,2),"application/json");return}const rows=[["Дата","Игрок","Место","Очки","Раунды","Игроков"]];for(const g of state.archive)rankingFor(g).forEach((x,i)=>rows.push([(g.finishedAt||g.startedAt||"").slice(0,10),x.name,i+1,x.total,g.rounds.length,g.players.length]));const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\n");downloadText(`korova-${roomCode}-${stamp}.csv`,csv,"text/csv;charset=utf-8")}

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
  const cacheKey=`${statsPeriod}:${state.archive.length}:${state.archive[0]?.id||''}:${state.archive.at(-1)?.id||''}`;if(statsMemo.key===cacheKey)return statsMemo.value;
  const now=Date.now(),days=statsPeriod==="week"?7:statsPeriod==="month"?30:null;
  const games=[...state.archive].filter(g=>!days||now-new Date(g.finishedAt||g.startedAt).getTime()<=days*86400000).reverse();
  const map=new Map();
  for(const game of games){const ranks=ranking(game),best=ranks[0]?.total,winners=new Set(ranks.filter(x=>x.total===best).map(x=>x.profileId||x.name.toLowerCase()));for(const player of ranks){const key=player.profileId||player.name.toLowerCase();const won=winners.has(key);const x=map.get(key)||{profileId:player.profileId||key,name:player.name,emoji:player.emoji,games:0,wins:0,points:0,best:Infinity,streak:0,bestStreak:0,trend:[]};x.name=player.name;x.emoji=player.emoji;x.games++;x.points+=player.total;x.best=Math.min(x.best,player.total);x.trend.push(player.total);if(won){x.wins++;x.streak++;x.bestStreak=Math.max(x.bestStreak,x.streak)}else x.streak=0;map.set(key,x)}}
  const items=[...map.values()].map(x=>({...x,average:Math.round(x.points/x.games*10)/10,winRate:Math.round(x.wins/x.games*100)})).sort((a,b)=>b.wins-a.wins||a.average-b.average);
  const value={items,games};statsMemo={key:cacheKey,value};return value;
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
    state=mergeLive(result?.currentGame?result:await getLive());
    lastStateHash=JSON.stringify({...state,archive:[]});
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

function gameEvents(game){
  if(!game?.rounds?.length)return[];
  const players=[...game.players],totals=Object.fromEntries(players.map(x=>[x.id,0])),events=[];
  let previousOrder=[...players].sort((a,b)=>a.seat-b.seat).map(x=>x.id),previousLeaders=[];
  let historicHeavy=0,historicLongest=0;
  for(const g of state.archive||[]){if(g.id===game.id||!hasRoundDetails(g))continue;historicLongest=Math.max(historicLongest,g.rounds?.length||0);for(const r of g.rounds||[])for(const v of Object.values(r.scores||{}))historicHeavy=Math.max(historicHeavy,Number(v)||0)}
  let heavyMark=historicHeavy,longestShown=false,currentHeavy=0;
  for(const round of game.rounds){
    const before={...totals};for(const x of players)totals[x.id]+=Number(round.scores?.[x.id]||0);
    const order=[...players].sort((x,y)=>totals[x.id]-totals[y.id]||x.seat-y.seat),best=totals[order[0].id],leaders=order.filter(x=>totals[x.id]===best),c=[];
    const scores=players.map(x=>({p:x,v:Number(round.scores?.[x.id]||0)})),heavy=[...scores].sort((x,y)=>y.v-x.v)[0];
    if(historicHeavy>0&&heavy.v>heavyMark){c.push({priority:100,icon:'💥',tone:'record',title:'Рекорд тяжёлого раунда',text:`${heavy.p.emoji} ${heavy.p.name} получает ${heavy.v} ${plural(heavy.v,'очко','очка','очков')} — новый рекорд комнаты`});heavyMark=heavy.v}
    if(!longestShown&&historicLongest>0&&round.number>historicLongest){c.push({priority:96,icon:'⏱️',tone:'record',title:'Самая длинная партия',text:`Раунд ${round.number} превысил прежний рекорд комнаты`});longestShown=true}
    const crossed=players.filter(x=>before[x.id]<WIN_LINE&&totals[x.id]>=WIN_LINE);if(crossed.length)c.push({priority:82,icon:'🐮',tone:'warning',title:'Рубеж 66 пройден',text:`${crossed.map(x=>`${x.emoji} ${x.name}`).join(', ')} — игра продолжается до ручного завершения`});
    if(round.number>1&&previousLeaders.length&&leaders.map(x=>x.id).join()!=previousLeaders.join()&&leaders.length===1){const old=players.find(x=>x.id===previousLeaders[0]),lead=leaders[0];c.push({priority:92,icon:'⚡',tone:'leader',title:'Смена лидера',text:`${lead.emoji} ${lead.name} обходит ${old?`${old.emoji} ${old.name}`:'соперников'} и выходит на первое место`})}
    if(round.number>1&&leaders.length>1&&previousLeaders.join()!=leaders.map(x=>x.id).join())c.push({priority:88,icon:'🤝',tone:'tie',title:'Первое место разделено',text:`${leaders.map(x=>`${x.emoji} ${x.name}`).join(' и ')} — по ${best} ${plural(best,'очку','очка','очков')}`});
    let jumper=null;if(round.number>1)for(const x of players){const was=previousOrder.indexOf(x.id),now=order.findIndex(y=>y.id===x.id),jump=was-now;if(jump>=3&&(!jumper||jump>jumper.jump))jumper={x,jump,was,now}}if(jumper)c.push({priority:72,icon:'🚀',tone:'jump',title:'Крупный рывок',text:`${jumper.x.emoji} ${jumper.x.name} поднимается с ${jumper.was+1}-го на ${jumper.now+1}-е место`});
    if(heavy.v>=20&&heavy.v>currentHeavy)c.push({priority:55,icon:'🔥',tone:'heavy',title:'Тяжёлый раунд',text:`${heavy.p.emoji} ${heavy.p.name} получает ${heavy.v} ${plural(heavy.v,'очко','очка','очков')} — максимум этой партии`});
    if(round.number===1){if(leaders.length===1)c.push({priority:30,icon:'🏁',tone:'leader',title:'Лидер после первого раунда',text:`${leaders[0].emoji} ${leaders[0].name} завершает первый раунд с лучшим результатом — ${best} ${plural(best,'очко','очка','очков')}`});else c.push({priority:30,icon:'🤝',tone:'tie',title:'Лидеры после первого раунда',text:`${leaders.map(x=>`${x.emoji} ${x.name}`).join(' и ')} завершили первый раунд с результатом ${best}`})};
    currentHeavy=Math.max(currentHeavy,heavy.v);const chosen=c.sort((x,y)=>y.priority-x.priority)[0];if(chosen)events.push({...chosen,roundId:round.id,round:round.number});previousOrder=order.map(x=>x.id);previousLeaders=leaders.map(x=>x.id);
  }
  return events;
}
function latestGameEvent(game){return gameEvents(game).at(-1)||null}
function renderLiveEvent(game){const e=latestGameEvent(game);return e?`<section class="live-event ${e.tone}"><span>${e.icon}</span><div><small>Событие ${e.round}-го раунда</small><b>${e.title}</b><p>${esc(e.text)}</p></div></section>`:''}
function renderTvEvent(game){const e=latestGameEvent(game);return e&&Date.now()<tvEventUntil?`<div class="tv-event ${e.tone}"><span>${e.icon}</span><div><small>Событие раунда ${e.round}</small><b>${e.title}</b><p>${esc(e.text)}</p></div></div>`:''}
function tvUrl(){const u=new URL(location.href);u.searchParams.set("room",roomCode);u.searchParams.set("display","tv");return u.toString()}
function todayGames(){const d=new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Minsk"});return(state.archive||[]).filter(g=>new Date(g.finishedAt||g.startedAt).toLocaleDateString("sv-SE",{timeZone:"Europe/Minsk"})===d)}
function tvDayLeaders(games){const m=new Map();for(const g of games){const r=ranking(g),best=r[0]?.total;for(const x of r.filter(y=>y.total===best)){const key=x.profileId||x.name,v=m.get(key)||{name:x.name,emoji:x.emoji,wins:0};v.wins++;m.set(key,v)}}return[...m.values()].sort((a,b)=>b.wins-a.wins)}
function renderTvCelebration(game){const r=ranking(game),best=r[0]?.total,winners=r.filter(x=>x.total===best),runner=r.find(x=>x.total>best),margin=runner?runner.total-best:0;root.innerHTML=`<main class="tv-shell tv-finale-shell"><header><div class="tv-brand"><span>🐮</span><div><b>Коровосчёт 006</b><small>Партия завершена</small></div></div><div class="tv-tools"><span class="tv-live">● Итоги</span><button data-action="tv-fullscreen">Во весь экран</button><a href="?room=${roomCode}">Выйти</a></div></header><section class="tv-finale"><div class="tv-confetti">${Array.from({length:36},(_,i)=>`<i style="--i:${i}"></i>`).join("")}</div><small>ПОБЕДИТЕЛЬ${winners.length>1?"И":""}</small><div class="tv-winner-avatars">${winners.map(x=>esc(x.emoji)).join(" ")}</div><h1>${winners.map(x=>esc(x.name)).join(" и ")}</h1><strong>${best} ${plural(best,"очко","очка","очков")}</strong><p>${runner?`Отрыв от второго места — ${margin} ${plural(margin,"очко","очка","очков")}`:"Победа зафиксирована"}</p><div class="tv-final-top">${r.slice(0,3).map((x,i)=>`<span><em>${["🥇","🥈","🥉"][i]}</em><b>${esc(x.emoji)} ${esc(x.name)}</b><strong>${x.total}</strong></span>`).join("")}</div><footer>Через несколько секунд табло вернётся к следующей игре</footer></section></main>`}
function renderTv(){if(tvCelebrationGame&&Date.now()<tvCelebrationUntil){renderTvCelebration(tvCelebrationGame);return}const g=state.currentGame,r=ranking(g),last=g.rounds.at(-1),today=todayGames(),leader=r[0],tvRows=Math.max(1,Math.ceil(r.length/2)),tvDense=r.length>=9?" tv-dense":"";document.body.classList.add("tv-mode");root.innerHTML=`<main class="tv-shell"><header><div class="tv-brand"><span>🐮</span><div><b>Коровосчёт 006</b><small>Большое табло · комната ${roomCode}</small></div></div><div class="tv-tools"><span class="tv-live ${navigator.onLine?"":"offline"}">● ${navigator.onLine?"В эфире":"Нет связи"}</span><button data-action="copy-tv-link">Ссылка</button><button data-action="tv-fullscreen">Во весь экран</button><a href="?room=${roomCode}">Выйти</a></div></header>${!g.players.length?`<section class="tv-empty"><div>🎴</div><h1>Ждём игроков</h1><p>Добавьте участников с телефона или ноутбука.</p></section>`:g.rounds.length?`<section class="tv-stage${tvDense}" style="--tv-rows:${tvRows}"><div class="tv-heading"><div><small>Текущая партия</small><h1>Раунд ${g.rounds.length+1}</h1></div><div><b>${leader?`${esc(leader.emoji)} ${esc(leader.name)}`:"—"}</b><small>сейчас впереди</small></div></div>${renderTvEvent(g)}<div class="tv-board">${r.map((x,i)=>`<article class="${i===0?"leader":""} ${x.total>=66?"over66":""}"><span class="tv-place">${i+1}</span><span class="tv-avatar">${esc(x.emoji)}</span><b>${esc(x.name)}</b><em>${last?`+${last.scores[x.id]??0}`:""}</em><strong>${x.total}</strong><small>${x.total>=66?"66+ · игра продолжается":"очков"}</small></article>`).join("")}</div><footer><span>В архиве: <b>${archiveTotal()}</b></span><span>Последнее обновление: <b>${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</b></span></footer></section>`:`<section class="tv-wait"><div><small>Состав готов · ${g.players.length} ${plural(g.players.length,"игрок","игрока","игроков")}</small><h1>Начинаем игру</h1><p>Прогноз перед первым раундом</p></div>${dailyCard(g)}<div class="tv-roster">${g.players.map(x=>`<span>${esc(x.emoji)} <b>${esc(x.name)}</b></span>`).join("")}</div></section>`}</main>`;scheduleInsightAuto()}
function render() {
  if (!state) {
    root.innerHTML = `<main class="loading"><div class="logo-card mini">🐮<b>006</b></div><p>Раскладываем карты…</p></main>`;
    return;
  }
  if(TV_MODE){renderTv();return}
  document.body.classList.remove("tv-mode");
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
        <div class="room-tools"><button class="tv-open" data-action="open-tv" title="Большое табло">📺 <span>Табло</span></button><button class="admin-pill ${isAdmin()?"active":""}" data-action="open-admin">${isAdmin()?"🔓 Организатор":"🔒 Войти"}</button><span class="sync-badge ${!navigator.onLine?"offline":pendingWrites.length?"pending":"saved"}">${!navigator.onLine?`Нет соединения · не отправлено ${pendingWrites.length}`:pendingWrites.length?`Не отправлено: ${pendingWrites.length}`:"Всё сохранено"}</span>
          <span class="room-label">Комната <b>${roomCode}</b></span>
          <button class="icon-btn" data-action="open-share" title="Поделиться и установить" aria-label="Поделиться и установить">${icon("share")}</button>
        </div>
      </header>

      ${!cloudMode ? `<aside class="demo-banner"><span>Локальный режим</span> Данные видны только на этом устройстве. Для мультидоступа подключите Supabase по README.</aside>` : ""}

      <nav class="tabs" aria-label="Разделы">
        <button class="tab ${tab === "game" ? "active" : ""}" data-tab="game">${icon("cards")} Текущая игра</button>
        <button class="tab ${tab === "archive" ? "active" : ""}" data-tab="archive">${icon("archive")} Архив <span>${archiveTotal()}</span></button>
        <button class="tab ${tab === "stats" ? "active" : ""}" data-tab="stats">${icon("chart")} Статистика</button>
      </nav>

      <main>
        ${tab === "game" ? renderGame(game, ranks, leader, danger) : tab === "archive" ? renderArchive() : renderStatistics()}
      </main>
      <footer><span>🐮</span> Меньше коров — ближе победа</footer>
    </div>
    ${renderModal()}
  `;
  scheduleInsightAuto();
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
  let closest=null,roomRecord=null;for(const g of state.archive){const r=ranking(g);if(r.length<2)continue;const margin=r[1].total-r[0].total;if(margin>0&&(!closest||margin<closest.margin))closest={g,w:r[0],runner:r[1],margin};if(!roomRecord||r[0].total<roomRecord.w.total)roomRecord={g,w:r[0],players:r.length}}
  const dayCode=new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Minsk"}),dayDate=new Date(`${dayCode}T12:00:00`),weekdayIndex=dayDate.getDay(),weekdayName=dayDate.toLocaleDateString("ru-RU",{weekday:"long"});
  const weekdayStats=pool.map(p=>{const rows=careerFor(p.id).rows.filter(r=>new Date(r.game.finishedAt||r.game.startedAt).getDay()===weekdayIndex),wins=rows.filter(r=>r.won).length;return{p,rows:rows.length,wins,rate:rows.length?wins/rows.length:0}}).filter(x=>x.rows>=3).sort((a,b)=>b.rate-a.rate||b.wins-a.wins),weekdayBest=weekdayStats[0];
  let nemesis=null;for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){const h=headToHead(pool[i].id,pool[j].id);if(h.shared<3||h.aw===h.bw)continue;const winner=h.aw>h.bw?pool[i]:pool[j],loser=h.aw>h.bw?pool[j]:pool[i],wins=Math.max(h.aw,h.bw),losses=Math.min(h.aw,h.bw),power=(wins-losses)/h.shared;if(!nemesis||power>nemesis.power)nemesis={winner,loser,wins,losses,shared:h.shared,ties:h.ties,power}}
  const specialists=size?pool.map(p=>{const rows=careerFor(p.id).rows.filter(r=>r.game.players.length===size),wins=rows.filter(r=>r.won).length;return{p,rows:rows.length,wins,rate:rows.length?wins/rows.length:0}}).filter(x=>x.rows>=3).sort((a,b)=>b.rate-a.rate||b.wins-a.wins):[],specialist=specialists[0];
  const storyCandidates=[roomRecord&&{kind:"record",title:"Рекорд комнаты",icon:"🏆",main:`${esc(roomRecord.w.emoji)} ${esc(roomRecord.w.name)}`,stat:`${roomRecord.w.total} очк.`,text:`Самый низкий итоговый штрафной счёт за всю историю. ${formatDate(roomRecord.g.finishedAt||roomRecord.g.startedAt)} · ${roomRecord.players} ${plural(roomRecord.players,"игрок","игрока","игроков")}.`},weekdayBest&&{kind:"weekday",title:`${weekdayName[0].toUpperCase()+weekdayName.slice(1)} — день ${esc(weekdayBest.p.name)}`,icon:"📅",main:`${esc(weekdayBest.p.emoji)} ${esc(weekdayBest.p.name)}`,stat:`${Math.round(weekdayBest.rate*100)}%`,text:`${weekdayBest.wins} ${plural(weekdayBest.wins,"победа","победы","побед")} в ${weekdayBest.rows} партиях по ${weekdayName.endsWith("а")?weekdayName.slice(0,-1)+"ам":weekdayName+"ам"}.`},nemesis&&{kind:"nemesis",title:"Неудобный соперник",icon:"⚔️",main:`${esc(nemesis.winner.emoji)} ${esc(nemesis.winner.name)}`,stat:`${nemesis.wins}:${nemesis.losses}`,text:`Такой счёт в личных встречах против ${esc(nemesis.loser.emoji)} ${esc(nemesis.loser.name)}. Всего ${nemesis.shared} игр, ничьи ${nemesis.ties}.`},closest&&{kind:"photo",title:"Фотофиниш из архива",icon:"🎯",main:`${esc(closest.w.emoji)} ${esc(closest.w.name)}`,stat:`+${closest.margin}`,text:`Победа над ${esc(closest.runner.name)} с минимальным отрывом. ${formatDate(closest.g.finishedAt||closest.g.startedAt)}.`},specialist&&{kind:"specialist",title:`Специалист по столу из ${size} игроков`,icon:"🧠",main:`${esc(specialist.p.emoji)} ${esc(specialist.p.name)}`,stat:`${Math.round(specialist.rate*100)}%`,text:`${specialist.wins} ${plural(specialist.wins,"победа","победы","побед")} в ${specialist.rows} партиях с таким количеством участников.`}].filter(Boolean),dayNumber=Number(dayCode.replaceAll("-","")),story=storyCandidates[dayNumber%storyCandidates.length];
  const history={key:"history",kicker:"Сюжет дня",title:story.title,body:`<div class="daily-story" data-story-kind="${story.kind}"><span>${story.icon}</span><div><small>по данным архива</small><b>${story.main}</b><p>${story.text}</p></div><strong>${story.stat}</strong></div><div class="history-timeline"><i></i><span>На основе ${state.archive.length} сохранённых партий</span><i></i></div>`};
  return[forecast,form,rivalryCard,history];
}
function clearInsightAuto(){clearTimeout(insightTimer);insightTimer=null}
function pauseInsightAuto(delay=INSIGHT_DELAY){insightPausedUntil=Date.now()+delay;clearInsightAuto()}
function scheduleInsightAuto(delay=INSIGHT_DELAY){
  clearInsightAuto();
  if(document.hidden||!state||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const deck=document.querySelector('.daily-carousel');
  if(!deck)return;
  const cards=buildDailyInsights(state.currentGame);
  if(cards.length<2)return;
  const wait=Math.max(delay,insightPausedUntil-Date.now());
  insightTimer=setTimeout(()=>{if(document.hidden||!document.querySelector('.daily-carousel'))return;const next=buildDailyInsights(state.currentGame);if(next.length<2)return;insightIndex=(insightIndex+1)%next.length;render()},wait);
}
function dailyCard(game){const cards=buildDailyInsights(game);if(!cards.length)return"";insightIndex=((insightIndex%cards.length)+cards.length)%cards.length;const c=cards[insightIndex];return`<section class="daily-carousel insight-deck" data-card="${c.key}" aria-label="Аналитика перед игрой"><i class="deck-auto-progress" aria-hidden="true"></i><header><div><span>🎴 ${c.kicker}</span><b>${c.title}</b></div><nav class="deck-head-controls" aria-label="Переключение аналитики"><button data-action="insight-prev" aria-label="Предыдущая карточка">‹</button><small>${insightIndex+1} / ${cards.length}</small><button data-action="insight-next" aria-label="Следующая карточка">›</button></nav></header><div class="insight-slide deck-body" data-insight-key="${c.key}">${c.body}</div><div class="deck-pagination"><div class="insight-dots">${cards.map((x,i)=>`<button class="${i===insightIndex?"active":""}" data-action="insight-go" data-index="${i}" aria-label="Карточка ${i+1}"></button>`).join("")}</div><small>сменится автоматически</small></div></section>`}

function renderGame(game, ranks, leader, danger) {
  return `
    <div class="game-view ${game.rounds.length?"active-game":""}"><section class="hero-panel">
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
      ${game.players.length?`<details class="hero-game-menu"><summary aria-label="Управление партией" title="Управление партией">•••</summary><div>${game.rounds.length?`<button data-action="undo">${icon("undo")} Отменить последний раунд</button><button data-action="undo-change">${icon("undo")} Отменить исправление</button>`:""}<button data-action="open-reset">${icon("refresh")} Новая игра</button>${game.rounds.length?`<button class="danger" data-action="open-finish">${icon("flag")} Завершить игру</button>`:""}</div></details>`:""}
    </section>

    ${dailyCard(game)}
    <div class="section-heading">
      <div><span class="section-no">01</span><h2>Таблица игроков</h2></div>
      ${game.players.length < LIMIT && !game.rounds.length ? `<button class="button secondary" data-action="open-add">${icon("userPlus")} Добавить игрока</button>` : ""}
    </div>

    ${game.players.length ? `<section class="players-grid">${ranks.map((p, i) => renderPlayerCard(p, i, game)).join("")}</section>` : renderEmptyPlayers()}
    ${game.players.length >= 2 ? renderScoreEntry(game, danger) : ""}
    ${game.rounds.length ? renderLiveEvent(game) : ""}
    ${game.rounds.length ? renderRounds(game) : ""}
    </div>
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
      <p>${last == null ? "Очков пока нет" : game.rounds.length===1 ? `Первый раунд: +${last}` : `Последний раунд: +${last}`}</p>
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
  return `<section class="score-section"><div class="section-heading light"><div><span class="section-no">02</span><h2>Очки раунда</h2></div><span class="hint">Заполнено ${Object.keys(drafts).length} из ${players.length}</span></div><p class="score-collab">Заполняйте как удобно: один человек за всех или каждый со своего телефона.</p>${reached66?`<div class="game-over continue"><span>🐮</span><div><b>Рубеж 66 пройден</b><small>Игра продолжается до ручного завершения.</small></div></div>`:""}<form id="round-form" class="score-form"><div class="score-inputs">${players.map(p=>{const has=Object.prototype.hasOwnProperty.call(drafts,p.id);return `<label class="score-row ${has?"score-ready":""}"><span class="score-person"><i>${esc(p.emoji)}</i><b>${esc(p.name)}</b><small>${has?"результат сохранён":"значение не введено"}</small></span><span class="number-wrap"><span>${has?"✓":"＋"}</span><input data-draft-player="${p.id}" inputmode="numeric" min="0" max="999" type="number" value="${has?drafts[p.id]:""}" placeholder="—" aria-label="Очки игрока ${esc(p.name)}"></span></label>`}).join("")}</div><div class="score-actions"><button class="button primary large" type="submit" ${ready&&!busy?"":"disabled"}>${icon("save")} ${ready?"Завершить раунд":"Заполните все результаты"}</button>${game.rounds.length?`<button class="button ghost" type="button" data-action="undo">${icon("undo")} Отменить последний</button>`:""}<button class="button ghost" type="button" data-action="open-reset">${icon("refresh")} Новая игра</button><button class="button finish" type="button" data-action="open-finish" ${game.rounds.length?"":'disabled'}>${icon("flag")} Завершить игру</button></div></form><div class="mobile-round-bar"><span><b>${Object.keys(drafts).length} из ${players.length}</b><small>${ready?"Раунд готов":"Заполните результаты"}</small></span><button class="button primary" type="submit" form="round-form" ${ready&&!busy?"":"disabled"}>${icon("save")} ${ready?"Завершить раунд":"Осталось "+(players.length-Object.keys(drafts).length)}</button></div></section>`;
}
function renderRounds(game) {
 const players=[...game.players].sort((a,b)=>a.seat-b.seat);
 return `<section class="rounds-section"><div class="section-heading"><div><span class="section-no">03</span><h2>Ход партии</h2></div><span class="hint">Нажмите раунд, чтобы раскрыть</span></div><div class="round-accordion always">${[...game.rounds].reverse().map((r,i)=>`<details ${i===0?"open":""}><summary><span>Раунд ${r.number}</span><b>${new Date(r.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</b></summary><div>${players.map(p=>`<p><span>${esc(p.emoji)} ${esc(p.name)}</span><strong>+${r.scores[p.id]??0}</strong></p>`).join("")}${(()=>{const e=gameEvents(game).find(x=>x.roundId===r.id);return e?`<div class="round-event ${e.tone}"><span>${e.icon}</span><div><small>${e.title}</small><p>${esc(e.text)}</p></div></div>`:""})()}<button class="button secondary full" data-action="open-edit-round" data-id="${r.id}">${icon("edit")} Исправить раунд</button></div></details>`).join("")}<button class="undo-change" data-action="undo-change">${icon("undo")} Отменить последнее исправление</button></div></section>`;
}
function renderPagedArchive(){setTimeout(setupArchiveAutoLoad,0);const total=archiveTotal();if(!total)return `<section class="archive-empty"><div class="empty-trophy">${icon("trophy")}</div><h1>Архив ещё пуст</h1><p>Завершённые партии появятся здесь вместе с датой, составом и финальным счётом.</p><button class="button primary" data-action="open-import">＋ Добавить прошлую партию</button></section>`;if(!archiveFeed.loaded)return `<section class="archive-page"><div class="archive-title archive-title-actions"><div><span class="eyebrow">История стола</span><h1>Прошлые игры</h1><p>Загружаем последние партии…</p></div><button class="button secondary" data-action="open-import">＋ Добавить прошлую партию</button></div><div class="archive-loading-cards"><i></i><i></i><i></i></div></section>`;const monthName=d=>new Date(d).toLocaleDateString("ru-RU",{month:"long",year:"numeric"});let lastMonth="";const rows=archiveFeed.items.map(g=>{const month=monthName(g.finishedAt||g.startedAt),heading=month!==lastMonth?(lastMonth=month,`<div class="archive-month server-month">${month}</div>`):"",mode=g.scoreMode||"rounds";return`${heading}<button class="archive-server-row" data-action="open-archive-game" data-id="${g.id}"><span class="compact-date">${formatDate(g.finishedAt||g.startedAt)}</span><span class="compact-winner">${esc(g.winner?.emoji||'🏆')} <b>${esc(g.winner?.name||'—')}</b></span><small>${g.playerCount} ${plural(g.playerCount,'игрок','игрока','игроков')} · <em class="score-mode-badge ${mode}">${mode==='totals'?'Только итоги':`${g.roundCount} ${plural(g.roundCount,'раунд','раунда','раундов')}`}</em></small><strong>${g.winner?.total??'—'} очк.</strong><i>›</i></button>`}).join('');return `<section class="archive-page"><div class="archive-title archive-title-actions"><div><span class="eyebrow">История стола</span><h1>Прошлые игры</h1><p>Партии загружаются порциями — подробности открываются по нажатию.</p></div><button class="button secondary" data-action="open-import">＋ Добавить прошлую партию</button></div><div class="recent-archive"><div class="archive-section-title"><b>Архив</b><span>${archiveFeed.items.length} из ${total}</span></div><div class="archive-server-list">${rows}</div>${archiveFeed.hasMore?`<span class="archive-auto-sentinel" aria-hidden="true"></span><button class="button secondary archive-load-more" data-action="archive-load-more" ${archiveFeed.loading?'disabled':''}>${archiveFeed.loading?'Загружаем…':'Показать ещё'}</button>`:''}</div></section>`}
function renderArchive(){
  if(cloudMode)return renderPagedArchive();
  if(!state.archive.length)return `<section class="archive-empty"><div class="empty-trophy">${icon("trophy")}</div><h1>Архив ещё пуст</h1><p>Завершённые партии появятся здесь вместе с датой, составом и финальным счётом.</p><button class="button primary" data-action="open-import">＋ Добавить прошлую партию</button></section>`;
  const recent=state.archive.slice(0,3),older=state.archive.slice(3),pageSize=10,pageCount=Math.max(1,Math.ceil(older.length/pageSize));archivePage=Math.max(0,Math.min(archivePage,pageCount-1));const visible=older.slice(archivePage*pageSize,(archivePage+1)*pageSize);
  const monthName=d=>new Date(d).toLocaleDateString("ru-RU",{month:"long",year:"numeric"});let lastMonth="";const compact=visible.map(game=>{const month=monthName(game.finishedAt||game.startedAt),ranks=ranking(game),best=ranks[0]?.total,winners=ranks.filter(x=>x.total===best),heading=month!==lastMonth?(lastMonth=month,`<div class="archive-month">${month}</div>`):"";return `${heading}<button class="archive-compact-row" data-action="open-archive-game" data-id="${game.id}"><span class="compact-date">${formatDate(game.finishedAt||game.startedAt)}</span><span class="compact-winner">${esc(winners[0]?.emoji||"🏆")} <b>${winners.map(x=>esc(x.name)).join(", ")}</b></span><small>${game.players.length} ${plural(game.players.length,"игрок","игрока","игроков")} · ${scoreModeLabel(game)}</small><strong>${best} очк.</strong><i>›</i></button>`}).join("");
  const pager=pageCount>1?`<nav class="archive-pager" aria-label="Страницы архива"><button data-action="archive-page" data-page="${archivePage-1}" ${archivePage===0?"disabled":""}>‹ Назад</button><span>${Array.from({length:pageCount},(_,i)=>`<button data-action="archive-page" data-page="${i}" class="${i===archivePage?"active":""}">${i+1}</button>`).join("")}</span><button data-action="archive-page" data-page="${archivePage+1}" ${archivePage===pageCount-1?"disabled":""}>Вперёд ›</button></nav>`:"";
  return `<section class="archive-page"><div class="archive-title archive-title-actions"><div><span class="eyebrow">История стола</span><h1>Прошлые игры</h1><p>Три последние партии показаны полностью. Остальные разбиты по месяцам и страницам.</p></div><button class="button secondary" data-action="open-import">＋ Добавить прошлую партию</button></div><div class="recent-archive"><div class="archive-section-title"><b>Последние партии</b><span>${Math.min(3,state.archive.length)} из ${state.archive.length}</span></div><div class="archive-list">${recent.map((g,i)=>renderArchiveGame(g,i)).join("")}</div></div>${older.length?`<details class="archive-older" ${olderArchiveOpen?"open":""}><summary><span><b>Предыдущие партии</b><small>${older.length} ${plural(older.length,"партия","партии","партий")}</small></span><em>Открыть список</em></summary><div class="archive-compact-list">${compact}</div>${pager}</details>`:""}</section>`;
}
function renderArchiveGame(game, index) {
  const ranks = ranking(game);
  const best = ranks[0]?.total;
  const winners = ranks.filter(p => p.total === best);
  return `<article class="archive-card" data-action="open-archive-game" data-id="${game.id}">
    <div class="archive-head">
      <div><span class="archive-index">Партия ${state.archive.length - index}</span><h2>${formatDate(game.finishedAt || game.startedAt)}</h2><small>${scoreModeLabel(game)} · ${game.players.length} ${plural(game.players.length,"игрок","игрока","игроков")}</small></div>
      <div class="winner-badge"><span>${esc(winners[0]?.emoji || "🏆")}</span><div><small>${winners.length > 1 ? "Победители" : "Победитель"}</small><b>${winners.map(p => esc(p.name)).join(", ") || "—"}</b></div></div>${isAdmin()?`<button class="archive-delete" data-action="delete-archive" data-id="${game.id}">Удалить</button>`:""}
    </div>
    <ol class="archive-results">
      ${ranks.map((p, i) => `<li class="${p.total === best ? "winner" : ""}"><span class="place">${i + 1}</span><span class="avatar">${esc(p.emoji)}</span><b>${esc(p.name)}</b><strong>${p.total}<small> очк.</small></strong></li>`).join("")}
    </ol>
  </article>`;
}

function buildRecordBook(){
 const games=state.archive||[];if(!games.length)return[];let low=null,big=null,close=null,long=null,roundHit=null;for(const g of games){const r=ranking(g);if(r.length<2)continue;const margin=r[1].total-r[0].total;if(!low||r[0].total<low.value)low={game:g,player:r[0],value:r[0].total};if(!big||margin>big.value)big={game:g,player:r[0],runner:r[1],value:margin};if(margin>0&&(!close||margin<close.value))close={game:g,player:r[0],runner:r[1],value:margin};if(hasRoundDetails(g)){if(!long||g.rounds.length>long.value)long={game:g,player:r[0],value:g.rounds.length};for(const rd of g.rounds)for(const pl of g.players){const value=rd.scores?.[pl.id]??0;if(!roundHit||value>roundHit.value)roundHit={game:g,player:{name:pl.name,emoji:pl.emoji},value}}}}
 const careers=(state.knownPlayers||[]).map(p=>({p,c:careerFor(p.id)})).sort((x,y)=>y.c.games-x.c.games),veteran=careers[0];return[
 low&&{icon:"🎯",name:"Рекорд комнаты",value:`${low.value} ${plural(low.value,"очко","очка","очков")}`,who:`${low.player.emoji} ${low.player.name}`,desc:`Самый низкий итог · ${formatDate(low.game.finishedAt||low.game.startedAt)}`,game:low.game},
 big&&{icon:"💥",name:"Крупнейший отрыв",value:`отрыв ${big.value}`,who:`${big.player.emoji} ${big.player.name}`,desc:`Впереди ${big.runner.name} · ${formatDate(big.game.finishedAt||big.game.startedAt)}`,game:big.game},
 close&&{icon:"📸",name:"Самый близкий финиш",value:`отрыв ${close.value}`,who:`${close.player.emoji} ${close.player.name}`,desc:`Фотофиниш с ${close.runner.name} · ${formatDate(close.game.finishedAt||close.game.startedAt)}`,game:close.game},
 long&&{icon:"⏱️",name:"Самая длинная партия",value:`${long.value} ${plural(long.value,"раунд","раунда","раундов")}`,who:`${long.player.emoji} ${long.player.name}`,desc:`Победитель марафона · ${formatDate(long.game.finishedAt||long.game.startedAt)}`,game:long.game},
 roundHit&&{icon:"🐮",name:"Самый тяжёлый раунд",value:`${roundHit.value} ${plural(roundHit.value,"очко","очка","очков")}`,who:`${roundHit.player.emoji} ${roundHit.player.name}`,desc:`Максимальный штраф за один раунд · ${formatDate(roundHit.game.finishedAt||roundHit.game.startedAt)}`,game:roundHit.game},
 veteran&&{icon:"🛡️",name:"Главный ветеран",value:`${veteran.c.games} ${plural(veteran.c.games,"партия","партии","партий")}`,who:`${veteran.p.emoji} ${veteran.p.name}`,desc:"Больше всего сыгранных партий за всю историю"}
 ].filter(Boolean)}
function renderRecordBook(){const records=buildRecordBook();if(!records.length)return"";return `<section class="record-book"><header><div><span class="eyebrow">История комнаты</span><h2>Книга рекордов</h2></div><small>${state.archive.length} ${plural(state.archive.length,"партия","партии","партий")} в архиве</small></header><div class="record-grid">${records.map(r=>`<button ${r.game?`data-action="open-archive-game" data-id="${r.game.id}"`:""}><i>${r.icon}</i><span><small>${r.name}</small><b>${esc(r.who)}</b><em>${r.desc}</em></span><strong>${r.value}</strong></button>`).join("")}</div></section>`}
function renderStatistics() {
  if(cloudMode&&!historyLoaded)return `<section class="archive-empty"><div class="empty-trophy">${icon("chart")}</div><h1>Загружаем статистику</h1><p>История подгружается только при необходимости.</p><div class="modal-loader"></div></section>`;
  const data=statistics(),items=data.items;
  if(!items.length)return `<section class="archive-empty"><div class="empty-trophy">${icon("chart")}</div><h1>Нет партий за период</h1><p>Выберите другой период или завершите игру.</p><div class="period-tabs">${renderPeriods()}</div></section>`;
  const renderTrend=p=>{const vals=p.trend.slice(-8),max=Math.max(...vals,1);return `<span class="mini-trend" aria-label="Последние результаты: ${vals.join(", ")}">${vals.map(v=>`<i style="height:${Math.max(8,Math.round(v/max*34))}px" title="${v} очк."></i>`).join("")}</span>`};
  const player=p=>`<button class="stat-player stat-player-open" data-action="open-player-card" data-id="${p.profileId||""}"><span class="stat-rank">${p.rank}</span><span class="avatar">${esc(p.emoji)}</span><b>${esc(p.name)}</b></button>`;
  const ranked=items.map((p,i)=>({...p,rank:i+1}));
  return `<section class="stats-page"><div class="archive-title"><span class="eyebrow">Личная история</span><h1>Статистика игроков</h1><div class="period-tabs">${renderPeriods()}</div></div>
  <div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>Игрок</th><th>Игры</th><th>Победы</th><th>% побед</th><th>Среднее</th><th>Рекорд</th><th>Серия</th><th>Динамика</th></tr></thead><tbody>${ranked.map(p=>`<tr><td>${player(p)}</td><td>${p.games}</td><td>${p.wins}</td><td><strong>${p.winRate}%</strong></td><td>${p.average}</td><td>${p.best}</td><td>${p.streak} <small>(макс. ${p.bestStreak})</small></td><td>${renderTrend(p)}</td></tr>`).join("")}</tbody></table></div>
  <div class="stats-mobile"><div class="mobile-podium">${ranked.slice(0,3).map((p,i)=>`<button data-action="open-player-card" data-id="${p.profileId||""}" class="place-${i+1}"><em class="podium-medal">${["🥇","🥈","🥉"][i]}</em><span>${esc(p.emoji)}</span><b>${esc(p.name)}</b><strong>${p.wins} <small>${plural(p.wins,"победа","победы","побед")}</small></strong><small>${p.winRate}% · ${p.games} игр</small></button>`).join("")}</div>${ranked.length>3?`<h3 class="other-players-title">Остальные игроки</h3><div class="mobile-ranking">${ranked.slice(3).map(p=>`<button data-action="open-player-card" data-id="${p.profileId||""}"><span class="stat-rank">${p.rank}</span><i>${esc(p.emoji)}</i><b>${esc(p.name)}</b><small>${p.games} игр · ${p.winRate}% · среднее ${p.average}</small><strong>${p.wins} ${plural(p.wins,"победа","победы","побед")}</strong><em>›</em></button>`).join("")}</div>`:""}</div>
  ${renderRecordBook()}
  <details class="stats-help"><summary>Что означают показатели?</summary><dl><div><dt>Среднее</dt><dd>Средний итоговый штрафной счёт за партию. Чем меньше, тем лучше.</dd></div><div><dt>Рекорд</dt><dd>Самый низкий итоговый счёт игрока за выбранный период.</dd></div><div><dt>Серия</dt><dd>Победы подряд сейчас; в скобках — лучшая серия за период.</dd></div><div><dt>Динамика</dt><dd>Последние результаты слева направо. Низкий столбик лучше высокого.</dd></div></dl></details>${renderAwardsHub()}</section>`;
}
function renderPeriods(){return [["week","Неделя"],["month","Месяц"],["all","Всё время"]].map(([id,label])=>`<button type="button" class="${statsPeriod===id?"active":""}" data-action="stats-period" data-period="${id}">${label}</button>`).join("")}

function careerFor(profileId){const games=[...state.archive].sort((a,b)=>new Date(a.finishedAt)-new Date(b.finishedAt)),rows=[];for(const g of games){const p=g.players.find(x=>x.profileId===profileId);if(!p)continue;const total=totalFor(p.id,g),best=Math.min(...ranking(g).map(x=>x.total));rows.push({game:g,total,won:total===best})}let streak=0,bestStreak=0;for(const r of rows){if(r.won){streak++;bestStreak=Math.max(bestStreak,streak)}else streak=0}return{rows,games:rows.length,wins:rows.filter(x=>x.won).length,average:rows.length?Math.round(rows.reduce((s,x)=>s+x.total,0)/rows.length*10)/10:0,best:rows.length?Math.min(...rows.map(x=>x.total)):0,streak,bestStreak}}
function playerAnalytics(profileId){const c=careerFor(profileId),vals=c.rows.map(x=>x.total),mean=c.average,variance=vals.length?vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length:0;let rounds=0,points=0,narrowWins=0,comebacks=0,zeroTriple=false;for(const row of c.rows){const g=row.game,p=g.players.find(x=>x.profileId===profileId),rank=ranking(g),second=rank[1]?.total??rank[0]?.total;if(row.won&&second-row.total<=3)narrowWins++;if(!hasRoundDetails(g))continue;rounds+=g.rounds.length;points+=row.total;let z=0;for(const r of g.rounds){if((r.scores[p.id]??0)===0){z++;if(z>=3)zeroTriple=true}else z=0}if(row.won&&g.rounds.length>=2){const half=Math.max(1,Math.floor(g.rounds.length/2)),partial=g.players.map(x=>({id:x.id,total:g.rounds.slice(0,half).reduce((s,r)=>s+(r.scores[x.id]??0),0)})).sort((x,y)=>x.total-y.total);if(partial.at(-1)?.id===p.id)comebacks++}}const recent=vals.slice(-3),prev=vals.slice(-6,-3),improvement=recent.length===3&&prev.length===3?(prev.reduce((a,b)=>a+b,0)/3-recent.reduce((a,b)=>a+b,0)/3):0;return{...c,variance,avgRound:rounds?points/rounds:Infinity,narrowWins,comebacks,zeroTriple}}
function temporaryTitles(){const all=(state.knownPlayers||[]).map(p=>({p,m:playerAnalytics(p.id)})).filter(x=>x.m.games),eligible=all.filter(x=>x.m.games>=3);if(!all.length)return[];const one=(name,desc,list,sort)=>{if(!list.length)return{name,desc,holders:[]};const sorted=[...list].sort(sort),best=sorted[0],holders=sorted.filter(x=>sort(x,best)===0).map(x=>x.p);return{name,desc,holders}};let h2h=all.map(x=>{let net=0;for(const y of all)if(x!==y){const z=headToHead(x.p.id,y.p.id);net+=z.aw-z.bw}return{...x,net}});return[one("Укротитель коров","Лучшее среднее при 3+ играх",eligible,(a,b)=>a.m.average-b.m.average),one("Коровий магнит","Самое высокое среднее при 3+ играх",eligible,(a,b)=>b.m.average-a.m.average),one("Железное копыто","Больше всего сыгранных партий",all,(a,b)=>b.m.games-a.m.games),one("Снайпер шестого ряда","Самый низкий результат одной партии",all,(a,b)=>a.m.best-b.m.best),one("Победный галоп","Самая длинная серия побед",all,(a,b)=>b.m.bestStreak-a.m.bestStreak),one("Коровьи горки","Самые переменчивые результаты",eligible,(a,b)=>b.m.variance-a.m.variance),one("Коровий метроном","Самые стабильные результаты",eligible,(a,b)=>a.m.variance-b.m.variance),one("Тёмная лошадка","Лучшее улучшение последних трёх игр",eligible.filter(x=>x.m.improvement>0),(a,b)=>b.m.improvement-a.m.improvement),one("Мастер фотофиниша","Больше всего побед с разницей до 3 очков",all.filter(x=>x.m.narrowWins),(a,b)=>b.m.narrowWins-a.m.narrowWins),one("Экономист стада","Самое низкое среднее за раунд",eligible.filter(x=>Number.isFinite(x.m.avgRound)),(a,b)=>a.m.avgRound-b.m.avgRound),one("Гроза соперников","Лучший баланс личных встреч",h2h,(a,b)=>b.net-a.net)]}
const PERMANENT_RULES=[
 ["Три в ряд","Три победы подряд",m=>m.bestStreak>=3],["Пять в ряд","Пять побед подряд",m=>m.bestStreak>=5],["Ветеран стада","25 партий",m=>m.games>=25],["Старейшина стада","50 партий",m=>m.games>=50],["Легенда коровника","100 партий",m=>m.games>=100],["На одно копыто","Победа с преимуществом ровно в одно очко",m=>m.rows.some(r=>r.won&&((ranking(r.game)[1]?.total??r.total)-r.total===1))],["Разгромное мычание","Победа с преимуществом 20+ очков",m=>m.rows.some(r=>r.won&&((ranking(r.game)[1]?.total??r.total)-r.total>=20))],["Ровно 66","Закончить партию ровно с 66 очками",m=>m.rows.some(r=>r.total===66)],["Из последних в первые","Идти последним в середине партии и победить",m=>m.comebacks>0],["Нулевая диета","Три нулевых раунда подряд",m=>m.zeroTriple]];
function permanentAwards(profileId){const m=playerAnalytics(profileId);return PERMANENT_RULES.filter(x=>x[2](m)).map(x=>({name:x[0],desc:x[1]}))}
function awardsFor(profileId){return temporaryTitles().filter(t=>t.holders.some(p=>p.id===profileId)).map(t=>t.name)}
function renderAwardsHub(){const temps=temporaryTitles();const rows=gamificationTab==="temporary"?temps.map(t=>`<article class="title-row" title="${esc(t.desc)}"><div><b>${t.name}</b><small>${t.desc}</small></div><span>${t.holders.length?t.holders.map(p=>`${esc(p.emoji)} ${esc(p.name)}`).join(", "):"Пока не присвоен"}</span></article>`).join(""):PERMANENT_RULES.map(r=>{const holders=(state.knownPlayers||[]).filter(p=>permanentAwards(p.id).some(x=>x.name===r[0]));return`<article class="title-row" title="${esc(r[1])}"><div><b>${r[0]}</b><small>${r[1]}</small></div><span>${holders.length?holders.map(p=>`${esc(p.emoji)} ${esc(p.name)}`).join(", "):"Ещё никто"}</span></article>`}).join("");return`<details class="awards-shell" ${awardsOpen?"open":""}><summary><span><small>Зал наград</small><b>Номинации и достижения</b></span><em>Показать</em></summary><section class="awards-hub"><header><div class="award-tabs"><button class="${gamificationTab==="temporary"?"active":""}" data-action="award-tab" data-tab-id="temporary">Временные</button><button class="${gamificationTab==="permanent"?"active":""}" data-action="award-tab" data-tab-id="permanent">Постоянные</button></div></header><div class="title-list">${rows}</div></section></details>`}
function headToHead(a,b){let aw=0,bw=0,ties=0,shared=0;for(const g of state.archive){const pa=g.players.find(x=>x.profileId===a),pb=g.players.find(x=>x.profileId===b);if(!pa||!pb)continue;shared++;const at=totalFor(pa.id,g),bt=totalFor(pb.id,g);if(at<bt)aw++;else if(bt<at)bw++;else ties++}return{shared,aw,bw,ties}}
function browserHelp(){const ua=navigator.userAgent;if(/iPhone|iPad/i.test(ua))return"Safari: нажмите «Поделиться», затем «На экран Домой». Во встроенном браузере сначала выберите «Открыть в Safari».";if(/MiuiBrowser/i.test(ua))return"Браузер Xiaomi не всегда устанавливает приложение. Скопируйте ссылку, откройте её в Google Chrome и выберите меню ⋮, затем «Добавить на главный экран».";if(/SamsungBrowser/i.test(ua))return"Samsung Internet: откройте меню ☰, выберите «Добавить страницу в», затем «Главный экран».";return"Google Chrome на Android: откройте меню ⋮ и выберите «Добавить на главный экран» или «Установить приложение»."}

function profileSnapshot(profileId,games=state.archive){const rows=[];for(const g of [...games].sort((a,b)=>new Date(a.finishedAt)-new Date(b.finishedAt))){const p=g.players.find(x=>x.profileId===profileId);if(!p)continue;const total=totalFor(p.id,g),rank=ranking(g),best=rank[0]?.total,place=rank.findIndex(x=>x.id===p.id)+1;rows.push({game:g,total,won:total===best,place})}let streak=0,bestStreak=0;for(const x of rows){if(x.won){streak++;bestStreak=Math.max(bestStreak,streak)}else streak=0}return{rows,games:rows.length,wins:rows.filter(x=>x.won).length,average:rows.length?Math.round(rows.reduce((s,x)=>s+x.total,0)/rows.length*10)/10:0,best:rows.length?Math.min(...rows.map(x=>x.total)):0,streak,bestStreak,podiums:rows.filter(x=>x.place<=3).length}}
function profileOverallRank(profileId,games=state.archive){const ids=(state.knownPlayers||[]).map(p=>p.id),list=ids.map(id=>({id,c:profileSnapshot(id,games)})).filter(x=>x.c.games).sort((a,b)=>b.c.wins-a.c.wins||a.c.average-b.c.average);return{place:list.findIndex(x=>x.id===profileId)+1,total:list.length}}
function profileForm(c){const recent=c.rows.slice(-5),previous=c.rows.slice(-10,-5),avg=x=>x.length?Math.round(x.reduce((s,r)=>s+r.total,0)/x.length*10)/10:null,ra=avg(recent),pa=avg(previous),enough=recent.length>=3&&previous.length>=3,change=enough?Math.round((pa-ra)*10)/10:null;return{recent,previous,recentAvg:ra,previousAvg:pa,enough,change}}
function profileHistoryChart(p,c){const limit=window.matchMedia('(max-width:760px)').matches?8:12,rows=c.rows.slice(-limit);if(!rows.length)return`<div class="profile-no-data">Завершённых партий пока нет</div>`;const W=620,H=220,left=36,right=24,top=28,bottom=34,max=Math.max(...rows.map(x=>x.total),1),min=Math.min(...rows.map(x=>x.total)),x=i=>left+i*((W-left-right)/Math.max(1,rows.length-1)),y=v=>top+(v-min)*((H-top-bottom)/Math.max(1,max-min));return`<div class="profile-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Результаты слева направо: от ранних к последней игре"><line x1="${left}" y1="${top}" x2="${W-right}" y2="${top}" class="profile-grid"/><line x1="${left}" y1="${H-bottom}" x2="${W-right}" y2="${H-bottom}" class="profile-grid"/><polyline points="${rows.map((r,i)=>`${x(i)},${y(r.total)}`).join(' ')}" fill="none" stroke="#176b55" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${rows.map((r,i)=>{const py=y(r.total),ly=py<48?py+19:py-16;return`<circle cx="${x(i)}" cy="${py}" r="${i===rows.length-1?8:r.won?7:5}" fill="${r.won?'#f4c84a':'#176b55'}" stroke="#201e1b" stroke-width="2"/><rect x="${x(i)-15}" y="${ly-11}" width="30" height="16" rx="5" class="profile-score-bg"/><text x="${x(i)}" y="${ly+1}" text-anchor="middle" class="profile-score">${r.total}</text>`}).join('')}</svg><div class="profile-chart-legend"><span><i class="win"></i> победа</span><span><i></i> обычная партия</span><b>выше — лучше</b></div><div class="profile-time-axis"><span>Раньше</span><b>→</b><span>Последняя игра</span></div></div>`}
function profileLastChange(profileId,c){if(!c.rows.length)return'';const last=c.rows.at(-1),beforeGames=(state.archive||[]).filter(g=>g.id!==last.game.id),before=profileSnapshot(profileId,beforeGames),nowRank=profileOverallRank(profileId),beforeRank=profileOverallRank(profileId,beforeGames),items=[];if(c.wins!==before.wins)items.push(`<span class="good"><small>Победы</small><b>${before.wins} → ${c.wins}</b><em>+${c.wins-before.wins}</em></span>`);if(before.games&&Math.abs(c.average-before.average)>=0.5){const diff=Math.round(Math.abs(c.average-before.average)*10)/10,good=c.average<before.average;items.push(`<span class="${good?'good':'bad'}"><small>Средний итог</small><b>${before.average} → ${c.average}</b><em>${good?'Лучше':'Хуже'} на ${diff}</em></span>`)}if(beforeRank.place&&nowRank.place&&beforeRank.place!==nowRank.place)items.push(`<span class="${nowRank.place<beforeRank.place?'good':'bad'}"><small>Место в рейтинге</small><b>${beforeRank.place} → ${nowRank.place}</b><em>${nowRank.place<beforeRank.place?'Подъём':'Снижение'}</em></span>`);if(last.total===c.best&&(!before.games||last.total<before.best))items.push(`<span class="good"><small>Новый личный рекорд</small><b>${c.best} очк.</b><em>Лучший итог</em></span>`);if(!items.length)return'';return`<section class="profile-change"><header><span>✨</span><div><small>Последняя партия</small><b>Что изменилось</b></div></header><div>${items.join('')}</div></section>`}
function profileStrengths(profileId,c){const bySize=new Map();for(const row of c.rows){const n=row.game.players.length,x=bySize.get(n)||{n,games:0,wins:0,points:0};x.games++;x.wins+=row.won?1:0;x.points+=row.total;bySize.set(n,x)}const sizes=[...bySize.values()].filter(x=>x.games>=3).map(x=>({...x,rate:x.wins/x.games,avg:Math.round(x.points/x.games*10)/10})).sort((a,b)=>b.rate-a.rate||a.avg-b.avg),bestSize=sizes[0];const avgRound=playerAnalytics(profileId).avgRound;return`<div class="profile-strengths"><article><span>🥉</span><div><small>Попадания в тройку</small><b>${c.podiums} из ${c.games}</b><p>${c.games?Math.round(c.podiums/c.games*100):0}% партий</p></div></article><article><span>🎯</span><div><small>Среднее за раунд</small><b>${Number.isFinite(avgRound)?Math.round(avgRound*10)/10:'—'}</b><p>меньше — лучше</p></div></article>${bestSize?`<article><span>🧠</span><div><small>Лучший размер стола</small><b>${bestSize.n} игроков</b><p>${bestSize.wins} побед в ${bestSize.games} играх</p></div></article>`:`<article><span>🧩</span><div><small>Размер состава</small><b>Нужно больше игр</b><p>минимум 3 игры одним составом</p></div></article>`}</div>`}
function profileProgress(c){const goals=[];for(const n of [25,50,100])if(c.games<n){if(n-c.games<=5)goals.push({name:n===25?'Ветеран стада':n===50?'Старейшина стада':'Легенда коровника',value:c.games,max:n,text:`${c.games} из ${n} партий`});break}if(c.streak>=2&&c.bestStreak<3)goals.push({name:'Три в ряд',value:c.streak,max:3,text:`${c.streak} из 3 побед подряд`});else if(c.streak>=4&&c.bestStreak<5)goals.push({name:'Пять в ряд',value:c.streak,max:5,text:`${c.streak} из 5 побед подряд`});if(!goals.length)return'';return`<div class="profile-progress">${goals.slice(0,2).map(g=>`<article><div><b>${g.name}</b><small>${g.text}</small></div><span><i style="width:${Math.min(100,Math.round(g.value/g.max*100))}%"></i></span></article>`).join('')}</div>`}
function profileHeadToHead(p,opp,h){if(!opp||!h)return'';const shared=(state.archive||[]).filter(g=>g.players.some(x=>x.profileId===p.id)&&g.players.some(x=>x.profileId===opp.id)).sort((a,b)=>new Date(b.finishedAt)-new Date(a.finishedAt)),last=shared[0],lastText=last?(()=>{const a=last.players.find(x=>x.profileId===p.id),b=last.players.find(x=>x.profileId===opp.id),at=totalFor(a.id,last),bt=totalFor(b.id,last);return `${esc(p.name)} ${at} · ${esc(opp.name)} ${bt}`})():'';const recent=shared.slice(0,5),rw=recent.filter(g=>{const a=g.players.find(x=>x.profileId===p.id),b=g.players.find(x=>x.profileId===opp.id);return totalFor(a.id,g)<totalFor(b.id,g)}).length,ow=recent.filter(g=>{const a=g.players.find(x=>x.profileId===p.id),b=g.players.find(x=>x.profileId===opp.id);return totalFor(b.id,g)<totalFor(a.id,g)}).length;return`<div class="duel-card enhanced"><div class="duel-names"><span>${esc(p.name)}</span><span>${esc(opp.name)}</span></div><div class="duel-scoreline"><div><strong>${h.aw}</strong><small>${plural(h.aw,'победа','победы','побед')}</small></div><em>:</em><div><strong>${h.bw}</strong><small>${plural(h.bw,'победа','победы','побед')}</small></div></div><p>${h.shared} ${plural(h.shared,'общая встреча','общие встречи','общих встреч')} · ничьи ${h.ties}</p><div class="duel-extra">${lastText?`<span><small>Последняя встреча</small><b>${lastText}</b></span>`:''}${recent.length>=3?`<span><small>Последние ${recent.length} встреч</small><b>${esc(p.name)} ${rw} — ${ow} ${esc(opp.name)}</b></span>`:''}</div></div>`}
function renderPersonalCard(p){const c=profileSnapshot(p.id),rank=profileOverallRank(p.id),form=profileForm(c),titles=temporaryTitles().filter(t=>t.holders.some(x=>x.id===p.id)),permanent=permanentAwards(p.id),opponents=(state.knownPlayers||[]).filter(x=>x.id!==p.id&&state.archive.some(g=>g.players.some(y=>y.profileId===p.id)&&g.players.some(y=>y.profileId===x.id))),opp=opponents.find(x=>x.id===selectedOpponentId)||opponents[0],h=opp?headToHead(p.id,opp.id):null,progress=profileProgress(c);return`<section class="premium-profile profile-v62"><div class="profile-sticky-bar"><span>Личная статистика</span><button class="modal-close profile-close" data-action="close-modal" aria-label="Закрыть">×</button></div><div class="premium-glow"></div><header><div class="premium-avatar">${esc(p.emoji)}</div><div><h2>${esc(p.name)}</h2><strong>${c.wins} ${plural(c.wins,'победа','победы','побед')}</strong><small>${c.games?`${c.games} ${plural(c.games,'игра','игры','игр')} · ${Math.round(c.wins/c.games*100)}% побед · место ${rank.place} из ${rank.total}`:'Новый игрок'}</small>${c.games?`<em class="profile-record">Личный рекорд: <b>${c.best}</b></em>`:''}</div></header>${profileLastChange(p.id,c)}<section class="profile-history"><div class="compact-heading"><h3>История и форма</h3><small>раньше → сейчас · до 12 игр</small></div>${form.enough?`<div class="profile-form-summary ${form.change>0?'good':form.change<0?'bad':''}"><span>${form.change>0?'↘':form.change<0?'↗':'→'}</span><div><b>${form.change>0?`Форма улучшилась на ${form.change}`:form.change<0?`Средний итог вырос на ${Math.abs(form.change)}`:'Форма стабильна'}</b><small>Последние ${form.recent.length}: ${form.recentAvg} · предыдущие ${form.previous.length}: ${form.previousAvg}</small></div></div>`:`<p class="sample-note">Для оценки формы нужны минимум 3 недавние и 3 предыдущие игры.</p>`}${profileHistoryChart(p,c)}</section><section><div class="compact-heading"><h3>Сильные стороны</h3><small>только проверенные данные</small></div>${profileStrengths(p.id,c)}</section>${opponents.length?`<section class="premium-h2h"><div class="compact-heading"><h3>Личные встречи</h3><small>${opponents.length} соперников</small></div><label class="opponent-select-wrap"><span>Соперник</span><select id="opponent-select">${opponents.map(x=>`<option value="${x.id}" ${opp?.id===x.id?'selected':''}>${esc(x.emoji)} ${esc(x.name)}</option>`).join('')}</select></label>${profileHeadToHead(p,opp,h)}</section>`:''}${progress?`<section><div class="compact-heading"><h3>Ближайшее достижение</h3><small>цель уже близко</small></div>${progress}</section>`:""}<details class="profile-titles"><summary>Временные титулы <span>${titles.length}</span></summary><div>${titles.length?titles.map(t=>`<article title="${esc(t.desc)}"><b>✦ ${t.name}</b><small>${t.desc}</small></article>`).join(''):'<small>Титулы ещё впереди</small>'}</div></details><details class="profile-achievements"><summary>Постоянные достижения <span>${permanent.length}</span></summary><div>${permanent.length?permanent.map(x=>`<span title="${esc(x.desc)}">🏅 ${x.name}</span>`).join(''):'<small>Полученных достижений пока нет</small>'}</div></details></section>`}
function finalGameMetrics(game){
  const players=game.players,totals=Object.fromEntries(players.map(p=>[p.id,0])),leadRounds=Object.fromEntries(players.map(p=>[p.id,0])),bestPlace=Object.fromEntries(players.map(p=>[p.id,players.length])),series=Object.fromEntries(players.map(p=>[p.id,[]]));let leaderChanges=0,lastLeader=null,biggest={player:null,value:-1,round:0};
  for(const round of game.rounds){for(const p of players){const v=Number(round.scores[p.id]||0);totals[p.id]+=v;if(v>biggest.value)biggest={player:p,value:v,round:round.number}}const order=[...players].sort((x,y)=>totals[x.id]-totals[y.id]||x.seat-y.seat),best=totals[order[0].id],leaders=order.filter(x=>totals[x.id]===best);for(const p of players){const place=order.findIndex(x=>x.id===p.id)+1;series[p.id].push(place);bestPlace[p.id]=Math.min(bestPlace[p.id],place)}for(const x of leaders)leadRounds[x.id]++;const leaderKey=leaders.map(x=>x.id).sort().join('|');if(lastLeader&&leaderKey!==lastLeader)leaderChanges++;lastLeader=leaderKey}
  return{totals,leadRounds,bestPlace,series,leaderChanges,biggest};
}
function finalStory(game){const m=finalGameMetrics(game),r=ranking(game),events=gameEvents(game).filter(e=>game.rounds.length>1||!['Смена лидера','Крупный рывок'].includes(e.title));const out=[];if(game.rounds.length>1&&m.leaderChanges)out.push({icon:'⚡',title:'Борьба за лидерство',text:`Лидер менялся ${m.leaderChanges} ${plural(m.leaderChanges,'раз','раза','раз')}.`});const decisive=[...events].reverse().find(e=>e.title==='Смена лидера');if(decisive)out.push({icon:'🎯',title:'Переломный момент',text:`В ${decisive.round}-м раунде: ${decisive.text}.`});if(m.biggest.player)out.push({icon:'🐮',title:'Самый тяжёлый раунд',text:`${m.biggest.player.emoji} ${m.biggest.player.name} получает +${m.biggest.value} в ${m.biggest.round}-м раунде.`});for(const e of [...events].reverse())if(out.length<3&&!out.some(x=>x.text.includes(e.text)))out.push({icon:e.icon,title:e.title,text:e.text});return out.slice(0,3)}
function finalRankChart(game){if(game.rounds.length<2)return`<div class="final-chart-empty">Для графика нужно минимум два раунда</div>`;const m=finalGameMetrics(game),players=game.players,W=680,H=Math.max(230,players.length*34),left=42,right=20,top=25,bottom=34,colors=['#d33f35','#176b55','#b27b00','#3568c8','#8a4db3','#d56b16','#10859b','#69712d','#c53675','#555'];const x=i=>left+i*((W-left-right)/Math.max(1,game.rounds.length-1)),y=place=>top+(place-1)*((H-top-bottom)/Math.max(1,players.length-1));return`<div class="final-chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Изменение мест по раундам">${players.map((_,i)=>`<line x1="${left}" y1="${y(i+1)}" x2="${W-right}" y2="${y(i+1)}" class="chart-grid"/><text x="12" y="${y(i+1)+5}" class="chart-rank">${i+1}</text>`).join('')}${game.rounds.map((r,i)=>`<text x="${x(i)}" y="${H-8}" text-anchor="middle" class="chart-round">${r.number}</text>`).join('')}${players.map((p,pi)=>`<polyline points="${m.series[p.id].map((place,i)=>`${x(i)},${y(place)}`).join(' ')}" fill="none" stroke="${colors[pi%colors.length]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${m.series[p.id].map((place,i)=>`<circle cx="${x(i)}" cy="${y(place)}" r="5" fill="${colors[pi%colors.length]}" stroke="#fff" stroke-width="2"/>`).join('')}`).join('')}</svg><div class="final-chart-legend">${players.map((p,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(p.emoji)} ${esc(p.name)}</span>`).join('')}</div></div>`}
function finalPlayerMetrics(game){const m=finalGameMetrics(game),r=ranking(game);return`<div class="final-player-metrics">${r.map((p,i)=>{const rounds=game.rounds.length,avg=rounds?Math.round(p.total/rounds*10)/10:0,max=Math.max(...game.rounds.map(x=>Number(x.scores[p.id]||0)));return`<article><span>${esc(p.emoji)}</span><div><b>${esc(p.name)}</b><small>${i+1} место · среднее ${avg} за раунд</small></div><strong>${p.total}</strong><em>лучшее место ${m.bestPlace[p.id]} · лидер ${m.leadRounds[p.id]} ${plural(m.leadRounds[p.id],'раунд','раунда','раундов')} · максимум +${max}</em></article>`}).join('')}</div>`}
function renderWinnerSummary(game,ranks,winners,best){const runner=ranks.find(x=>x.total>best),margin=runner?runner.total-best:0;return`<section class="winner-pane active" data-winner-pane="summary"><div class="winner-hero"><span class="winner-crown">🏆</span><span class="eyebrow">Партия завершена</span><h2>${winners.length>1?'Победители':'Победитель'}: ${winners.map(p=>esc(p.name)).join(', ')}</h2><div class="winner-avatars">${winners.map(p=>`<span>${esc(p.emoji)}</span>`).join('')}</div><p>Лучший результат — <b>${best} ${plural(best,'очко','очка','очков')}</b>${runner?` · отрыв ${margin}`:''}</p></div><div class="final-facts"><span><b>${game.players.length}</b><small>игроков</small></span><span><b>${game.rounds.length}</b><small>раундов</small></span><span><b>${finalGameMetrics(game).leaderChanges}</b><small>смен лидера</small></span></div><ol class="mini-results final-results">${ranks.map((p,i)=>`<li><span>${['🥇','🥈','🥉'][i]||i+1+'.'} ${esc(p.emoji)} ${esc(p.name)}</span><b>${p.total}</b></li>`).join('')}</ol></section>`}
function renderWinnerStory(game){const stories=finalStory(game);return`<section class="winner-pane active" data-winner-pane="story"><div class="winner-section-head"><span>📈</span><div><small>Разбор партии</small><h2>Как всё происходило</h2></div></div>${stories.length?`<div class="final-story-grid">${stories.map(x=>`<article><span>${x.icon}</span><div><b>${x.title}</b><p>${esc(x.text)}</p></div></article>`).join('')}</div>`:'<p class="final-empty">Партия прошла без заметных перестановок.</p>'}<h3 class="final-subtitle">Динамика мест</h3>${finalRankChart(game)}<h3 class="final-subtitle">Показатели игроков</h3>${finalPlayerMetrics(game)}</section>`}
function renderWinnerAwards(game){const awards=funAwards(game);return`<section class="winner-pane active" data-winner-pane="awards"><div class="winner-section-head"><span>🎭</span><div><small>Шуточное награждение</small><h2>Номинации партии</h2></div></div><p class="final-award-note">Номинации созданы для настроения и не влияют на рейтинг.</p><div class="fun-awards final-awards">${awards.map((x,i)=>`<article><span>${['🏅','🎖️','🥇','🐮','🎯','✨'][i%6]}</span><div><small>Номинация</small><b>${x.title}</b><p>${esc(x.player.emoji)} ${esc(x.player.name)}</p><em>${x.desc}</em></div></article>`).join('')}</div></section>`}
function captureImportValues(){if(!manualImport)return;document.querySelectorAll('#import-game-form [data-import-name]').forEach(input=>{if(input.offsetParent!==null)manualImport.values[input.dataset.importName]=input.value});persistImportDraft()}
function persistImportDraft(){if(!manualImport)return;try{sessionStorage.setItem(importDraftKey,JSON.stringify(manualImport))}catch{}}
function clearImportDraft(){try{sessionStorage.removeItem(importDraftKey)}catch{}}
function hasImportValues(){return Boolean(manualImport&&Object.values(manualImport.values||{}).some(v=>String(v)!==''))}
function importScoreValue(key){return manualImport?.values?.[key]??""}
function importPlayerTotals(profiles){return Object.fromEntries(profiles.map(p=>[p.id,Array.from({length:manualImport.roundCount},(_,i)=>Number(importScoreValue(`r${i}-${p.id}`))||0).reduce((a,b)=>a+b,0)]))}
function renderImportGameForm(){const profiles=manualImport.profileIds.map(id=>state.knownPlayers.find(p=>p.id===id)),quick=manualImport.quick,active=Math.min(manualImport.roundIndex||0,manualImport.roundCount-1),totals=importPlayerTotals(profiles),input=(i,p,mobile=false)=>`<input type="number" min="0" max="999" inputmode="numeric" enterkeyhint="next" data-import-name="r${i}-${p.id}" value="${esc(importScoreValue(`r${i}-${p.id}`))}" ${quick?'placeholder="Итог" required':''}>`;return`<div class="import-head"><div><span class="eyebrow">${manualImport.date}</span><h2>${quick?'Быстрый ввод итогов':'Результаты по раундам'}</h2></div></div><div class="import-mode-tabs"><button type="button" class="${quick?'active':''}" data-action="toggle-import-mode" data-mode="quick">Только итоги</button><button type="button" class="${!quick?'active':''}" data-action="toggle-import-mode" data-mode="rounds">По раундам</button></div><form id="import-game-form">${quick?`<div class="quick-totals">${profiles.map(p=>`<label><span>${esc(p.emoji)} <b>${esc(p.name)}</b></span>${input(0,p)}</label>`).join('')}</div>`:`<div class="import-sheet-wrap"><table class="import-sheet"><thead><tr><th>Раунд</th>${profiles.map(p=>`<th>${esc(p.emoji)}<br>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${Array.from({length:manualImport.roundCount},(_,i)=>`<tr><th>${i+1}</th>${profiles.map(p=>`<td>${input(i,p)}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th>Итого</th>${profiles.map(p=>`<td><b data-import-total="${p.id}">${totals[p.id]}</b></td>`).join('')}</tr></tfoot></table></div><div class="import-mobile-round"><header><span>Раунд ${active+1}</span><small>${active+1} из ${manualImport.roundCount}</small></header><div>${profiles.map(p=>`<label><span>${esc(p.emoji)} <b>${esc(p.name)}</b></span>${input(active,p,true)}</label>`).join('')}</div><nav><button type="button" class="button secondary" data-action="import-round-prev" ${active===0?'disabled':''}>← Назад</button><button type="button" class="button secondary" data-action="import-round-next" ${active===manualImport.roundCount-1?'disabled':''}>Дальше →</button></nav><section>${profiles.map(p=>`<span>${esc(p.emoji)} <b data-import-total="${p.id}">${totals[p.id]}</b></span>`).join('')}</section></div><div class="import-actions"><button type="button" class="button secondary" data-action="import-add-round">＋ Раунд</button><button type="button" class="button secondary" data-action="import-remove-round">− Раунд</button></div>`}<div class="import-confirm"><span><small>Дата</small><b>${manualImport.date}</b></span><span><small>Игроков</small><b>${profiles.length}</b></span><span><small>Режим</small><b>${quick?'Только итоги':'По раундам'}</b></span></div><button class="button primary full" type="submit">Сохранить прошлую партию</button></form>`}
function renderModal() {
  if (!modal) return "";
  const shell = body => `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" data-modal><button class="modal-close" data-action="close-modal" aria-label="Закрыть">×</button>${body}</section></div>`;

  if(modal==="admin"){return shell(`<span class="eyebrow">Режим организатора</span><h2>${isAdmin()?"Доступ открыт":"Введите PIN"}</h2>${isAdmin()?`<p class="modal-text">Административные действия доступны до ${formatDate(adminSession.expiresAt)}.</p><button class="button secondary full" data-action="admin-logout">Выйти из режима организатора</button><div class="backup-actions"><b>Резервная копия</b><small>Все партии, раунды и игроки</small><div><button class="button secondary" data-action="export-backup">Скачать JSON</button><button class="button secondary" data-action="export-csv">Скачать CSV</button></div></div><details class="admin-merge"><summary>Объединить дубли профилей</summary><form id="merge-profiles-form"><select name="source">${(state.knownPlayers||[]).map(p=>`<option value="${p.id}">${esc(p.emoji)} ${esc(p.name)}</option>`).join("")}</select><span>→</span><select name="target">${(state.knownPlayers||[]).map(p=>`<option value="${p.id}">${esc(p.emoji)} ${esc(p.name)}</option>`).join("")}</select><button class="button primary full" type="submit">Объединить</button></form></details>`:`<form id="admin-login-form"><label class="field-label">Шестизначный PIN</label><input class="text-input admin-pin" name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus><button class="button primary full" type="submit">Войти</button></form>`}`)}
  if(modal==="archive-loading")return shell(`<span class="eyebrow">Архивная партия</span><h2>Загружаем результаты…</h2><div class="modal-loader"></div>`);
  if(modal==="archive-game"){const game=archiveDetails.get(selectedArchiveId)||state.archive.find(g=>g.id===selectedArchiveId);if(!game)return"";const ranks=ranking(game),best=ranks[0]?.total;return shell(`<span class="eyebrow">Архивная партия</span><h2>${formatDate(game.finishedAt||game.startedAt)}</h2><p class="modal-text">${game.players.length} ${plural(game.players.length,"игрок","игрока","игроков")} · <span class="score-mode-badge ${game.scoreMode||'rounds'}">${scoreModeLabel(game)}</span></p><ol class="archive-results archive-modal-results">${ranks.map((p,i)=>`<li class="${p.total===best?"winner":""}"><span class="place">${i+1}</span><span class="avatar">${esc(p.emoji)}</span><b>${esc(p.name)}</b><strong>${p.total}<small> очк.</small></strong></li>`).join("")}</ol>${isAdmin()?`<div class="archive-admin-actions"><button class="button secondary full" data-action="toggle-game-score-mode" data-id="${game.id}" data-mode="${hasRoundDetails(game)?'totals':'rounds'}">${hasRoundDetails(game)?'Отметить как «Только итоги»':'Отметить как «По раундам»'}</button><button class="archive-delete button secondary full" data-action="delete-archive" data-id="${game.id}">Удалить ошибочную партию</button></div>`:""}`)}
  if(modal==="import"){const known=state.knownPlayers||[];return shell(`<span class="eyebrow">Ручной архив</span><h2>Добавить прошлую партию</h2><form id="import-setup-form"><label class="field-label">Дата игры</label><input class="text-input" type="date" name="date" max="${new Date().toISOString().slice(0,10)}" required><span class="field-label">Участники</span><div class="import-profiles">${known.map(p=>`<label><input type="checkbox" name="profile" value="${p.id}"><span>${esc(p.emoji)} ${esc(p.name)}</span></label>`).join("")}</div><button class="button primary full" type="submit">Продолжить к раундам</button></form>`)}
  if(modal==="import-rounds")return shell(renderImportGameForm());
  if(modal==="player-card"){const p=(state.knownPlayers||[]).find(x=>x.id===selectedProfileId);if(!p)return"";return shell(renderPersonalCard(p))}
  if (modal === "add") {
    const activeIds = new Set(state.currentGame.players.map(p => p.profileId));
    const returning = (state.knownPlayers || []).filter(p => !activeIds.has(p.id));
    return shell(`<span class="eyebrow">Состав партии</span><h2>Кто сегодня играет?</h2>${returning.length ? `<span class="field-label">Уже играл</span><div class="known-players">${returning.map(p => `<button class="known-player" data-action="add-existing" data-id="${p.id}"><span>${esc(p.emoji)}</span><b>${esc(p.name)}</b><small>Добавить</small></button>`).join("")}</div><div class="or-divider"><span>или новый игрок</span></div>` : ""}<form id="player-form">
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
  if (modal === "finish") return shell(`<span class="eyebrow">Финиш партии</span><h2>Завершить игру?</h2><p class="modal-text">Результат попадёт в архив и статистику. Победит игрок с наменьшим счётом.</p><label class="check-row"><input id="keep-players" type="checkbox" checked><span><b>Оставить тех же игроков</b><small>Новая партия начнётся с нулевого счёта</small></span></label><button class="button finish large full" data-action="finish-game" ${busy ? "disabled" : ""}>${icon("flag")} Завершить и показать победителя</button>`);
  if (modal === "winner" && celebrationGame) {
    const ranks=ranking(celebrationGame),best=ranks[0]?.total,winners=ranks.filter(p=>p.total===best);
    const pane=winnerTab==='story'?renderWinnerStory(celebrationGame):winnerTab==='awards'?renderWinnerAwards(celebrationGame):renderWinnerSummary(celebrationGame,ranks,winners,best);
    return `<div class="modal-backdrop winner-backdrop"><div class="confetti" aria-hidden="true">${winnerTab==='summary'?Array.from({length:28},(_,i)=>`<i style="--i:${i}"></i>`).join(''):''}</div><section class="modal winner-modal final-debrief" role="dialog" aria-modal="true" data-modal><nav class="winner-tabs" aria-label="Разделы итогов"><button class="${winnerTab==='summary'?'active':''}" data-action="winner-tab" data-tab-id="summary">Итоги</button><button class="${winnerTab==='story'?'active':''}" data-action="winner-tab" data-tab-id="story">Сюжет</button><button class="${winnerTab==='awards'?'active':''}" data-action="winner-tab" data-tab-id="awards">Номинации</button></nav>${pane}<footer class="winner-actions"><button class="button secondary" data-action="share-final-card">${icon('share')} Поделиться</button><button class="button primary" data-action="close-winner">${icon('cards')} Новая игра</button></footer></section></div>`;
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
    state=mergeLive(result?.currentGame?result:await getLive());
    lastStateHash=JSON.stringify({...state,archive:[]});
    if(cloudMode){invalidateHistory();setTimeout(()=>ensureHistory(true).catch(()=>{}),0)}else{state.archiveCount=state.archive.length;statsMemo={key:null,value:null}}
    celebrationGame = finished;
    winnerTab = "summary";
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
  if(button.dataset.tab){tab=button.dataset.tab;render();scrollTo({top:0,behavior:"smooth"});if(tab==="archive"&&cloudMode&&!archiveFeed.loaded)loadArchivePage(true);if(tab==="stats"&&!historyLoaded)ensureHistory();return}
  const action = button.dataset.action;
  if(action==="open-admin"){modal="admin";render();return}
  if(action==="admin-logout"){adminSession=null;localStorage.removeItem(adminKey);modal=null;render();return}

  if(action==="insight-prev"){pauseInsightAuto();const cards=buildDailyInsights(state.currentGame);insightIndex=(insightIndex-1+cards.length)%cards.length;render();return}
  if(action==="insight-next"){pauseInsightAuto();const cards=buildDailyInsights(state.currentGame);insightIndex=(insightIndex+1)%cards.length;render();return}
  if(action==="insight-go"){pauseInsightAuto();insightIndex=Number(button.dataset.index)||0;render();return}
  if(action==="open-archive-game"){openArchiveGame(button.dataset.id);return}
  if(action==="archive-load-more"){loadArchivePage(false);return}
  if(action==="export-backup"){exportBackup("json").then(()=>showToast("Резервная копия скачана")).catch(()=>{});return}
  if(action==="export-csv"){exportBackup("csv").then(()=>showToast("Таблица CSV скачана")).catch(()=>{});return}
  if(action==="archive-page"){olderArchiveOpen=true;archivePage=Math.max(0,Number(button.dataset.page)||0);render();setTimeout(()=>document.querySelector(".archive-older")?.scrollIntoView({behavior:"smooth",block:"start"}),30);return}
  if(action==="award-tab"){gamificationTab=button.dataset.tabId;awardsOpen=true;render();return}
  if(action==="toggle-import-mode"){captureImportValues();const quick=button.dataset.mode==="quick";if(manualImport.quick!==quick){manualImport.quick=quick;manualImport.roundCount=quick?1:5;manualImport.roundIndex=0;manualImport.values={}}persistImportDraft();render();return}
  if(action==="toggle-game-score-mode"){const mode=button.dataset.mode;if(confirm(mode==="totals"?"Отметить эту партию как введённую только итогами? Раундовые рекорды будут пересчитаны.":"Отметить эту партию как подробную, введённую по раундам?")){mutate(async()=>{const r=await api.setGameScoreMode(button.dataset.id,mode);invalidateHistory();setTimeout(()=>{ensureHistory(true).catch(()=>{});if(tab==="archive")loadArchivePage(true)},0);return r},"Тип партии исправлен")}return}
  if(action==="delete-archive"&&confirm("Удалить эту архивную партию?")){mutate(async()=>{const r=await api.deleteGame(button.dataset.id);invalidateHistory();setTimeout(()=>{ensureHistory(true);if(tab==="archive")loadArchivePage(true)},0);return r},"Партия удалена");return}
  if(action==="open-tv"){window.open(tvUrl(),"_blank","noopener");return}
  if(action==="copy-tv-link"){try{await navigator.clipboard.writeText(tvUrl());showToast("Ссылка на табло скопирована")}catch{prompt("Ссылка на табло",tvUrl())}return}
  if(action==="tv-fullscreen"){try{await document.documentElement.requestFullscreen();if(navigator.wakeLock)window.tvWakeLock=await navigator.wakeLock.request("screen")}catch{}return}
  if(action==="winner-tab"){winnerTab=button.dataset.tabId||"summary";render();return}
  if(action==="share-final-card"&&celebrationGame){shareFinalCard(celebrationGame);return}
  if(action==="open-import"){manualImport=null;clearImportDraft();modal="import";render();return}
  if(action==="import-add-round"){captureImportValues();manualImport.roundCount++;manualImport.roundIndex=manualImport.roundCount-1;persistImportDraft();render();return}
  if(action==="import-round-prev"){captureImportValues();manualImport.roundIndex=Math.max(0,(manualImport.roundIndex||0)-1);persistImportDraft();render();return}
  if(action==="import-round-next"){captureImportValues();manualImport.roundIndex=Math.min(manualImport.roundCount-1,(manualImport.roundIndex||0)+1);persistImportDraft();render();setTimeout(()=>document.querySelector(".import-mobile-round input")?.focus(),0);return}
  if(action==="import-remove-round"&&manualImport.roundCount>1){captureImportValues();const n=manualImport.roundCount-1;for(const k of Object.keys(manualImport.values||{}))if(k.startsWith(`r${n}-`))delete manualImport.values[k];manualImport.roundCount=n;manualImport.roundIndex=Math.min(manualImport.roundIndex||0,n-1);persistImportDraft();render();return}
  if(action==="open-player-card"){selectedProfileId=button.dataset.id;selectedOpponentId=null;modal="player-card";render();return}
  if(action==="select-opponent"){selectedOpponentId=button.dataset.id;render();return}
  if (action === "stats-period") { statsPeriod = button.dataset.period || "all"; render(); return; }
  if (action === "open-add") { selectedEmoji = EMOJIS[state.currentGame.players.length % EMOJIS.length]; modal = "add"; render(); setTimeout(() => document.querySelector("#player-name")?.focus(), 0); }
  if (action === "close-modal" && (button.classList.contains("modal-close") || !event.target.closest("[data-modal]"))) { if(modal==="import-rounds"){captureImportValues();if(hasImportValues()&&!confirm("Закрыть ввод? Заполненные результаты будут удалены."))return;clearImportDraft()} modal = null; editingRoundId = null; editingPlayerId = null; render(); }
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

root.addEventListener("touchstart",event=>{if(!event.target.closest(".daily-carousel"))return;pauseInsightAuto(12000);const t=event.touches[0];insightTouch={x:t.clientX,y:t.clientY}},{passive:true});
root.addEventListener("touchend",event=>{if(!insightTouch||!event.target.closest(".daily-carousel"))return;const t=event.changedTouches[0],dx=t.clientX-insightTouch.x,dy=t.clientY-insightTouch.y;insightTouch=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){const cards=buildDailyInsights(state.currentGame);insightIndex=(insightIndex+(dx<0?1:-1)+cards.length)%cards.length;render()}},{passive:true});
root.addEventListener("pointerover",event=>{if(event.target.closest('.daily-carousel'))clearInsightAuto()});
root.addEventListener("pointerout",event=>{const deck=event.target.closest('.daily-carousel');if(deck&&!deck.contains(event.relatedTarget))scheduleInsightAuto()});
root.addEventListener("focusin",event=>{if(event.target.closest('.daily-carousel'))clearInsightAuto()});
root.addEventListener("focusout",event=>{const deck=event.target.closest('.daily-carousel');if(deck&&!deck.contains(event.relatedTarget))scheduleInsightAuto()});

function refreshDraftUi() {
  const drafts=state.currentGame.draftScores||{},players=state.currentGame.players;
  document.querySelectorAll("[data-draft-player]").forEach(input=>{
    const has=Object.prototype.hasOwnProperty.call(drafts,input.dataset.draftPlayer),row=input.closest(".score-row");
    row?.classList.toggle("score-ready",has);
    const status=row?.querySelector(".score-person small"),mark=row?.querySelector(".number-wrap > span");
    if(status)status.textContent=has?"результат сохранён":"значение не введено";
    if(mark)mark.textContent=has?"✓":"＋";
    if(document.activeElement!==input)input.value=has?drafts[input.dataset.draftPlayer]:"";
    input.disabled=false;
  });
  const count=Object.keys(drafts).length,ready=players.length>0&&players.every(p=>Object.prototype.hasOwnProperty.call(drafts,p.id));
  const hint=document.querySelector(".score-section .section-heading .hint");if(hint)hint.textContent=`Заполнено ${count} из ${players.length}`;
  document.querySelectorAll('button[type="submit"][form="round-form"],#round-form button[type="submit"]').forEach((button,i)=>{button.disabled=!ready||busy||!navigator.onLine||pendingWrites.length>0;button.innerHTML=`${icon("save")} ${ready?"Завершить раунд":i?`Осталось ${players.length-count}`:"Заполните все результаты"}`});const bar=document.querySelector(".mobile-round-bar span");if(bar)bar.innerHTML=`<b>${count} из ${players.length}</b><small>${ready?"Раунд готов":"Заполните результаты"}</small>`;
}

root.addEventListener("input",event=>{const draft=event.target.closest("[data-draft-player]");if(draft){const id=draft.dataset.draftPlayer;clearTimeout(draftSaveTimers.get(id));const note=draft.closest(".score-row")?.querySelector(".score-person small");if(note)note.textContent="сохраняем…";draftSaveTimers.set(id,setTimeout(()=>{draftSaveTimers.delete(id);draft.dispatchEvent(new Event("change",{bubbles:true}))},450));return}if(!event.target.closest("#import-game-form"))return;const score=event.target.closest("[data-import-name]");if(!score)return;manualImport.values[score.dataset.importName]=score.value;persistImportDraft();const profiles=manualImport.profileIds.map(id=>state.knownPlayers.find(p=>p.id===id)),totals=importPlayerTotals(profiles);for(const id of manualImport.profileIds)document.querySelectorAll(`[data-import-total="${id}"]`).forEach(out=>out.textContent=totals[id])});

function updateSyncBadge(){const el=document.querySelector(".sync-badge");if(!el)return;el.className=`sync-badge ${!navigator.onLine?"offline":pendingWrites.length?"pending":"saved"}`;el.textContent=!navigator.onLine?`Нет соединения · не отправлено ${pendingWrites.length}`:pendingWrites.length?`Не отправлено: ${pendingWrites.length}`:"Всё сохранено"}
function queueDraft(type,playerId,score){pendingWrites=pendingWrites.filter(x=>x.playerId!==playerId);pendingWrites.push({type,playerId,score});localStorage.setItem(pendingKey,JSON.stringify(pendingWrites));if(type==="clear")delete state.currentGame.draftScores[playerId];else state.currentGame.draftScores[playerId]=score;refreshDraftUi();updateSyncBadge()}
async function flushPending(){if(!cloudMode||!navigator.onLine||!pendingWrites.length)return;for(const op of [...pendingWrites]){try{op.type==="clear"?await api.clearDraftScore(op.playerId):await api.setDraftScore(op.playerId,op.score);pendingWrites=pendingWrites.filter(x=>x!==op);localStorage.setItem(pendingKey,JSON.stringify(pendingWrites))}catch{break}}updateSyncBadge();if(!pendingWrites.length)syncStateNow()}
root.addEventListener("change", async event => {const opponent=event.target.closest("#opponent-select");if(opponent){selectedOpponentId=opponent.value;render();return}const input=event.target.closest("[data-draft-player]");if(!input)return;clearTimeout(draftSaveTimers.get(input.dataset.draftPlayer));draftSaveTimers.delete(input.dataset.draftPlayer);const raw=input.value.trim(),score=Number(raw),type=raw===""?"clear":"set";if(raw!==""&&(!Number.isInteger(score)||score<0||score>999)){showToast("Введите целое число от 0 до 999","error");return}if(cloudMode&&!navigator.onLine){queueDraft(type,input.dataset.draftPlayer,score);showToast("Нет соединения — сохранили на устройстве");return}try{input.disabled=true;updateSyncBadge();const drafts=type==="clear"?await api.clearDraftScore(input.dataset.draftPlayer):await api.setDraftScore(input.dataset.draftPlayer,score);state.currentGame.draftScores=drafts;lastStateHash=JSON.stringify(state);refreshDraftUi();updateSyncBadge();showToast(type==="clear"?"Результат очищен":"Результат сохранён")}catch(e){if(cloudMode){queueDraft(type,input.dataset.draftPlayer,score);showToast("Не отправлено — повторим автоматически","error")}else{input.disabled=false;showToast(e.message||"Не удалось сохранить","error")}}});

root.addEventListener("submit", (event) => {
  event.preventDefault();
  if(event.target.id==="merge-profiles-form"){const fd=new FormData(event.target),s=fd.get("source"),t=fd.get("target");if(s===t){showToast("Выберите разные профили","error");return}if(confirm("Объединить профили? История будет перенесена."))mutate(()=>api.mergeProfiles(s,t),"Профили объединены");return}
  if(event.target.id==="admin-login-form"){const pin=new FormData(event.target).get("pin");mutate(async()=>{adminSession=await api.adminLogin(pin);localStorage.setItem(adminKey,JSON.stringify(adminSession));return api.getState()},"Режим организатора включён");return}
  if(event.target.id==="import-setup-form"){const fd=new FormData(event.target),ids=fd.getAll("profile"),date=fd.get("date");if(ids.length<2){showToast("Выберите минимум двух игроков","error");return}manualImport={date,profileIds:ids,roundCount:1,roundIndex:0,quick:true,values:{}};persistImportDraft();modal="import-rounds";render();return}
  if(event.target.id==="import-game-form"){captureImportValues();const rounds=[];for(let i=0;i<manualImport.roundCount;i++){const row={};let any=false,all=true;for(const id of manualImport.profileIds){const v=manualImport.values[`r${i}-${id}`]??"";if(v!==""){any=true;row[id]=Number(v)}else all=false}if(any&&!all){showToast(`Заполните весь раунд ${i+1}`,"error");manualImport.roundIndex=i;render();return}if(any)rounds.push(row)}if(!rounds.length){showToast(manualImport.quick?"Заполните итоги":"Добавьте хотя бы один раунд","error");return}const mode=manualImport.quick?"totals":"rounds";mutate(async()=>{const result=await api.importGame(`${manualImport.date}T12:00:00`,manualImport.profileIds,rounds,mode);clearImportDraft();return result},"Прошлая партия добавлена");return}
  if (event.target.id === "player-form") { const name = new FormData(event.target).get("name")?.trim(); if (name) mutate(() => api.addPlayer(name, selectedEmoji), `${name} за столом`); }
  if(event.target.id==="edit-profile-form"){const pl=state.currentGame.players.find(x=>x.id===editingPlayerId),name=new FormData(event.target).get("name")?.trim();if(name!==pl.name&&!isAdmin()){modal="admin";render();showToast("Переименование доступно организатору");return}mutate(()=>name!==pl.name?api.updateProfile(pl.profileId,name,selectedEmoji):api.updatePlayerIcon(pl.id,selectedEmoji),"Профиль обновлён");}
  if(event.target.id==="round-form")mutate(async()=>{const key=`korova-round-token-${roomCode}-${state.currentGame.id}`;let token=localStorage.getItem(key);if(!token){token=crypto.randomUUID();localStorage.setItem(key,token)}const result=await api.finalizeRound(token);localStorage.removeItem(key);return result},"Раунд завершён");
  if (event.target.id === "edit-round-form") { const form=new FormData(event.target),scores={};for(const player of state.currentGame.players){const raw=form.get(player.id);if(raw===""||raw==null||Number(raw)<0||!Number.isInteger(Number(raw))){showToast(`Укажите очки для ${player.name}`,"error");return}scores[player.id]=Number(raw)}mutate(()=>api.updateRound(editingRoundId,scores),"Результат раунда исправлен"); }
});

root.addEventListener("keydown",event=>{const input=event.target.closest(".import-mobile-round input[data-import-name]");if(!input||event.key!=="Enter")return;event.preventDefault();const list=[...document.querySelectorAll(".import-mobile-round input[data-import-name]")],i=list.indexOf(input);if(i<list.length-1)list[i+1].focus();else if((manualImport.roundIndex||0)<manualImport.roundCount-1){manualImport.roundIndex++;render();setTimeout(()=>document.querySelector(".import-mobile-round input")?.focus(),0)}});

window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; });
window.addEventListener("appinstalled", () => showToast("Коровосчёт установлен"));
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));

document.addEventListener("keydown", (event) => { if (event.key === "Escape" && modal) { if(modal==="import-rounds"){captureImportValues();if(hasImportValues()&&!confirm("Закрыть ввод? Заполненные результаты будут удалены."))return;clearImportDraft()} modal = null; render(); } });
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
    const next=mergeLive(await getLive());
    const hash=JSON.stringify({...next,archive:[]});
    if (hash !== lastStateHash) {
      if(TV_MODE&&state?.currentGame?.id===next.currentGame?.id&&(next.currentGame?.rounds?.length||0)>(state.currentGame?.rounds?.length||0)){tvEventUntil=Date.now()+6500;clearTimeout(tvEventTimer);tvEventTimer=setTimeout(()=>render(),6600)}
      if(TV_MODE&&state?.currentGame?.id&&next.currentGame?.id!==state.currentGame.id){const finished=(next.archive||[]).find(g=>g.id===state.currentGame.id);if(finished){tvCelebrationGame=finished;tvCelebrationUntil=Date.now()+15000;clearTimeout(tvCelebrationTimer);tvCelebrationTimer=setTimeout(()=>{tvCelebrationGame=null;render()},15100)}}
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
  if (document.hidden) {clearTimeout(syncTimer);clearInsightAuto()}
  else {syncStateNow();scheduleInsightAuto()}
});
window.addEventListener("focus", () => { if (cloudMode && !document.hidden) syncStateNow(); });
window.addEventListener("online", () => { syncRetryDelay=5000;updateSyncBadge();flushPending(); });
window.addEventListener("offline",()=>{updateSyncBadge();refreshDraftUi()});

async function init() {
  render();
  try {
    await api.ensure();
    state=mergeLive(await getLive());
    lastStateHash=JSON.stringify({...state,archive:[]});
    render();
    scheduleSync(5000);
    if(cloudMode)setTimeout(()=>{if(tab==="game"||TV_MODE)ensureHistory().catch(()=>{})},2500);
  } catch (error) {
    root.innerHTML = `<main class="fatal"><div class="logo-card mini"><b>006</b></div><h1>Не удалось открыть комнату</h1><p>${esc(error.message)}</p><button class="button primary" onclick="location.reload()">Попробовать снова</button></main>`;
  }
}
init();
