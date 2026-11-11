// Flow Tile: shared engine and UI for every map. Maps are flat (Nov 9): no slopes, waterfalls or speed.
// Each map page sets window.MAP before loading this file:
//   id, label, types[], elev[], bloomGoal, turnGoal, startHint, help[] (HTML strings), next (URL or null)
//   lesson: what this map teaches (HTML), shown with the star goals on a goal card when a run starts (Dan, Nov 10)
//   pickHint: message when the player taps a non-source tile before starting (default: startHint)
//   tileCost: every tile costs this many gal before modifiers (default 1)
//   showBloom: show the bloom chip (default: shown when the map has a bloom goal)
//   storage: water cap at the start (turns on bare ground: tap ground by the river for grass, then meadow, then trees, +1 cap each)
//   tributaries: true lets you tap another source mid-game to start a tributary (Nov 9). It has no water, flow or storage
//     of its own: you build it with the main river's water, and its source (plus springs and runoff it picks up) adds to
//     your flow only once it connects to the main river
//   mainSource: [x, y] of the only source you can start on (others are for tributaries)
//   plantCost: gal to plant grass, meadow or trees (default 1)
//   tutorial: step number on /tutorial/N/ (the win card says "Next lesson"); nextLabel: text for the win card's next button
//   bloomKind: "trees" or "bees" to count planted trees or pollinating meadows for the bloom goal
//   offerTutorial: offer the tutorial to a first-time visitor (site root)
//   objectives: [{text, target, done: g => …}] (tutorial, LOU-264): one at a time on the map; done is tested after every action
//     with the helpers in G below; target names what to highlight (see objAim)
//   placeSource: true lets you place your source on any bare ground, grass, meadow or sand tile at least 4 tiles from the sea (LOU-263)
// Map codes g, m, t: bare ground that starts as grass, meadow or trees (counted in storage); bloomLabel: name of the bloom chip (default "Bloom")
//   wind: [dx, dy], the side the wind comes from. The tile on that side of each mountain is runoff (+1 flow when the
//     river runs through or beside it); the tile on the far side is in rain shadow (can't turn green).
//   waterSides: {"x,y": [dx, dy]} sets one mountain's water side (LOU-269); others take it from the wind. Each mountain has
//     exactly one water side: one face with water on it and one runoff tile in front of it.
// Tile costs (Nov 9): sand is free, rock costs +1, trees cost the normal price (they don't defend). Storage maps also: sand grows
// grass on the bare ground around it, 3+ trees in a row along the river make a grove (+1 flow, +1 per extra tree)
// and each meadow touching a grove adds +1 flow to it (pollinators, Nov 9). Map code F = wild forest.
(() => {
const M = window.MAP;
const SW_URL = new URL("sw.js", document.currentScript.src).href; // sw.js sits next to play.js
const PERF = M.mode === "perfection"; // Perfection: the best score in a fixed number of turns
const TYPES = M.types, ELEV = M.elev, BLOOM_GOAL = PERF ? 0 : M.bloomGoal, TURN_GOAL = PERF ? (M.turns || 20) : M.turnGoal;
const ROOT = new URL("./", document.currentScript.src).href;
// Green levels on bare ground (Dan, Nov 10, LOU-261): 0 bare, 1 grass, 2 meadow, 3 trees. 1 gal and +1 storage per step.
const MEADOW = 2, TREES = 3, gName = g => ["bare ground", "grass", "meadow", "trees"][Math.min(g, TREES)];
const meadowy = c => !c.river && (c.g === MEADOW || (c.t === "meadow" && !c.g)); // the site root, where play.js lives
const LAKE_TILE_COST = 2, REACH = 2; // lakes (Nov 9): 2 gal a tile; a full lake lets you plant up to 2 tiles from it
const SHOW_BLOOM = M.showBloom ?? BLOOM_GOAL > 0;
const TRIB = !!M.tributaries, STORE = M.storage ?? 0, PLANT_COST = M.plantCost ?? 1, BLOOM_LABEL = M.bloomLabel ?? "Bloom";
const NEW = STORE > 0, WIND = M.wind || null;
const PLACE = !!M.placeSource, PLACE_FLOW = 3, SEA_GAP = 4; // LOU-263: place your source anywhere allowed
// Ideas (Nov 10), each switched on by the map: water cycle, weather forecast
const CYCLE = !!M.cycle, WX = M.weather || null, SPREAD = !!M.spread, FLOOD = !!M.floodplain, MELT = !!M.snowmelt, MOSS = !!M.moss, DEER = !!M.deer;
const turnHooks = []; // other end-of-turn effects (spread, wildlife, fire) add themselves here
// A fixed roll per map, turn and tile, so undo and replays give the same result.
const rnd = (...k) => { let h = 2166136261; for (const ch of [M.id, ...k].join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 10007) / 10007 };
const W = TYPES[0].length, H = TYPES.length, TW = 96, TH = 48, ZH = 12;
const PLAY_TILE = 118; // LOU-262: a tile's width in px at play zoom, so 3–4 fit across a 390px phone (and stand ~59px tall)
const COL = {bare:"#b8875a",grass:"#7cc94c",trees:"#6fbf45",meadow:"#a3d977",sand:"#f2d68f",rock:"#b0aa9f",boulder:"#a88050",spring:STORE ? "#b8875a" : "#a3d977",lake:"#9a7650",ocean:"#58b6e6",deep:"#2f74c4",source:"#9aa7b0",river:"#4aa3e8",bloom:"#7cc94c",shadow:"#a7835c"};
const BANKS = true; // river drawn as a channel with banks; lakes get a shore
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- DOM
document.body.innerHTML = `
<div class="app">
  <div class="board" id="board">
    <canvas id="cv" aria-label="Game board"></canvas>
    <div class="overlay top" id="top">
      <!-- Polytopia-style top bar (LOU-267): three stats straight on the map, no panels. Water shows its income in brackets. -->
      <div class="stats">
        <div class="stat" id="cScore"><span>Score</span><b id="hScore">0</b></div>
        <div class="stat" id="cTurn"><span>Turn</span><b><i id="hTurn">0</i><small>/${TURN_GOAL}</small></b></div>
        <button type="button" class="stat water" id="cWater"><span>Water${STORE ? ` <small id="hCap"></small>` : ""}</span><b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.8 4.8 6.5 8.2 6.5 11.6a6.5 6.5 0 01-13 0c0-3.4 2.7-6.8 6.5-11.6z"/><path class="hl" d="M9 14.5a3 3 0 002.4 2.9"/></svg><i id="hWater">0</i><em id="cFlow">(+<i id="hFlow">0</i>)</em></b></button>
      </div>
      <div class="subrow">
        <div class="goals" id="goals"></div>
        ${WIND ? `<div class="wx wind" id="cWind" aria-label="Wind from the ${{"-1,0":"west","1,0":"east","0,-1":"north","0,1":"south"}[WIND + ""] || "side"}"><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${Math.round(Math.atan2((-WIND[0] - WIND[1]) * TH / 2, (-WIND[0] + WIND[1]) * TW / 2) * 180 / Math.PI)}deg)"><path d="M3 12h15M13 6l6 6-6 6"/></svg>Wind</div>` : ""}
        ${CYCLE || WX ? `<div class="wx sky" id="cSky"><span id="lSky">Sky</span> <b id="hSky">Clear</b></div>` : ""}
      </div>
      ${M.objectives ? `<div class="obj" id="obj" role="status"><i class="ock" id="oTick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></i><span class="otext" id="oText"></span><span class="odots" id="oDots" aria-hidden="true"></span>${M.next ? `<button type="button" class="oskip" id="oSkip">Skip lesson</button>` : ""}</div>` : ""}
    </div>
    <button class="icon sq zoom" id="fitBtn" aria-label="Show the whole map"></button>
    <div class="overlay bottom" id="bottom"><div class="msg" id="msg" role="status"></div></div>
    <div class="tcard" id="tcard" role="group" aria-label="Tile details" hidden></div>
    <div class="banner" id="banner" aria-hidden="true" hidden><b id="bTurn"></b><small id="bSub"></small></div>
    <div class="win" id="win" hidden><div class="card" role="dialog" aria-labelledby="winTitle">
      <div class="stars" id="wStars" role="img"></div>
      <div class="ribbon"><h2 id="winTitle">You reached the sea!</h2></div>
      <div class="wsub">${M.label}</div>
      <ul id="wGoals"></ul>
      <div class="row" id="wRow">
        <button id="again">Play again</button>
        ${M.share ? `<button class="end" id="share">Share score</button>` : M.next ? `<a class="btn end" id="next" href="${M.next}">${M.nextLabel || (M.tutorial ? "Next lesson" : "Next map")}</a>` : ""}
      </div>
    </div></div>
  </div>
  <div class="actions">
    <button id="undo" class="rb"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg></i><span>Undo</span></button>
    <button id="restart" class="rb"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9.5 9.5 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/></svg></i><span>Restart</span></button>
    <button id="helpBtn" class="rb"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 015.6 1.2c0 2-2.8 2.6-2.8 4.3"/><circle cx="12" cy="18.2" r=".6" fill="currentColor"/></svg></i><span>Help</span></button>
    <button id="end" class="rb go"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9c3-2 6-2 9 0s6 2 9 0M3 15c3-2 6-2 9 0s6 2 9 0"/><path d="M17 4l4 5-4 5" class="arr"/></svg><em class="gain" id="gain" hidden></em></i><span>Next Water Cycle</span></button>
  </div>
</div>
<dialog id="goal" class="goalcard" aria-labelledby="goalTitle">
  <small class="eyebrow">${M.label}</small>
  <h2 id="goalTitle">What you'll learn</h2>
  <p class="learn">${M.lesson || "Reach the sea."}</p>
  <h3>${PERF ? "Your goal" : "Earn 3 stars"}</h3>
  <ul class="aims">${aims().map(a => `<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg><span>${a}</span></li>`).join("")}</ul>
  <form method="dialog"><button class="end" id="goalGo">Let's go</button></form>
</dialog>
<dialog id="offer" class="goalcard" aria-labelledby="offerTitle">
  <small class="eyebrow">Welcome to Flow Tile</small>
  <h2 id="offerTitle">New here?</h2>
  <p class="learn">Start the <b>tutorial</b>: 12 short islands, one new rule each, from your first stream to tributaries and mountains.</p>
  <form method="dialog" class="orow2"><a class="btn end" href="${ROOT}tutorial/1/">Start the tutorial</a><button value="stay" id="offerStay">Play this island</button></form>
</dialog>
<dialog id="help" aria-labelledby="helpTitle">
  <h2 id="helpTitle">How to play</h2>
  <ul>
    <li><b class="wtr">Water</b> (blue) is what you have right now, in gallons. Every cost is paid in water. <b class="flw">Flow</b> (teal, in brackets next to your water) is how much each water cycle brings. Tap <b>Water</b> at the top for your storage${TRIB ? " and each river" : ""}.</li>
    ${M.lesson ? `<li><b>This map:</b> ${M.lesson}</li>` : ""}
    <li>To move the stream, tap its <b>end</b> (it gets a white ring), then a glowing tile. The number is its cost in water. Tap any other tile to see what it does and what it costs, then choose.</li>
    ${PLACE ? `<li><b>Place your source:</b> before you start, tap a source, or any glowing land tile (bare ground, grass, meadow or sand, at least ${SEA_GAP} tiles from the sea) to start your river there with <b>+${PLACE_FLOW} flow</b>.</li>` : ""}
    ${M.help.map(h => `<li>${h}</li>`).join("\n    ")}
    <li>${PERF ? `Score as much as you can in <b>${TURN_GOAL} turns</b>: 1 point per river tile, green tile and fish, 3 per grove, 2 per full lake. Reaching the sea ends the run with <b>+5</b> and <b>+1 per turn left</b>.` : `Stars: reach the sea${BLOOM_GOAL ? `, bloom <b>${BLOOM_GOAL}</b>+ tiles` : ""}, and arrive by turn <b>${TURN_GOAL}</b>.`}</li>
  </ul>
  <div class="opts">
    <label class="hard"><input type="checkbox" id="hard"> Hard mode: <b>3 undos</b> per map</label>
    <div class="orow"><a class="btn" href="${ROOT}world/">All islands</a><button type="button" id="codeBtn">Copy map code</button></div>
  </div>
  <form method="dialog"><button class="end">Got it</button></form>
</dialog>`;
if (!M.next && !M.share) document.getElementById("wRow").classList.add("one");
const $ = id => document.getElementById(id);
const tx = (id, v) => { const e = $(id); if (e) e.textContent = v };

// ---------- state
let S, history = [], prevW = 0;
// The star goals in words, for the goal card.
function aims() {
  if (PERF) return [`Score as many points as you can in <b>${TURN_GOAL} turns</b>`, `Stars at <b>${(M.scoreStars || [20, 30, 40]).join(", ")}</b> points`, "Reaching the sea ends the run with a bonus"];
  const what = {Grass:"tiles of grass", Green:"tiles green", Trees:"tiles of trees", Bees:"meadow beside the grove (bees)"}[M.bloomLabel], verb = M.bloomLabel === "Green" ? "Turn" : "Grow";
  return ["Reach the <b>sea</b>", ...(BLOOM_GOAL ? [what ? `${verb} <b>${BLOOM_GOAL}</b> ${what}` : `Bloom <b>${BLOOM_GOAL}</b> tiles`] : []), `Arrive by <b>turn ${TURN_GOAL}</b>`];
}
function showGoal() { try { const g = document.getElementById("goal"); if (!g.open) g.showModal() } catch (_) {} }
function fresh() {
  const tiles = [];
  for (let y = 0; y < H; y++) { tiles.push([]); for (let x = 0; x < W; x++) {
    const ch = TYPES[y][x];
    const t = {"_":"bare",F:"bare",g:"bare",m:"bare",t:"bare",p:"bare",v:"bare",".":"meadow",s:"sand",r:"rock",B:"boulder",o:"spring",L:"lake","~":"ocean",S:"source",T:"source"}[ch];
    tiles[y].push({t, e:+ELEV[y][x], river:false, g:ch==="F"?TREES:{g:1,m:MEADOW,t:TREES}[ch]||0, bloom:"gmt".includes(ch), wild:ch==="F", pool:ch==="p", beaver:ch==="v" ? 1 : 0, ro:0, rs:false, rid:-1, pr:"gmt".includes(ch) ? 0 : -1, to:null, lake:-1, yield:ch==="S"?2:ch==="T"?3:0, from:null});
  }}
  // Mountains (LOU-269): each has exactly one water side, set per mountain (waterSides) or by the wind. The tile on that
  // face is its runoff tile (ro 1 = waiting, 2 = claimed); the tile on the far side is rain shadow.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (TYPES[y][x] !== "B") continue;
    const side = (M.waterSides && M.waterSides[x + "," + y]) || WIND; if (!side) continue;
    const a = [x + side[0], y + side[1]], b = [x - side[0], y - side[1]], land = p => inside(...p) && !["boulder","ocean","source"].includes(tiles[p[1]][p[0]].t);
    tiles[y][x].ws = side;
    if (land(a)) tiles[a[1]][a[0]].ro = 1;
    if (land(b) && !["lake","spring"].includes(tiles[b[1]][b[0]].t)) tiles[b[1]][b[0]].rs = true }
  const lakes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = tiles[y][x]; if (c.t !== "lake" || c.lake >= 0) continue;
    const id = lakes.length, members = [], st = [[x, y]]; c.lake = id;
    while (st.length) { const p = st.pop(); members.push(p);
      for (const n of nbrs(p)) { const nc = tiles[n[1]][n[0]]; if (nc.t === "lake" && nc.lake < 0) { nc.lake = id; st.push(n) } } }
    lakes.push({tiles:members, filled:false});
  }
  const grown = tiles.flat().reduce((n, c) => n + (c.pr === 0 ? c.g : 0), 0);
  return {tiles, lakes, rivers:[], active:0, phase:"pick", cap:STORE + grown, water:0, income:0, turn:0, head:null, msg:PLACE ? `${M.startHint} Or tap any glowing land tile to place your own source there.` : M.startHint, warn:false, clouds:[], dry:0};
}
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
function nbrs([x, y]) { return [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => [x+dx, y+dy]).filter(([a,b]) => inside(a, b)) }
const at = p => S.tiles[p[1]][p[0]];
function level(p) { const c = at(p); return c.t === "lake" && S.lakes[c.lake].filled ? c.e + 1 : c.e }

// ---------- rules
function cost(from, to) {
  const b = at(to);
  const merge = TRIB && b.river && b.rid >= 0 && root(b.rid) !== root(S.active) && b.t !== "source" && b.t !== "ocean";
  if ((b.river && !merge) || b.t === "boulder" || b.t === "source") return -1;
  if (b.e > level(from)) return -1;
  if (merge) return M.tileCost ?? 1;
  if (b.t === "lake") return LAKE_TILE_COST * S.lakes[b.lake].tiles.length;
  let c = M.tileCost ?? 1; // flat maps: the tile type sets the cost
  if (b.t === "spring" || b.t === "sand") c = 0; // sand is free to enter; it cuts flow instead (see build)
  if (b.t === "rock") c += 1;   // hard ground
  return c;
}
// Bare ground touching the river can be planted: grass, then meadow, then trees. Not in a mountain's rain shadow.
function plantable(p) {
  if (!STORE || S.phase !== "play") return false;
  const c = at(p); if (c.t !== "bare" || c.river || c.g >= TREES || c.rs || c.pool || c.beaver || c.fire || salty(p)) return false;
  return nbrs(p).some(n => at(n).river && at(n).rid >= 0 && onMain(at(n).rid)) || lakeReach(p);
}
// A full lake's reach: ground up to 2 tiles from its water can be planted.
function lakeReach(p) { return S.lakes.some(L => L.filled && L.tiles.some(q => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) <= REACH && onMain(at(q).rid))) }
// ---------- rivers: water, storage and flow (S.income) belong to the main river. Each river keeps its own head; the
// active river's head lives on S.head. Rivers that have merged share a group (grp); group 0 is connected to the main river.
// A group that isn't connected keeps its flow waiting (pend) until it connects.
function stash() { if (S.rivers[S.active]) S.rivers[S.active].head = S.head }
function activate(i) { stash(); S.active = i; S.head = S.rivers[i].head }
const root = i => i >= 0 && S.rivers[i] ? (S.rivers[i].grp ?? i) : i;
const onMain = i => root(i) === 0;
// Add flow to a river: straight into your flow if it's connected, otherwise it waits for the connection.
function flowAdd(rid, d) { const g = root(rid); if (g <= 0) S.income = Math.max(0, S.income + d); else S.rivers[g].pend = Math.max(0, (S.rivers[g].pend || 0) + d) }
const flowOf = rid => root(rid) <= 0 ? S.income : S.rivers[root(rid)].pend || 0;
// ---------- combos: groves (3+ trees in a row along the river); meadows touching a grove pollinate it (+1 flow each)
const GROVE = 3;
const groveTile = c => !c.river && c.g >= TREES && c.t === "bare";
const byRiver = p => nbrs(p).find(n => at(n).river && at(n).rid >= 0);
// Every maximal straight run of matching tiles that all touch the river.
function combos() {
  const out = []; if (!NEW || !S.rivers.length) return out;
  for (const [kind, ok, min] of [["grove", groveTile, GROVE]])
    for (const [dx, dy] of [[1, 0], [0, 1]]) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const good = q => inside(...q) && ok(at(q)) && !!byRiver(q);
      if (!good([x, y]) || good([x - dx, y - dy])) continue;
      const run = []; for (let q = [x, y]; good(q); q = [q[0] + dx, q[1] + dy]) run.push(q);
      if (run.length < min) continue;
      const first = kind === "grove" && at(run[0]).pr >= 0 ? at(run[0]).pr : at(byRiver(run[0])).rid;
      out.push({kind, tiles:run, rid:root(first), bonus:run.length - 2, bees:[]});
    }
  // pollinators: each meadow next to a grove adds +1 flow to it (a meadow counts once)
  const used = new Set();
  for (const k of out) for (const q of k.tiles) for (const n of nbrs(q)) { const c = at(n);
    if (!meadowy(c) || used.has(n + "")) continue; used.add(n + ""); k.bees.push(n); k.bonus++ }
  return out;
}
function comboBonus(rid) { return combos().filter(k => k.rid === rid).reduce((s, k) => s + k.bonus, 0) }
// Recount groves; move each river's flow by the change. Returns a note, or "".
function recombo() {
  if (!NEW || !S.rivers.length) return "";
  let note = "";
  S.rivers.forEach((r, i) => { if (root(i) !== i) return; const now = comboBonus(i), d = now - (r.combo || 0); if (!d) return;
    flowAdd(i, d); r.combo = now;
    if (i === S.active) note = d > 0 ? `Flow +${d} from your grove` : `Lost ${-d} flow from a broken grove`; });
  if (note) bump("cFlow");
  return note;
}
// What doing f() would add to the active river's combo flow (for the tile card).
function comboPreview(p, f) { const c = at(p), keep = {...c}; const a = comboBonus(root(S.active)); f(c); const b = comboBonus(root(S.active)); Object.assign(c, keep); return b - a }
// Mountain runoff: the river running through or beside a runoff tile adds +1 flow, once per tile.
let melted = 0;
function claimRunoff(tiles) { let n = 0; melted = 0; for (const p of tiles) for (const q of [p, ...nbrs(p)]) { const c = at(q); if (c.ro === 1) { c.ro = 2; n++; float(q, "+1 flow", "#62e0c8"); if (MELT) { const g = addWater(3); melted += g; float(q, `+${g} gal snowmelt`, "#ffffff") } } }
  if (n) { flowAdd(S.active, n); bump("cFlow") } return n }
// One-time water (rain pools, snowmelt): fills storage; what doesn't fit runs off.
function addWater(g) { const got = STORE ? Math.min(g, Math.max(0, S.cap - S.water)) : g; S.water += got; bump("cWater"); return got }
function collect(p) { const c = at(p); if (!c.pool) return; snapshot(); c.pool = false; const got = addWater(2); float(p, `+${got} gal`, "#bfe4ff"); anim.set("g:" + p, now());
  say(`You collected the rain pool: +${got} gal${got < 2 ? ` (${2 - got} ran off: storage is full)` : ""}.`) }
function moss(p) { const c = at(p); if (S.water < 1) return; snapshot(); S.water -= 1; c.t = "bare"; c.moss = true; anim.set("g:" + p, now()); float(p, "−1 gal", "#bfe4ff");
  say("Moss broke the rock down into soil: you can plant here now.") }
const riverName = i => i === 0 ? "Main river" : S.rivers.length > 2 ? `Tributary ${i}` : "Tributary";
const openRivers = () => S.rivers.map((r, i) => i).filter(i => i !== S.active && !S.rivers[i].joined);
const liveOf = g => S.rivers.findIndex((r, i) => root(i) === g && !r.joined); // the one river in a group still building
function capAdd(rid, d) { S.cap += d } // storage belongs to the main river
function startTributary(p) {
  const c = at(p); snapshot(); stash();
  const i = S.rivers.length; S.rivers.push({src:p, joined:false, head:p, grp:i, pend:c.yield, combo:0});
  c.river = true; c.rid = i; S.active = i; S.head = p; anim.set(p + "", now()); wave = now();
  const ro = claimRunoff([p]);
  say(`${riverName(i)} started. It runs on your main river's water and earns nothing yet: once it reaches the main river, its +${S.rivers[i].pend} gal per water cycle${ro ? " (with mountain runoff)" : ""} joins your flow.`);
}
function plant(p) {
  const c = at(p), what = ["Grass", "Meadow", "Trees"][c.g];
  if (S.water < PLANT_COST) { say(`${what} costs ${PLANT_COST} gal and you have ${S.water} gal. Tap Next Water Cycle to collect your flow.`, true); return }
  snapshot(); S.water -= PLANT_COST; c.g++; c.bloom = true; c.pr = S.active; S.cap++; bump("cWater"); bump("cBloom");
  anim.set("g:" + p, now()); float(p, "+1 storage", "#b6f08a");
  const cb = recombo(), bv = beavers(), sh = storageHint();
  say(`${what} ${c.g === 1 ? "planted" : "grown"}: you can now store ${S.cap} gal.${c.g === MEADOW && NEW ? " A meadow next to a grove adds +1 flow." : ""}${cb ? " " + cb + "." : ""}${bv ? " " + bv + "." : ""}${sh ? " " + sh + "." : ""}`);
}
function ends() { const h = at(S.head); return h.t === "lake" ? S.lakes[h.lake].tiles : [S.head] }
function moves() {
  const m = new Map(); if (S.phase !== "play") return m;
  for (const f of ends()) for (const n of nbrs(f)) { const c = cost(f, n), k = n + "";
    if (c >= 0 && (!m.has(k) || c < m.get(k).cost)) m.set(k, {p:n, cost:c, from:f}) }
  return m;
}
const touchesRock = p => nbrs(p).some(n => at(n).t === "rock");
function tryBloom(p, delay = 0) { const c = at(p);
  if (c.river || c.bloom || c.rs || salty(p) || !["meadow","sand","spring"].includes(c.t)) return 0;
  if (touchesRock(p)) return 0;
  c.bloom = true; anim.set("g:" + p, now() + delay); return 1 }
