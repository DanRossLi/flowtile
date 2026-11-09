// Flow Tile: shared engine and UI for every map (Spring Hill, 1, 1a, 2, 3, 4, 4a, 5, 6, big).
// Each map page sets window.MAP before loading this file:
//   id, label, types[], elev[], bloomGoal, turnGoal, startHint, help[] (HTML strings), next (URL or null)
//   pickHint: message when the player taps a non-source tile before starting (default: startHint)
//   tileCost: every tile costs this many gal before modifiers (omit for downhill 1 / flat 2)
//   lakeTileCost: gal per lake tile (default 2)
//   speedRule: "perLevel" (+1 per level dropped, flat -1) or "waterfall" (default: drop-1, so 2+ level drops)
//   showSpeed / showBloom: show those chips (default: shown when the map uses them)
//   storage: water cap at the start (turns on bare ground: tap ground by the river for grass, then trees, +1 cap each)
//   tributaries: true lets you tap another source mid-game to start a separate river with its own water, flow and storage;
//     when it runs into another river it merges and adds its flow to that river
//   mainSource: [x, y] of the only source you can start on (others are for tributaries)
//   plantCost: gal to plant grass or trees (default 1); bloomLabel: name of the bloom chip (default "Bloom")
(() => {
const M = window.MAP;
const SW_URL = new URL("sw.js", document.currentScript.src).href; // sw.js sits next to play.js
const TYPES = M.types, ELEV = M.elev, BLOOM_GOAL = M.bloomGoal, TURN_GOAL = M.turnGoal;
const LAKE_TILE_COST = M.lakeTileCost ?? 2;
const SHOW_SPEED = M.showSpeed ?? M.speedRule === "perLevel";
const SHOW_BLOOM = M.showBloom ?? BLOOM_GOAL > 0;
const TRIB = !!M.tributaries, STORE = M.storage ?? 0, PLANT_COST = M.plantCost ?? 1, BLOOM_LABEL = M.bloomLabel ?? "Bloom";
const W = TYPES[0].length, H = TYPES.length, TW = 96, TH = 48, ZH = 14;
const COL = {bare:"#b8916a",grass:"#8fce5a",meadow:"#8fce5a",sand:"#f0d48a",rock:"#a9a49b",boulder:"#86b852",spring:"#8fce5a",lake:"#c9b98f",ocean:"#2f7fc4",source:"#7a8f9e",river:"#4aa3e8",bloom:"#45b043"};
const BANKS = true; // river drawn as a channel with banks; lakes get a shore
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- DOM
document.body.innerHTML = `
<div class="app">
  <div class="board" id="board">
    <canvas id="cv" aria-label="Game board"></canvas>
    <div class="overlay top" id="top">
      <div class="bar">
        <div class="brand">Flow <span>Tiles</span></div>
        <div class="lvl">${M.label}</div>
        <button class="icon" id="helpBtn" aria-label="How to play">?</button>
      </div>
      <div class="rivers" id="rivers" hidden></div>
      <div class="hud">
        <div class="chip tank" id="cWater">
          <div class="tline"><span>Water</span><b id="hWater">0</b><small id="hCap">gal</small><em id="cFlow">+0 a turn</em></div>
          ${STORE ? `<div class="cells" id="cells" aria-hidden="true"></div>` : ""}
        </div>
        ${SHOW_SPEED ? `<div class="chip mini" id="cSpeed"><span>Speed</span><b id="hSpeed">0</b></div>` : ""}
        <div class="chip mini" id="cTurn"><span>Turn</span><b><i id="hTurn">0</i><small>/${TURN_GOAL}</small></b></div>
      </div>
      <div class="goals" id="goals"></div>
    </div>
    <button class="icon sq zoom" id="fitBtn" aria-label="Show the whole map"></button>
    <div class="overlay bottom" id="bottom"><div class="msg" id="msg" role="status"></div></div>
    <div class="tcard" id="tcard" role="group" aria-label="Tile details" hidden></div>
    <div class="win" id="win" hidden><div class="card" role="dialog" aria-labelledby="winTitle">
      <div class="stars" id="wStars"></div>
      <h2 id="winTitle">You reached the sea!</h2>
      <ul id="wGoals"></ul>
      <div class="row" id="wRow">
        <button id="again">Play again</button>
        ${M.next ? `<a class="btn end" id="next" href="${M.next}">Next map</a>` : ""}
      </div>
    </div></div>
  </div>
  <div class="actions">
    <button id="undo" class="sq" aria-label="Undo" title="Undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg></button>
    <button id="restart" class="sq" aria-label="Restart" title="Restart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9.5 9.5 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/></svg></button>
    <button id="end" class="end">End turn <span class="gain" id="gain" hidden></span></button>
  </div>
</div>
<dialog id="help" aria-labelledby="helpTitle">
  <h2 id="helpTitle">How to play</h2>
  <ul>
    <li><b>Water</b> is what you have, in gallons. <b>Flow</b> is how many gallons you get each turn.</li>
    <li>Tap a tile to see what it does and what it costs, then choose. <b>Tap the same tile again</b> to do the first action.</li>
    ${M.help.map(h => `<li>${h}</li>`).join("\n    ")}
    <li>Stars: reach the sea${BLOOM_GOAL ? `, bloom <b>${BLOOM_GOAL}</b>+ tiles` : ""}, and arrive by turn <b>${TURN_GOAL}</b>.</li>
  </ul>
  <form method="dialog"><button class="end">Got it</button></form>
</dialog>`;
if (!M.next) document.getElementById("wRow").classList.add("one");
const $ = id => document.getElementById(id);
const tx = (id, v) => { const e = $(id); if (e) e.textContent = v };

// ---------- state
let S, history = [];
function fresh() {
  const tiles = [];
  for (let y = 0; y < H; y++) { tiles.push([]); for (let x = 0; x < W; x++) {
    const ch = TYPES[y][x];
    const t = {"_":"bare",".":"meadow",s:"sand",r:"rock",B:"boulder",o:"spring",L:"lake","~":"ocean",S:"source",T:"source"}[ch];
    tiles[y].push({t, e:+ELEV[y][x], river:false, bloom:false, g:0, rid:-1, pr:-1, to:null, lake:-1, yield:ch==="S"?2:ch==="T"?3:0, from:null});
  }}
  const lakes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = tiles[y][x]; if (c.t !== "lake" || c.lake >= 0) continue;
    const id = lakes.length, members = [], st = [[x, y]]; c.lake = id;
    while (st.length) { const p = st.pop(); members.push(p);
      for (const n of nbrs(p)) { const nc = tiles[n[1]][n[0]]; if (nc.t === "lake" && nc.lake < 0) { nc.lake = id; st.push(n) } } }
    lakes.push({tiles:members, filled:false});
  }
  return {tiles, lakes, rivers:[], active:0, phase:"pick", cap:STORE, water:0, income:0, speed:0, turn:0, head:null, msg:M.startHint, warn:false};
}
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
function nbrs([x, y]) { return [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => [x+dx, y+dy]).filter(([a,b]) => inside(a, b)) }
const at = p => S.tiles[p[1]][p[0]];
function level(p) { const c = at(p); return c.t === "lake" && S.lakes[c.lake].filled ? c.e + 1 : c.e }

// ---------- rules
function cost(from, to) {
  const b = at(to);
  const merge = TRIB && b.river && b.rid >= 0 && b.rid !== S.active && b.t !== "source" && b.t !== "ocean";
  if ((b.river && !merge) || b.t === "boulder" || b.t === "source") return -1;
  if (b.e > level(from)) return -1;
  if (merge) return M.tileCost ?? 1;
  if (b.t === "lake") return LAKE_TILE_COST * S.lakes[b.lake].tiles.length;
  let c = M.tileCost ?? (b.e < level(from) ? 1 : 2); // sand costs the normal price; it cuts flow instead (see build)
  if (b.t === "spring") c = 0;
  return c;
}
// Bare ground touching the river can be planted: grass, then trees.
function plantable(p) {
  if (!STORE || S.phase !== "play") return false;
  const c = at(p); if (c.t !== "bare" || c.river || c.g >= 2) return false;
  return nbrs(p).some(n => at(n).river && (!TRIB || at(n).rid === S.active));
}
// ---------- rivers: the active river's numbers live on S; the others wait in S.rivers
const RF = ["water", "income", "speed", "head", "cap"];
const take = o => Object.fromEntries(RF.map(k => [k, o[k]]));
function stash() { if (S.rivers[S.active]) Object.assign(S.rivers[S.active], take(S)) }
function activate(i) { stash(); S.active = i; Object.assign(S, take(S.rivers[i])) }
const riverName = i => i === 0 ? "Main river" : S.rivers.length > 2 ? `Tributary ${i}` : "Tributary";
const openRivers = () => S.rivers.map((r, i) => i).filter(i => i !== S.active && !S.rivers[i].joined);
function capAdd(rid, d) { if (rid === S.active || rid < 0) S.cap += d; else S.rivers[rid].cap += d }
function startTributary(p) {
  const c = at(p); snapshot(); stash();
  const i = S.rivers.length; S.rivers.push({src:p, joined:false, water:STORE ? Math.min(c.yield, STORE) : c.yield, income:c.yield, speed:0, head:p, cap:STORE});
  c.river = true; c.rid = i; S.active = i; Object.assign(S, take(S.rivers[i]));
  say(`${riverName(i)} started: its own ${S.water} gal and +${S.income} gal a turn. Run it into another river to add its flow there.`);
}
function plant(p) {
  const c = at(p), what = c.g ? "Trees" : "Grass";
  if (S.water < PLANT_COST) { say(`${what} costs ${PLANT_COST} gal and you have ${S.water} gal. End the turn to collect your flow.`, true); return }
  snapshot(); S.water -= PLANT_COST; c.g++; c.bloom = true; c.pr = S.active; S.cap++; bump("cWater"); bump("cBloom");
  const sh = storageHint(); say(`${what} planted: you can now store ${S.cap} gal.${sh ? " " + sh + "." : ""}`);
}
function ends() { const h = at(S.head); return h.t === "lake" ? S.lakes[h.lake].tiles : [S.head] }
function moves() {
  const m = new Map(); if (S.phase !== "play") return m;
  for (const f of ends()) for (const n of nbrs(f)) { const c = cost(f, n), k = n + "";
    if (c >= 0 && (!m.has(k) || c < m.get(k).cost)) m.set(k, {p:n, cost:c, from:f}) }
  return m;
}
const touchesRock = p => nbrs(p).some(n => at(n).t === "rock");
function tryBloom(p) { const c = at(p);
  if (c.river || c.bloom || !["meadow","sand","spring"].includes(c.t)) return 0;
  if (S.speed < 1 && touchesRock(p)) return 0;
  c.bloom = true; return 1 }
const bloomCount = () => S.tiles.flat().filter(c => c.bloom).length;
const affordable = () => [...moves().values()].some(m => m.cost <= S.water);
const canPlant = () => STORE && S.water >= PLANT_COST && S.tiles.some((r, y) => r.some((_, x) => plantable([x, y])));
// When every next tile costs more than you can store, say so: ending turns won't help, planting will.
function storageHint() { if (!STORE || S.phase !== "play") return "";
  const c = Math.min(...[...moves().values()].map(m => m.cost)); if (!(c > S.cap)) return "";
  return `The next tile costs ${c} gal but you can only store ${S.cap}. Plant by the stream to store more` }

function snapshot() { history.push(JSON.stringify(S)) }
function build(mv) {
  if (S.water < mv.cost) { say(`That tile costs ${mv.cost} gal and you have ${S.water} gal. End the turn to collect your flow of ${S.income} gal.`, true); return }
  snapshot();
  S.water -= mv.cost;
  if (at(mv.p).river) { // ran into another river: merge into it
    const t = at(mv.p).rid, me = S.active, gave = S.income, poured = S.water; at(mv.from).to = mv.p;
    S.rivers[t].income += gave; stash(); S.rivers[me].joined = true; S.active = t; Object.assign(S, take(S.rivers[t]));
    S.water += poured; const sp = STORE ? Math.max(0, S.water - S.cap) : 0; S.water -= sp; bump("cFlow"); bump("cWater");
    say(`${riverName(me)} joined the ${riverName(t).toLowerCase()}: flow now +${S.income} gal a turn${poured ? `, and ${poured - sp} gal poured in${sp ? ` (${sp} spilled)` : ""}` : ""}.`); return }
  const b = at(mv.p), drop = level(mv.from) - b.e;
  S.speed = M.speedRule === "perLevel" ? (drop > 0 ? S.speed + drop : Math.max(0, S.speed - 1)) : Math.max(0, S.speed + drop - 1);
  const notes = []; let bl = 0;
  if (b.t === "lake") { const L = S.lakes[b.lake]; L.filled = true;
    for (const p of L.tiles) { const c = at(p); c.river = true; c.bloom = false; c.from = mv.from; c.rid = S.active }
    S.income += 1; for (const p of L.tiles) for (const n of nbrs(p)) bl += tryBloom(n);
    notes.push("Lake filled: flow +1 gal a turn"); bump("cFlow") }
  else { b.river = true; b.bloom = false; b.from = mv.from; b.rid = S.active;
    if (b.g) { capAdd(b.pr, -b.g); const sp = Math.max(0, S.water - S.cap); S.water -= sp;
      notes.push(`The river washed away the ${b.g > 1 ? "trees" : "grass"}: storage down to ${S.cap} gal${sp ? `, ${sp} gal spilled` : ""}`); b.g = 0; bump("cWater") }
    if (b.t === "spring") { S.income += 1; notes.push("Spring joined: flow +1 gal a turn"); bump("cFlow") }
    if (b.t === "sand") { for (const n of nbrs(mv.p)) bl += tryBloom(n);
      const was = S.income; S.income = Math.max(0, S.income - 1);
      notes.push(was > S.income ? `Sand soaked up 1 flow: now +${S.income} gal a turn` : "Sand soaked the ground"); bump("cFlow") } }
  if (bl) notes.push(`${bl} tile${bl > 1 ? "s" : ""} bloomed`);
  if (M.speedRule === "perLevel") notes.push(drop >= 1 ? `Downhill: speed ${S.speed}` : S.speed ? `Flat: speed down to ${S.speed}` : "Flat: no speed");
  else if (drop >= 2) notes.push("Waterfall! Speed up");
  S.head = mv.p;
  if (b.t === "ocean") { S.phase = "won"; say(`You reached the sea on turn ${S.turn}.`); return }
  if (TRIB && openRivers().length && (!moves().size || (S.income === 0 && !affordable()))) { notes.push(`This river can't go on. Tap your ${riverName(openRivers()[0]).toLowerCase()} to switch`); say(notes.join(". ") + ".", true); return }
  if (!moves().size) { S.phase = "stuck"; say("Dead end: nowhere left to go. Undo or restart.", true); return }
  if (S.income === 0 && !affordable()) { S.phase = "stuck"; say("Your flow is 0 and you can't afford another tile. Undo or restart.", true); return }
  const sh = storageHint();
  if (sh) notes.push(sh); else if (!affordable() && !canPlant()) notes.push(`Out of water. End the turn for +${S.income} gal`);
  say(notes.length ? notes.join(". ") + "." : "Keep building, or end the turn.");
}
function endTurn() { if (S.phase !== "play") return; snapshot(); S.turn++; S.water += S.income; bump("cWater");
  const sp = STORE ? Math.max(0, S.water - S.cap) : 0; S.water -= sp;
  for (const i of openRivers()) { const r = S.rivers[i]; r.water = STORE ? Math.min(r.cap, r.water + r.income) : r.water + r.income }
  say(sp ? `Turn ${S.turn}: +${S.income - sp} gal. Storage is full at ${S.cap} gal, so ${sp} gal spilled.` : `Turn ${S.turn}: +${S.income} gal of water.`) }
function pick(p) {
  const c = at(p); if (c.t !== "source" || (M.mainSource && p + "" !== M.mainSource + "")) { say(M.pickHint ?? M.startHint, true); return }
  snapshot(); c.river = true; c.rid = 0; S.rivers = [{src:p, joined:false}]; S.active = 0; S.head = p; S.income = c.yield; S.turn = 1; S.water = STORE ? Math.min(c.yield, S.cap) : c.yield; S.phase = "play";
  say(`Your source has a flow of ${c.yield} gal a turn. Tap a glowing tile to build.`);
}
function undo() { if (!history.length) return; S = JSON.parse(history.pop()); say("Stepped back.") }
function restart() { S = fresh(); history = []; say(M.startHint) }

// ---------- UI
function say(t, warn = false) { S.msg = t; S.warn = warn; sync() }
function bump(id) { const e = $(id); if (!e || reduce) return; e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump") }
function sync() {
  const rv = $("rivers"), multi = TRIB && S.rivers && S.rivers.length > 1; rv.hidden = !multi;
  if (multi) rv.innerHTML = S.rivers.map((r, i) => { const on = i === S.active, d = on ? S : r;
    return `<button data-r="${i}" class="${on ? "on" : ""}" ${r.joined ? "disabled" : ""}>${riverName(i)}<small>${r.joined ? "joined" : `${d.water}${STORE ? "/" + d.cap : ""} gal · +${d.income}`}</small></button>` }).join("");
  tx("hWater", S.water); tx("hCap", STORE ? `of ${S.cap} gal` : "gal"); tx("cFlow", `+${S.income} a turn`); tx("hSpeed", S.speed); tx("hTurn", S.turn);
  if (STORE) { const cells = $("cells"); let h = ""; for (let i = 0; i < S.cap; i++) h += `<i class="${i < S.water ? "f" : ""}"></i>`; cells.innerHTML = h }
  $("cWater").setAttribute("aria-label", `Water: ${S.water}${STORE ? ` of ${S.cap}` : ""} gallons, flow +${S.income} a turn`);
  $("cTurn").classList.toggle("over", S.turn > TURN_GOAL);
  goals();
  const gain = $("gain"), play = S.phase === "play"; gain.hidden = !play;
  if (play) { const g = STORE ? Math.min(S.income, Math.max(0, S.cap - S.water)) : S.income, sp = S.income - g;
    gain.textContent = sp ? `+${g} · ${sp} spill` : `+${S.income} gal`; gain.classList.toggle("spill", sp > 0) }
  if ((S.head || "") + "|" + S.active !== lastHead) { lastHead = (S.head || "") + "|" + S.active; follow() }
  $("cSpeed")?.classList.toggle("fast", S.speed >= 1);
  $("msg").textContent = S.msg || ""; $("msg").classList.toggle("warn", !!S.warn);
  $("end").disabled = S.phase !== "play"; $("undo").disabled = !history.length;
  $("end").classList.toggle("ready", S.phase === "play" && !affordable() && !canPlant());
  const won = S.phase === "won"; $("win").hidden = !won; $("bottom").hidden = won;
  if (won) {
    const bl = bloomCount(), goals = [[true, "Reached the sea"], [bl >= BLOOM_GOAL, BLOOM_GOAL ? (M.bloomLabel ? `${M.bloomLabel} on ${bl}/${BLOOM_GOAL} tiles` : `Bloomed ${bl}/${BLOOM_GOAL} tiles`) : "Bloom goal (none on this map)"], [S.turn <= TURN_GOAL, `Turn ${S.turn} (goal: by turn ${TURN_GOAL})`]];
    const n = goals.filter(g => g[0]).length;
    $("wStars").innerHTML = "★".repeat(n) + `<span class="off">${"★".repeat(3 - n)}</span>`;
    $("wStars").setAttribute("aria-label", `${n} of 3 stars`);
    $("wGoals").innerHTML = goals.map(([ok, t]) => `<li class="${ok ? "got" : ""}">${t}</li>`).join("");
  }
  save(); resize();
  if (sel) { if (S.phase === "play") renderCard(); else closeCard() }
  draw();
}

// ---------- tile card: tap a tile to see what it does and choose an action
let sel = null, cardActs = [];
function tileName(c) {
  if (c.river) return {lake:"Full lake", ocean:"The sea", source:"Source"}[c.t] || (c.rid >= 0 && c.rid !== S.active ? riverName(c.rid) : "Your stream");
  if (c.g) return c.g > 1 ? "Trees" : "Grass";
  return {bare:"Bare ground", meadow:"Meadow", sand:"Sand", rock:"Rock", boulder:"Boulder", spring:"Spring", lake:"Empty lake", ocean:"The sea", source:"Source"}[c.t];
}
function tileText(p) {
  const c = at(p);
  if (c.river) return c.rid === S.active ? "Part of the river you're building." : "Part of another river.";
  if (c.g) return `Stores ${c.g} extra gal. A stream running over it washes that away.`;
  const lake = c.t === "lake" ? LAKE_TILE_COST * S.lakes[c.lake].tiles.length : 0;
  return {bare:"Plant here once your stream is next to it.", meadow:"Open ground the stream can cross.",
    sand:"Cuts flow by 1 when a stream crosses it, and blooms the land around it.", rock:"A stream can cross it. Tiles touching rock only bloom with speed.",
    boulder:"Blocks the stream.", spring:"Free to reach, and adds +1 flow.", lake:`Fills all at once for ${lake} gal. Adds +1 flow and blooms the shore.`,
    ocean:"Bring a stream here to finish the map.", source:"Where a river starts."}[c.t];
}
function actions(p) {
  const c = at(p), out = [], m = moves().get(p + "");
  if (m) { let name = "Extend the stream", sub = "", warn = "";
    if (c.river) { name = `Join the ${riverName(c.rid).toLowerCase()}`; sub = "Adds this river's flow and pours in its water" }
    else if (c.t === "ocean") { name = "Reach the sea"; sub = "Finishes the map" }
    else if (c.t === "lake") { name = "Fill the lake"; sub = `Flow ${S.income} → ${S.income + 1}, and blooms the shore` }
    else if (c.t === "spring") { name = "Join the spring"; sub = `Flow ${S.income} → ${S.income + 1}` }
    else if (c.t === "sand") { sub = "Blooms the land around it"; warn = `Cuts flow: ${S.income} → ${Math.max(0, S.income - 1)}` }
    if (c.g) warn = `Washes away the ${c.g > 1 ? "trees" : "grass"}: you lose ${c.g} storage`;
    out.push({k:"stream", name, cost:m.cost, sub, warn, run:() => build(m)}) }
  if (plantable(p)) out.push({k:"plant", name:c.g ? "Grow trees" : "Plant grass", cost:PLANT_COST, sub:`Store ${S.cap} → ${S.cap + 1} gal`,
    warn:m ? "A stream running here later washes it away" : "", run:() => plant(p)});
  if (TRIB && c.t === "source" && !c.river) out.push({k:"trib", name:"Start a tributary", cost:0, sub:`Its own water and storage, +${c.yield} gal a turn`, warn:"", run:() => startTributary(p)});
  return out;
}
const canDo = a => S.water >= a.cost;
function shortBy(a) { return STORE && a.cost > S.cap ? `You can only store ${S.cap} gal. Plant to store more` : `You have ${S.water} gal. End the turn for +${S.income}` }
function renderCard() {
  const c = at(sel), el = $("tcard"); cardActs = actions(sel);
  el.innerHTML = `<div class="thead"><i class="swatch" style="background:${topColor(c)}"></i><div class="tname"><b>${tileName(c)}</b>${cardActs.length ? "" : `<small>${tileText(sel)}</small>`}</div><button class="tclose" id="tclose" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>` +
    cardActs.map((a, i) => `<button class="act ${a.k}" data-a="${i}" ${canDo(a) ? "" : "disabled"}><span class="atext"><b>${a.name}</b>${canDo(a) ? (a.sub ? `<small>${a.sub}</small>` : "") : `<small>${shortBy(a)}</small>`}${a.warn && canDo(a) ? `<small class="awarn">${a.warn}</small>` : ""}</span><span class="acost">${a.cost ? a.cost + " gal" : "Free"}</span></button>`).join("");
  el.hidden = false; placeCard();
}
function placeCard() {
  if (!sel) return;
  const el = $("tcard"), d = diamond(sel), sx = ((d[0][0] + d[2][0]) / 2 * scale + off.x) / lay.dpr, sy = ((d[0][1] + d[2][1]) / 2 * scale + off.y) / lay.dpr;
  const side = lay.h < 540 && lay.w > lay.h * 1.3, up = sy > lay.topH + (lay.h - lay.topH) / 2;
  el.className = "tcard " + (side ? (sx > lay.w / 2 ? "left" : "right") : up ? "up" : "");
  el.style.top = !side && up ? lay.topH + 6 + "px" : "";
}
function closeCard() { if (!sel) return; sel = null; cardActs = []; $("tcard").hidden = true; draw() }
function runAct(a) { closeCard(); a.run() }
function tapTile(p) {
  const c = at(p), m = moves().get(p + "");
  if (TRIB && c.river && c.rid >= 0 && c.rid !== S.active && !S.rivers[c.rid].joined && !m) { closeCard(); activate(c.rid); say(`Now building the ${riverName(c.rid).toLowerCase()}.`); return }
  if (sel && sel + "" === p + "") { const a = cardActs.find(canDo); if (a) runAct(a); else closeCard(); return }
  sel = p; renderCard(); draw();
}

// The three star goals stay on screen while you play.
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';
function goals() {
  const won = S.phase === "won", bl = bloomCount(), left = TURN_GOAL - S.turn, over = left < 0;
  const list = [[won ? "got" : "", "To the sea"]];
  if (BLOOM_GOAL) list.push([bl >= BLOOM_GOAL ? "got" : "", `${BLOOM_LABEL} ${bl}/${BLOOM_GOAL}`, "cBloom"]);
  list.push([over ? "miss" : won ? "got" : "live",
    S.phase === "pick" || won ? `By turn ${TURN_GOAL}` : over ? `Missed turn ${TURN_GOAL}` : left === 0 ? `Turn ${TURN_GOAL} · last turn` : `Turn ${TURN_GOAL} · ${left} left`]);
  $("goals").innerHTML = list.map(([k, t, id]) => `<span class="goal ${k}"${id ? ` id="${id}"` : ""}>${STAR}${t}</span>`).join("");
}

// ---------- persistence: keep the current run across app close/reopen
const SAVE_KEY = "flowtile.run.v2." + M.id;
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({S, history})) } catch (_) {} }
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!d || !d.S || !Array.isArray(d.S.tiles) || d.S.tiles.length !== H || d.S.tiles[0].length !== W || !Array.isArray(d.history)) return false;
    S = d.S; history = d.history; S.rivers ||= []; S.active ||= 0; return true;
  } catch (_) { return false }
}