// Sand on storage maps: bare ground next to it turns into real grass (+1 storage each).
function sandGrass(p, delay) { const c = at(p);
  if (c.t !== "bare" || c.river || c.g || c.rs || c.beaver || salty(p) || touchesRock(p)) return 0;
  c.g = 1; c.bloom = true; c.pr = S.active; S.cap++; anim.set("g:" + p, now() + delay); return 1 }
// bloomKind (tutorial): "trees" counts planted trees, "bees" counts meadows pollinating a grove; otherwise every green tile counts
const bloomCount = () => M.bloomKind === "trees" ? S.tiles.flat().filter(c => c.g >= TREES && !c.wild && !c.river).length
  : M.bloomKind === "bees" ? combos().reduce((n, k) => n + k.bees.length, 0) : S.tiles.flat().filter(c => c.bloom).length;
const affordable = () => [...moves().values()].some(m => m.cost <= S.water);
const canPlant = () => STORE && S.water >= PLANT_COST && S.tiles.some((r, y) => r.some((_, x) => plantable([x, y])));
// When every next tile costs more than you can store, say so: ending turns won't help, planting will.
function storageHint() { if (!STORE || S.phase !== "play") return "";
  const c = Math.min(...[...moves().values()].map(m => m.cost)); if (!(c > S.cap)) return "";
  return `The next tile costs ${c} gal but you can only store ${S.cap}. Plant by the stream to store more` }

function snapshot() { history.push(JSON.stringify(S)) }
function build(mv) {
  if (S.water < mv.cost) { say(`That tile costs ${mv.cost} gal and you have ${S.water} gal. Tap Next Water Cycle to collect your flow of ${S.income} gal.`, true); return }
  snapshot();
  S.water -= mv.cost;
  if (at(mv.p).river) { // ran into another river: merge into it
    const t = at(mv.p).rid, me = S.active, a = root(me), b = root(t), g = Math.min(a, b), other = g === a ? b : a; at(mv.from).to = mv.p;
    stash(); S.rivers[me].joined = true; const was = S.income;
    // the two groups become one; if that connects a group to the main river, its waiting flow joins yours from now on
    const gave = g === 0 ? S.rivers.reduce((s, r, i) => root(i) === other ? s + (r.pend || 0) : s, 0) : 0;
    S.rivers.forEach((r, i) => { if (root(i) === other) { if (g === 0) { S.income += r.pend || 0; r.pend = 0 } else if (i !== g) { S.rivers[g].pend = (S.rivers[g].pend || 0) + (r.pend || 0); r.pend = 0 } r.grp = g } });
    S.rivers[g].combo = (S.rivers[g].combo || 0) + (S.rivers[other].combo || 0); S.rivers[other].combo = 0;
    const next = liveOf(g); S.active = next; S.head = S.rivers[next].head; anim.set("m:" + mv.from, now()); wave = now(); bump("cFlow");
    if (gave) float(mv.p, `+${gave} flow`, "#62e0c8"); const cb = recombo();
    say(g === 0 ? `${me === 0 ? `Your main river reached the ${riverName(t).toLowerCase()}` : `${riverName(me)} joined the main river`}: flow now +${S.income} gal per water cycle${S.income > was ? ` (+${S.income - was})` : ""}. Now building the ${riverName(next).toLowerCase()}.${cb ? " " + cb + "." : ""}`
      : `The tributaries joined: +${S.rivers[g].pend} gal per water cycle waits until they reach the main river.${cb ? " " + cb + "." : ""}`); return }
  const b = at(mv.p);
  const notes = []; let bl = 0, gr = 0, t1 = now(), placed = [mv.p];
  if (mv.cost) float(mv.p, `−${mv.cost} gal`, "#bfe4ff");
  if (b.t === "lake") { const L = S.lakes[b.lake]; L.filled = true; placed = L.tiles;
    for (const p of L.tiles) { const c = at(p); c.river = true; c.bloom = false; c.from = mv.from; c.rid = S.active;
      anim.set(p + "", t1 + 120 * (Math.abs(p[0] - mv.p[0]) + Math.abs(p[1] - mv.p[1]))) }
    notes.push(STORE ? `Lake filled: you can plant up to ${REACH} tiles from it, and the stream can leave from any side` : "Lake filled: the stream can leave from any side") }
  else { b.river = true; b.bloom = false; b.from = mv.from; b.rid = S.active; anim.set(mv.p + "", t1);
    if (b.g) { const wild = b.wild; if (!wild) capAdd(b.pr, -b.g); const sp = Math.max(0, S.water - S.cap); S.water -= sp;
      notes.push(wild ? "You cut through the forest" : `The river washed away the ${gName(b.g)}: storage down to ${S.cap} gal${sp ? `, ${sp} gal spilled` : ""}`);
      if (!wild) float(mv.p, `−${b.g} storage`, "#ffb27a"); b.g = 0; b.wild = false; bump("cWater") }
    if (b.t === "spring") { flowAdd(S.active, 1); notes.push(onMain(S.active) ? "Spring joined: flow +1 gal per water cycle" : "Spring joined: +1 flow once this tributary reaches the main river"); float(mv.p, "+1 flow", "#62e0c8"); bump("cFlow") }
    if (b.t === "sand") { for (const n of nbrs(mv.p)) { const d = 350 + 110 * (bl + gr); if (NEW) gr += sandGrass(n, d); if (!at(n).bloom || !NEW) bl += tryBloom(n, d) }
      const was = flowOf(S.active); flowAdd(S.active, -1); const now1 = flowOf(S.active);
      notes.push(was > now1 ? (onMain(S.active) ? `Sand soaked up 1 flow: now +${now1} gal per water cycle` : `Sand soaked up 1 of this tributary's flow: +${now1} once it joins`) : "Sand soaked the ground"); if (was > now1) float(mv.p, "−1 flow", "#ffb27a"); bump("cFlow") } }
  const ro = claimRunoff(placed); if (ro) notes.push(`Mountain runoff: flow +${ro} gal per water cycle${MELT ? `, and ${melted} gal of snowmelt${melted < 3 * ro ? ` (${3 * ro - melted} ran off: storage is full)` : ""}` : ""}`);
  if (b.pool) { b.pool = false; const got = addWater(2); notes.push(`The stream took in the rain pool: +${got} gal`) }
  if (gr) { notes.push(`Sand grew ${gr} grass: you can store ${S.cap} gal`); bump("cWater") }
  if (bl) notes.push(`${bl} tile${bl > 1 ? "s" : ""} bloomed`);
  const cb = recombo(); if (cb) notes.push(cb);
  const bv = beavers(); if (bv) notes.push(bv);
  S.head = mv.p;
  if (b.t === "ocean") { S.phase = "won"; wave = now(); float(mv.p, "Splash!", "#ffffff"); say(`You reached the sea on turn ${S.turn}.`); return }
  if (TRIB && openRivers().length && (!moves().size || (S.income === 0 && !affordable()))) { notes.push(`This river can't go on. Tap your ${riverName(openRivers()[0]).toLowerCase()} to switch`); say(notes.join(". ") + ".", true); return }
  if (PERF && (!moves().size || (S.income === 0 && !affordable()))) { S.phase = "won"; wave = now(); say("Your river can't go on: the island is scored. Undo to try another way."); return }
  if (!moves().size) { S.phase = "stuck"; say("Dead end: nowhere left to go. Undo or restart.", true); return }
  if (S.income === 0 && !affordable()) { S.phase = "stuck"; say("Your flow is 0 and you can't afford another tile. Undo or restart.", true); return }
  const sh = storageHint();
  if (sh) notes.push(sh); else if (!affordable() && !canPlant()) notes.push(`Out of water. Tap Next Water Cycle for +${S.income} gal`);
  say(notes.length ? notes.join(". ") + "." : "Keep building, or tap Next Water Cycle.");
}
// What the next end of turn brings: flow, weather, and any cloud raining back.
function forecast(turn = S.turn + 1) {
  const wx = WX && WX[turn], rain = (S.clouds || []).filter(c => c.turn === turn).reduce((n, c) => n + c.gal, 0);
  const dry = (S.dry > 0 || wx === "drought") ? 1 : 0, gain = Math.max(0, S.income - dry) + (wx === "rain" ? 2 : 0);
  return {wx, rain, dry, gain};
}
function endTurn() { if (S.phase !== "play") return; closeCard(); snapshot();
  const f = forecast(), notes = []; S.turn++; S.clouds ||= [];
  if (S.dry > 0) S.dry--; if (f.wx === "drought") S.dry = 1;
  S.water += f.gain; bump("cWater"); wave = now();
  const sp = STORE ? Math.max(0, S.water - S.cap) : 0; S.water -= sp;
  const src = S.rivers[0] && S.rivers[0].src; if (src) float(src, `+${f.gain - sp} gal`, "#bfe4ff");
  if (f.wx === "rain") { notes.push("Rainstorm: +2 gal"); sky = {kind:"rain", t0:now()} }
  if (f.dry) { notes.push(`Drought: flow −1 ${S.dry ? "this turn and next" : "this turn"}`); sky = {kind:"drought", t0:now()} }
  const cap0 = S.cap; let fl = 0; if (FLOOD && sp) { const n = floodTurn(sp); if (n) { notes.push(n); fl = 1 } }
  // the water cycle: spill rises as a cloud and rains back two turns later
  let up = 0; if (CYCLE && sp - fl > 0) { const to = rainTarget(); up = sp - fl; S.clouds.push({gal:up, turn:S.turn + 2, from:S.head, to}); }
  if (f.rain) { S.clouds = S.clouds.filter(c => { if (c.turn !== S.turn) return true; rains.push({p:c.to || S.head, t0:now()}); return false });
    const room = STORE ? Math.max(0, S.cap - S.water) : f.rain, got = Math.min(room, f.rain); S.water += got; float(S.head, `+${got} gal rain`, "#bfe4ff");
    notes.push(`Your cloud rained back ${got} gal${got < f.rain ? ` (${f.rain - got} soaked into the ground)` : ""}`) }
  if (sp && !reduce) { const e = $("cWater"); if (e) { e.classList.remove("spill"); void e.offsetWidth; e.classList.add("spill") } }
  for (const h of turnHooks) { const n = h(); if (n) notes.push(n) }
  if (PERF && S.turn > TURN_GOAL) { S.turn = TURN_GOAL; S.phase = "won"; wave = now(); notes.push(`That's ${TURN_GOAL} turns: the island is scored`) }
  if (S.phase === "play") showBanner(`Turn ${S.turn}`, sp ? `+${f.gain - sp} gal · ${sp} gal ${CYCLE ? "to the clouds" : "spilled"}` : `+${f.gain} gal of water`);
  const head = sp ? (up ? `Turn ${S.turn}: +${f.gain - sp} gal. ${up} gal spilled and rose as a cloud: it rains back on turn ${S.turn + 2}` : `Turn ${S.turn}: +${f.gain - sp} gal. Storage is full at ${cap0} gal, so ${sp} gal spilled`) : `Turn ${S.turn}: +${f.gain} gal of water`;
  say([head, ...notes].join(". ") + ".") }
// ---------- floodplain: at full storage, spilled water floods one bare tile beside the river and greens it
function floodTurn(sp) { if (!sp) return "";
  const to = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(greenable).sort((a, b) => rnd("flood", S.turn, ...a) - rnd("flood", S.turn, ...b))[0];
  if (!to) return ""; grow(to, 300, "#9fd4ff"); bump("cWater"); return `The spill flooded the bank and greened it: you can store ${S.cap} gal` }
// ---------- wildlife: beavers dam a pond (+1 flow) when your river runs THROUGH their colony and trees grow next to it (Dan, Nov 10)
function beavers() { let n = 0;
  S.tiles.forEach((r, y) => r.forEach((c, x) => { const p = [x, y]; if (c.beaver !== 1 || !c.river || !nbrs(p).some(q => at(q).g >= TREES && !at(q).river)) return;
    c.beaver = 2; flowAdd(c.rid, 1);
    anim.set("g:" + p, now() + 200); float(p, "+1 flow", "#62e0c8"); n++ }));
  if (n) bump("cFlow"); return n ? `Beavers dammed a pond on your river: flow +${n} gal per water cycle` : "" }
// Deer: every 3rd turn they graze one grass tile with no trees next to it.
function deerTurn() { if (S.turn % 3) return "";
  const to = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(q => { const c = at(q); return c.g === 1 && !c.river && !nbrs(q).some(n => at(n).g >= TREES) })
    .sort((a, b) => rnd("deer", S.turn, ...a) - rnd("deer", S.turn, ...b))[0]; if (!to) return "";
  const c = at(to); c.g = 0; c.bloom = false; capAdd(c.pr, -1); const sp = STORE ? Math.max(0, S.water - S.cap) : 0; S.water -= sp; deer.push({p:to, t0:now()}); float(to, "−1 storage", "#ffb27a"); bump("cWater");
  return `Deer grazed a grass tile with no trees next to it: storage down to ${S.cap} gal${sp ? `, ${sp} gal spilled` : ""}` }
const deer = [];
if (DEER) turnHooks.push(deerTurn);
// Wildfire: lightning on a forecast turn sets dry trees alight (trees not touching water); fire spreads to dry trees each turn, then burns out.
const wet = p => nbrs(p).some(n => { const k = at(n); return (k.river && k.t !== "source") || (k.t === "lake" && S.lakes[k.lake].filled) || k.t === "ocean" || k.t === "spring" || k.beaver === 2 });
const dryTree = p => { const c = at(p); return c.g >= TREES && !c.river && !c.fire && !wet(p) };
function fireTurn() { const notes = []; let burnt = 0, lost = 0;
  const burning = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(q => at(q).fire);
  for (const q of burning) { const c = at(q); c.fire = false; if (!c.wild) { capAdd(c.pr, -c.g); lost += c.g } c.g = 0; c.wild = false; c.bloom = false; c.ash = true; burnt++ }
  // a fire spreads to the trees next to it, unless water is next to the burning tile
  const next = []; for (const q of burning) if (!wet(q)) for (const n of nbrs(q)) { const k = at(n); if (k.g >= TREES && !k.river && !k.fire && !next.some(z => same(z, n))) next.push(n) }
  if (WX && WX[S.turn] === "fire") { const hit = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(dryTree).sort((a, b) => rnd("bolt", ...a) - rnd("bolt", ...b))[0];
    if (hit) { next.push(hit); bolts.push({p:hit, t0:now()}); notes.push("Lightning struck dry trees: they're on fire") } else notes.push("Lightning struck, but every tree touches water: nothing burned") }
  for (const q of next) at(q).fire = true;
  if (burnt) { const sp = STORE ? Math.max(0, S.water - S.cap) : 0; S.water -= sp; recombo(); notes.push(`Fire burned ${burnt} tree tile${burnt > 1 ? "s" : ""}${lost ? `: storage down to ${S.cap} gal` : ""}${sp ? `, ${sp} gal spilled` : ""}`); bump("cWater") }
  if (next.length && burnt) notes[notes.length - 1] += `, and it spread to ${next.length} more`;
  return notes.join(". ") }
const bolts = [];
if (WX && Object.values(WX).includes("fire")) turnHooks.push(fireTurn);
// ---------- living spread: grass beside the river greens a bare bank tile next to it; meadows make it certain; birds carry grove seeds
const bank = p => nbrs(p).find(n => at(n).river && at(n).rid >= 0 && at(n).t !== "ocean");
function greenable(p) { const c = at(p); return c.t === "bare" && !c.river && !c.g && !c.rs && !c.ro && !c.pool && !c.beaver && !!bank(p) && !salty(p) }
// Salt: land next to the sea doesn't turn green (planting, spread, sand or lakes) while the sea's salt is in it.
const salty = p => !!M.salt && nbrs(p).some(n => at(n).t === "ocean");
function grow(p, delay, col = "#b6f08a") { const c = at(p), r = root(at(bank(p)).rid); c.g = 1; c.bloom = true; c.pr = r; capAdd(r, 1); anim.set("g:" + p, now() + delay); float(p, "+1 storage", col) }
const birds = [];
function spreadTurn() {
  const grown = []; let seeded = 0;
  S.tiles.forEach((row, y) => row.forEach((c, x) => { const p = [x, y]; if (!c.g || c.wild || c.river || !bank(p)) return;
    const sure = nbrs(p).some(n => meadowy(at(n))); if (!sure && rnd("spread", S.turn, x, y) >= .35) return;
    const to = nbrs(p).filter(n => greenable(n) && !grown.some(g => g + "" === n + "")).sort((a, b) => rnd("to", S.turn, ...a) - rnd("to", S.turn, ...b))[0];
    if (to) grown.push(to) }));
  grown.forEach((p, i) => grow(p, 250 + 160 * i));
  if (S.turn % 3 === 0) for (const k of combos().filter(k => k.kind === "grove")) { const mid = k.tiles[Math.floor(k.tiles.length / 2)];
    const to = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(q => greenable(q) && Math.abs(q[0] - mid[0]) + Math.abs(q[1] - mid[1]) <= 4)
      .sort((a, b) => (Math.abs(a[0] - mid[0]) + Math.abs(a[1] - mid[1])) - (Math.abs(b[0] - mid[0]) + Math.abs(b[1] - mid[1])) || rnd("seed", ...a) - rnd("seed", ...b))[0];
    if (to) { grow(to, 900, "#ffe066"); birds.push({from:mid, to, t0:now()}); seeded++ } }
  if (!grown.length && !seeded) return "";
  bump("cWater"); bump("cBloom"); const cb = recombo();
  const what = [grown.length ? `Grass spread to ${grown.length} tile${grown.length > 1 ? "s" : ""}` : "", seeded ? `a bird carried a seed from your grove` : ""].filter(Boolean).join(" and ");
  return `${what[0].toUpperCase() + what.slice(1)}: you can store ${S.cap} gal${cb ? ". " + cb : ""}`;
}
if (SPREAD) turnHooks.push(spreadTurn);
// Where a cloud rains: the greenest tile beside the river.
function rainTarget() { let best = null, bs = -1;
  S.tiles.forEach((r, y) => r.forEach((c, x) => { const p = [x, y]; if (c.river || !(c.g || c.bloom) || !nbrs(p).some(n => at(n).river)) return;
    const sc = nbrs(p).filter(n => at(n).g || at(n).bloom).length * 10 + c.g; if (sc > bs) { bs = sc; best = p } }));
  return best || S.head }
// Placing your source (LOU-263): bare ground, grass, meadow or sand, at least SEA_GAP tiles from the sea.
const seaGap = p => { let d = 1e9; S.tiles.forEach((r, y) => r.forEach((k, x) => { if (k.t === "ocean") d = Math.min(d, Math.abs(x - p[0]) + Math.abs(y - p[1])) })); return d };
function placeWhy(p) { const c = at(p);
  if (!["bare", "meadow", "sand"].includes(c.t) || c.pool || c.beaver || c.wild) return `You can't place a source on ${{rock:"rock", boulder:"a mountain", lake:"a lake", ocean:"the sea", spring:"a spring"}[c.t] || (c.wild ? "the forest" : c.pool ? "a rain pool" : c.beaver ? "a beaver colony" : "this tile")}. Choose bare ground, grass, meadow or sand.`;
  if (seaGap(p) < SEA_GAP) return `Too close to the sea: place your source at least ${SEA_GAP} tiles from it.`;
  return "" }
const placeable = p => PLACE && S.phase === "pick" && !placeWhy(p);
function placeSrc(p) { const c = at(p); snapshot();
  if (c.g && c.pr === 0) S.cap -= c.g; Object.assign(c, {t:"source", g:0, bloom:false, yield:PLACE_FLOW, rs:false, ro:0});
  anim.set("g:" + p, now()); start(p, true) }
function pick(p) {
  const c = at(p);
  if (PLACE && c.t !== "source") { const why = placeWhy(p); if (why) { ring(p); say(why, true); return } ring(p); sel = p; renderCard(); say("Place your source here? Tap again or tap the button to confirm."); return }
  if (c.t !== "source" || (M.mainSource && p + "" !== M.mainSource + "")) { say(M.pickHint ?? M.startHint, true); return }
  start(p) }
function start(p, placed) { const c = at(p); closeCard();
  if (!placed) snapshot(); c.river = true; c.rid = 0; S.rivers = [{src:p, joined:false, head:p, grp:0, pend:0, combo:0}]; S.active = 0; S.head = p; S.income = c.yield; S.turn = 1; S.water = STORE ? Math.min(c.yield, S.cap) : c.yield; S.phase = "play";
  anim.set(p + "", now()); wave = now(); float(p, `+${c.yield} gal per water cycle`, "#bfe4ff");
  const ro = claimRunoff([p]);
  say(`${placed ? "Source placed. " : ""}Your source's flow is ${S.income} gal per water cycle${ro ? " (with mountain runoff)" : ""}. Tap your stream's end, then where it should go.`);
  zoomTo(lay.zAuto);
}
const HARD_KEY = "flowtile.hard", UNDOS = 3;
const hard = () => { try { return localStorage.getItem(HARD_KEY) === "1" } catch (_) { return false } };
function undo() { if (!history.length) return; if (hard() && (S.undos || 0) >= UNDOS) { say("Hard mode: no undos left on this map. Restart to try again.", true); return }
  const used = (S.undos || 0) + (hard() ? 1 : 0), ob = S.obj || 0; closeCard(); S = JSON.parse(history.pop()); S.obj = Math.max(ob, S.obj || 0); S.undos = used; anim.clear(); fx.length = 0; say(hard() ? `Stepped back. Hard mode: ${UNDOS - S.undos} undo${UNDOS - S.undos === 1 ? "" : "s"} left.` : "Stepped back."); if (S.phase === "pick") zoomTo(1) }
function restart() { closeCard(); hsel = false; S = fresh(); history = []; anim.clear(); fx.length = 0; say(M.startHint); zoomTo(1); showGoal() }