// ---------- drawing (isometric prisms)
const cv = $("cv"), ctx = cv.getContext("2d");
let scale = 1, off = {x:0, y:0}, t0 = performance.now(), lastSize = "", lastHead = null;
// view.z is zoom relative to "whole map fits"; cx/cy is the world point at the middle of the free area
const view = {z:null, cx:0, cy:0}, lay = {w:0, h:0, topH:0, availH:0, dpr:1, fit:1, zAuto:1};
let tgt = null;
const ORDER = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ORDER.push([x, y]); ORDER.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
const iso = (x, y, e) => ({x:(x - y) * TW / 2, y:(x + y) * TH / 2 - e * ZH});
function drawLevel(p) { const c = at(p); if (c.t === "ocean") return 0; if (c.t === "lake") return c.e + (S.lakes[c.lake].filled ? .7 : 0); return c.e }
function diamond(p) { const o = iso(p[0], p[1], drawLevel(p)); return [[o.x, o.y - TH/2], [o.x + TW/2, o.y], [o.x, o.y + TH/2], [o.x - TW/2, o.y]] }
function bounds() { let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = +ELEV[y][x], o = iso(x, y, e), g = iso(x, y, 0);
    a = Math.min(a, o.x - TW/2); c = Math.max(c, o.x + TW/2); b = Math.min(b, o.y - TH/2 - 40); d = Math.max(d, g.y + TH/2 + 14) }
  return {x:a - 8, y:b, w:c - a + 16, h:d - b + 8} }