// ---------- UI
let quiet = false; // set by the test solver: skip the screen
function say(t, warn = false) { S.msg = t; S.warn = warn; if (!quiet) sync() }
// A big "Turn N" banner sweeps across the board at each water cycle (LOU-260)
let bannerT = 0, toastT = 0;
function showBanner(t, sub) { if (quiet) return; const b = $("banner"); tx("bTurn", t); tx("bSub", sub); b.hidden = false; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; b.classList.remove("go") }, reduce ? 1200 : 1700) }
function bump(id) { const e = $(id); if (!e || reduce) return; e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump") }
function sync() {
  tx("hWater", S.water); tx("hCap", `(of ${S.cap})`); tx("hFlow", S.income); tx("hTurn", S.turn); tx("hScore", PERF ? score().total : bloomCount());
  $("cWater").setAttribute("aria-label", `Water: ${S.water}${STORE ? ` of ${S.cap}` : ""} gallons. Flow: +${S.income} per water cycle. Tap for details`);
  $("cTurn").classList.toggle("over", S.turn > TURN_GOAL);
  goals();
  const gain = $("gain"), play = S.phase === "play"; gain.hidden = !play;
  if (play) { const f = forecast(), g = STORE ? Math.min(f.gain, Math.max(0, S.cap - S.water)) : f.gain, sp = f.gain - g;
    gain.textContent = sp ? `+${g} · ${sp} ${CYCLE ? "to cloud" : "spill"}` : `+${f.gain} gal`; gain.classList.toggle("spill", sp > 0) }
  if (CYCLE || WX) { const nx = skyNext(); tx("hSky", nx.text); tx("lSky", nx.turn > S.turn ? `Sky · T${nx.turn}` : "Sky"); $("cSky").className = "wx sky " + nx.kind; $("cSky").setAttribute("aria-label", nx.long) }
  if ((S.head || "") + "|" + S.active !== lastHead) { lastHead = (S.head || "") + "|" + S.active; follow() }
  // the message is a short toast that fades (LOU-262); warnings stay a little longer
  const me = $("msg"); if (me.textContent !== (S.msg || "")) { me.textContent = S.msg || ""; me.classList.remove("fade"); clearTimeout(toastT);
    if (S.msg) toastT = setTimeout(() => me.classList.add("fade"), S.warn ? 6500 : 4200); else me.classList.add("fade");
    if (!reduce) { me.classList.remove("pop"); void me.offsetWidth; me.classList.add("pop") } }
  me.classList.toggle("warn", !!S.warn);
  $("end").disabled = S.phase !== "play"; $("undo").disabled = !history.length || (hard() && (S.undos || 0) >= UNDOS);
  $("end").classList.toggle("ready", S.phase === "play" && !affordable() && !canPlant());
  const won = S.phase === "won"; $("win").hidden = !won; $("bottom").hidden = won; if (!won) $("wStars").dataset.n = "";
  if (won && PERF) {
    const sc = score(), n = perfStars(sc.total), prevBest = getNum(bestKey); if (sc.total > prevBest) setNum(bestKey, sc.total); if (n > getNum(starKey)) setNum(starKey, n);
    const pts = `${sc.total} point${sc.total === 1 ? "" : "s"}`; $("winTitle").textContent = sc.sea ? `You reached the sea! ${pts}` : `Island scored: ${pts}`;
    const BIG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/><path class="glint" d="M12 2.5l2.9 6 6.6.8L12 12z"/></svg>';
    if ($("wStars").dataset.n !== String(n)) { $("wStars").dataset.n = n; $("wStars").innerHTML = [0, 1, 2].map(i => `<span class="st ${i < n ? "on" : ""} s${i}">${BIG}</span>`).join("") }
    $("wStars").setAttribute("aria-label", `${n} of 3 stars`);
    const rows = [["River tiles", sc.river], ["Green tiles", sc.green], ["Groves", sc.combos], ["Fish", sc.fish], ["Full lakes", sc.lakes], ["Reached the sea", sc.sea]].filter(r => r[1]);
    $("wGoals").innerHTML = rows.map(([t, v], i) => `<li class="got g${i % 3}"><i></i><span>${t}</span><b>+${v}</b></li>`).join("") + `<li class="g3 extra"><i></i><span>${sc.total > prevBest && prevBest ? "New best! Before" : "Best score"}</span><b>${sc.total > prevBest && prevBest ? prevBest : Math.max(prevBest, sc.total)}</b></li>`;
  } else if (won) {
    const bl = bloomCount(), goals = [[true, `Reached the sea · turn ${S.turn}`], [bl >= BLOOM_GOAL, BLOOM_GOAL ? (M.bloomLabel ? `${M.bloomLabel} on ${bl}/${BLOOM_GOAL} tiles` : `Bloomed ${bl}/${BLOOM_GOAL} tiles`) : "Bloom goal (none on this map)"], [S.turn <= TURN_GOAL, `Turn ${S.turn} (goal: by turn ${TURN_GOAL})`]];
    const n = goals.filter(g => g[0]).length; if (n > getNum(starKey)) setNum(starKey, n);
    const BIG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/><path class="glint" d="M12 2.5l2.9 6 6.6.8L12 12z"/></svg>';
    if (!$("wStars").dataset.n || $("wStars").dataset.n !== String(n)) { $("wStars").dataset.n = n; $("wStars").innerHTML = [0, 1, 2].map(i => `<span class="st ${i < n ? "on" : ""} s${i}">${BIG}</span>`).join("") }
    $("wStars").setAttribute("aria-label", `${n} of 3 stars`);
    const trees = S.tiles.flat().filter(c => c.g >= TREES && !c.wild).length;
    $("wGoals").innerHTML = goals.map(([ok, t], i) => `<li class="${ok ? "got" : ""} g${i}"><i></i><span>${t}</span><b>${ok ? "★" : "☆"}</b></li>`).join("") + (trees ? `<li class="g3 extra"><i></i><span>Trees planted</span><b>${trees}</b></li>` : "");
  }
  save(); resize();
  if (sel) { if (S.phase === "play" || (S.phase === "pick" && placeable(sel))) renderCard(); else closeCard() } else if (info) renderInfo();
  draw();
}

// ---------- tile card: tap a tile to see what it does and choose an action
let sel = null, cardActs = [], hsel = false; // hsel: the stream's end is selected (LOU-258)
function tileName(c) {
  if (c.river && c.beaver) return c.beaver === 2 ? "Beaver pond" : "Beaver colony";
  if (c.river) return {lake:"Full lake", ocean:"The sea", source:"Source"}[c.t] || (c.rid >= 0 && c.rid !== S.active ? riverName(c.rid) : "Your stream");
  if (c.wild) return "Forest";
  if (c.g) return c.g >= TREES ? "Trees" : c.g === MEADOW ? "Meadow" : "Grass";
  if (c.pool) return "Rain pool";
  if (c.beaver) return c.beaver === 2 ? "Beaver pond" : "Beaver colony";
  if (c.fire) return "Trees on fire";
  if (c.g === 0 && c.ash) return "Ash";
  if (c.moss && !c.g) return "Mossy ground";
  if (c.ro === 1) return "Water side: runoff";
  if (c.rs) return "Rain shadow";
  return {bare:"Bare ground", meadow:"Meadow", sand:"Sand", rock:"Rock", boulder:"Mountain", spring:"Spring", lake:"Empty lake", ocean:"The sea", source:"Source"}[c.t];
}
function tileText(p) {
  const c = at(p), cs = combos(), inCombo = cs.find(k => k.tiles.some(q => q + "" === p + "")), bee = cs.find(k => k.bees.some(q => q + "" === p + ""));
  if (c.river && c.beaver === 1) return "Your river runs through the beaver colony. Grow trees next to it and they dam a pond: +1 flow.";
  if (c.river && c.beaver === 2) return "The beavers dammed a pond on your river. It adds +1 flow.";
  if (c.river) return c.rid === S.active ? "Part of the river you're building." : "Part of another river.";
  if (inCombo) return inCombo.kind === "grove" ? `Part of a grove of ${inCombo.tiles.length} trees: +${inCombo.bonus} flow. A stream running over it breaks the grove.` : "";
  if (bee) return "Pollinators: bees from this meadow add +1 flow to the grove next to it.";
  if (c.wild) return "Wild trees. A stream can run through for the normal cost, but it clears them. 3 in a row along the river make a grove: +1 flow.";
  if (c.g) return `Stores ${c.g} extra gal. ${c.g < TREES && plantable(p) ? `Grow it into ${gName(c.g + 1)} for 1 gal: +1 storage. ` : ""}${NEW && c.g >= TREES ? "3 trees in a row along the river make a grove: +1 flow. " : ""}${NEW && c.g === MEADOW ? "A meadow next to a grove adds +1 flow. " : ""}A stream running over it washes that away.${DEER && c.g === 1 && !nbrs(p).some(n => at(n).g >= TREES) ? " Deer may graze it: no trees next to it." : ""}${c.g >= TREES && WX && Object.values(WX).includes("fire") && !wet(p) ? " Dry: not touching water, so lightning can set it alight and fire spreads from it." : ""}`;
  if (c.beaver === 1) return "Beavers live here. Run your stream through the colony and grow trees next to it, and they dam a pond: +1 flow. Running beside it isn't enough.";
  if (c.beaver === 2) return "The beavers' pond. It adds +1 flow to your river.";
  if (c.fire) return wet(p) ? "Burning. It burns out at the next water cycle. Water is next to it, so the fire stops here." : "Burning. It burns out at the next water cycle and spreads to the trees next to it, because no water is next to it.";
  if (c.ash && !c.g) return "Burnt ground. You can plant here again.";
  if (salty(p) && c.t === "bare" && !c.g) return "Salty ground by the sea. Nothing grows here.";
  if (c.pool) return "A puddle of rain. Bring your stream next to it and collect +2 gal, once.";
  if (c.ro === 1) return `Water side: +1 flow when your river reaches this tile (through or beside it).${MELT ? " Snowmelt adds +3 gal once." : ""} It's the only tile at this mountain that gives flow.`;
  if (c.ro === 2) return "Water side: your river already took this mountain's runoff (+1 flow).";
  if (c.rs) return "Behind the mountain, out of the rain. Nothing grows here unless the stream runs through it.";
  const lake = c.t === "lake" ? LAKE_TILE_COST * S.lakes[c.lake].tiles.length : 0;
  return {bare:SPREAD ? "Plant here once your stream is next to it. Grass beside it on the bank may spread here." : "Plant here once your stream is next to it.", meadow:SPREAD ? "Grass next to a meadow always spreads along the bank. A meadow next to a grove adds +1 flow to it." : NEW ? "Pollinators: a meadow next to a grove (3 trees in a row by the river) adds +1 flow to it." : "Open ground the stream can cross.",
    sand:NEW ? "Free to cross, but cuts flow by 1. Grows grass on the bare ground around it." : "Free to cross, but cuts flow by 1. Blooms the land around it.",
    rock:MOSS ? "Hard ground: costs 1 gal more to cross. Beside your stream, grow moss for 1 gal to break it into soil." : NEW ? "Hard ground: costs 1 gal more to cross. Tiles touching rock don't turn green." : "Hard ground: costs 1 gal more to cross. Tiles touching rock don't bloom.",
    boulder:c.ws ? "Blocks the stream. Water side: rain runs down one face to the tile in front of it (marked +1). That tile gives +1 flow when your river reaches it; the other sides are dry." : "Blocks the stream.", spring:"Free to reach, and adds +1 flow.", lake:`Fills all at once for ${lake} gal (2 a tile). The stream can then leave from any side${STORE ? `, and you can plant up to ${REACH} tiles from it` : ""}.`,
    ocean:"Bring a stream here to finish the map.", source:"Where a river starts."}[c.t];
}
function actions(p) {
  const c = at(p), out = [], m = moves().get(p + "");
  if (m) { let name = "Extend the stream", sub = "", warn = "";
    if (c.river) { const g = Math.min(root(c.rid), root(S.active)), w = root(c.rid) === 0 ? flowOf(S.active) : flowOf(c.rid);
      name = `Join the ${riverName(c.rid).toLowerCase()}`; sub = g === 0 ? `Connects to the main river: flow ${S.income} → ${S.income + w}` : "The tributaries join; their flow still waits for the main river" }
    else if (c.t === "ocean") { name = "Reach the sea"; sub = "Finishes the map" }
    else if (c.t === "lake") { name = "Fill the lake"; sub = STORE ? `Then you can plant up to ${REACH} tiles from it` : "Then the stream can leave from any side" }
    else if (c.t === "spring") { name = "Join the spring"; sub = onMain(S.active) ? `Flow ${S.income} → ${S.income + 1}` : "+1 flow once this tributary joins the main river" }
    else if (c.t === "sand") { const g = NEW ? nbrs(p).filter(n => { const k = at(n); return k.t === "bare" && !k.river && !k.g && !k.rs && !touchesRock(n) }).length : 0;
      sub = g ? `Grows ${g} grass around it: store ${S.cap} → ${S.cap + g} gal` : "Blooms the land around it"; warn = `Cuts flow: ${flowOf(S.active)} → ${Math.max(0, flowOf(S.active) - 1)}${onMain(S.active) ? "" : " (this tributary's)"}` }
    else if (c.ro === 1 || nbrs(p).some(n => at(n).ro === 1)) sub = `Mountain runoff: flow ${flowOf(S.active)} → ${flowOf(S.active) + [p, ...nbrs(p)].filter(q => at(q).ro === 1).length}${onMain(S.active) ? "" : " once joined"}`;
    if (c.beaver === 1) sub = nbrs(p).some(q => at(q).g >= TREES && !at(q).river) ? `Through the beaver colony: they dam a pond, flow +1` : "Through the beaver colony. Grow trees next to it for a pond: +1 flow";
    if (c.wild) sub = "Cuts through the forest";
    else if (c.g) warn = `Washes away the ${gName(c.g)}: you lose ${c.g} storage`;
    if (NEW && c.t !== "lake" && !c.river) { const d = comboPreview(p, k => { k.river = true; k.rid = S.active; k.g = 0 });
      if (d < 0) warn = (warn ? warn + ". " : "") + `Breaks a grove: flow −${-d}`;
      else if (d > 0) sub = (sub ? sub + ". " : "") + `Grove: flow +${d}` }
    out.push({k:"stream", name, cost:m.cost, sub, warn, run:() => build(m)}) }
  if (plantable(p)) { const d = NEW && c.g ? comboPreview(p, k => { k.g++; k.pr = S.active }) : 0;
    out.push({k:"plant", name:["Plant grass", "Grow a meadow", "Grow trees"][c.g], cost:PLANT_COST, sub:`Store ${S.cap} → ${S.cap + 1} gal${d > 0 ? `. Grove: flow +${d}` : ""}`,
      warn:m ? "A stream running here later washes it away" : "", run:() => plant(p)}) }
  if (c.pool && !c.river && nbrs(p).some(n => at(n).river && at(n).rid === S.active)) out.unshift({k:"collect", name:"Collect the rain pool", cost:0, sub:`+2 gal at once${STORE && S.water + 2 > S.cap ? ` (only ${Math.max(0, S.cap - S.water)} fit)` : ""}`, warn:"", run:() => collect(p)});
  if (MOSS && c.t === "rock" && !c.river && nbrs(p).some(n => at(n).river && at(n).rid === S.active)) out.push({k:"moss", name:"Grow moss", cost:1, sub:"Breaks the rock into soil you can plant", warn:"", run:() => moss(p)});
  if (TRIB && c.t === "source" && !c.river) out.push({k:"trib", name:"Start a tributary", cost:0, sub:`Build it with your main river's water. Its +${c.yield} gal per water cycle joins your flow once it reaches the main river`, warn:"", run:() => startTributary(p)});
  return out;
}
const canDo = a => S.water >= a.cost;
function shortBy(a) { return STORE && a.cost > S.cap ? `You can only store ${S.cap} gal. Plant to store more` : `You have ${S.water} gal. Next Water Cycle brings +${S.income}` }
// Round icons for the tile card's actions (LOU-260)
const ICON = {
  plant:'<svg viewBox="0 0 24 24"><path d="M12 21v-8"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/></svg>',
  meadow:'<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="2.2"/><path d="M12 4.5v2.3M12 11.2v2.3M7.5 9h2.3M14.2 9h2.3M12 13.5V21M12 18c-2-2.5-4.5-3-6-2.5M12 17c2-2 4-2.5 5.5-2"/></svg>',
  trees:'<svg viewBox="0 0 24 24"><path d="M12 3l6 9h-3.5l4 6H5.5l4-6H6z"/><path d="M12 18v3"/></svg>',
  collect:'<svg viewBox="0 0 24 24"><path d="M12 3c3.5 4.5 6 7.6 6 10.7a6 6 0 01-12 0C6 10.6 8.5 7.5 12 3z"/></svg>',
  moss:'<svg viewBox="0 0 24 24"><path d="M4 18c2-6 7-10 16-12-1 8-6 13-13 13"/><path d="M4 21l7-8"/></svg>',
  trib:'<svg viewBox="0 0 24 24"><path d="M6 3v6c0 4 6 5 6 9v3"/><path d="M18 3v6c0 4-6 5-6 9"/></svg>',
  src:'<svg viewBox="0 0 24 24"><path d="M5 19h14"/><path d="M8 19c0-3 1.5-4 4-4s4 1 4 4"/><path d="M12 15V6"/><path d="M12 6c-2-2-5-1.5-6 1M12 6c2-2 5-1.5 6 1"/></svg>',
};
function renderCard() {
  info = false;
  const c = at(sel), el = $("tcard"); const p0 = sel;
  cardActs = S.phase === "pick" ? [{k:"src", name:"Place source here", cost:0, sub:`Your main river starts here: +${PLACE_FLOW} gal per water cycle`, warn:c.g ? `Covers the ${gName(c.g)}` : "", run:() => placeSrc(p0)}]
    : actions(sel).filter(a => a.k !== "stream"); // the stream moves only from its selected end
  el.innerHTML = `<div class="thead"><i class="swatch" style="background:${topColor(c)}"></i><div class="tname"><b>${tileName(c)}</b>${cardActs.length ? "" : `<small>${tileText(sel)}</small>`}</div><button class="tclose" id="tclose" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>` +
    cardActs.map((a, i) => `<button class="act ${a.k}" data-a="${i}" ${canDo(a) ? "" : "disabled"}><i class="aico">${ICON[a.k === "plant" ? ["plant", "meadow", "trees"][at(sel).g] : a.k] || ""}</i><span class="atext"><b>${a.name}</b>${canDo(a) ? (a.sub ? `<small>${a.sub}</small>` : "") : `<small>${shortBy(a)}</small>`}${a.warn && canDo(a) ? `<small class="awarn">${a.warn}</small>` : ""}</span><span class="acost">${a.cost ? a.cost + " gal" : "Free"}</span></button>`).join("");
  el.hidden = false; placeCard();
}
function placeCard() {
  if (!sel) return;
  const el = $("tcard"), d = diamond(sel), sx = ((d[0][0] + d[2][0]) / 2 * scale + off.x) / lay.dpr, sy = ((d[0][1] + d[2][1]) / 2 * scale + off.y) / lay.dpr;
  const side = lay.h < 540 && lay.w > lay.h * 1.3, up = sy > lay.topH + (lay.h - lay.topH) / 2;
  el.className = "tcard " + (side ? (sx > lay.w / 2 ? "left" : "right") : up ? "up" : "");
  el.style.top = !side && up ? lay.topH + 6 + "px" : "";
}
function closeCard() { if (!sel && !info) return; sel = null; info = false; cardActs = []; $("tcard").hidden = true; draw() }
// The Water card (LOU-267): tap Water in the top bar for storage, flow and, on tributary maps, each river.
let info = false;
function renderInfo() {
  const el = $("tcard"), f = forecast(); let cells = "";
  if (STORE) { for (let i = 0; i < S.cap; i++) cells += `<i class="${i < S.water ? "f" : ""}"></i>`; cells = `<div class="cells big" aria-hidden="true">${cells}</div>` }
  const rv = TRIB && S.rivers.length > 1 ? `<div class="rivers">${S.rivers.map((r, i) => `<button data-r="${i}" class="${i === S.active ? "on" : ""}" ${r.joined || S.phase !== "play" ? "disabled" : ""}>${riverName(i)}<small>${r.joined ? "joined" : onMain(i) ? `+${S.income} flow` : `+${flowOf(i)} flow once joined`}</small></button>`).join("")}</div>` : "";
  el.innerHTML = `<div class="thead"><i class="swatch" style="background:#2f9be8"></i><div class="tname"><b>Water: ${S.water}${STORE ? ` of ${S.cap}` : ""} gal</b><small>${STORE ? "Water over storage spills at the next water cycle. Plant by the stream to store more." : "Every cost is paid in water."}</small></div><button class="tclose" id="tclose" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>${cells}` +
    `<div class="wline"><span>Flow</span><b class="flw">+${S.income} gal per water cycle</b></div>${S.phase === "play" ? `<div class="wline"><span>Next Water Cycle</span><b>+${Math.min(f.gain, STORE ? Math.max(0, S.cap - S.water) : f.gain)} gal${STORE && f.gain > S.cap - S.water ? `, ${f.gain - Math.max(0, S.cap - S.water)} spills` : ""}${f.dry ? " (drought)" : ""}</b></div>` : ""}${rv}`;
  el.className = "tcard"; el.style.top = ""; el.hidden = false;
}
$("cWater").onclick = () => { if (info) { closeCard(); return } closeCard(); hsel = false; info = true; renderInfo(); sync() };
function runAct(a) { closeCard(); a.run() }
// Moving the stream (LOU-258, replaces LOU-255's quick tap): tap the stream's end to select it, then tap a glowing tile.
// The end stays selected so you can keep extending. Tap the end again, or empty space, to let go. With nothing selected,
// tapping land opens its card, and tapping next to the river never moves the stream.
function headTiles(i) { const h = i === S.active ? S.head : S.rivers[i] && S.rivers[i].head; if (!h) return []; const c = at(h); return c.t === "lake" && c.lake >= 0 ? S.lakes[c.lake].tiles : [h] }
function liveRivers() { return S.phase !== "play" ? [] : TRIB ? S.rivers.map((_, i) => i).filter(i => !S.rivers[i].joined) : [S.active] }
function headRiver(p) { for (const i of liveRivers()) if (headTiles(i).some(q => same(q, p))) return i; return -1 }
function tapTile(p, hold = false) {
  if (hold) { hsel = false; ring(p); sel = p; renderCard(); draw(); return }
  const hr = headRiver(p);
  if (hr >= 0) { closeCard(); if (hsel && hr === S.active) { hsel = false; draw(); return }
    if (hr !== S.active) activate(hr);
    hsel = true; ring(p); const who = TRIB && S.rivers.length > 1 ? `the ${riverName(hr).toLowerCase()}` : "your stream";
    const mvs = [...moves().values()], can = mvs.some(m => S.water >= m.cost);
    say(!mvs.length ? `${who[0].toUpperCase() + who.slice(1)} has nowhere to go from here.` : can ? `Now tap a glowing tile to move ${who} there.` : `Out of water: the grey tiles cost more than your ${S.water} gal. Tap Next Water Cycle for +${S.income} gal.`, !can); return }
  if (hsel) { const m = moves().get(p + "");
    if (m) { const st = actions(p).find(a => a.k === "stream"); if (st && canDo(st)) { runAct(st); return } if (st) { ring(p); say(shortBy(st), true); return } }
    hsel = false }
  if (sel && same(sel, p)) { const a = cardActs.find(canDo); if (a) runAct(a); else closeCard(); return }
  ring(p);
  const acts = actions(p).filter(a => a.k !== "stream"); // one clear choice with nothing to warn about: just do it
  if (acts.length === 1 && canDo(acts[0]) && !acts[0].warn) { closeCard(); acts[0].run(); return }
  sel = p; renderCard(); draw();
}

// ---------- tutorial objectives (LOU-264): one at a time, checked by the game after every action, target highlighted
const OBJ = M.objectives || [];
const G = { // what an objective's done(g) can ask
  get phase() { return S.phase }, get won() { return S.phase === "won" }, get selected() { return hsel }, get turn() { return S.turn },
  get sel() { return sel ? at(sel) : null }, get selPlantable() { return !!sel && plantable(sel) }, get info() { return info },
  count(f) { return S.tiles.flat().filter(f).length },
  get built() { return G.count(c => c.river && c.rid >= 0 && !["source", "ocean"].includes(c.t)) },
  get grass() { return G.count(c => !c.river && !c.wild && c.g >= 1) }, get meadows() { return G.count(c => !c.river && c.g >= MEADOW) },
  get trees() { return G.count(c => !c.river && !c.wild && c.g >= TREES && c.pr !== 0) }, get groves() { return combos().length },
  get bees() { return combos().reduce((n, k) => n + k.bees.length, 0) }, get lakes() { return S.lakes.filter(L => L.filled).length },
  get rivers() { return S.rivers.length }, get joined() { return S.rivers.some(r => r.joined) }, get runoff() { return G.count(c => c.ro === 2) },
  river(t) { return G.count(c => c.river && c.t === t) },
  beside(f) { return S.tiles.flatMap((r, y) => r.map((c, x) => [x, y])).filter(p => { const c = at(p); return !c.river && f(c) && nbrs(p).some(n => at(n).river && at(n).rid >= 0) }).length },
  get besideGrove() { const g = combos().flatMap(k => k.tiles); return S.tiles.flatMap((r, y) => r.map((c, x) => [x, y])).filter(p => { const c = at(p); return !c.river && c.g >= 1 && c.g < TREES && nbrs(p).some(n => g.some(q => same(q, n))) }).length },
};
const objDone = o => { try { return !!o.done(G) } catch (_) { return false } };
const objNow = () => S && OBJ.length && (S.obj || 0) < OBJ.length ? OBJ[S.obj || 0] : null;
// Tiles to highlight for the current objective (null: none). Buttons get a ring instead (see objCheck).
function objAim() { const o = objNow(); if (!o || !o.target || o.target === "end" || o.target === "water") return null;
  const all = S.tiles.flatMap((r, y) => r.map((c, x) => [x, y])), t = o.target;
  const pick = Array.isArray(t) ? [t] : t === "head" ? (S.phase === "play" ? headTiles(S.active) : []) : t === "moves" ? [...moves().values()].map(m => m.p)
    : t === "plantable" ? all.filter(plantable) : all.filter(p => { const c = at(p); return {
      source:c.t === "source" && !c.river && (!M.mainSource || S.phase !== "pick" || same(M.mainSource, p)), sea:c.t === "ocean" && !c.river, lake:c.t === "lake" && !c.river,
      sand:c.t === "sand" && !c.river, rock:c.t === "rock" && !c.river, spring:c.t === "spring" && !c.river, runoff:c.ro === 1, main:c.river && c.rid >= 0 && onMain(c.rid) && c.t !== "source",
      grass:!c.river && c.g === 1, meadow:!c.river && c.g === MEADOW, trees:!c.river && c.g >= TREES, grove:combos().some(k => k.tiles.some(q => same(q, p))) }[t] });
  return pick.length ? new Set(pick.map(p => p + "")) : null }
let objShown = -1;
function objCheck() { if (!OBJ.length || !S) return; let moved = false;
  if (S.phase === "won" && (S.obj || 0) < OBJ.length) { S.obj = OBJ.length; moved = true } // reaching the sea finishes the lesson whatever the route
  while ((S.obj || 0) < OBJ.length && objDone(OBJ[S.obj || 0])) { S.obj = (S.obj || 0) + 1; moved = true }
  const i = S.obj || 0, o = OBJ[Math.min(i, OBJ.length - 1)];
  if (i !== objShown) { const el = $("obj"); tx("oText", i >= OBJ.length ? "Lesson complete!" : o.text);
    $("oDots").innerHTML = OBJ.map((_, k) => `<i class="${k < i ? "d" : k === i ? "c" : ""}"></i>`).join("");
    el.classList.toggle("all", i >= OBJ.length);
    if (objShown >= 0 && moved && !reduce) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick") }
    objShown = i; if (moved) save() }
  const tg = objNow() && objNow().target; $("end").classList.toggle("aim", tg === "end"); $("cWater").classList.toggle("aim", tg === "water") }
if (OBJ.length && $("oSkip")) $("oSkip").onclick = () => { lsSet("flowtile.seen." + M.id, "skipped"); location.href = M.next };

// ---------- Perfection score
function score() {
  const c = combos(), lakes = S.lakes.filter(L => L.filled).length, sea = S.tiles.flat().some(k => k.t === "ocean" && k.river);
  const part = {river:S.tiles.flat().filter(k => k.river && k.t !== "source" && k.t !== "ocean" && k.t !== "lake").length, green:bloomCount(), combos:3 * c.length, fish:fishCount(), lakes:2 * lakes, sea:sea ? 5 + Math.max(0, TURN_GOAL - S.turn) : 0};
  part.total = Object.values(part).reduce((a, b) => a + b, 0); return part;
}
const bestKey = "flowtile.best." + M.id, starKey = "flowtile.stars." + M.id;
const getNum = k => { try { return +localStorage.getItem(k) || 0 } catch (_) { return 0 } };
const setNum = (k, v) => { try { localStorage.setItem(k, String(v)) } catch (_) {} };
function perfStars(t) { const st = M.scoreStars || [20, 30, 40]; return st.filter(x => t >= x).length }
// The sky chip: the next thing the weather or your clouds will do.
function skyNext() {
  const ev = [];
  for (const c of S.clouds || []) ev.push({turn:c.turn, kind:"cloud", text:`☁ +${c.gal}`, long:`A cloud with ${c.gal} gal rains back on turn ${c.turn}`});
  if (WX) for (const [k, v] of Object.entries(WX)) if (+k > S.turn) ev.push({turn:+k, kind:v, text:`${{rain:"Rain", drought:"Dry", fire:"Storm"}[v] || v}`, long:`${{rain:"Rainstorm: +2 gal", drought:"Drought: −1 flow for 2 turns", fire:"Lightning: dry trees catch fire"}[v] || v} on turn ${k}`});
  if (S.dry > 0) ev.push({turn:S.turn, kind:"drought", text:"Drought", long:"Drought: −1 flow next turn"});
  ev.sort((a, b) => a.turn - b.turn);
  return ev[0] || {kind:"", text:"Clear", long:"Clear skies ahead"};
}
// The three star goals stay on screen while you play.
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';
function goals() {
  if (PERF) { const sc = score().total, best = getNum(bestKey), st = M.scoreStars || [20, 30, 40], nx = st.find(x => sc < x);
    $("goals").innerHTML = [`<span class="goal ${nx ? "live" : "got"}">${STAR}Score ${sc}${nx ? ` · next star at ${nx}` : ""}</span>`, best ? `<span class="goal">Best ${best}</span>` : ""].join(""); return }
  const won = S.phase === "won", bl = bloomCount(), left = TURN_GOAL - S.turn, over = left < 0;
  const list = [[won ? "got" : "", "To the sea"]];
  if (BLOOM_GOAL) list.push([bl >= BLOOM_GOAL ? "got" : "", `${BLOOM_LABEL} ${bl}/${BLOOM_GOAL}`, "cBloom"]);
  list.push([over ? "miss" : won ? "got" : "live",
    S.phase === "pick" || won ? `By turn ${TURN_GOAL}` : over ? `Missed turn ${TURN_GOAL}` : left === 0 ? `Turn ${TURN_GOAL} · last turn` : `Turn ${TURN_GOAL} · ${left} left`]);
  $("goals").innerHTML = list.map(([k, t, id]) => `<span class="goal ${k}"${id ? ` id="${id}"` : ""}>${STAR}${t}</span>`).join("");
}

// ---------- persistence: keep the current run across app close/reopen
const SAVE_KEY = "flowtile.run.v4." + M.id; // v4: grass, meadow, trees (LOU-261)
function save() { try { if (S.phase === "won" || S.phase === "stuck") localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, JSON.stringify({S, history, at:Date.now()})) } catch (_) {} }
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!d || !d.S || !Array.isArray(d.S.tiles) || d.S.tiles.length !== H || d.S.tiles[0].length !== W || !Array.isArray(d.history)) return false;
    if (d.S.phase === "won" || d.S.phase === "stuck" || (d.at && Date.now() - d.at > 12 * 3600e3)) { localStorage.removeItem(SAVE_KEY); return false } // finished or stale: start fresh (LOU-258)
    S = d.S; history = d.history; S.rivers ||= []; S.active ||= 0; return true;
  } catch (_) { return false }
}

// ---------- motion: animations live outside S (never saved), keyed by tile
const now = () => performance.now();
const anim = new Map(), fx = [], rings = [], rains = []; let wave = -1e9, sky = null;
const DUR = 420, clamp01 = v => Math.max(0, Math.min(1, v));
const easeBack = k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
function prog(key) { if (reduce) return 1; const s = anim.get(key); if (s == null) return 1; const k = (now() - s) / DUR; if (k >= 1) { anim.delete(key); return 1 } return Math.max(0, k) }
function float(p, text, col) { if (reduce) return; const t = now(), busy = fx.filter(f => f.p + "" === p + "" && f.t0 > t - 400).length; fx.push({p, text, col, t0:t + busy * 280}) }
function ring(p) { if (!reduce) rings.push({p, t0:now()}) }

// ---------- drawing (isometric blocks in the sea)
const cv = $("cv"), ctx = cv.getContext("2d");
let scale = 1, off = {x:0, y:0}, t0 = now(), lastSize = "", lastHead = null;
// view.z is zoom relative to "whole map fits"; cx/cy is the world point at the middle of the free area
const view = {z:null, cx:0, cy:0}, lay = {w:0, h:0, topH:0, availH:0, dpr:1, fit:1, zAuto:1};
let tgt = null;
const RING = 0, CELLS = []; // no sea border around the map
for (let y = -RING; y < H + RING; y++) for (let x = -RING; x < W + RING; x++) CELLS.push([x, y]);
CELLS.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
const ORDER = CELLS.filter(p => inside(...p));
const iso = (x, y, e) => ({x:(x - y) * TW / 2, y:(x + y) * TH / 2 - e * ZH});
function drawLevel(p) { const c = at(p); if (c.t === "ocean") return 0; if (c.t === "lake") return c.e + (S.lakes[c.lake].filled ? .7 * prog(p + "") : 0); return c.e }
function diamond(p, lv = drawLevel(p)) { const o = iso(p[0], p[1], lv); return [[o.x, o.y - TH/2], [o.x + TW/2, o.y], [o.x, o.y + TH/2], [o.x - TW/2, o.y]] }
function bounds() { let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = +ELEV[y][x], o = iso(x, y, e), g = iso(x, y, 0);
    a = Math.min(a, o.x - TW/2); c = Math.max(c, o.x + TW/2); b = Math.min(b, o.y - TH/2 - 44); d = Math.max(d, g.y + TH/2 + 14) }
  return {x:a - 8, y:b, w:c - a + 16, h:d - b + 8} }
const B = bounds();
// Fit the map into the part of the game window not covered by the top bar and the message.
// Before a source is picked the whole island shows (the overview); after, play zoomed in like Polytopia (LOU-262):
// a tile is PLAY_TILE px wide and the camera follows the stream's end. The message is a toast over the map, so it takes no room.
function resize() {
  const box = $("board"), w = box.clientWidth, h = box.clientHeight, dpr = Math.min(devicePixelRatio || 1, 3);
  if (!w || !h) return;
  const topH = $("top").offsetHeight, botH = 0;
  const key = [w, h, topH, botH, dpr].join(); if (key === lastSize) return; lastSize = key;
  const availH = Math.max(40, h - topH - botH), fit = Math.min(w / B.w, availH / B.h);
  Object.assign(lay, {w, h, topH, availH, dpr, fit, zAuto:Math.max(1, PLAY_TILE / (TW * fit))});
  if (view.z === null) { view.z = S.phase === "pick" ? 1 : lay.zAuto; const f = S.phase === "pick" ? {x:B.x + B.w / 2, y:B.y + B.h / 2} : focusPoint(); view.cx = f.x; view.cy = f.y }
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
  view.z = Math.min(Math.max(5, lay.zAuto * 1.6), Math.max(1, view.z)); clampView();
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
    tgt = {x:f.x, y:f.y, n:0}; if (reduce) { view.cx = f.x; view.cy = f.y; tgt = null; applyView() } }
}
// Glide the camera to a zoom level: 1 shows the whole island, otherwise centre on the stream.
function zoomTo(z) {
  if (view.z === null || !lay.w) { view.z = null; return }
  const f = z <= 1.01 ? {x:B.x + B.w / 2, y:B.y + B.h / 2} : focusPoint(); tgt = {x:f.x, y:f.y, z, n:0};
  if (reduce) { view.z = z; view.cx = f.x; view.cy = f.y; tgt = null; applyView() }
}
function glide() { if (!tgt) return; const k = .14;
  view.cx += (tgt.x - view.cx) * k; view.cy += (tgt.y - view.cy) * k; if (tgt.z != null) view.z += (tgt.z - view.z) * k;
  if (++tgt.n > 80 || (Math.hypot(tgt.x - view.cx, tgt.y - view.cy) < 1 && (tgt.z == null || Math.abs(tgt.z - view.z) < .005))) {
    if (tgt.z != null) view.z = tgt.z; tgt = null }
  applyView() }

// ---------- paint helpers
function mix(hex, k) { if (hex[0] !== "#") return hex; const n = parseInt(hex.slice(1), 16);
  return "rgb(" + [n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)).join(",") + ")" }
const shade = (hex, k) => mix(hex, -k);
function poly(pts, fill) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill() }
function line(pts, col, w) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke() }
function ell(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fillStyle = fill; ctx.fill() }
const hsh = (x, y) => Math.abs(((x + 11) * 73856093) ^ ((y + 7) * 19349663)) % 97;
function topColor(c) {
  if (c.t === "ocean") return COL.ocean;
  if (c.river && c.t === "lake") return COL.river;
  if (c.river) return COL[c.t];
  if (c.g >= TREES) return COL.trees; if (c.g === MEADOW) return COL.meadow; if (c.g) return COL.grass;
  if (c.rs) return COL.shadow;
  if (c.ro && c.t === "bare") return c.ro === 1 ? "#6fa592" : "#7aa98c"; // wet green-blue ground at the foot of the water side
  if (c.bloom && c.t !== "meadow") return COL.bloom; return COL[c.t] }
function pine(x, y, s, dark) {
  ell(x + 3 * s, y + 1, 10 * s, 3.5 * s, "rgba(0,0,0,.2)");
  poly([[x - 1.8 * s, y - 5 * s], [x + 1.8 * s, y - 5 * s], [x + 1.8 * s, y + 1], [x - 1.8 * s, y + 1]], "#6b4a2b");
  poly([[x, y - 30 * s], [x + 11 * s, y - 5 * s], [x - 11 * s, y - 5 * s]], dark ? "#24703a" : "#2f8a3a");
  poly([[x, y - 30 * s], [x + 11 * s, y - 5 * s], [x, y - 5 * s]], dark ? "#378f3e" : "#46a948");
  poly([[x, y - 40 * s], [x + 8 * s, y - 18 * s], [x - 8 * s, y - 18 * s]], dark ? "#2e8038" : "#3c9a40");
  poly([[x, y - 40 * s], [x + 8 * s, y - 18 * s], [x, y - 18 * s]], dark ? "#47a646" : "#5cbf52");
}
function tufts(cx, cy, h, sway) {
  [[-18, 2], [-6, -9], [12, -5], [2, 9], [18, 5]].forEach(([a, b], i) => { if ((h + i) % 5 === 4) return;
    const x = cx + a, y = cy + b, w = sway * Math.sin(i * 1.7);
    ctx.beginPath(); ctx.moveTo(x - 4 + w, y - 6); ctx.lineTo(x - 2, y); ctx.moveTo(x + w, y - 9); ctx.lineTo(x, y); ctx.moveTo(x + 4 + w, y - 6); ctx.lineTo(x + 2, y);
    ctx.strokeStyle = "#3d9a35"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke() });
  ell(cx - 9 + h % 7, cy + 4, 2.4, 2.4, "#ffe066"); ell(cx + 9, cy - 9 + h % 5, 2.1, 2.1, "#ffffff");
}
function flowers(cx, cy, h) {
  [[-16, 0, "#ffe066"], [-5, -9, "#ffffff"], [10, -4, "#c9a2ff"], [3, 8, "#ffe066"], [17, 4, "#ffffff"], [-8, 7, "#ff9fb8"]].forEach(([a, b, f], i) => {
    if ((h + i) % 6 === 5) return; const x = cx + a, y = cy + b;
    line([[x, y + 3], [x, y]], "#4e9a3c", 1.5); ell(x, y - 1, 2.6, 2.2, f); ell(x, y - 1, 1, 1, "#f2a93b") });
}
// Meadow (LOU-258): soft pale patches and wildflowers on short stems, no grass tufts. A bloomed meadow is fuller.
function meadow(cx, cy, h, full) {
  [[-11, 1, 9, 4], [9, -5, 8, 3.6], [2, 8, 7, 3]].forEach(([a, b, rx, ry], i) => { if ((h + i) % 4 !== 3) ell(cx + a, cy + b, rx, ry, "#c3e89e") });
  flowers(cx, cy, h); if (full) flowers(cx + 4, cy - 3, h + 3);
}
function stones(cx, cy) {
  [[-13, 3, 1], [9, -6, .8], [-1, 10, .6]].forEach(([a, b, s]) => { const x = cx + a, y = cy + b;
    ell(x + 2, y + 3 * s, 13 * s, 4 * s, "rgba(0,0,0,.18)");
    poly([[x - 12 * s, y + 3 * s], [x - 7 * s, y - 9 * s], [x + 5 * s, y - 11 * s], [x + 12 * s, y + s], [x + 3 * s, y + 6 * s]], "#8d887f");
    poly([[x - 7 * s, y - 9 * s], [x + 5 * s, y - 11 * s], [x + s, y - 2 * s]], "#d3cdc2");
    poly([[x + 5 * s, y - 11 * s], [x + 12 * s, y + s], [x + s, y - 2 * s]], "#aaa499") });
}
function mountain(cx, cy, t, side) {
  ell(cx + 6, cy + 8, 32, 9, "rgba(0,0,0,.22)");
  poly([[cx + 10, cy + 8], [cx + 20, cy - 20], [cx + 32, cy + 5]], "#857f77");
  poly([[cx - 28, cy + 6], [cx - 5, cy - 48], [cx + 5, cy + 11]], "#6f6a64");
  poly([[cx + 5, cy + 11], [cx - 5, cy - 48], [cx + 27, cy + 4]], "#a29b92");
  poly([[cx - 5, cy - 48], [cx - 14, cy - 27], [cx - 7, cy - 31], [cx - 1, cy - 25]], "#e8eef4");
  poly([[cx - 5, cy - 48], [cx - 1, cy - 25], [cx + 4, cy - 30], [cx + 11, cy - 25]], "#ffffff");
  if (side) { // the water side (LOU-269): a wet, darker strip of rock with moss, and a thin waterfall down that one face
    const sx = (side[0] - side[1]) * TW / 4, sy = (side[0] + side[1]) * TH / 4, x0 = cx + sx * .2, y0 = cy - 30, x1 = cx + sx * .75, y1 = cy + sy * .75;
    const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1, wx = nx / nl * 7, wy = ny / nl * 7;
    poly([[x0 - wx * .5, y0 - wy * .5], [x0 + wx * .5, y0 + wy * .5], [x1 + wx, y1 + wy], [x1 - wx, y1 - wy]], "rgba(40,52,60,.45)");
    ell(x1 - wx * 1.1, y1 - wy * 1.1 - 2, 4.5, 2.6, "#5f9a40"); ell(x1 + wx * 1.2, y1 + wy * 1.2 - 3, 3.8, 2.2, "#6fa84a"); ell((x0 + x1) / 2 + wx * .8, (y0 + y1) / 2 + wy * .8, 2.6, 1.6, "#5f9a40");
    line([[x0, y0], [(x0 + x1) / 2 + 3, (y0 + y1) / 2], [x1, y1]], "#7ccbf7", 3.5);
    ctx.save(); ctx.setLineDash([4, 7]); ctx.lineDashOffset = -t * 30; line([[x0, y0], [(x0 + x1) / 2 + 3, (y0 + y1) / 2], [x1, y1]], "#ffffff", 1.6); ctx.restore();
    ell(x1, y1 + 2, 7, 3.5, "#4aa3e8") }
}
function cloud(x, y, s) {
  ell(x + 8 * s, y + 18 * s, 48 * s, 9 * s, "rgba(8,24,40,.18)");
  for (const [a, b, r] of [[-30, 4, 17], [-11, -8, 22], [12, -3, 19], [31, 6, 14], [0, 9, 24]]) ell(x + a * s, y + b * s, r * s, r * s * .82, "#ffffff");
  ell(x, y + 14 * s, 42 * s, 6 * s, "#dce8f2");
}
// Fish: one for every 4 river tiles once the river is 6 long (they also count toward the Perfection score).
function fishCount() { const n = S.tiles.flat().filter(c => c.river && c.t !== "source" && c.t !== "ocean").length; return n >= 6 ? Math.floor(n / 4) : 0 }
function deerSprite(x, y, b) { ell(x, y + 10, 12, 3, "rgba(0,0,0,.2)"); line([[x - 7, y + 9], [x - 7, y + 1]], "#6b4326", 2); line([[x + 6, y + 9], [x + 5, y + 1]], "#6b4326", 2);
  ell(x, y, 10, 5, "#b0703c"); ell(x + 10, y - 6 + b, 4, 3.5, "#b0703c"); line([[x + 8, y - 2], [x + 10, y - 6 + b]], "#b0703c", 4); line([[x + 10, y - 9 + b], [x + 8, y - 15 + b], [x + 5, y - 17 + b]], "#6b4326", 1.6); line([[x + 11, y - 9 + b], [x + 14, y - 15 + b]], "#6b4326", 1.6); ell(x - 9, y - 2, 2, 2, "#ffffff") }