const B = bounds();
// Fit the map into the part of the game window not covered by the top bar and the message.
// Zoom in so tiles are at least 72px wide and the board fills most of the free height; keep the end of the stream in view.
function resize() {
  const box = $("board"), w = box.clientWidth, h = box.clientHeight, dpr = Math.min(devicePixelRatio || 1, 3);
  if (!w || !h) return;
  const topH = $("top").offsetHeight, botH = $("bottom").hidden ? 0 : $("bottom").offsetHeight;
  const key = [w, h, topH, botH, dpr].join(); if (key === lastSize) return; lastSize = key;
  const availH = Math.max(40, h - topH - botH), fit = Math.min(w / B.w, availH / B.h);
  Object.assign(lay, {w, h, topH, availH, dpr, fit, zAuto:Math.min(4, Math.max(1, 72 / (TW * fit), Math.min(2, .85 * availH / B.h / fit)))});
  if (view.z === null) { view.z = lay.zAuto; const f = focusPoint(); view.cx = f.x; view.cy = f.y }
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  $("fitBtn").style.top = topH + 6 + "px";
  applyView();
}
function clampView() {
  const s = lay.fit * view.z, vw = lay.w / s, vh = lay.availH / s;
  view.cx = vw >= B.w ? B.x + B.w / 2 : Math.min(B.x + B.w - vw / 2, Math.max(B.x + vw / 2, view.cx));
  view.cy = vh >= B.h ? B.y + B.h / 2 : Math.min(B.y + B.h - vh / 2, Math.max(B.y + vh / 2, view.cy));
}
function applyView() {
  view.z = Math.min(5, Math.max(1, view.z)); clampView();
  scale = lay.fit * view.z * lay.dpr;
  off = {x:lay.w / 2 * lay.dpr - view.cx * scale, y:(lay.topH + lay.availH / 2) * lay.dpr - view.cy * scale};
  const zoomed = view.z > 1.02, fb = $("fitBtn");
  fb.innerHTML = zoomed ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6"/></svg>';
  fb.setAttribute("aria-label", zoomed ? "Show the whole map" : "Zoom in");
  placeCard(); draw();
}
// Where to look: the end of the active stream, else the source you can start on, else the middle.
function focusPoint() {
  const p = S && S.head ? S.head : M.mainSource || (() => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (TYPES[y][x] === "S" || TYPES[y][x] === "T") return [x, y] })();
  if (!p) return {x:B.x + B.w / 2, y:B.y + B.h / 2};
  const o = iso(p[0], p[1], +ELEV[p[1]][p[0]]); return {x:o.x, y:o.y};
}
function follow(force) {
  if (view.z === null || !lay.w) return;
  const f = focusPoint(), s = lay.fit * view.z, hw = lay.w / s / 2, hh = lay.availH / s / 2;
  if (force || Math.abs(f.x - view.cx) > hw * .55 || Math.abs(f.y - view.cy) > hh * .55) {
    tgt = {x:f.x, y:f.y}; if (reduce) { view.cx = f.x; view.cy = f.y; tgt = null; applyView() } }
}
function glide() { if (!tgt) return; view.cx += (tgt.x - view.cx) * .18; view.cy += (tgt.y - view.cy) * .18;
  if (Math.hypot(tgt.x - view.cx, tgt.y - view.cy) < 1) { view.cx = tgt.x; view.cy = tgt.y; tgt = null } applyView() }
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  return `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})` }
function poly(pts, fill) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill() }
function topColor(c) { if (c.t === "ocean") return COL.ocean; if (c.river && (c.t === "lake" || !BANKS)) return COL.river; if (c.river) return COL[c.t]; if (c.g) return COL.grass; if (c.bloom) return COL.bloom; return COL[c.t] }
// ---------- banks: the river is a channel cut into the land, lakes get a shoreline
const gp = (x, y, u, v, lv) => { const o = iso(x + u, y + v, lv); return [o.x, o.y] };
const same = (q, p) => !!q && q + "" === p + "";
const linked = (a, b) => { const A = at(a), B = at(b); return A.river && B.river && (same(B.from, a) || same(A.from, b) || same(A.to, b) || same(B.to, a)) };
function channel(p, lv) {
  const dirs = nbrs(p).filter(n => linked(p, n)).map(n => [n[0] - p[0], n[1] - p[1]]);
  const [x, y] = p;
  const shape = (w, fill) => {
    poly([gp(x, y, -w, -w, lv), gp(x, y, w, -w, lv), gp(x, y, w, w, lv), gp(x, y, -w, w, lv)], fill);
    for (const [dx, dy] of dirs) { const px = -dy, py = dx;
      poly([gp(x, y, px * w, py * w, lv), gp(x, y, dx * .5 + px * w, dy * .5 + py * w, lv), gp(x, y, dx * .5 - px * w, dy * .5 - py * w, lv), gp(x, y, -px * w, -py * w, lv)], fill) }
  };
  shape(.33, "#8a6a45"); shape(.27, "#a9865c"); shape(.2, COL.river);
  ctx.strokeStyle = "rgba(220,240,255,.75)"; ctx.lineWidth = 2; ctx.lineCap = "round";
  for (const [dx, dy] of dirs) { ctx.beginPath(); ctx.moveTo(...gp(x, y, 0, 0, lv)); ctx.lineTo(...gp(x, y, dx * .5, dy * .5, lv)); ctx.stroke() }
}
function shore(p, lv) {
  const [x, y] = p, me = at(p);
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const n = [x + dx, y + dy];
    if (inside(...n) && (at(n).lake === me.lake && me.lake >= 0 || linked(p, n))) continue;
    const px = -dy, py = dx, a = .5, b = .37;
    poly([gp(x, y, dx * a + px * .5, dy * a + py * .5, lv), gp(x, y, dx * a - px * .5, dy * a - py * .5, lv), gp(x, y, dx * b - px * .5, dy * b - py * .5, lv), gp(x, y, dx * b + px * .5, dy * b + py * .5, lv)], "#e6d29c");
    ctx.strokeStyle = "#7d5f3c"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(...gp(x, y, dx * b + px * .5, dy * b + py * .5, lv)); ctx.lineTo(...gp(x, y, dx * b - px * .5, dy * b - py * .5, lv)); ctx.stroke() }
}
function draw() {
  if (!S) return;
  const t = (performance.now() - t0) / 1000, mv = moves();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(scale, 0, 0, scale, off.x, off.y);
  const badges = []; // drawn after all tiles so tiles in front can't cover them
  for (const p of ORDER) {
    const c = at(p), lv = drawLevel(p), d = diamond(p), base = topColor(c), dn = lv * ZH + 12;
    poly([d[3], d[2], [d[2][0], d[2][1] + dn], [d[3][0], d[3][1] + dn]], shade(base, .38));
    poly([d[2], d[1], [d[1][0], d[1][1] + dn], [d[2][0], d[2][1] + dn]], shade(base, .22));
    poly(d, base);
    ctx.strokeStyle = shade(base, .12); ctx.lineWidth = 1; ctx.stroke();
    const o = iso(p[0], p[1], lv);
    deco(p, c, o, t);
    if (c.river && c.t === "lake") shore(p, lv);
    else if (c.river && c.t !== "ocean" && c.t !== "source") channel(p, lv);
    else if (c.t === "source" && c.river) channel(p, lv), deco(p, c, o, t);
    const m = mv.get(p + ""), pk = c.t === "source" && !c.river && ((S.phase === "pick" && (!M.mainSource || p + "" === M.mainSource + "")) || (TRIB && S.phase === "play"));
    if (m || pk) {
      const ok = pk || S.water >= m.cost, pulse = reduce ? 1 : .6 + .4 * Math.sin(t * 4);
      poly(d, ok ? `rgba(255,255,255,${.12 + .1 * pulse})` : "rgba(255,159,90,.12)");
      ctx.strokeStyle = ok ? `rgba(255,255,255,${pulse})` : "rgba(255,159,90,.9)"; ctx.lineWidth = 3.5; ctx.stroke();
      badges.push({o, pk, text: pk ? `+${c.yield}` : m.cost, sand: !!m && c.t === "sand"});
    } else if (plantable(p)) { // plant here: green dashed outline and a small green price
      ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = S.water >= PLANT_COST ? "rgba(214,255,170,.5)" : "rgba(255,255,255,.2)"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      badges.push({o, plant:true, text:PLANT_COST, ok:S.water >= PLANT_COST});
    }
  }
  if (sel) { const d = diamond(sel); poly(d, "rgba(255,255,255,.24)"); ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.stroke() }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const {o, pk, text, sand, plant, ok} of badges) {
    if (plant) { const x = o.x, y = o.y + 1; ctx.fillStyle = ok ? "rgba(31,110,40,.85)" : "rgba(8,24,38,.55)"; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
      ctx.fillStyle = ok ? "#d6ffaa" : "#9bb6c6"; ctx.beginPath(); ctx.moveTo(x - 5, y + 5); ctx.quadraticCurveTo(x - 6, y - 6, x + 6, y - 6); ctx.quadraticCurveTo(x + 6, y + 5, x - 5, y + 5); ctx.fill(); continue }
    ctx.fillStyle = "rgba(8,24,38,.88)"; ctx.beginPath(); ctx.arc(o.x, o.y - 2, pk ? 20 : 15, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `700 ${pk ? 15 : 19}px Fredoka, Nunito, sans-serif`; ctx.fillText(text, o.x, o.y - 1);
    if (sand) { // sand also costs 1 flow: show it under the price
      ctx.fillStyle = "rgba(8,24,38,.92)"; ctx.beginPath(); ctx.arc(o.x - 16, o.y + 21, 9, 0, 7); ctx.arc(o.x + 16, o.y + 21, 9, 0, 7); ctx.fill(); ctx.fillRect(o.x - 16, o.y + 12, 32, 18);
      ctx.fillStyle = "#ff9f5a"; ctx.font = "700 12px Fredoka, Nunito, sans-serif"; ctx.fillText("−1 flow", o.x, o.y + 21);
    }
  }
}
function deco(p, c, o, t) {
  if (c.t === "bare" && !c.river && !c.g) { ctx.fillStyle = "rgba(110,75,45,.4)"; for (const [dx, dy] of [[-12,-3],[-1,6],[10,-5],[3,-10]]) ctx.fillRect(o.x + dx - 3, o.y + dy - 1, 6, 2) }
  if (c.g === 1 && !c.river) { ctx.strokeStyle = "#3f9a3f"; ctx.lineWidth = 2; ctx.lineCap = "round";
    for (const [dx, dy] of [[-14,-2],[-4,7],[8,-6],[14,4],[0,-10]]) { const x = o.x + dx, y = o.y + dy; ctx.beginPath(); ctx.moveTo(x - 3, y - 6); ctx.lineTo(x, y); ctx.lineTo(x + 3, y - 6); ctx.stroke() } return }
  if (c.bloom && !c.river) for (const [dx, dy] of [[-14,-2],[10,-8],[6,8]]) { const x = o.x + dx, y = o.y + dy;
    ctx.fillStyle = "#6b4a2b"; ctx.fillRect(x - 1.5, y - 2, 3, 6);
    poly([[x, y - 18], [x + 7, y - 1], [x - 7, y - 1]], "#2e7d32"); poly([[x, y - 18], [x + 7, y - 1], [x, y - 1]], "#3f9a3f") }
  if (c.t === "sand" && !c.river && !c.bloom) { ctx.fillStyle = "rgba(160,120,60,.45)"; for (const [dx, dy] of [[-12,-3],[-2,5],[9,-5],[14,4],[2,-9]]) { ctx.beginPath(); ctx.arc(o.x + dx, o.y + dy, 1.8, 0, 7); ctx.fill() } }
  if (c.t === "rock" && !c.river) { poly([[o.x-16,o.y+4],[o.x-8,o.y-10],[o.x+6,o.y-12],[o.x+16,o.y+2],[o.x+4,o.y+8]], "#8a857c"); poly([[o.x-8,o.y-10],[o.x+6,o.y-12],[o.x+2,o.y-2]], "#c4beb3") }
  if (c.t === "boulder") { poly([[o.x-22,o.y+6],[o.x-16,o.y-22],[o.x+2,o.y-34],[o.x+20,o.y-18],[o.x+22,o.y+6],[o.x,o.y+14]], "#6f6b66"); poly([[o.x-16,o.y-22],[o.x+2,o.y-34],[o.x+20,o.y-18],[o.x,o.y-12]], "#9c978f") }
  if (c.t === "spring" && !c.river) { ctx.fillStyle = "#4aa3e8"; ctx.beginPath(); ctx.arc(o.x, o.y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.x, o.y, 13, 0, 7); ctx.stroke() }
  if (c.t === "lake" && !S.lakes[c.lake].filled) { ctx.strokeStyle = "#4aa3e8"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(o.x, o.y, 10, 0, 7); ctx.stroke() }
  if (c.t === "source") { ctx.fillStyle = "#bfe4ff"; ctx.beginPath(); ctx.arc(o.x, o.y - 4, 10, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(o.x, o.y - 4, 5, 0, 7); ctx.fill() }
  if (c.t === "ocean") { const w = reduce ? 0 : Math.sin(t * 2 + p[0]) * 3; ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x - 14, o.y + w); ctx.lineTo(o.x + 14, o.y + w); ctx.stroke() }
}