function bee(x, y) { // a little striped bee with white wings
  ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.ellipse(x - 1, y - 4, 3, 2, -.5, 0, 7); ctx.ellipse(x + 2, y - 4, 3, 2, .5, 0, 7); ctx.fill();
  ctx.fillStyle = "#ffcf3a"; ctx.beginPath(); ctx.ellipse(x, y, 4.5, 3, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = "#3a2600"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - 1, y - 3); ctx.lineTo(x - 1, y + 3); ctx.moveTo(x + 1.6, y - 2.6); ctx.lineTo(x + 1.6, y + 2.6); ctx.stroke() }
function fish(x, y, dir) { ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(0, -6, 7, 0); ctx.quadraticCurveTo(0, 6, -7, 0); ctx.moveTo(7, 0); ctx.lineTo(13, -4); ctx.lineTo(13, 4); ctx.closePath();
  ctx.fillStyle = "rgba(10,44,92,.45)"; ctx.fill(); ctx.restore() }
function prism(d, depth, top) {
  poly([d[3], d[2], [d[2][0], d[2][1] + depth], [d[3][0], d[3][1] + depth]], shade(top, .38));
  poly([d[2], d[1], [d[1][0], d[1][1] + depth], [d[2][0], d[2][1] + depth]], shade(top, .22));
  poly(d, top); line([d[3], d[0], d[1]], mix(top, .3), 2);
}
// ---------- the sea around the island: deep water with waves and fish; goal tiles (~) are bright shallows
const isWater = p => inside(...p) && TYPES[p[1]][p[0]] === "~"; // the sea goal (~) stays the brightest water so you can tell where to go
function seaCell(p, t) {
  const o = iso(p[0], p[1], 0), d = [[o.x, o.y - TH/2], [o.x + TW/2, o.y], [o.x, o.y + TH/2], [o.x - TW/2, o.y]], h = hsh(p[0], p[1]);
  const far = Math.max(-p[0], -p[1], p[0] - W + 1, p[1] - H + 1); // 1..RING
  let coast = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isWater([p[0] + dx, p[1] + dy])) coast = true;
  prism(d, 6, coast ? "#3d88cf" : COL.deep); if (far > 1) poly(d, `rgba(20,60,120,${.12 * (far - 1)})`);
  if (coast && h % 3 === 0) { ctx.globalAlpha = .45 + .25 * Math.sin(t * 1.8 + h); line([[o.x - 10, o.y - 2], [o.x + 6, o.y - 2]], "#ffffff", 2); ctx.globalAlpha = 1 }
  if (h % 5 === 0) fish(o.x + Math.sin(t * .7 + h) * 8, o.y + 2, Math.cos(t * .7 + h) > 0 ? 1 : -1);
  else if (h % 4 === 2) { ctx.globalAlpha = .25 + .2 * Math.sin(t * 1.5 + h); line([[o.x - 12, o.y], [o.x - 6, o.y - 4], [o.x, o.y], [o.x + 6, o.y + 4], [o.x + 12, o.y]], "#ffffff", 2); ctx.globalAlpha = 1 }
}
// Foam where the island's front faces meet the water.
function foam(p, d, lv, t) {
  for (const [dx, dy, a, b] of [[0, 1, 3, 2], [1, 0, 2, 1]]) { if (!isWater([p[0] + dx, p[1] + dy])) continue;
    const y = lv * ZH, w = reduce ? 0 : Math.sin(t * 2 + p[0] + p[1]) * 1.5;
    line([[d[a][0], d[a][1] + y + 2 + w], [(d[a][0] + d[b][0]) / 2, (d[a][1] + d[b][1]) / 2 + y + 4 - w], [d[b][0], d[b][1] + y + 2 + w]], "rgba(255,255,255,.75)", 2.5) }
}
// ---------- banks: the river is a channel cut into the land, lakes get a shoreline
const gp = (x, y, u, v, lv) => { const o = iso(x + u, y + v, lv); return [o.x, o.y] };
const same = (q, p) => !!q && q + "" === p + "";
const linked = (a, b) => { const A = at(a), B = at(b); return A.river && B.river && (same(B.from, a) || same(A.from, b) || same(A.to, b) || same(B.to, a)) };
// Water flows in: a new tile first fills the arm of the tile it comes from, then its own arm to the centre.
// The river (LOU-268): a channel cut into the land (banks in the tile's own colour), light water at the edges and deep blue
// down the middle, rounded at the bends, with ripples drifting downstream (faster with more flow) and glints on the surface.
const RW = {bank:31, edge:22, deep:11}, RCOL = {edge:"#62b9f0", deep:"#2f86c9", foam:"rgba(255,255,255,.85)"};
// The shape of the river on one tile. All river tiles are drawn together in layers after the land (banks, then water,
// then ripples), so one tile's bank never covers the next tile's water: no seams at tile edges.
function chanGeom(p, lv, top) {
  const [x, y] = p, me = at(p), kp = prog(p + "");
  const arms = nbrs(p).filter(n => linked(p, n)).map(n => { const down = same(at(n).from, p) || same(me.to, n);
    return {n, dx:n[0] - x, dy:n[1] - y, down, sea:at(n).t === "ocean", k:down ? clamp01(prog(n + "") * 2) : clamp01(kp * 2 - 1)} });
  const up = arms.some(a => !a.down), kc = up ? clamp01(kp * 2 - 1) : 1;
  const P = (u, v) => gp(x, y, u, v, lv), C = P(0, 0);
  const full = !arms.some(a => a.sea) && arms.length === 2 && arms.every(a => a.k >= 1) && kc >= 1;
  const ups = arms.filter(a => !a.down), downs = arms.filter(a => a.down);
  const curve = full ? (() => { const a = ups[0] || arms[0], b = downs.find(d => d !== a) || arms.find(d => d !== a);
    return [P(a.dx * .5, a.dy * .5), C, P(b.dx * .5, b.dy * .5)] })() : null;
  // each arm runs upstream -> downstream: an upstream arm edge -> centre, a downstream one centre -> edge
  const segs = arms.map(a => { if (a.down) { const s = .5 * a.k; return s > 0 ? Object.assign([C, P(a.dx * s, a.dy * s)], {sea:a.sea && a.k >= 1}) : null }
    const s = .5 * (1 - a.k); return a.k > 0 ? [P(a.dx * .5, a.dy * .5), P(a.dx * s, a.dy * s)] : null }).filter(Boolean);
  return {p, me, arms, kc, P, C, curve, segs, top};
}
function chanStroke(g, w, col, dash) {
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = col; ctx.lineWidth = w;
  if (dash) { ctx.setLineDash(dash.d); ctx.lineDashOffset = dash.o }
  ctx.beginPath();
  if (g.curve) { ctx.moveTo(...g.curve[0]); ctx.quadraticCurveTo(...g.curve[1], ...g.curve[2]) }
  else { for (const s of g.segs) { if (s.sea && !dash) continue; ctx.moveTo(...s[0]); ctx.lineTo(...s[1]) }
    if (!dash && g.kc > 0) { ctx.moveTo(g.C[0] + .01, g.C[1]); ctx.lineTo(g.C[0], g.C[1]) } } // a round dot joins the arms at the centre
  ctx.stroke();
  if (!dash && g.segs.some(s => s.sea)) { ctx.lineCap = "butt"; ctx.beginPath(); for (const s of g.segs) if (s.sea) { ctx.moveTo(...s[0]); ctx.lineTo(...s[1]) } ctx.stroke() } // flat where it pours into the sea
  ctx.restore() }
function drawRivers(list, t) {
  const gs = list.map(([p, lv, top]) => chanGeom(p, lv, top));
  for (const g of gs) chanStroke(g, RW.bank, shade(g.top, .42));
  for (const g of gs) chanStroke(g, RW.bank - 5, shade(g.top, .6));
  for (const g of gs) chanStroke(g, RW.edge, RCOL.edge);
  for (const g of gs) chanStroke(g, RW.deep, RCOL.deep);
  for (const g of gs) { const [x, y] = g.p, f = Math.min(6, flowOf(g.me.rid >= 0 ? g.me.rid : S.active)); // ripples drift downstream; more flow, faster and brighter
    chanStroke(g, 2.2, `rgba(225,244,255,${.55 + .06 * f})`, {d:[6, 13], o:reduce ? 0 : -t * (14 + 5 * f) - hsh(x, y) * .4}) }
  for (const g of gs) { const [x, y] = g.p, {arms, P, me} = g;
    // glints that come and go on the surface
    if (g.kc >= 1 && arms.length) { const hh = hsh(x, y); for (let i = 0; i < 2; i++) { const k = reduce ? .5 : (t * .55 + hh * .13 + i * .5) % 1, a = Math.pow(Math.sin(k * Math.PI), 6);
      if (a < .05) continue; const arm = arms[i % arms.length], s = .12 + .22 * ((hh + i * 3) % 5) / 5, [gx, gy] = P(arm.dx * s + (i ? .05 : -.05), arm.dy * s);
      ctx.globalAlpha = a; poly([[gx, gy - 3.2], [gx + 1, gy - 1], [gx + 3.2, gy], [gx + 1, gy + 1], [gx, gy + 3.2], [gx - 1, gy + 1], [gx - 3.2, gy], [gx - 1, gy - 1]], "#ffffff"); ctx.globalAlpha = 1 } }
    // joins: a foam line where the river meets a full lake or another river
    for (const a of arms) { if (a.k < 1) continue; const n = at(a.n), other = n.river && n.rid >= 0 && me.rid >= 0 && root(n.rid) !== root(me.rid);
      if (n.t !== "lake" && !other && !(n.river && n.rid !== me.rid && a.down)) continue;
      const [ex, ey] = P(a.dx * .44, a.dy * .44), w = reduce ? 0 : Math.sin(t * 3 + x + y) * 1.2; ctx.globalAlpha = .8;
      ell(ex - 3, ey + w * .5, 3.2, 1.8, "#ffffff"); ell(ex + 4, ey - 1 - w * .5, 2.6, 1.5, "#ffffff"); ell(ex, ey + 2, 2, 1.2, "#e6f6ff"); ctx.globalAlpha = 1 }
    const o = iso(x, y, drawLevel(g.p));
    if (me.t === "source") source(o, t); else if (me.beaver) lodge(o.x, o.y, me.beaver === 2, t, hsh(x, y)) }
}
// The river's mouth at the sea: the water fans out and foams instead of stopping at a hard edge.
function mouth(p, t) { const [x, y] = p, from = nbrs(p).find(n => linked(p, n)); if (!from) return;
  const dx = from[0] - x, dy = from[1] - y, P = (u, v) => gp(x, y, u, v, 0), px = -dy, py = dx, k = prog(p + "");
  if (k <= 0) return; ctx.globalAlpha = k;
  // a short waterfall from the land's edge down to the sea
  const lv = drawLevel(from), top = topColor(at(from)), U = (u, v) => gp(x, y, u, v, lv);
  const strip = (w, fill) => poly([U(dx * .5 + px * w, dy * .5 + py * w), U(dx * .5 - px * w, dy * .5 - py * w), P(dx * .5 - px * w, dy * .5 - py * w), P(dx * .5 + px * w, dy * .5 + py * w)], fill);
  if (lv > 0) { strip(.29, shade(top, .42)); strip(.2, RCOL.edge); strip(.1, RCOL.deep);
    ctx.save(); ctx.setLineDash([3, 5]); ctx.lineDashOffset = reduce ? 0 : -t * 30; const [ax, ay] = U(dx * .5, dy * .5), [bx, by] = P(dx * .5, dy * .5); line([[ax, ay], [bx, by]], "rgba(230,246,255,.9)", 2); ctx.restore() }
  poly([P(dx * .5 + px * .2, dy * .5 + py * .2), P(dx * .5 - px * .2, dy * .5 - py * .2), P(dx * .05 - px * .42, dy * .05 - py * .42), P(dx * .05 + px * .42, dy * .05 + py * .42)], "rgba(124,200,245,.75)");
  poly([P(dx * .5 + px * .1, dy * .5 + py * .1), P(dx * .5 - px * .1, dy * .5 - py * .1), P(dx * .15 - px * .25, dy * .15 - py * .25), P(dx * .15 + px * .25, dy * .15 + py * .25)], "rgba(74,163,232,.85)");
  for (let i = 0; i < 5; i++) { const s = -.36 + i * .18, w = reduce ? 0 : Math.sin(t * 2.4 + i * 1.3) * .03, [fx, fy] = P(dx * (.06 + w) + px * s, dy * (.06 + w) + py * s);
    ell(fx, fy, 3.4 - Math.abs(s) * 2, 1.7, RCOL.foam) }
  ctx.globalAlpha = 1 }
function shore(p, lv) {
  const [x, y] = p, me = at(p);
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const n = [x + dx, y + dy];
    if (inside(...n) && (at(n).lake === me.lake && me.lake >= 0 || linked(p, n))) continue;
    const px = -dy, py = dx, a = .5, b = .37;
    poly([gp(x, y, dx * a + px * .5, dy * a + py * .5, lv), gp(x, y, dx * a - px * .5, dy * a - py * .5, lv), gp(x, y, dx * b - px * .5, dy * b - py * .5, lv), gp(x, y, dx * b + px * .5, dy * b + py * .5, lv)], "#e6d29c");
    ctx.strokeStyle = "#7d5f3c"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(...gp(x, y, dx * b + px * .5, dy * b + py * .5, lv)); ctx.lineTo(...gp(x, y, dx * b - px * .5, dy * b - py * .5, lv)); ctx.stroke() }
}
// Distance along the river from its source, for the shimmer that runs down it when a turn ends.
function riverDist() {
  const dist = new Map(), q = [];
  for (const r of S.rivers) if (r.src) { dist.set(r.src + "", 0); q.push(r.src) }
  while (q.length) { const p = q.shift(), d = dist.get(p + "");
    for (const n of nbrs(p)) if (!dist.has(n + "") && at(n).river && (linked(p, n) || (at(n).t === "lake" && at(p).t === "lake" && at(n).lake === at(p).lake))) { dist.set(n + "", d + 1); q.push(n) } }
  return dist }