// ---------- input
function tileAt(cx, cy) {
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
  const x = ((cx - r.left) * dpr - off.x) / scale, y = ((cy - r.top) * dpr - off.y) / scale;
  for (let i = ORDER.length - 1; i >= 0; i--) { const d = diamond(ORDER[i]); if (inPoly(x, y, d)) return ORDER[i] }
  return null }
function inPoly(x, y, pts) { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins } return ins }
// Drag to pan, pinch or wheel to zoom; a touch that barely moves is a tap.
const ptrs = new Map(); let drag = null, dragged = false;
cv.addEventListener("pointerdown", e => {
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY}); try { cv.setPointerCapture(e.pointerId) } catch (_) {}
  const pts = [...ptrs.values()];
  if (pts.length === 1) { drag = {x:e.clientX, y:e.clientY, cx:view.cx, cy:view.cy}; dragged = false }
  else if (pts.length === 2) { drag = {pinch:Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), z:view.z}; dragged = true }
});
cv.addEventListener("pointermove", e => {
  if (!ptrs.has(e.pointerId) || !drag) return; ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  const pts = [...ptrs.values()];
  if (drag.pinch && pts.length >= 2) { view.z = drag.z * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / drag.pinch; tgt = null; applyView(); return }
  if (drag.pinch) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!dragged && Math.hypot(dx, dy) < 9) return;
  dragged = true; tgt = null; const s = lay.fit * view.z; view.cx = drag.cx - dx / s; view.cy = drag.cy - dy / s; applyView();
});
const lift = e => { ptrs.delete(e.pointerId); if (!ptrs.size) drag = null };
cv.addEventListener("pointercancel", e => { lift(e); dragged = false });
cv.addEventListener("wheel", e => { e.preventDefault(); view.z *= Math.exp(-e.deltaY * .0015); tgt = null; applyView() }, {passive:false});
$("fitBtn").onclick = () => { if (view.z > 1.02) view.z = 1; else { view.z = Math.max(lay.zAuto, 1.8); follow(true) } applyView() };
cv.addEventListener("pointerup", e => {
  const wasDrag = dragged; lift(e); if (wasDrag) { if (!ptrs.size) dragged = false; return }
  const p = tileAt(e.clientX, e.clientY);
  if (!p) { closeCard(); return }
  if (S.phase === "pick") return pick(p);
  if (S.phase !== "play") return;
  tapTile(p);
});
$("tcard").addEventListener("click", e => {
  if (e.target.closest("#tclose")) { closeCard(); return }
  const b = e.target.closest("button[data-a]"); if (b && !b.disabled) runAct(cardActs[+b.dataset.a]);
});
$("end").onclick = endTurn; $("undo").onclick = undo; $("restart").onclick = restart; $("again").onclick = restart;
addEventListener("keydown", e => { if (e.key === "Escape") closeCard(); });
addEventListener("keydown", e => { if (e.key === " " && !$("help").open) { e.preventDefault(); endTurn() } });
$("rivers").addEventListener("click", e => { const b = e.target.closest("button[data-r]"); if (!b || S.phase !== "play") return; const i = +b.dataset.r;
  if (i !== S.active && !S.rivers[i].joined) { activate(i); say(`Now building the ${riverName(i).toLowerCase()}.`) } });
$("helpBtn").onclick = () => $("help").showModal();
$("help").addEventListener("click", e => { if (e.target === $("help")) $("help").close() }); // tap backdrop to close
addEventListener("resize", resize);
if (window.ResizeObserver) { const ro = new ResizeObserver(resize); ro.observe($("board")); ro.observe($("top")); ro.observe($("bottom")) }
function loop() { if (tgt) glide(); else draw(); if (!reduce) requestAnimationFrame(loop) }
if (!load()) S = fresh();
sync(); document.fonts && document.fonts.ready.then(() => { lastSize = ""; resize() }); loop();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register(SW_URL).catch(() => {}));

// for debugging / tests
window.FT = {get S() { return S }, get history() { return history }, get view() { return view }, get sel() { return sel }, moves, plantable, diamond, endTurn, restart, bloomCount,
  tap(p) { const d = diamond(p), r = cv.getBoundingClientRect(), dpr = cv.width / r.width, cx = (d[0][0] + d[2][0]) / 2, cy = (d[0][1] + d[2][1]) / 2;
    cv.dispatchEvent(new PointerEvent("pointerup", {clientX:r.left + (cx * scale + off.x) / dpr, clientY:r.top + (cy * scale + off.y) / dpr, bubbles:true})) }};
})();