function draw() {
  if (!S) return; objCheck();
  const T = now(), t = (T - t0) / 1000, mv = moves(), aim = objAim();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#2b68b0"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(scale, 0, 0, scale, off.x, off.y);
  const badges = [], wd = T - wave < 4000 ? riverDist() : null, riv = [], mouths = [];
  // three passes: the land, then the river on top of it (so it runs as one piece), then everything standing on the land
  for (const p of CELLS) {
    if (!inside(...p)) { seaCell(p, t); continue }
    const c = at(p), lv = drawLevel(p), d = diamond(p, lv), filling = c.t === "lake" && c.river && prog(p + "") < 1;
    const base = filling ? COL.lake : topColor(c), o = iso(p[0], p[1], lv), h = hsh(...p);
    prism(d, c.t === "ocean" ? 6 : lv * ZH + 14, base);
    if (filling) { ctx.globalAlpha = prog(p + ""); poly(d, COL.river); ctx.globalAlpha = 1 }
    if (c.t !== "ocean") foam(p, d, lv, t);
    if (c.river && c.t === "lake") { shore(p, lv); if (h % 3 === 0 && !filling) { ell(o.x - 6, o.y + 3, 8, 4, "#4caf50"); ell(o.x + 12, o.y - 5, 4, 2, "#7fd36b") } }
    else if (c.river && c.t !== "ocean") riv.push([p, lv, base]);
    else if (c.river && c.t === "ocean") mouths.push(p);
  }
  drawRivers(riv, t); for (const q of mouths) mouth(q, t);
  for (const p of ORDER) {
    const c = at(p), lv = drawLevel(p), d = diamond(p, lv), o = iso(p[0], p[1], lv), h = hsh(...p);
    const kg = prog("g:" + p), s = kg < 1 ? easeBack(kg) : 1;
    if (s !== 1) { ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s, s); ctx.translate(-o.x, -o.y) }
    deco(p, c, o, t, h);
    if (s !== 1) ctx.restore();
    if (aim && !aim.has(p + "")) poly(d, "rgba(8,20,32,.2)"); // the objective's target stays bright, the rest dims a little
    if (wd && c.river && wd.has(p + "")) { const k = (T - wave - wd.get(p + "") * 90) / 450; if (k > 0 && k < 1) { ctx.globalAlpha = Math.sin(k * Math.PI) * .45; poly(d, "#e6f6ff"); ctx.globalAlpha = 1 } }
    const m = hsel && S.phase === "play" ? mv.get(p + "") : null, pk = c.t === "source" && !c.river && ((S.phase === "pick" && (!M.mainSource || p + "" === M.mainSource + "")) || (TRIB && S.phase === "play"));
    if (m || pk) {
      const ok = pk || S.water >= m.cost, pulse = reduce ? 1 : .6 + .4 * Math.sin(t * 4);
      poly(d, ok ? `rgba(255,255,255,${.12 + .1 * pulse})` : "rgba(150,160,168,.28)");
      ctx.strokeStyle = ok ? `rgba(255,255,255,${pulse})` : "rgba(205,212,217,.85)"; ctx.lineWidth = 3.5; ctx.stroke();
      badges.push({o, pk, ok, text: pk ? `+${c.yield}` : m.cost, sand: !!m && c.t === "sand"});
    } else if (c.ro === 1 && !c.river) { badges.push({o, drop:true});
    } else if (PLACE && S.phase === "pick" && placeable(p)) { // tiles you can place a source on glow softly (LOU-263)
      poly(d, `rgba(255,255,255,${.1 + (reduce ? 0 : .06 * Math.sin(t * 2.5 + h))})`);
    } else if (plantable(p)) {
      ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = S.water >= PLANT_COST ? "rgba(214,255,170,.6)" : "rgba(255,255,255,.2)"; ctx.lineWidth = 2; poly(d, "rgba(0,0,0,0)"); ctx.stroke(); ctx.restore();
      badges.push({o, plant:true, ok:S.water >= PLANT_COST});
    }
  }
  // groves: a golden thread through the tiles and the flow they give; bees hover over the meadows that pollinate them
  for (const k of combos()) { for (const q of k.bees) { const o = iso(q[0], q[1], drawLevel(q)), h = hsh(...q), b = reduce ? 0 : t * 2.2 + h;
      bee(o.x - 10 + Math.cos(b) * 12, o.y - 16 + Math.sin(b * 1.7) * 5); bee(o.x + 12 + Math.sin(b * .8) * 9, o.y - 8 + Math.cos(b * 1.3) * 4) } const pts = k.tiles.map(q => { const o = iso(q[0], q[1], drawLevel(q)); return [o.x, o.y + 6] });
    ctx.save(); ctx.setLineDash([3, 6]); ctx.lineDashOffset = reduce ? 0 : -t * 12; line(pts, "rgba(255,209,102,.95)", 3); ctx.restore();
    const mid = pts[Math.floor(pts.length / 2)]; badges.push({o:{x:mid[0], y:mid[1] - 30}, combo:`+${k.bonus}`}) }
  // fish come to long rivers
  const rl = fishCount(); if (rl) { let i = 0; for (const p of ORDER) { const c = at(p); if (!c.river || c.t === "source" || c.t === "ocean" || c.t === "lake" || hsh(...p) % 3) continue; if (i++ >= rl) break;
    const o = iso(p[0], p[1], drawLevel(p)), k = reduce ? 0 : Math.sin(t * 1.4 + hsh(...p)); fish(o.x + k * 10, o.y + 1, Math.cos(t * 1.4 + hsh(...p)) > 0 ? 1 : -1) } }
  for (let i = deer.length - 1; i >= 0; i--) { const d = deer[i], k = (T - d.t0) / 2600; if (k >= 1 || reduce) { deer.splice(i, 1); continue }
    const o = iso(d.p[0], d.p[1], drawLevel(d.p)); ctx.globalAlpha = Math.min(1, Math.sin(k * Math.PI) * 2); deerSprite(o.x + 8 - k * 20, o.y - 4, Math.sin(t * 6) * 2); ctx.globalAlpha = 1 }
  for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i], k = (T - b.t0) / 700; if (k >= 1 || reduce) { bolts.splice(i, 1); continue }
    const o = iso(b.p[0], b.p[1], drawLevel(b.p)); ctx.globalAlpha = 1 - k; line([[o.x + 10, o.y - 160], [o.x - 6, o.y - 100], [o.x + 8, o.y - 90], [o.x - 4, o.y - 20]], "#fff6b0", 5); line([[o.x + 10, o.y - 160], [o.x - 6, o.y - 100], [o.x + 8, o.y - 90], [o.x - 4, o.y - 20]], "#ffffff", 2); ctx.globalAlpha = 1 }
  // the end of each stream: a soft pulse says "tap me"; selected, it gets a bold white ring with a teal edge
  for (const i of liveRivers()) for (const q of headTiles(i)) { const d = diamond(q, drawLevel(q)), on = hsel && i === S.active, k = reduce ? 1 : .5 + .5 * Math.sin(t * (on ? 6 : 3));
    if (on) { const o = iso(q[0], q[1], drawLevel(q)), s = 1.04 + .05 * k, dd = d.map(([x, y]) => [o.x + (x - o.x) * s, o.y + (y - o.y) * s]);
      poly(dd, "rgba(98,224,200,.18)"); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.stroke(); poly(dd, "rgba(0,0,0,0)"); ctx.strokeStyle = "#62e0c8"; ctx.lineWidth = 2.5; ctx.stroke() }
    else { ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = reduce ? 0 : -t * 10; poly(d, "rgba(0,0,0,0)"); ctx.strokeStyle = `rgba(255,255,255,${.45 + .4 * k})`; ctx.lineWidth = 3; ctx.stroke(); ctx.restore() } }
  if (aim) { const k = reduce ? 1 : .55 + .45 * Math.sin(t * 4.5); for (const key of aim) { const q = key.split(",").map(Number), d = diamond(q, drawLevel(q)), o = iso(q[0], q[1], drawLevel(q)), s = 1.02 + .06 * k;
    poly(d.map(([x, y]) => [o.x + (x - o.x) * s, o.y + (y - o.y) * s]), "rgba(0,0,0,0)"); ctx.strokeStyle = `rgba(255,209,102,${.5 + .5 * k})`; ctx.lineWidth = 4; ctx.stroke() } }
  if (sel) { const d = diamond(sel); poly(d, "rgba(255,209,102,.22)"); ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 4.5; ctx.stroke() }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i], k = (T - r.t0) / 350; if (k >= 1) { rings.splice(i, 1); continue }
    const d = diamond(r.p), o = iso(r.p[0], r.p[1], drawLevel(r.p)), s = 1 + k * .25;
    poly(d.map(([x, y]) => [o.x + (x - o.x) * s, o.y + (y - o.y) * s]), "rgba(0,0,0,0)"); ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3; ctx.stroke() }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const b of badges) badge(b, t);
  // drifting clouds at the corners, and wind streaks on maps with wind
  const cs = [[B.x + B.w - 30, B.y + 40, 1.1], [B.x + 20, B.y + B.h - 10, 1.25], [B.x + B.w + 10, B.y + B.h * .7, .9]];
  cs.forEach(([x, y, s], i) => { ctx.globalAlpha = .92; cloud(x + (reduce ? 0 : Math.sin(t * .15 + i * 2) * 14), y + (reduce ? 0 : Math.cos(t * .12 + i) * 4), s); ctx.globalAlpha = 1 });
  if (WIND && !reduce) { const sx = -(WIND[0] - WIND[1]) * TW / 2, sy = -(WIND[0] + WIND[1]) * TH / 2, L = Math.hypot(sx, sy), ux = sx / L, uy = sy / L;
    for (let i = 0; i < 4; i++) { const k = ((t * .1 + i / 4) % 1), cx = B.x + B.w * ((hsh(i, 3) % 70) / 100 + .15), cy = B.y + B.h * ((hsh(3, i) % 70) / 100 + .15);
      const x = cx + ux * (k - .5) * 160, y = cy + uy * (k - .5) * 160, px = -uy, py = ux; // a short gust with a curl at the end
      ctx.globalAlpha = Math.sin(k * Math.PI) * .55; ctx.beginPath(); ctx.moveTo(x - ux * 34, y - uy * 34);
      ctx.quadraticCurveTo(x, y + 4, x + ux * 14 + px * 2, y + uy * 14 + py * 2); ctx.arc(x + ux * 14 + px * 8, y + uy * 14 + py * 8, 6, Math.atan2(-py, -px), Math.atan2(-py, -px) + 4.2);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.stroke(); ctx.globalAlpha = 1 } }
  // the water cycle: clouds drift from where they spilled to where they'll rain; rain falls in streaks
  for (const c of S.clouds || []) { const k = clamp01(1 - (c.turn - S.turn - 1) / 2 + (reduce ? 0 : .08 * Math.sin(t * .8))), a = c.from || c.to, b = c.to || c.from; if (!a) continue;
    const oa = iso(a[0], a[1], 0), ob = iso(b[0], b[1], 0), x = oa.x + (ob.x - oa.x) * k, y = oa.y + (ob.y - oa.y) * k - 92 + (reduce ? 0 : Math.sin(t * 1.3) * 3);
    ctx.globalAlpha = .95; cloud(x, y, .5); ctx.globalAlpha = 1; ell(x + 26, y - 14, 15, 11, "#1f6fb0"); ctx.fillStyle = "#fff"; ctx.font = "700 13px Fredoka, Nunito, sans-serif"; ctx.fillText(`+${c.gal}`, x + 26, y - 13);
    if (c.turn === S.turn + 1 && !reduce) { ctx.globalAlpha = .5; for (let i = 0; i < 5; i++) { const dx = -22 + i * 11, dy = ((t * 60 + i * 13) % 26); line([[x + dx, y + 12 + dy], [x + dx - 3, y + 20 + dy]], "#9fd4ff", 2) } ctx.globalAlpha = 1 } }
  for (let i = rains.length - 1; i >= 0; i--) { const r = rains[i], k = (T - r.t0) / 1600; if (k >= 1 || reduce) { rains.splice(i, 1); continue }
    const o = iso(r.p[0], r.p[1], drawLevel(r.p)); ctx.globalAlpha = Math.sin(k * Math.PI); cloud(o.x, o.y - 100, .6);
    for (let j = 0; j < 9; j++) { const dx = -30 + j * 7.5, dy = ((k * 400 + j * 17) % 70); line([[o.x + dx, o.y - 86 + dy], [o.x + dx - 4, o.y - 74 + dy]], "#9fd4ff", 2.2) } ctx.globalAlpha = 1 }
  for (let i = birds.length - 1; i >= 0; i--) { const b = birds[i], k = (T - b.t0) / 1100; if (k >= 1 || reduce) { birds.splice(i, 1); continue } if (k < 0) continue;
    const oa = iso(b.from[0], b.from[1], 0), ob = iso(b.to[0], b.to[1], 0), x = oa.x + (ob.x - oa.x) * k, y = oa.y + (ob.y - oa.y) * k - 40 - Math.sin(k * Math.PI) * 50, f = Math.sin(t * 22) * 6;
    line([[x - 11, y - f], [x - 4, y - 2], [x, y + 1], [x + 4, y - 2], [x + 11, y - f]], "#2a2f3a", 2.6); ell(x + 2, y + 6, 2.2, 2.2, "#ffe066") }
  if (sky && !reduce) { const k = (T - sky.t0) / 2200; if (k >= 1) sky = null; else { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const a = Math.sin(k * Math.PI);
    if (sky.kind === "rain") { ctx.strokeStyle = `rgba(200,230,255,${.55 * a})`; ctx.lineWidth = 2 * lay.dpr; ctx.beginPath(); for (let j = 0; j < 70; j++) { const x = (hsh(j, 1) / 97) * cv.width, y = ((hsh(1, j) / 97) * cv.height + k * cv.height * 1.6) % cv.height; ctx.moveTo(x, y); ctx.lineTo(x - 6 * lay.dpr, y + 22 * lay.dpr) } ctx.stroke() }
    else { ctx.fillStyle = `rgba(255,190,90,${.22 * a})`; ctx.fillRect(0, 0, cv.width, cv.height) }
    ctx.restore() } }
  // floating numbers: what a move gave or cost
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i], k = (T - f.t0) / 1300; if (k >= 1) { fx.splice(i, 1); continue } if (k < 0) continue;
    const o = iso(f.p[0], f.p[1], drawLevel(f.p)), y = o.y - 34 - 46 * (1 - Math.pow(1 - k, 2));
    ctx.globalAlpha = k < .75 ? 1 : (1 - k) / .25; ctx.font = "700 19px Fredoka, Nunito, sans-serif";
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(8,24,38,.85)"; ctx.lineJoin = "round"; ctx.strokeText(f.text, o.x, y); ctx.fillStyle = f.col; ctx.fillText(f.text, o.x, y); ctx.globalAlpha = 1 }
}
function badge(b, t) {
  const {o} = b;
  if (b.combo) { ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(o.x - 24, o.y - 12, 48, 24, 12) : ctx.rect(o.x - 24, o.y - 12, 48, 24); ctx.fill();
    ctx.fillStyle = "#3a2600"; ctx.font = "700 14px Fredoka, Nunito, sans-serif"; ctx.fillText(b.combo + " flow", o.x, o.y + 1); return }
  if (b.drop) { const bob = reduce ? 0 : Math.sin(t * 2.6 + o.x * .05) * 2, x = o.x + 12, y = o.y - 22 + bob; // a teal "+1 flow" drop until the river claims it
    ell(x, y + 14, 7, 2.5, "rgba(0,0,0,.2)");
    ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.bezierCurveTo(x + 4, y - 7, x + 10, y - 2, x + 10, y + 3); ctx.arc(x, y + 3, 10, 0, Math.PI); ctx.bezierCurveTo(x - 10, y - 2, x - 4, y - 7, x, y - 13);
    ctx.fillStyle = "#62e0c8"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
    ctx.fillStyle = "#0b3a32"; ctx.font = "700 12px Fredoka, Nunito, sans-serif"; ctx.fillText("+1", x, y + 4); return }
  if (b.plant) { const x = o.x, y = o.y + 1; ell(x, y + 2, 12, 12, "rgba(0,0,0,.25)"); ell(x, y, 12, 12, b.ok ? "#3f9a3f" : "rgba(8,24,38,.55)");
    ctx.fillStyle = b.ok ? "#d6ffaa" : "#9bb6c6"; ctx.beginPath(); ctx.moveTo(x - 5, y + 5); ctx.quadraticCurveTo(x - 6, y - 6, x + 6, y - 6); ctx.quadraticCurveTo(x + 6, y + 5, x - 5, y + 5); ctx.fill(); return }
  const r = b.pk ? 19 : 15, bob = reduce ? 0 : Math.sin(t * 3 + o.x * .05) * 1.5, y = o.y - 4 + bob;
  ell(o.x, y + 3, r, r, "rgba(0,0,0,.3)"); ell(o.x, y, r, r, b.pk ? "#ffffff" : b.ok ? "#1f6fb0" : "#7d8a93");
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  ctx.fillStyle = b.pk ? "#13222e" : "#fff"; ctx.font = `700 ${b.pk ? 16 : 18}px Fredoka, Nunito, sans-serif`; ctx.fillText(b.text, o.x, y + 1);
  if (b.sand) { ctx.fillStyle = "#62e0c8"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(o.x - 27, y + 15, 54, 20, 10) : ctx.rect(o.x - 27, y + 15, 54, 20); ctx.fill();
    ctx.fillStyle = "#0b3a32"; ctx.font = "700 12px Fredoka, Nunito, sans-serif"; ctx.fillText("−1 flow", o.x, y + 26) }
}
function source(o, t) { // a bubbling spring at the source: a stone ring, rings of water spreading out, and a little fountain
  const b = reduce ? 0 : Math.sin(t * 5) * 2;
  ell(o.x, o.y + 2, 21, 10.5, "#7d8a93"); ell(o.x, o.y, 16, 8, "#4aa3e8"); ell(o.x - 3, o.y - 1, 9, 4, "#8fd0ff");
  if (!reduce) for (let i = 0; i < 2; i++) { const k = (t * .7 + i * .5) % 1; ctx.globalAlpha = (1 - k) * .8; ctx.beginPath(); ctx.ellipse(o.x, o.y, 4 + k * 11, 2 + k * 5.5, 0, 0, 7); ctx.strokeStyle = "#e6f6ff"; ctx.lineWidth = 1.4; ctx.stroke(); ctx.globalAlpha = 1 }
  ctx.beginPath(); ctx.moveTo(o.x, o.y - 2); ctx.quadraticCurveTo(o.x - 9, o.y - 13 - b, o.x, o.y - 30 - b); ctx.quadraticCurveTo(o.x + 9, o.y - 13 - b, o.x, o.y - 2); ctx.fillStyle = "#dff3ff"; ctx.fill();
  ell(o.x - 8, o.y - 13 + b, 2, 2, "#ffffff"); ell(o.x + 8, o.y - 18 - b, 1.6, 1.6, "#ffffff");
}
function lodge(cx, cy, pond, t, h) { // a beaver lodge on the bank of a river tile; once dammed, a stick dam across the water
  if (pond) { for (let i = 0; i < 5; i++) line([[cx - 14 + i * 6, cy + 4 + i * 1.5], [cx - 9 + i * 6, cy - 2 + i * 1.5]], "#6b4a2b", 3);
    ctx.globalAlpha = .6 + .3 * Math.sin(t * 2 + h); ell(cx - 6, cy - 3, 3, 1.5, "#ffffff"); ctx.globalAlpha = 1 }
  const x = cx + 13, y = cy - 6; ell(x + 1, y + 4, 11, 4, "rgba(0,0,0,.2)"); ctx.beginPath(); ctx.ellipse(x, y, 10, 8, 0, Math.PI, 0); ctx.fillStyle = "#7a5233"; ctx.fill();
  for (let i = 0; i < 4; i++) line([[x - 9 + i * 5, y], [x - 6 + i * 4, y - 6 - (i % 2) * 2]], "#5a3a20", 1.6); ell(x, y - 1, 2.5, 2, "#2a1a0e") }
function deco(p, c, o, t, h) {
  const {x: cx, y: cy} = o, sway = reduce ? 0 : Math.sin(t * 1.6 + h) * 1.2;
  if (c.river) return; // river tiles are drawn with the river (drawRivers)
  if (c.t === "ocean") { const w = reduce ? 0 : Math.sin(t * 2 + p[0] + p[1]) * 3; if (h % 3 === 0) line([[cx - 10 + w, cy - 2], [cx + 6 + w, cy - 2]], "rgba(255,255,255,.6)", 2);
    ctx.globalAlpha = .5 + .3 * Math.sin(t * 2 + h); line([[cx - 16, cy + 6], [cx - 8, cy + 3], [cx, cy + 6], [cx + 8, cy + 3]], "#ffffff", 1.8); ctx.globalAlpha = 1; return }
  if (c.t === "source") { source(o, t); return }
  if (c.fire) { pine(cx - 12, cy + 1, .75, true); pine(cx + 11, cy - 3, .8, true);
    for (let i = 0; i < 4; i++) { const fx0 = cx - 15 + i * 10, fl = reduce ? 1 : .8 + .3 * Math.sin(t * 9 + i * 2), fy = cy - 6 - i % 2 * 8;
      ctx.beginPath(); ctx.moveTo(fx0 - 6, fy + 8); ctx.quadraticCurveTo(fx0 - 7, fy - 8 * fl, fx0, fy - 20 * fl); ctx.quadraticCurveTo(fx0 + 7, fy - 8 * fl, fx0 + 6, fy + 8); ctx.fillStyle = "#ff7a2a"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx0 - 3, fy + 7); ctx.quadraticCurveTo(fx0 - 3, fy - 3 * fl, fx0, fy - 10 * fl); ctx.quadraticCurveTo(fx0 + 3, fy - 3 * fl, fx0 + 3, fy + 7); ctx.fillStyle = "#ffe066"; ctx.fill() }
    ctx.globalAlpha = .35; ell(cx + 4, cy - 40 - (t * 20 % 20), 10, 7, "#555"); ctx.globalAlpha = 1; return }
  if (c.g >= TREES) { tufts(cx, cy, h + 2, sway); pine(cx - 15, cy + 1, .75, c.wild); pine(cx + 13, cy - 4, .85, c.wild); pine(cx - 1, cy + 9, 1, c.wild); if (c.wild) pine(cx + 2, cy - 12, .7, true); return }
  if ((c.t === "meadow" && !c.g) || c.g === MEADOW) { meadow(cx, cy, h, c.bloom || c.g === MEADOW); return }
  if (c.g === 1 || (c.bloom && c.t !== "spring")) { tufts(cx, cy, h, sway); return }
  if (c.ro) { // runoff: a small pool fed by the mountain
    ell(cx, cy + 1, 15, 7.5, c.ro === 2 ? "#2f86c9" : "#3e7fb3"); ell(cx - 2, cy, 9, 4.5, "#7ccbf7");
    if (c.ro === 1) { const a = reduce ? 1 : .6 + .4 * Math.sin(t * 3 + h); ctx.globalAlpha = a; ell(cx + 9, cy - 8, 2, 2, "#ffffff"); ell(cx - 8, cy - 4, 1.5, 1.5, "#ffffff"); ctx.globalAlpha = 1 } }
  if (c.beaver === 1) { ell(cx + 2, cy + 6, 22, 7, "rgba(0,0,0,.2)"); ctx.beginPath(); ctx.ellipse(cx, cy, 20, 13, 0, Math.PI, 0); ctx.fillStyle = "#7a5233"; ctx.fill();
    for (let i = 0; i < 6; i++) line([[cx - 18 + i * 7, cy - 1], [cx - 12 + i * 6, cy - 10 - (i % 2) * 3]], "#5a3a20", 2); ell(cx, cy - 1, 4, 3, "#2a1a0e"); return }
  if (c.beaver === 2) { ell(cx, cy + 1, 23, 11.5, "#2f86c9"); ell(cx - 3, cy, 15, 7, "#7ccbf7"); for (let i = 0; i < 5; i++) line([[cx + 10 + i * 2, cy + 9 - i * 3], [cx + 18 + i * 2, cy + 7 - i * 3]], "#6b4a2b", 2.5);
    ctx.globalAlpha = .6 + .3 * Math.sin(t * 2 + h); ell(cx - 8, cy - 2, 3, 1.5, "#ffffff"); ctx.globalAlpha = 1; return }
  if (c.pool) { ell(cx + 1, cy + 2, 19, 9, "#2f86c9"); ell(cx - 2, cy + 1, 13, 6, "#7ccbf7"); ell(cx - 7, cy - 1, 3, 1.4, "#ffffff");
    const k = reduce ? 0 : (t * .8 + h / 10) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(cx + 5, cy + 2, 4 + k * 9, 2 + k * 4.5, 0, 0, 7); ctx.strokeStyle = "#e6f6ff"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1; return }
  if (c.moss && !c.g) { ell(cx - 10, cy + 2, 7, 3.5, "#6fa84a"); ell(cx + 8, cy - 5, 6, 3, "#7cb956"); ell(cx + 3, cy + 7, 5, 2.5, "#5f9a40") }
  if (c.ash && !c.g) { ell(cx - 8, cy + 2, 9, 4, "rgba(40,30,25,.45)"); ell(cx + 9, cy - 4, 7, 3, "rgba(40,30,25,.4)"); line([[cx - 4, cy + 6], [cx + 6, cy + 1]], "#3a2a20", 2) }
  if (M.salt && salty(p) && c.t === "bare" && !c.g) { for (let i = 0; i < 6; i++) ell(cx - 16 + (hsh(i, h) % 32), cy - 7 + (hsh(h, i) % 15), 2.2, 1.2, "#f4f1e8") }
  if (c.t === "bare" && !c.ro) { line([[cx - 15, cy - 2], [cx - 6, cy + 2], [cx + 2, cy - 1]], shade(topColor(c), .25), 1.5); ell(cx + 12, cy + 6, 3, 2, shade(topColor(c), .3)); ell(cx - 6, cy - 10, 2.4, 1.6, mix(topColor(c), .25));
    if (c.rs) { const k = "rgba(70,45,20,.5)"; // dry, cracked ground in the rain shadow
      line([[cx + 4, cy - 8], [cx + 10, cy - 3], [cx + 18, cy - 5]], k, 1.6); line([[cx + 10, cy - 3], [cx + 9, cy + 3]], k, 1.3); line([[cx - 4, cy + 6], [cx + 2, cy + 10], [cx + 9, cy + 9]], k, 1.6);
      line([[cx - 18, cy], [cx - 11, cy - 3], [cx - 9, cy - 9]], k, 1.4); line([[cx - 11, cy - 3], [cx - 6, cy + 1]], k, 1.2) } }
  if (c.t === "sand") { const hi = mix(COL.sand, .5); ctx.beginPath(); ctx.moveTo(cx - 20, cy + 2); ctx.quadraticCurveTo(cx - 10, cy - 4, cx, cy + 2); ctx.moveTo(cx - 4, cy + 10); ctx.quadraticCurveTo(cx + 6, cy + 4, cx + 16, cy + 10);
    ctx.strokeStyle = hi; ctx.lineWidth = 2; ctx.stroke(); ell(cx + 12, cy - 8, 2.6, 1.8, "#f39b6d") }
  if (c.t === "rock") stones(cx, cy);
  if (c.t === "boulder") mountain(cx, cy, t, c.ws);
  if (c.t === "spring") { ell(cx, cy + 1, 17, 8.5, "#2f86c9"); ell(cx - 2, cy, 11, 5, "#7ccbf7");
    const tw = reduce ? 1 : .55 + .45 * Math.sin(t * 3 + h); ctx.save(); ctx.globalAlpha = tw; ctx.translate(cx + 8, cy - 4); ctx.scale(tw, tw);
    poly([[0, -7], [2, -2], [7, 0], [2, 2], [0, 7], [-2, 2], [-7, 0], [-2, -2]], "#ffffff"); ctx.restore() }
  if (c.t === "lake") { line([[cx - 18, cy], [cx - 6, cy + 3], [cx + 2, cy - 4], [cx + 16, cy + 1]], shade(COL.lake, .3), 1.5); line([[cx - 6, cy + 3], [cx - 4, cy + 12]], shade(COL.lake, .3), 1.5);
    ctx.save(); ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(cx, cy, 25, 12.5, 0, 0, 7); ctx.strokeStyle = "#7ccbf7"; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore() }
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
const ptrs = new Map(); let drag = null, dragged = false, holdT = 0, held = false; const HOLD_MS = 420;
const unhold = () => { clearTimeout(holdT); holdT = 0 };
cv.addEventListener("pointerdown", e => {
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY}); try { cv.setPointerCapture(e.pointerId) } catch (_) {}
  const pts = [...ptrs.values()];
  if (pts.length === 1) { drag = {x:e.clientX, y:e.clientY, cx:view.cx, cy:view.cy}; dragged = false; held = false; unhold();
    const hx = e.clientX, hy = e.clientY; holdT = setTimeout(() => { holdT = 0; if (dragged || ptrs.size !== 1 || S.phase !== "play") return;
      const p = tileAt(hx, hy); if (!p) return; held = true; try { navigator.vibrate && navigator.vibrate(12) } catch (_) {} tapTile(p, true) }, HOLD_MS) }
  else if (pts.length === 2) { unhold(); drag = {pinch:Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), z:view.z}; dragged = true }
});
cv.addEventListener("pointermove", e => {
  if (!ptrs.has(e.pointerId) || !drag) return; ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  const pts = [...ptrs.values()];
  if (drag.pinch && pts.length >= 2) { view.z = drag.z * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / drag.pinch; tgt = null; applyView(); return }
  if (drag.pinch) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!dragged && Math.hypot(dx, dy) < 9) return;
  dragged = true; unhold(); tgt = null; const s = lay.fit * view.z; view.cx = drag.cx - dx / s; view.cy = drag.cy - dy / s; applyView();
});
const lift = e => { ptrs.delete(e.pointerId); if (!ptrs.size) drag = null };
cv.addEventListener("pointercancel", e => { unhold(); held = false; lift(e); dragged = false });
cv.addEventListener("contextmenu", e => e.preventDefault()); // a long press opens the tile card, not the browser menu
cv.addEventListener("wheel", e => { e.preventDefault(); view.z *= Math.exp(-e.deltaY * .0015); tgt = null; applyView() }, {passive:false});
$("fitBtn").onclick = () => zoomTo(view.z > 1.02 ? 1 : lay.zAuto); // overview <-> play zoom
cv.addEventListener("pointerup", e => {
  unhold(); const wasDrag = dragged; lift(e); if (held) { held = false; return } if (wasDrag) { if (!ptrs.size) dragged = false; return }
  const p = tileAt(e.clientX, e.clientY);
  if (!p) { closeCard(); if (hsel) { hsel = false; draw() } return }
  if (S.phase === "pick") { if (sel && same(sel, p) && placeable(p)) { closeCard(); return placeSrc(p) } return pick(p) }
  if (S.phase !== "play") return;
  tapTile(p);
});
$("tcard").addEventListener("click", e => {
  if (e.target.closest("#tclose")) { closeCard(); return }
  const rb = e.target.closest("button[data-r]"); if (rb && !rb.disabled && S.phase === "play") { const i = +rb.dataset.r; if (i !== S.active) { activate(i); say(`Now building the ${riverName(i).toLowerCase()}.`) } return }
  const b = e.target.closest("button[data-a]"); if (b && !b.disabled) runAct(cardActs[+b.dataset.a]);
});
$("end").onclick = endTurn; $("undo").onclick = undo; $("restart").onclick = restart; $("again").onclick = restart;
addEventListener("keydown", e => { if (e.key === "Escape") closeCard(); });
addEventListener("keydown", e => { if (e.key === " " && !$("help").open && !$("goal").open) { e.preventDefault(); endTurn() } });
$("helpBtn").onclick = () => { $("hard").checked = hard(); $("help").showModal() };
$("hard").onchange = e => { try { localStorage.setItem(HARD_KEY, e.target.checked ? "1" : "0") } catch (_) {} sync() };
// Map codes: the map as a short text you can share; /custom/#<code> plays it.
function mapCode() { const keep = {...M}; delete keep.help; delete keep.next; delete keep.share; delete keep.startHint;
  const b = new TextEncoder().encode(JSON.stringify(keep)); let bin = ""; b.forEach(x => bin += String.fromCharCode(x)); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") }
$("codeBtn").onclick = async () => { const url = new URL("custom/#" + mapCode(), ROOT).href; let ok = false; try { await navigator.clipboard.writeText(url); ok = true } catch (_) {}
  $("codeBtn").textContent = ok ? "Link copied!" : "Copy failed"; if (!ok) prompt("Map code link:", url); setTimeout(() => $("codeBtn").textContent = "Copy map code", 1800) };
if ($("share")) $("share").onclick = async () => { const sc = score(), n = perfStars(sc.total), txt = `Flow Tile · ${M.label}: ${sc.total} points ${"★".repeat(n)}${"☆".repeat(3 - n)}${sc.sea ? " · reached the sea" : ""}\n${location.href}`;
  try { if (navigator.share) await navigator.share({text:txt}); else { await navigator.clipboard.writeText(txt); $("share").textContent = "Copied!" } } catch (_) {} };
$("help").addEventListener("click", e => { if (e.target === $("help")) $("help").close() }); // tap backdrop to close
$("goal").addEventListener("click", e => { if (e.target === $("goal")) $("goal").close() });
addEventListener("resize", resize);
if (window.ResizeObserver) { const ro = new ResizeObserver(resize); ro.observe($("board")); ro.observe($("top")); ro.observe($("bottom")) }
function loop() { if (tgt) glide(); else draw(); if (!reduce) requestAnimationFrame(loop) }
if (!load()) S = fresh();
// The tutorial: remember a visit, and offer it to a first-time visitor at the site root (LOU-261)
const lsGet = k => { try { return localStorage.getItem(k) } catch (_) { return null } }, lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (_) {} };
if (M.tutorial) lsSet("flowtile.tutorial.seen", "1");
const offer = M.offerTutorial && !lsGet("flowtile.tutorial.seen") && !lsGet("flowtile.tutorial.declined");
$("offer").addEventListener("close", () => { lsSet("flowtile.tutorial.declined", "1"); if (S.phase === "pick" && !S.turn) showGoal() });
if (offer) { try { $("offer").showModal() } catch (_) {} }
else if (S.phase === "pick" && !S.turn) showGoal(); // a new run opens on the map's goal card
sync(); document.fonts && document.fonts.ready.then(() => { lastSize = ""; resize() }); loop();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register(SW_URL).catch(() => {}));

// for debugging / tests
window.FT = {get lay() { return lay }, get S() { return S }, set S(v) { S = v; anim.clear(); fx.length = 0 }, set quiet(v) { quiet = v }, get history() { return history }, get view() { return view }, get sel() { return sel }, moves, plantable, diamond, endTurn, restart, bloomCount, actions, combos, pick, placeSrc, placeable, score, objAim, objCheck, get obj() { return S.obj || 0 }, openInfo() { info = true }, selectHead() { hsel = true }, select(p) { sel = p },
  switchTo(i) { activate(i) },
  act(p, k) { const a = actions(p).find(a => a.k === k); if (!a || !canDo(a)) return false; a.run(); return true },
  tap(p) { const d = diamond(p), r = cv.getBoundingClientRect(), dpr = cv.width / r.width, cx = (d[0][0] + d[2][0]) / 2, cy = (d[0][1] + d[2][1]) / 2;
    cv.dispatchEvent(new PointerEvent("pointerup", {clientX:r.left + (cx * scale + off.x) / dpr, clientY:r.top + (cy * scale + off.y) / dpr, bubbles:true})) }};
})();
