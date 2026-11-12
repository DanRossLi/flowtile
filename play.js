// Flow Tile: shared engine and UI for every map. Maps are flat (Nov 9): no slopes, waterfalls or speed.
// Each map page sets window.MAP before loading this file:
//   id, label, types[], elev[], bloomGoal, turnGoal, startHint, help[] (HTML strings), next (URL or null)
//   lesson: what this map teaches (HTML), shown with the star goals on a goal card when a run starts (Dan, Nov 10)
//   pickHint: message when the player taps a non-source tile before starting (default: startHint)
//   tileCost: every tile costs this many gal before modifiers (default 1)
//   showBloom: show the bloom chip (default: shown when the map has a bloom goal)
//   storage: water cap at the start (turns on bare ground: free grass by the river, meadows store +1 per touching tree, trees make grove flow; LOU-279)
//   tributaries: true lets you tap another source mid-game to start a tributary (Nov 9). It has no water, flow or storage
//     of its own: you build it with the main river's water, and its source (plus springs and runoff it picks up) adds to
//     your flow only once it connects to the main river
//   mainSource: [x, y] of the only source you can start on (others are for tributaries)
//   plantCost: gal to plant grass, meadow or trees (default 1)
//   nextLabel: text for the win card's next button
//   bloomKind: "trees" counts planted trees, "meadows" meadows you grew (trees grown from them count too) for the bloom goal
//   objectives: [{text, target, done: g => …}] (tutorial, LOU-264): one at a time on the map; done is tested after every action
//     with the helpers in G below; target names what to highlight (see objAim)
//   placeSource: true lets you place your source on any bare ground, grass, meadow or sand tile at least 4 tiles from the sea (LOU-263)
// Alpine trees (LOU-235): on storage maps with mountains, grass touching a mountain can grow alpine trees (1 gal). Each one
//   beside your river collects 1 snow per water cycle (2 on a mountain's water side), up to 3. Snow doesn't count against
//   storage and never spills; tap an alpine tree to melt all your snow into water at once, any time (Dan, Nov 11).
// rechannel: true (LOU-238): tap a tile on your river to rechannel from there. Everything downstream becomes dry riverbed,
//   that tile becomes the river's end, and it costs all your water (Dan, Nov 11). Not on tributary maps yet.
// Map code C (LOU-276): caves, paired in reading order (1st with 2nd, 3rd with 4th). Run the river into one for the normal
//   tile cost and it comes out of the other; the land between is skipped. caves: [[[x,y],[x,y]], ...] sets the pairs.
// Map code M (LOU-274): marsh. Next to your river it stores 2 gal; with green on two opposite sides it adds +1 flow.
//   The river can run through it (normal cost), which drains it.
// Map code f (LOU-273): fertile ground. A meadow on it stores 1 gal more and its trees count double toward a grove (LOU-279).
// Map codes g, m, t: bare ground that starts as grass, meadow or trees (counted in storage); bloomLabel: name of the bloom chip (default "Bloom")
//   wind: [dx, dy], the side the wind comes from. The tile on that side of each mountain is runoff (+1 flow when the
//     river runs through or beside it); the tile on the far side is in rain shadow (can't turn green).
//   waterSides: {"x,y": [dx, dy]} sets one mountain's water side (LOU-269); others take it from the wind. Each mountain has
//     exactly one water side: one face with water on it and one runoff tile in front of it.
// Tile costs (Nov 9): sand is free, rock costs +1, trees cost the normal price (they don't defend). Storage maps also: sand grows
// grass on the bare ground around it, and touching trees along the river make a grove: +1 flow for every 3 trees (LOU-279).
// Map code F = wild forest.
(() => {
const M = window.MAP;
const SW_URL = new URL("sw.js", document.currentScript.src).href; // sw.js sits next to play.js
const PERF = M.mode === "perfection"; // Perfection: the best score in a fixed number of turns
const TYPES = M.types, ELEV = M.elev, BLOOM_GOAL = PERF ? 0 : M.bloomGoal, TURN_GOAL = PERF ? (M.turns || 20) : M.turnGoal;
const ROOT = new URL("./", document.currentScript.src).href;
// Green levels on bare ground: 0 bare, 1 grass, 2 meadow, 3 trees. Growth rebalance (LOU-279, Dan): grass is free next to your
// river and stores nothing; a meadow touching a river tile stores +1 for each tree touching it (+1 on fertile ground), with no
// storage of its own; trees store nothing but every 3 touching trees beside the river make +1 flow. A meadow cut back from
// wild forest (nos) stores nothing (Dan, Nov 11: "No storage from it").
const MEADOW = 2, TREES = 3, gName = g => ["bare ground", "grass", "meadow", "trees"][Math.min(g, TREES)];
// storage the tile at p gives (LOU-279); green storage is recounted from the board after every change (syncCap)
function storAt(p) { const c = at(p); if (!STORE || c.g !== MEADOW || c.river || c.nos || c.t !== "bare" || !riverBy(p)) return 0;
  return nbrs(p).filter(n => { const k = at(n); return k.g >= TREES && !k.river }).length + (c.fert ? 1 : 0) }
const greenCap = () => { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) n += storAt([x, y]); return n };
function syncCap() { if (!STORE) return 0; const g = greenCap(), d = g - (S.gcap || 0); if (d) { S.cap += d; S.gcap = g } return d }
// what doing f() to tile p would change in storage (for the tile card)
function capPreview(p, f) { const c = at(p), keep = {...c}, a = greenCap(); f(c); const b = greenCap(); for (const k of Object.keys(c)) if (!(k in keep)) delete c[k]; Object.assign(c, keep); return b - a }
// costs (LOU-279): grass is free to plant and free to cut back to bare ground; every other step is PLANT_COST
const growCost = c => c.g === 0 ? 0 : PLANT_COST, cutCost = c => c.g === 1 && !c.wild ? 0 : PLANT_COST;
const meadowy = c => !c.river && (c.g === MEADOW || (c.t === "meadow" && !c.g)); // the site root, where play.js lives
const LAKE_TILE_COST = 2, REACH = 2; // lakes (Nov 9): 2 gal a tile; a full lake lets you plant up to 2 tiles from it
const SHOW_BLOOM = M.showBloom ?? BLOOM_GOAL > 0;
const TRIB = !!M.tributaries, STORE = M.storage ?? 0, PLANT_COST = M.plantCost ?? 1, BLOOM_LABEL = M.bloomLabel ?? "Bloom";
const NEW = STORE > 0, WIND = M.wind || null;
const PLACE = !!M.placeSource, PLACE_FLOW = 3, SEA_GAP = 4; // LOU-263: place your source anywhere allowed
// Landscape mode (LOU-266): the river flows on its own, flow tiles per water cycle, always to the cheapest next tile (the
// sea first, then sand and springs 0, ground 1, rock 2), ties toward the sea, never into mountains. You reshape the land
// with water. MAP.budget adds water at the start; MAP.noSand fails the run if the river crosses sand.
// Ideas (Nov 10), each switched on by the map: water cycle, weather forecast
const CYCLE = !!M.cycle, WX = M.weather || null, SPREAD = false, FLOOD = false, // spread (grass and bird seeds) and floodplain greening are removed (Dan, Nov 12: "grass and tiles are randomly spawning...get rid of that mechanic")
  _unused = [M.spread, M.floodplain], MELT = !!M.snowmelt, MOSS = !!M.moss, DEER = !!M.deer;
const RECH = !!M.rechannel && !M.tributaries; // rechannel (LOU-238)
const ALP = STORE > 0 && TYPES.some(r => r.includes("B")); // alpine trees (LOU-235)
const turnHooks = []; // other end-of-turn effects (spread, wildlife, fire) add themselves here
// A fixed roll per map, turn and tile, so undo and replays give the same result.
const rnd = (...k) => { let h = 2166136261; for (const ch of [M.id, ...k].join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 10007) / 10007 };
const W = TYPES[0].length, H = TYPES.length;
// Hex grid (A4): pointy-top hexes in "odd-r" offset rows (odd rows sit half a tile right). Six faces, numbered
// 0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE; face d and face d + 3 are opposite. Distance and straight lines use cube coordinates.
const HEX = [[[1,0],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]], [[1,0],[1,-1],[0,-1],[-1,0],[0,1],[1,1]]];
const step = ([x, y], d) => { const o = HEX[y & 1][((d % 6) + 6) % 6]; return [x + o[0], y + o[1]] };
const cube = ([x, y]) => [x - (y - (y & 1)) / 2, y];
const hexDist = (a, b) => { const [q1, r1] = cube(a), [q2, r2] = cube(b), dq = q1 - q2, dr = r1 - r2; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 };
const faceOf = (a, b) => [0, 1, 2, 3, 4, 5].find(d => { const q = step(a, d); return q[0] === b[0] && q[1] === b[1] }) ?? -1;
// Old square-grid sides ([dx, dy] in wind / waterSides) map to a hex face; a number 0–5 is a face already.
const FACE = s => typeof s === "number" ? s : ({"1,0":0, "0,-1":2, "-1,0":3, "0,1":5})[s + ""] ?? 0;
const BANKS = true; // river drawn as a channel with banks; lakes get a shore
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- DOM
// A4 fonts: Fraunces for numbers and the button, Patrick Hand for hints and tags, Nunito for labels
if (!document.querySelector("link[data-a4]")) { const l = document.createElement("link"); l.rel = "stylesheet"; l.dataset.a4 = "1";
  l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Patrick+Hand&family=Nunito:wght@500;700;800&display=swap"; document.head.appendChild(l) }
document.body.innerHTML = `
<div class="app">
  <div class="board" id="board">
    <canvas id="cv" aria-label="Game board"></canvas>
    <div class="overlay top" id="top">
      <!-- Polytopia-style top bar (LOU-267): three stats straight on the map, no panels. Water shows its income in brackets. -->
      <div class="stats">
        <div class="stat" id="cScore"><span>Score</span><b id="hScore">0</b></div>
        <div class="stat" id="cTurn"><span>Turn</span><b><i id="hTurn">0</i><small>/${TURN_GOAL}</small></b></div>
        <!-- Water jar (LOU-278): water you have (blue), storage (jar and notches), next cycle's flow (teal) and any spill -->
        <button type="button" class="stat water jar" id="cWater"><svg class="jsvg" viewBox="0 0 40 52" aria-hidden="true">
            <defs><clipPath id="jclip"><path d="M8 7h24v31a12 12 0 01-24 0z"/></clipPath></defs>
            <path class="jglass" d="M8 7h24v31a12 12 0 01-24 0z"/>
            <g clip-path="url(#jclip)"><g class="jlvl" id="jFlow"><rect class="jteal" x="0" y="0" width="40" height="60"/></g>
              <g class="jlvl" id="jWater"><path class="jwave" d="M-20 2q5-3 10 0t10 0t10 0t10 0t10 0t10 0t10 0v60h-70z"/></g></g>
            <g id="jNotch"></g>
            <path class="jink" d="M8 7v31a12 12 0 0024 0V7"/><path class="jrim" d="M6 6.5h28"/>
            <g class="jpour" id="jPour"><path class="jstream" d="M32 7q5 1 5 9v10"/><circle class="jdrop d1" cx="37" cy="30" r="1.6"/><circle class="jdrop d2" cx="37" cy="30" r="1.3"/></g>
          </svg><span class="jnums"><b><i id="hWater">0</i>${STORE ? `<small class="cap"> / <i id="hCap">0</i></small>` : ""}</b><em id="cFlow"><i class="jin">+<i id="hFlow">0</i><span id="jNext"> next cycle</span></i><i class="jsp" id="jSpill"></i></em></span></button>
      </div>
      <div class="subrow">
        <div class="goals" id="goals"></div>
        ${WIND != null ? (() => { const f = FACE(WIND), ang = -60 * f * Math.PI / 180, vx = -Math.cos(ang), vy = -Math.sin(ang), deg = Math.round(Math.atan2((vx + vy) * .3536, (vx - vy) * .7071) * 180 / Math.PI);
          return `<div class="wx wind" id="cWind" aria-label="Wind from the ${["east","north-east","north-west","west","south-west","south-east"][f]}"><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${deg}deg)"><path d="M3 12h15M13 6l6 6-6 6"/></svg>Wind</div>` })() : ""}
        ${CYCLE || WX ? `<div class="wx sky" id="cSky"><span id="lSky">Sky</span> <b id="hSky">Clear</b></div>` : ""}
      </div>
      ${M.tutorial ? `<button type="button" class="tutskip" id="tutSkip">Skip tutorial</button>` : ""}
      ${M.objectives && !M.tutorial ? `<div class="obj" id="obj" role="status"><i class="ock" id="oTick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></i><span class="otext" id="oText"></span><span class="odots" id="oDots" aria-hidden="true"></span>${M.next ? `<button type="button" class="oskip" id="oSkip" aria-label="Skip lesson">Skip</button>` : ""}</div>` : ""}
    </div>
    <button class="icon sq zoom" id="fitBtn" aria-label="Show the whole map"></button>
    <div class="overlay bottom" id="bottom">${M.tutorial ? `<div class="tutc" id="tutc" role="status"><i class="ock" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></i><div class="tutx"><span id="tutT"></span><small id="tutS"></small></div><span class="odots" id="tutD" aria-hidden="true"></span></div>` : ""}<div class="msg" id="msg" role="status"></div></div>
    ${M.tutorial ? `<div class="hand" id="hand" aria-hidden="true" hidden><span class="htap"></span><svg class="hsvg" viewBox="0 0 34 44"><g class="hout"><rect x="10" y="1.5" width="7" height="24" rx="3.5"/><rect x="16.5" y="13" width="6.2" height="13" rx="3.1"/><rect x="22.2" y="15" width="5.8" height="12" rx="2.9"/><rect x="27.4" y="18" width="5" height="10" rx="2.5"/><rect x="8" y="19" width="24.4" height="17" rx="7.5"/><rect x="2.6" y="19.5" width="6.2" height="13" rx="3.1" transform="rotate(-38 5.7 26)"/><rect x="11" y="34" width="18" height="8" rx="2.5"/></g><g class="hin"><rect x="10" y="1.5" width="7" height="24" rx="3.5"/><rect x="16.5" y="13" width="6.2" height="13" rx="3.1"/><rect x="22.2" y="15" width="5.8" height="12" rx="2.9"/><rect x="27.4" y="18" width="5" height="10" rx="2.5"/><rect x="8" y="19" width="24.4" height="17" rx="7.5"/><rect x="2.6" y="19.5" width="6.2" height="13" rx="3.1" transform="rotate(-38 5.7 26)"/></g><path class="hcrease" d="M16.8 17v5M22.4 18.5v4.5M27.6 21v3.5M11.6 4.2h3.6"/><rect class="hcuff" x="11" y="34" width="18" height="8" rx="2.5"/></svg><svg class="harrow" viewBox="0 0 24 24"><path d="M12 3v15M6 12l6 6 6-6"/></svg></div><div class="callout" id="callout" role="status" hidden></div><div class="welcome" id="welcome" hidden><div class="wcard"><svg class="wdrop" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4C24 4 9 21 9 30a15 15 0 0030 0C39 21 24 4 24 4z"/><path class="wsh" d="M17 30a7 7 0 007 7"/></svg><h2>Welcome to Flow Tile</h2><p>Every river starts as a spring. Spend water to carve yours across the island, grow the land around it, and reach the sea.</p><button type="button" class="go" id="wGo">Let's go</button><button type="button" class="wskip" id="wSkip">I've played before</button></div></div>` : ""}
    <div class="tcard" id="tcard" role="group" aria-label="Tile details" hidden></div>
    <div class="banner" id="banner" aria-hidden="true" hidden><b id="bTurn"></b><small id="bSub"></small></div>
    <div class="win" id="win" hidden><div class="card" role="dialog" aria-labelledby="winTitle">
      <div class="stars" id="wStars" role="img"></div>
      <div class="ribbon"><h2 id="winTitle">You reached the sea!</h2></div>
      <div class="wsub">${M.label}</div>
      <ul id="wGoals"></ul>
      <div class="row" id="wRow">
        <button id="again">Play again</button>
        ${M.share ? `<button class="end" id="share">Share score</button>` : M.next ? `<a class="btn end" id="next" href="${M.next}">${M.nextLabel || "Next map"}</a>` : ""}
      </div>
    </div></div>
  </div>
  <div class="actions">
    <button id="undo" class="rb"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg></i><span>Undo</span></button>
    <button id="restart" class="rb"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9.5 9.5 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/></svg></i><span>Restart</span></button>
    <button id="helpBtn" class="rb"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 015.6 1.2c0 2-2.8 2.6-2.8 4.3"/><circle cx="12" cy="18.2" r=".6" fill="currentColor"/></svg></i><span>Help</span></button>
    <button id="end" class="rb go"><i><svg class="cyc" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 11-2.2-5.3"/><path d="M18.2 2.8l-.9 3.9-3.9-.9"/></svg><em class="gain" id="gain" hidden></em></i><span>Next Water Cycle</span></button>
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
<dialog id="help" aria-labelledby="helpTitle">
  <h2 id="helpTitle">How to play</h2>
  <ul>
    <li><b class="wtr">Water</b> (blue) is what you have right now, in gallons. Every cost is paid in water. <b class="flw">Flow</b> (teal, in brackets next to your water) is how much each water cycle brings. Tap <b>Water</b> at the top for your storage${TRIB ? " and each river" : ""}.</li>
    ${M.lesson ? `<li><b>This map:</b> ${M.lesson}</li>` : ""}
    <li>To move the stream, tap its <b>end</b> (it gets a white ring), then a glowing tile. The number is its cost in water. Tap any other tile to see what it does and what it costs, then choose.</li>
    ${PLACE ? `<li><b>Place your source:</b> before you start, tap a source, or any glowing land tile (bare ground, grass, meadow or sand, at least ${SEA_GAP} tiles from the sea) to start your river there with <b>+${PLACE_FLOW} flow</b>.</li>` : ""}
    ${M.help.map(h => `<li>${h}</li>`).join("\n    ")}
    <li>${PERF ? `Score as much as you can in <b>${TURN_GOAL} turns</b>: 1 point per river tile, meadow you grow and fish, 3 per grove, 2 per full lake. Reaching the sea ends the run with <b>+5</b> and <b>+1 per turn left</b>.` : `Stars: reach the sea${BLOOM_GOAL ? `, bloom <b>${BLOOM_GOAL}</b>+ tiles` : ""}, and arrive by turn <b>${TURN_GOAL}</b>.`}</li>
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
  const what = {Grass:"tiles of grass", Green:"tiles green", Trees:"tiles of trees", Meadows:"meadows", Bees:"meadow beside the grove (bees)", Alpine:"alpine trees"}[M.bloomLabel], verb = M.bloomLabel === "Green" ? "Turn" : "Grow";
  return ["Reach the <b>sea</b>", ...(BLOOM_GOAL ? [what ? `${verb} <b>${BLOOM_GOAL}</b> ${what}` : `Bloom <b>${BLOOM_GOAL}</b> tiles`] : []), `Arrive by <b>turn ${TURN_GOAL}</b>`];
}
function showGoal() { try { const g = document.getElementById("goal"); if (!g.open) g.showModal() } catch (_) {} }
function fresh() {
  const tiles = [];
  for (let y = 0; y < H; y++) { tiles.push([]); for (let x = 0; x < W; x++) {
    const ch = TYPES[y][x];
    const t = {"_":"bare",f:"bare",M:"marsh",C:"cave",F:"bare",g:"bare",m:"bare",t:"bare",p:"bare",v:"bare",".":"meadow",s:"sand",r:"rock",B:"boulder",o:"spring",L:"lake","~":"ocean",S:"source",T:"source"}[ch];
    tiles[y].push({t, e:+ELEV[y][x], river:false, g:ch==="F"?TREES:{g:1,m:MEADOW,t:TREES}[ch]||0, bloom:"gmt".includes(ch), wild:ch==="F", pre:"gmtF".includes(ch), pool:ch==="p", beaver:ch==="v" ? 1 : 0, fert:ch==="f", ro:0, rs:false, rid:-1, pr:"gmt".includes(ch) ? 0 : -1, to:null, lake:-1, yield:ch==="S"?2:ch==="T"?3:0, from:null});
  }}
  // Caves (LOU-276): pairs, in reading order unless the map sets them
  { const cs = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (TYPES[y][x] === "C") cs.push([x, y]);
    const pairs = M.caves || cs.reduce((a, q, i) => (i % 2 ? a[a.length - 1].push(q) : a.push([q]), a), []);
    pairs.forEach((pr, i) => { if (pr.length < 2) return; const [a, b] = pr; Object.assign(tiles[a[1]][a[0]], {mate:b, cave:i + 1}); Object.assign(tiles[b[1]][b[0]], {mate:a, cave:i + 1}) }) }
  // Mountains (LOU-269): each has exactly one water side, set per mountain (waterSides) or by the wind. The tile on that
  // face is its runoff tile (ro 1 = waiting, 2 = claimed); the tile on the far side is rain shadow.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (TYPES[y][x] !== "B") continue;
    const s0 = (M.waterSides && M.waterSides[x + "," + y]) ?? WIND; if (s0 == null) continue; const side = FACE(s0);
    const a = step([x, y], side), b = step([x, y], side + 3), land = p => inside(...p) && !["boulder","ocean","source"].includes(tiles[p[1]][p[0]].t);
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
  return {tiles, lakes, rivers:[], active:0, phase:"pick", cap:STORE, gcap:0, water:0, income:0, turn:0, head:null, msg:PLACE ? `${M.startHint} Or tap any glowing land tile to place your own source there.` : M.startHint, warn:false, clouds:[], dry:0};
}
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
function nbrs(p) { return [0, 1, 2, 3, 4, 5].map(d => step(p, d)).filter(([a, b]) => inside(a, b)) }
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
  if (b.t === "cave" && (!b.mate || at(b.mate).river || b.dry || at(b.mate).dry)) return -1;
  if (b.t === "bed") return -1; // dry riverbed: a used tile // its other end is already used
  let c = M.tileCost ?? 1; // flat maps: the tile type sets the cost
  if (b.t === "spring" || b.t === "sand") c = 0; // sand is free to enter; it cuts flow instead (see build)
  if (b.t === "rock") c += 1;   // hard ground
  return c;
}
// Bare ground touching the river can be planted: grass, then meadow, then trees. Not in a mountain's rain shadow.
function plantable(p) {
  if (!STORE || S.phase !== "play") return false;
  const c = at(p); if (c.t !== "bare" || c.river || c.g >= TREES || c.alp || c.rs || c.pool || c.beaver || c.fire || salty(p)) return false;
  return !!c.pre || nbrs(p).some(n => at(n).river && at(n).rid >= 0 && onMain(at(n).rid)) || lakeReach(p); // a map's own greens grow anywhere (Dan, Nov 11)
}
// A map's own grass, meadows and trees (Dan, Nov 11: "let me adjust" them): grow them anywhere, or cut them back a step for 1 gal.
const cuttable = p => { const c = at(p); return S.phase === "play" && !!c.pre && c.g > 0 && !c.river && !c.fire };
function cutBack(p) {
  const c = at(p), from = c.wild ? "forest" : gName(c.g);
  const k = cutCost(c); if (S.water < k) { say(`Cutting back costs ${k} gal and you have ${S.water} gal. Tap Next Water Cycle to collect your flow.`, true); return }
  snapshot(); S.water -= k; const cap0 = S.cap;
  if (c.wild) c.nos = 1; // cut forest stores nothing (Dan, Nov 11: "No storage from it")
  c.g--; c.wild = false; if (c.pr < 0) c.pr = 0; if (!c.g) c.bloom = false;
  const cb = recombo(), d = S.cap - cap0;
  anim.set("g:" + p, now()); float(p, d ? `${d > 0 ? "+" : "−"}${Math.abs(d)} storage` : k ? `−${k} gal` : "Free", d < 0 ? "#ffb27a" : "#b6f08a"); bump("cWater");
  say(`Cut the ${from} back to ${c.g ? gName(c.g) : "bare ground"}${STORE && d ? `: you can store ${S.cap} gal` : ""}.${cb ? " " + cb + "." : ""}`) }
// A full lake's reach: ground up to 2 tiles from its water can be planted.
function lakeReach(p) { return S.lakes.some(L => L.filled && L.tiles.some(q => hexDist(q, p) <= REACH && onMain(at(q).rid))) }
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
// ---------- combos: groves (3+ touching trees along the river): +1 flow for every 3 trees (LOU-279; pollinators removed)
const GROVE = 3;
const groveTile = c => !c.river && c.g >= TREES && c.t === "bare";
const byRiver = p => nbrs(p).find(n => at(n).river && at(n).rid >= 0);
// Groves on hexes (Dan, Nov 11): every connected patch of trees that all touch the river, joined through any of the six
// hex sides (no straight line needed). links are the touching pairs, for drawing the grove's thread.
function combos() {
  const out = []; if (!NEW || !S.rivers.length) return out;
  const good = q => inside(...q) && groveTile(at(q)) && !!byRiver(q), seen = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (seen.has(x + "," + y) || !good([x, y])) continue;
    const run = [[x, y]], links = []; seen.add(x + "," + y);
    for (let i = 0; i < run.length; i++) for (const n of nbrs(run[i])) if (!seen.has(n + "") && good(n)) { seen.add(n + ""); run.push(n); links.push([run[i], n]) }
    const len = run.reduce((n, q) => n + (at(q).fert ? 2 : 1), 0); // fertile trees count double (LOU-273)
    if (len < GROVE) continue;
    const first = at(run[0]).pr >= 0 ? at(run[0]).pr : at(byRiver(run[0])).rid;
    out.push({kind:"grove", tiles:run, links, len, rid:root(first), bonus:Math.floor(len / GROVE), bees:[]});
  }
  return out;
}
function comboBonus(rid) { return combos().filter(k => k.rid === rid).reduce((s, k) => s + k.bonus, 0) }
// Marsh (LOU-274): beside the main river it stores 2 gal; with green (grass, meadow or trees) on two opposite sides it adds
// +1 flow. A river running through it drains it.
const marshBy = p => { const c = at(p); return c.t === "marsh" && !c.river && nbrs(p).some(n => { const k = at(n); return k.river && k.rid >= 0 && k.t !== "ocean" && onMain(k.rid) }) };
const greenAt = q => inside(...q) && !at(q).river && at(q).g >= 1;
const marshGreen = p => [0, 1, 2].some(d => greenAt(step(p, d)) && greenAt(step(p, d + 3)));
const HAS_MARSH = TYPES.some(r => r.includes("M"));
function marshState() { let cap = 0, flow = 0; if (!HAS_MARSH) return {cap, flow};
  S.tiles.forEach((r, y) => r.forEach((c, x) => { if (!marshBy([x, y])) return; cap += 2; if (marshGreen([x, y])) flow++ })); return {cap, flow} }
// What doing f() to tile p would change in marsh storage and flow (for the tile card).
function marshPreview(p, f) { if (!HAS_MARSH) return {cap:0, flow:0}; const c = at(p), keep = {...c}, a = marshState(); f(c); const b = marshState(); Object.assign(c, keep); return {cap:b.cap - a.cap, flow:b.flow - a.flow} }
// ---------- rechannel (LOU-238): cut the river back to a tile; downstream becomes dry riverbed; costs all your water
const riverBy = p => nbrs(p).some(n => { const k = at(n); return k.river && k.rid >= 0 && k.t !== "ocean" });
// The stretch downstream of p (head first), or null if p isn't upstream of the head or a lake is in the way.
function downstream(p) { const out = []; let q = S.head;
  for (let i = 0; q && i < W * H; i++) { if (same(q, p)) return out; const c = at(q); if (c.t === "lake" || c.t === "ocean") return null; out.push(q);
    q = c.from || (c.t === "cave" && c.mate && at(c.mate).river ? c.mate : null) }
  return null }
function canRechannel(p) { const c = at(p); return RECH && S.phase === "play" && c.river && c.rid === S.active && !same(p, S.head) && !!downstream(p) && downstream(p).length > 0 }
function rechannel(p) { const cut = downstream(p); if (!cut || !cut.length) return; snapshot(); const lostW = S.water; S.water = 0; let lostF = 0;
  for (const q of cut) { const c = at(q);
    if (c.t === "spring") { lostF++; c.t = "spring" }
    if (c.beaver === 2) { lostF++; c.beaver = 1 }
    Object.assign(c, {river:false, rid:-1, from:null, to:null}); if (c.t === "cave") c.dry = true; else if (c.t !== "spring") { c.t = "bed"; c.g = 0; c.bloom = false }
    anim.set("g:" + q, now()) }
  if (lostF) flowAdd(0, -lostF);
  // green that only touched the abandoned stretch stops storing water
  const cap0 = S.cap; S.head = p; at(p).to = null; const cb = recombo(), lostS = Math.max(0, cap0 - S.cap); bump("cWater"); if (lostF) bump("cFlow");
  float(p, "Rechanneled", "#ffffff"); wave = now();
  say(`Rechanneled: ${cut.length} tile${cut.length > 1 ? "s" : ""} downstream dried into riverbed${lostW ? ` and your ${lostW} gal of water is gone` : ", and it cost nothing: you had no water left"}.${lostF ? ` Flow −${lostF}.` : ""}${lostS ? ` Green beside the dry stretch stopped storing water: storage −${lostS}.` : ""}${cb ? " " + cb + "." : ""} Build on from here.`) }
// Green that lost its river stores again once a river runs beside it.
function rewet() { return 0 } // storage is recounted from the board now (syncCap), so green stores again by itself
function remarsh() { if (!HAS_MARSH || !S.rivers.length) return ""; const m = marshState(), dc = m.cap - (S.marshCap || 0), df = m.flow - (S.marshFlow || 0), out = [];
  if (dc) { S.cap += dc; S.marshCap = m.cap; if (S.water > S.cap) S.water = S.cap; bump("cWater"); out.push(dc > 0 ? `Marsh beside your river: storage +${dc}` : `Marsh drained: storage −${-dc}`) }
  if (df) { flowAdd(0, df); S.marshFlow = m.flow; bump("cFlow"); out.push(df > 0 ? `Marsh between green banks: flow +${df}` : `Marsh lost its green banks: flow −${-df}`) }
  return out.join(". ") }
// Recount groves; move each river's flow by the change. Returns a note, or "".
function recombo() {
  if (!NEW || !S.rivers.length) return "";
  if (syncCap()) bump("cWater");
  let note = "";
  S.rivers.forEach((r, i) => { if (root(i) !== i) return; const now = comboBonus(i), d = now - (r.combo || 0); if (!d) return;
    flowAdd(i, d); r.combo = now;
    if (i === S.active) note = d > 0 ? `Flow +${d} from your grove` : `Lost ${-d} flow from a broken grove`; });
  if (note) bump("cFlow");
  const rw = RECH ? rewet() : 0; if (rw) bump("cWater");
  const mn = remarsh(); return [note, mn, rw ? `Green beside your river stores water again: storage +${rw}` : ""].filter(Boolean).join(". ");
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
  const c = at(p), what = ["Grass", "Meadow", "Trees"][c.g], k = growCost(c);
  if (S.water < k) { say(`${what} costs ${k} gal and you have ${S.water} gal. Tap Next Water Cycle to collect your flow.`, true); return }
  snapshot(); S.water -= k; c.g++; c.bloom = true; c.pr = S.active; if (c.g >= MEADOW) c.mine = true; bump("cWater"); bump("cBloom");
  const cap0 = S.cap, cb = recombo(), d = S.cap - cap0, bv = beavers(), sh = storageHint();
  anim.set("g:" + p, now()); float(p, d ? `${d > 0 ? "+" : "−"}${Math.abs(d)} storage` : k ? `−${k} gal` : "Free", d < 0 ? "#ffb27a" : "#b6f08a");
  const why = c.g === 1 ? "Grass is free: grow it into a meadow to store water" : c.g === MEADOW ? (storAt(p) ? `This meadow stores ${storAt(p)} gal, one for each tree beside it${c.fert ? " plus 1 for fertile ground" : ""}` : riverBy(p) ? "A meadow stores +1 gal for each tree that grows next to it" : "A meadow stores water only when it touches your river")
    : "Trees store nothing, but every 3 touching trees beside your river make +1 flow, and each meadow next to them stores 1 more";
  say(`${what} ${c.g === 1 ? "planted" : "grown"}${d ? `: storage ${d > 0 ? "+" : "−"}${Math.abs(d)}, now ${S.cap} gal` : ""}. ${why}.${cb ? " " + cb + "." : ""}${bv ? " " + bv + "." : ""}${sh ? " " + sh + "." : ""}`);
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
// Sand on storage maps: bare ground next to it turns into grass for free (it stores nothing, LOU-279).
function sandGrass(p, delay) { const c = at(p);
  if (c.t !== "bare" || c.river || c.g || c.rs || c.beaver || salty(p) || touchesRock(p)) return 0;
  c.g = 1; c.bloom = true; c.pr = S.active; anim.set("g:" + p, now() + delay); return 1 }
// bloomKind: "trees" counts planted trees; otherwise every green tile counts
const bloomCount = () => M.bloomKind === "meadows" ? S.tiles.flat().filter(c => c.mine && c.g >= MEADOW && !c.river).length // meadows you grew (trees grown from them still count), LOU-279
  : M.bloomKind === "trees" ? S.tiles.flat().filter(c => c.g >= TREES && !c.wild && !c.river).length
  : M.bloomKind === "alpine" ? S.tiles.flat().filter(c => c.alp && !c.river).length
  : M.bloomKind === "springs" ? S.tiles.flat().filter(c => c.t === "spring" && c.river).length
  : S.tiles.flat().filter(c => c.bloom).length;
const affordable = () => [...moves().values()].some(m => m.cost <= S.water);
// free grass doesn't count: it would keep Next Water Cycle muted forever
const canPlant = () => STORE && S.water >= PLANT_COST && S.tiles.some((r, y) => r.some((_, x) => plantable([x, y]) && at([x, y]).g > 0));
// When every next tile costs more than you can store, say so: ending turns won't help, planting will.
function storageHint() { if (!STORE || S.phase !== "play") return "";
  const c = Math.min(...[...moves().values()].map(m => m.cost)); if (!(c > S.cap)) return "";
  return `The next tile costs ${c} gal but you can only store ${S.cap}. Grow meadows by the stream with trees beside them to store more` }

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
      anim.set(p + "", t1 + 120 * hexDist(p, mv.p)) }
    notes.push(STORE ? `Lake filled: you can plant up to ${REACH} tiles from it, and the stream can leave from any side` : "Lake filled: the stream can leave from any side") }
  else { b.river = true; b.bloom = false; b.from = mv.from; b.rid = S.active; anim.set(mv.p + "", t1);
    if (b.g) { const wild = b.wild; notes.push(wild ? "You cut through the forest" : `The river washed away the ${gName(b.g)}`); if (b.snow) notes.push(`The river melted ${b.snow} snow off the alpine trees and washed it away`); b.g = 0; b.wild = false; b.alp = false; b.snow = 0; bump("cWater") }
    if (b.t === "spring") { flowAdd(S.active, 1); notes.push(onMain(S.active) ? "Spring joined: flow +1 gal per water cycle" : "Spring joined: +1 flow once this tributary reaches the main river"); float(mv.p, "+1 flow", "#62e0c8"); bump("cFlow") }
    if (b.t === "sand") { for (const n of nbrs(mv.p)) { const d = 350 + 110 * (bl + gr); if (NEW) gr += sandGrass(n, d); if (!at(n).bloom || !NEW) bl += tryBloom(n, d) }
      const was = flowOf(S.active); flowAdd(S.active, -1); const now1 = flowOf(S.active);
      notes.push(was > now1 ? (onMain(S.active) ? `Sand soaked up 1 flow: now +${now1} gal per water cycle` : `Sand soaked up 1 of this tributary's flow: +${now1} once it joins`) : "Sand soaked the ground"); if (was > now1) float(mv.p, "−1 flow", "#ffb27a"); bump("cFlow") } }
  const ro = claimRunoff(placed); if (ro) notes.push(`Mountain runoff: flow +${ro} gal per water cycle${MELT ? `, and ${melted} gal of snowmelt${melted < 3 * ro ? ` (${3 * ro - melted} ran off: storage is full)` : ""}` : ""}`);
  if (b.pool) { b.pool = false; const got = addWater(2); notes.push(`The stream took in the rain pool: +${got} gal`) }
  if (gr) { notes.push(`Sand grew ${gr} grass`); bump("cWater") }
  if (bl) notes.push(`${bl} tile${bl > 1 ? "s" : ""} bloomed`);
  const capB = S.cap, cb = recombo(); if (cb) notes.push(cb); if (S.cap !== capB) { notes.push(`Storage ${S.cap > capB ? "+" : "−"}${Math.abs(S.cap - capB)}: now ${S.cap} gal`); if (S.cap < capB) float(mv.p, `−${capB - S.cap} storage`, "#ffb27a") }
  const bv = beavers(); if (bv) notes.push(bv);
  S.head = mv.p;
  if (b.t === "cave" && b.mate) { const q = b.mate, k = at(q); k.river = true; k.rid = S.active; k.from = null; anim.set(q + "", now() + 500); S.head = q;
    const r2 = claimRunoff([q]); notes.push(`The river went underground and came out of the other cave${r2 ? `. Mountain runoff: flow +${r2}` : ""}`) }
  if (b.t === "ocean") { S.phase = "won"; wave = now(); float(mv.p, "Splash!", "#ffffff"); say(`You reached the sea on turn ${S.turn}.`); return }
  if (TRIB && openRivers().length && (!moves().size || (S.income === 0 && !affordable()))) { notes.push(`This river can't go on. Tap your ${riverName(openRivers()[0]).toLowerCase()} to switch`); say(notes.join(". ") + ".", true); return }
  if (PERF && (!moves().size || (S.income === 0 && !affordable()))) { S.phase = "won"; wave = now(); say("Your river can't go on: the island is scored. Undo to try another way."); return }
  if (!moves().size && RECH) { notes.push("Dead end. Tap a tile upstream on your river to rechannel from there (it costs all your water)"); say(notes.join(". ") + ".", true); return }
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
  if (!to) return ""; grow(to, 300, "#9fd4ff"); bump("cWater"); recombo(); return "The spill flooded the bank and greened it" }
// ---------- wildlife: beavers dam a pond (+1 flow) when your river runs THROUGH their colony and trees grow next to it (Dan, Nov 10)
function beavers() { let n = 0;
  S.tiles.forEach((r, y) => r.forEach((c, x) => { const p = [x, y]; if (c.beaver !== 1 || !c.river || !nbrs(p).some(q => at(q).g >= TREES && !at(q).river)) return;
    c.beaver = 2; flowAdd(c.rid, 1);
    anim.set("g:" + p, now() + 200); float(p, "+1 flow", "#62e0c8"); n++ }));
  if (n) bump("cFlow"); return n ? `Beavers dammed a pond on your river: flow +${n} gal per water cycle` : "" }
// Deer: every 3rd turn they graze one grass tile with no trees next to it.
function deerTurn() { if (S.turn % 3) return "";
  const to = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(q => { const c = at(q); return c.g === 1 && !c.alp && !c.river && !nbrs(q).some(n => at(n).g >= TREES) })
    .sort((a, b) => rnd("deer", S.turn, ...a) - rnd("deer", S.turn, ...b))[0]; if (!to) return "";
  const c = at(to); c.g = 0; c.bloom = false; deer.push({p:to, t0:now()}); float(to, "Grazed", "#ffb27a"); recombo(); bump("cWater");
  return "Deer grazed a grass tile with no trees next to it" }
const deer = [];
if (DEER) turnHooks.push(deerTurn);
// ---------- alpine trees (LOU-235): a snow bank beside the mountains, melted into water whenever you like
const alpSite = p => { const c = at(p); return ALP && c.t === "bare" && c.g === 1 && !c.alp && !c.river && nbrs(p).some(n => at(n).t === "boulder") && plantable(p) };
const alpBy = p => nbrs(p).some(n => { const k = at(n); return k.river && k.rid >= 0 && k.t !== "ocean" && onMain(k.rid) });
const snowRate = c => c.ro ? 2 : 1;
const snowTotal = () => S.tiles.flat().reduce((n, c) => n + (c.alp ? c.snow || 0 : 0), 0);
function growAlpine(p) { const c = at(p); if (S.water < PLANT_COST) return; snapshot(); S.water -= PLANT_COST; c.alp = true; c.snow = 0; anim.set("g:" + p, now()); float(p, `−${PLANT_COST} gal`, "#bfe4ff"); bump("cWater");
  say(`Alpine trees grown. Beside your river they collect ${snowRate(c)} snow each water cycle, up to 3. Snow never spills: tap an alpine tree to melt it into water when you need it.`) }
function meltSnow() { const n = snowTotal(); if (!n) return; snapshot(); S.water += n;
  S.tiles.forEach((r, y) => r.forEach((c, x) => { if (c.alp && c.snow) { float([x, y], `+${c.snow} gal`, "#ffffff"); anim.set("g:" + [x, y], now()); c.snow = 0 } })); bump("cWater");
  const over = STORE ? Math.max(0, S.water - S.cap) : 0;
  say(`You melted ${n} snow into ${n} gal: you have ${S.water} gal.${over ? ` ${over} gal is over your storage: spend it this turn or it spills at the next water cycle.` : ""}`) }
function snowTurn() { let n = 0; S.tiles.forEach((r, y) => r.forEach((c, x) => { if (!c.alp || c.river || !alpBy([x, y]) || (c.snow || 0) >= 3) return;
    const add = Math.min(snowRate(c), 3 - (c.snow || 0)); c.snow = (c.snow || 0) + add; n += add; float([x, y], `+${add} snow`, "#ffffff") }));
  return n ? `Snow settled on your alpine trees: ${snowTotal()} snow banked` : "" }
if (ALP) turnHooks.push(snowTurn);
// Wildfire: lightning on a forecast turn sets dry trees alight (trees not touching water); fire spreads to dry trees each turn, then burns out.
const wet = p => nbrs(p).some(n => { const k = at(n); return (k.river && k.t !== "source") || (k.t === "lake" && S.lakes[k.lake].filled) || k.t === "ocean" || k.t === "spring" || k.beaver === 2 });
const dryTree = p => { const c = at(p); return c.g >= TREES && !c.river && !c.fire && !wet(p) };
function fireTurn() { const notes = []; let burnt = 0, lost = 0;
  const burning = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(q => at(q).fire);
  const capF = S.cap; for (const q of burning) { const c = at(q); c.fire = false; c.g = 0; c.wild = false; c.bloom = false; c.ash = true; burnt++ }
  // a fire spreads to the trees next to it, unless water is next to the burning tile
  const next = []; for (const q of burning) if (!wet(q)) for (const n of nbrs(q)) { const k = at(n); if (k.g >= TREES && !k.river && !k.fire && !next.some(z => same(z, n))) next.push(n) }
  if (WX && WX[S.turn] === "fire") { const hit = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(dryTree).sort((a, b) => rnd("bolt", ...a) - rnd("bolt", ...b))[0];
    if (hit) { next.push(hit); bolts.push({p:hit, t0:now()}); notes.push("Lightning struck dry trees: they're on fire") } else notes.push("Lightning struck, but every tree touches water: nothing burned") }
  for (const q of next) at(q).fire = true;
  if (burnt) { recombo(); lost = Math.max(0, capF - S.cap); const sp = 0; notes.push(`Fire burned ${burnt} tree tile${burnt > 1 ? "s" : ""}${lost ? `: storage down to ${S.cap} gal` : ""}${sp ? `, ${sp} gal spilled` : ""}`); bump("cWater") }
  if (next.length && burnt) notes[notes.length - 1] += `, and it spread to ${next.length} more`;
  return notes.join(". ") }
const bolts = [];
if (WX && Object.values(WX).includes("fire")) turnHooks.push(fireTurn);
// ---------- flood (LOU-222, weather "flood"): the river overtops its banks and washes away one grass tile beside it.
// Only grass (a meadow or trees holds), and a marsh touching the grass soaks the flood up. The tile nearest your river's end goes.
const floodSafe = p => nbrs(p).some(n => at(n).t === "marsh" && !at(n).river);
const floodable = p => { const c = at(p); return c.g === 1 && !c.river && !c.wild && !!bank(p) };
function floodWash() { if (!WX || WX[S.turn] !== "flood") return "";
  const all = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(floodable); rains.push({p:S.head, t0:now()});
  if (!all.length) return "Flood: the river overtopped its banks, but there was no grass beside it to wash away";
  const open = all.filter(q => !floodSafe(q)).sort((a, b) => hexDist(a, S.head) - hexDist(b, S.head) || a[1] - b[1] || a[0] - b[0]);
  if (!open.length) return "Flood: the river overtopped its banks, and the marsh soaked it up: no grass was lost";
  const q = open[0], c = at(q); c.g = 0; c.bloom = false; anim.set("g:" + q, now()); float(q, "Washed away", "#ffb27a"); recombo(); bump("cWater");
  return `Flood: the river overtopped its banks and washed away a grass tile. Meadows and trees hold, and a marsh next to grass soaks the flood up` }
const bank = p => nbrs(p).find(n => at(n).river && at(n).rid >= 0 && at(n).t !== "ocean");
if (WX && Object.values(WX).includes("flood")) turnHooks.push(floodWash);
// ---------- living spread: grass beside the river greens a bare bank tile next to it; meadows make it certain; birds carry grove seeds
function greenable(p) { const c = at(p); return c.t === "bare" && !c.river && !c.g && !c.rs && !c.ro && !c.pool && !c.beaver && !!bank(p) && !salty(p) }
// Salt: land next to the sea doesn't turn green (planting, spread, sand or lakes) while the sea's salt is in it.
const salty = p => !!M.salt && nbrs(p).some(n => at(n).t === "ocean");
function grow(p, delay, col = "#b6f08a") { const c = at(p), r = root(at(bank(p)).rid); c.g = 1; c.bloom = true; c.pr = r; anim.set("g:" + p, now() + delay); float(p, "Grass", col) }
const birds = [];
function spreadTurn() {
  const grown = []; let seeded = 0;
  S.tiles.forEach((row, y) => row.forEach((c, x) => { const p = [x, y]; if (!c.g || c.wild || c.river || !bank(p)) return;
    const sure = nbrs(p).some(n => meadowy(at(n))); if (!sure && rnd("spread", S.turn, x, y) >= .35) return;
    const to = nbrs(p).filter(n => greenable(n) && !grown.some(g => g + "" === n + "")).sort((a, b) => rnd("to", S.turn, ...a) - rnd("to", S.turn, ...b))[0];
    if (to) grown.push(to) }));
  grown.forEach((p, i) => grow(p, 250 + 160 * i));
  if (S.turn % 3 === 0) for (const k of combos().filter(k => k.kind === "grove")) { const mid = k.tiles[Math.floor(k.tiles.length / 2)];
    const to = S.tiles.flatMap((r, y) => r.map((_, x) => [x, y])).filter(q => greenable(q) && hexDist(q, mid) <= 4)
      .sort((a, b) => hexDist(a, mid) - hexDist(b, mid) || rnd("seed", ...a) - rnd("seed", ...b))[0];
    if (to) { grow(to, 900, "#ffe066"); birds.push({from:mid, to, t0:now()}); seeded++ } }
  if (!grown.length && !seeded) return "";
  bump("cWater"); bump("cBloom"); const cb = recombo();
  const what = [grown.length ? `Grass spread to ${grown.length} tile${grown.length > 1 ? "s" : ""}` : "", seeded ? `a bird carried a seed from your grove` : ""].filter(Boolean).join(" and ");
  return `${what[0].toUpperCase() + what.slice(1)}${cb ? ". " + cb : ""}`;
}
if (SPREAD) turnHooks.push(spreadTurn);
// Where a cloud rains: the greenest tile beside the river.
function rainTarget() { let best = null, bs = -1;
  S.tiles.forEach((r, y) => r.forEach((c, x) => { const p = [x, y]; if (c.river || !(c.g || c.bloom) || !nbrs(p).some(n => at(n).river)) return;
    const sc = nbrs(p).filter(n => at(n).g || at(n).bloom).length * 10 + c.g; if (sc > bs) { bs = sc; best = p } }));
  return best || S.head }
// Placing your source (LOU-263): bare ground, grass, meadow or sand, at least SEA_GAP tiles from the sea.
const seaGap = p => { let d = 1e9; S.tiles.forEach((r, y) => r.forEach((k, x) => { if (k.t === "ocean") d = Math.min(d, hexDist([x, y], p)) })); return d };
function placeWhy(p) { const c = at(p);
  if (!["bare", "meadow", "sand"].includes(c.t) || c.pool || c.beaver || c.wild) return `You can't place a source on ${{rock:"rock", boulder:"a mountain", lake:"a lake", ocean:"the sea", spring:"a spring"}[c.t] || (c.wild ? "the forest" : c.pool ? "a rain pool" : c.beaver ? "a beaver colony" : "this tile")}. Choose bare ground, grass, meadow or sand.`;
  if (seaGap(p) < SEA_GAP) return `Too close to the sea: place your source at least ${SEA_GAP} tiles from it.`;
  return "" }
const placeable = p => PLACE && S.phase === "pick" && !placeWhy(p);
function placeSrc(p) { const c = at(p); snapshot();
  Object.assign(c, {t:"source", g:0, bloom:false, yield:PLACE_FLOW, rs:false, ro:0});
  anim.set("g:" + p, now()); start(p, true) }
function pick(p) {
  const c = at(p);
  if (PLACE && c.t !== "source") { const why = placeWhy(p); if (why) { ring(p); say(why, true); return } ring(p); sel = p; renderCard(); say("Place your source here? Tap again or tap the button to confirm."); return }
  if (c.t !== "source" || (M.mainSource && p + "" !== M.mainSource + "")) { say(M.pickHint ?? M.startHint, true); return }
  start(p) }
function start(p, placed) { const c = at(p); closeCard();
  if (!placed) snapshot(); c.river = true; c.rid = 0; S.rivers = [{src:p, joined:false, head:p, grp:0, pend:0, combo:0}]; S.active = 0; S.head = p; S.income = c.yield; S.turn = 1; S.phase = "play"; syncCap(); if (TUT) hsel = true; S.water = STORE ? Math.min(c.yield, S.cap) : c.yield;
  anim.set(p + "", now()); wave = now(); float(p, `+${c.yield} gal per water cycle`, "#bfe4ff");
  const ro = claimRunoff([p]);
  say(`${placed ? "Source placed. " : ""}Your source's flow is ${S.income} gal per water cycle${ro ? " (with mountain runoff)" : ""}. Tap your stream's end, then where it should go.`);
  zoomTo(lay.zAuto);
}
const HARD_KEY = "flowtile.hard", UNDOS = 3;
const hard = () => { try { return localStorage.getItem(HARD_KEY) === "1" } catch (_) { return false } };
function undo() { if (!history.length) return; if (hard() && (S.undos || 0) >= UNDOS) { say("Hard mode: no undos left on this map. Restart to try again.", true); return }
  const used = (S.undos || 0) + (hard() ? 1 : 0), ob = S.obj || 0; closeCard(); S = JSON.parse(history.pop()); S.obj = Math.max(ob, S.obj || 0); S.undos = used; anim.clear(); fx.length = 0; say(hard() ? `Stepped back. Hard mode: ${UNDOS - S.undos} undo${UNDOS - S.undos === 1 ? "" : "s"} left.` : "Stepped back."); if (S.phase === "pick") zoomTo(1) }
function restart() { closeCard(); hsel = false; S = fresh(); history = []; anim.clear(); fx.length = 0; say(M.startHint); if (TUT) { objShown = -1; tutWait = 0; $("callout").hidden = true; if (!reduce) tutArrive = {}; else zoomTo(lay.zAuto) } else { zoomTo(1); showGoal() } }

// ---------- UI
let quiet = false; // set by the test solver: skip the screen
function say(t, warn = false) { S.msg = t; S.warn = warn; if (!quiet) sync() }
// A big "Turn N" banner sweeps across the board at each water cycle (LOU-260)
let bannerT = 0, toastT = 0;
function showBanner(t, sub) { if (quiet) return; const b = $("banner"); tx("bTurn", t); tx("bSub", sub); b.hidden = false; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; b.classList.remove("go") }, reduce ? 1200 : 1700) }
function bump(id) { const e = $(id); if (!e || reduce) return; e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump") }
// The water jar (LOU-278): levels ease to their new height (CSS transitions); one notch per gallon of storage.
// Maps without storage scale the jar to what you hold plus next cycle's flow.
function jar() { const play = S.phase === "play", g = play ? forecast().gain : S.income, cap = STORE ? Math.max(1, S.cap) : Math.max(8, S.water + g + 2);
  const top = 7, bot = 50, lv = v => bot - (bot - top) * Math.min(1, v / cap), sp = STORE ? Math.max(0, S.water + g - S.cap) : 0;
  $("jWater").style.transform = `translateY(${lv(S.water)}px)`; $("jFlow").style.transform = `translateY(${lv(S.water + g)}px)`;
  const nb = $("jNotch"), want = STORE ? Math.max(0, S.cap - 1) : 0;
  while (nb.children.length < want) { const l = document.createElementNS("http://www.w3.org/2000/svg", "path"); l.setAttribute("d", "M28 0h4"); l.setAttribute("class", "jn"); l.style.transform = `translateY(${bot}px)`; nb.appendChild(l) }
  while (nb.children.length > want) nb.lastChild.remove();
  [...nb.children].forEach((l, i) => { requestAnimationFrame(() => l.style.transform = `translateY(${lv(i + 1)}px)`) });
  $("cWater").classList.toggle("spilling", sp > 0 || (STORE && S.water >= S.cap && g > 0));
  tx("jNext", sp ? "" : " next cycle"); tx("jSpill", sp ? ` · ${sp} spill` : "") }
// Next Water Cycle (LOU-270): muted while you can still afford something, bright and pulsing once you can't.
const nothingLeft = () => !affordable() && !canPlant();
function sync() {
  tx("hWater", S.water); tx("hCap", S.cap); tx("hFlow", S.income); tx("hTurn", S.turn); tx("hScore", PERF ? score().total : bloomCount());
  jar();
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
  { const ready = S.phase === "play" && nothingLeft(); $("end").classList.toggle("ready", ready); $("end").classList.toggle("muted", S.phase === "play" && !ready) }
  const won = S.phase === "won"; $("win").hidden = !won; $("bottom").hidden = won; if (!won) $("wStars").dataset.n = "";
  if (won && PERF) {
    const sc = score(), n = perfStars(sc.total), prevBest = getNum(bestKey); if (sc.total > prevBest) setNum(bestKey, sc.total); if (n > getNum(starKey)) setNum(starKey, n);
    const pts = `${sc.total} point${sc.total === 1 ? "" : "s"}`; $("winTitle").textContent = sc.sea ? `You reached the sea! ${pts}` : `Island scored: ${pts}`;
    const BIG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/><path class="glint" d="M12 2.5l2.9 6 6.6.8L12 12z"/></svg>';
    if ($("wStars").dataset.n !== String(n)) { $("wStars").dataset.n = n; $("wStars").innerHTML = [0, 1, 2].map(i => `<span class="st ${i < n ? "on" : ""} s${i}">${BIG}</span>`).join("") }
    $("wStars").setAttribute("aria-label", `${n} of 3 stars`);
    const rows = [["River tiles", sc.river], ["Green tiles", sc.green], ["Groves", sc.combos], ["Fish", sc.fish], ["Full lakes", sc.lakes], ["Reached the sea", sc.sea]].filter(r => r[1]);
    $("wGoals").innerHTML = rows.map(([t, v], i) => `<li class="got g${i % 3}"><i></i><span>${t}</span><b>+${v}</b></li>`).join("") + `<li class="g3 extra"><i></i><span>${sc.total > prevBest && prevBest ? "New best! Before" : "Best score"}</span><b>${sc.total > prevBest && prevBest ? prevBest : Math.max(prevBest, sc.total)}</b></li>`;
  } else if (won && TUT) {
    $("winTitle").textContent = "You reached the sea!"; $("wStars").innerHTML = ""; $("wStars").dataset.n = "t"; $("wStars").removeAttribute("aria-label");
    $("wGoals").innerHTML = (M.learned || []).map(([t, v], i) => `<li class="got g${i % 3}"><i></i><span>${t}</span><b>${v}</b></li>`).join("");
    tx("again", "Replay tutorial");
  } else if (won) {
    const bl = bloomCount(), goals = [[true, `Reached the sea · turn ${S.turn}`], [bl >= BLOOM_GOAL, M.noSand ? "Never crossed sand" : BLOOM_GOAL ? (M.bloomKind === "springs" ? `Through ${bl}/${BLOOM_GOAL} springs` : M.bloomLabel ? `${M.bloomLabel} on ${bl}/${BLOOM_GOAL} tiles` : `Bloomed ${bl}/${BLOOM_GOAL} tiles`) : "Bloom goal (none on this map)"], [S.turn <= TURN_GOAL, `Turn ${S.turn} (goal: by turn ${TURN_GOAL})`]];
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
  if (c.alp) return "Alpine trees";
  if (c.g) return (c.g >= TREES ? "Trees" : c.g === MEADOW ? "Meadow" : "Grass") + (c.fert ? " · fertile" : "");
  if (c.pool) return "Rain pool";
  if (c.beaver) return c.beaver === 2 ? "Beaver pond" : "Beaver colony";
  if (c.fire) return "Trees on fire";
  if (c.g === 0 && c.ash) return "Ash";
  if (c.moss && !c.g) return "Mossy ground";
  if (c.ro === 1) return "Water side: runoff";
  if (c.rs) return "Rain shadow";
  if (c.fert && c.t === "bare") return "Fertile ground";
  if (c.t === "marsh") return "Marsh";
  if (c.t === "bed") return "Dry riverbed";
  if (c.t === "cave") return `Cave ${c.cave || ""}`.trim();
  return {bare:"Bare ground", meadow:"Meadow", sand:"Sand", rock:"Rock", boulder:"Mountain", spring:"Spring", lake:"Empty lake", ocean:"The sea", source:"Source"}[c.t];
}
function tileText(p) {
  const c = at(p), cs = combos(), inCombo = cs.find(k => k.tiles.some(q => q + "" === p + ""));
  if (c.river && c.beaver === 1) return "Your river runs through the beaver colony. Grow trees next to it and they dam a pond: +1 flow.";
  if (c.river && c.beaver === 2) return "The beavers dammed a pond on your river. It adds +1 flow.";
  if (c.t === "bed") return "Where your river ran before you rechanneled. It holds nothing, and the river can't run here again.";
  if (c.river && c.t === "cave") return "Your river runs underground between this cave and its pair.";
  if (c.river) return c.rid === S.active ? `Part of the river you're building.${canRechannel(p) ? " You can rechannel from here: the river downstream dries up and you build on from this tile in a new direction." : ""}` : "Part of another river.";
  if (inCombo) return inCombo.kind === "grove" ? `Part of a grove of ${inCombo.tiles.length} trees${inCombo.len > inCombo.tiles.length ? ` (fertile trees count double: ${inCombo.len})` : ""}: +${inCombo.bonus} flow, +1 for every 3 trees.${inCombo.len % 3 ? ` ${3 - inCombo.len % 3} more for the next +1.` : ""} Trees store nothing, but each meadow next to them stores 1 more. A stream running over it breaks the grove.` : "";
  if (c.alp) return `${alpBy(p) ? `Collects ${snowRate(c)} snow each water cycle${c.ro ? " (water side: double)" : ""}, up to 3` : "Collects snow only while your river runs beside it"}. Holding ${c.snow || 0} snow now. Snow doesn't count against storage and never spills; melt it into water any time. Alpine trees don't count toward groves.`;
  if (c.wild) return "Wild trees. A stream can run through for the normal cost, but it clears them. Every 3 touching trees beside your river: +1 flow, and each meadow next to them stores 1 more.";
  if (c.g === 1) return `Free next to your river. The ground you grow on: it stores nothing, but grow it into a meadow for 1 gal.${c.fert ? " Fertile ground: a meadow here stores 1 more." : ""} A stream running over it washes it away.${DEER && !nbrs(p).some(n => at(n).g >= TREES) ? " Deer may graze it: no trees next to it." : ""}`;
  if (c.g === MEADOW) { const n = storAt(p); return `${riverBy(p) ? c.nos ? "Cleared forest: it stores nothing." : `Beside your river: +1 storage for each tree next to it${c.fert ? ", +1 for fertile ground" : ""}. Stores ${n} gal now.` : "Away from your river it stores nothing. Beside your river: +1 storage for each tree next to it."} Trees shade the meadow and keep it damp. A stream running over it washes it away.` }
  if (c.g) return `${c.fert ? "Fertile trees count double toward a grove. " : ""}No storage. Every 3 touching trees beside your river: +1 flow, and each meadow next to them stores 1 more. A stream running over it washes them away.${DEER && c.g === 1 && !nbrs(p).some(n => at(n).g >= TREES) ? " Deer may graze it: no trees next to it." : ""}${c.g >= TREES && WX && Object.values(WX).includes("fire") && !wet(p) ? " Dry: not touching water, so lightning can set it alight and fire spreads from it." : ""}`;
  if (c.beaver === 1) return "Beavers live here. Run your stream through the colony and grow trees next to it, and they dam a pond: +1 flow. Running beside it isn't enough.";
  if (c.beaver === 2) return "The beavers' pond. It adds +1 flow to your river.";
  if (c.fire) return wet(p) ? "Burning. It burns out at the next water cycle. Water is next to it, so the fire stops here." : "Burning. It burns out at the next water cycle and spreads to the trees next to it, because no water is next to it.";
  if (c.ash && !c.g) return "Burnt ground. You can plant here again.";
  if (salty(p) && c.t === "bare" && !c.g) return "Salty ground by the sea. Nothing grows here.";
  if (c.pool) return "A puddle of rain. Bring your stream next to it and collect +2 gal, once.";
  if (c.ro === 1) return `Water side: +1 flow when your river reaches this tile (through or beside it).${MELT ? " Snowmelt adds +3 gal once." : ""} It's the only tile at this mountain that gives flow.`;
  if (c.ro === 2) return "Water side: your river already took this mountain's runoff (+1 flow).";
  if (c.rs) return "Behind the mountain, out of the rain. Nothing grows here unless the stream runs through it.";
  if (c.t === "cave") return c.mate ? `Run your river into this cave (${M.tileCost ?? 1} gal, like bare ground) and it comes out of cave ${c.cave} at the other end, ${hexDist(c.mate, p)} tiles away. A shortcut, but the land between gets no river.${at(c.mate).river ? " Its other end is already used, so it's closed." : ""}` : "A cave with no pair: the river can't use it.";
  if (c.t === "marsh") { const by = marshBy(p), gr = marshGreen(p);
    return by ? `Beside your river: stores 2 gal. ${gr ? "Green on both sides: +1 flow." : "Grow green on two opposite sides of it (both left and right, or above and below) for +1 flow."} A river running through it drains it.`
      : "Wet ground. Run your river beside it (not through it) and it stores 2 gal; with green on two opposite sides it also adds +1 flow." }
  if (c.fert && c.t === "bare") return "Rich, dark soil. A meadow here stores 1 more (1 + one for each tree beside it), and trees here count double toward a grove.";
  const lake = c.t === "lake" ? LAKE_TILE_COST * S.lakes[c.lake].tiles.length : 0;
  return {bare:SPREAD ? "Grass is free here once your stream is next to it. Grass beside it on the bank may spread here." : NEW ? "Grass is free here once your stream is next to it." : "Plant here once your stream is next to it.", meadow:SPREAD ? "Grass next to a meadow always spreads along the bank." : "Open ground the stream can cross.",
    sand:NEW ? "Free to cross, but cuts flow by 1. Grows grass on the bare ground around it for free." : "Free to cross, but cuts flow by 1. Blooms the land around it.",
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
    else if (c.t === "cave") { name = "Go underground"; sub = `Comes out of cave ${c.cave} on the other side` }
    else if (c.t === "marsh") { name = "Run through the marsh"; warn = "Drains the marsh: it only stores water and gives flow when your river runs beside it" }
    else if (c.t === "spring") { name = "Join the spring"; sub = onMain(S.active) ? `Flow ${S.income} → ${S.income + 1}` : "+1 flow once this tributary joins the main river" }
    else if (c.t === "sand") { const g = NEW ? nbrs(p).filter(n => { const k = at(n); return k.t === "bare" && !k.river && !k.g && !k.rs && !touchesRock(n) }).length : 0;
      sub = g ? `Grows ${g} grass around it for free` : "Blooms the land around it"; warn = `Cuts flow: ${flowOf(S.active)} → ${Math.max(0, flowOf(S.active) - 1)}${onMain(S.active) ? "" : " (this tributary's)"}` }
    else if (c.ro === 1 || nbrs(p).some(n => at(n).ro === 1)) sub = `Mountain runoff: flow ${flowOf(S.active)} → ${flowOf(S.active) + [p, ...nbrs(p)].filter(q => at(q).ro === 1).length}${onMain(S.active) ? "" : " once joined"}`;
    if (c.beaver === 1) sub = nbrs(p).some(q => at(q).g >= TREES && !at(q).river) ? `Through the beaver colony: they dam a pond, flow +1` : "Through the beaver colony. Grow trees next to it for a pond: +1 flow";
    if (c.wild) sub = "Cuts through the forest";
    else if (c.g) warn = `Washes away the ${gName(c.g)}`;
    if (STORE && c.t !== "lake" && !c.river) { const dc = capPreview(p, k => { k.river = true; k.rid = S.active; k.g = 0; k.wild = false }); if (dc) (dc < 0 ? (warn = (warn ? warn + ". " : "") + `Storage −${-dc}`) : (sub = (sub ? sub + ". " : "") + `Storage +${dc}`)) }
    if (NEW && c.t !== "lake" && !c.river) { const d = comboPreview(p, k => { k.river = true; k.rid = S.active; k.g = 0 });
      if (d < 0) warn = (warn ? warn + ". " : "") + `Breaks a grove: flow −${-d}`;
      else if (d > 0) sub = (sub ? sub + ". " : "") + `Grove: flow +${d}` }
    if (HAS_MARSH && c.t !== "lake") { const d = marshPreview(p, k => { k.river = true; k.rid = S.active; k.g = 0 });
      const bits = [d.cap ? `marsh storage ${d.cap > 0 ? "+" : "−"}${Math.abs(d.cap)}` : "", d.flow ? `marsh flow ${d.flow > 0 ? "+" : "−"}${Math.abs(d.flow)}` : ""].filter(Boolean).join(", ");
      if (bits) { if (d.cap < 0 || d.flow < 0) warn = (warn && c.t !== "marsh" ? warn + ". " : "") + bits[0].toUpperCase() + bits.slice(1); else sub = (sub ? sub + ". " : "") + bits[0].toUpperCase() + bits.slice(1) } }
    out.push({k:"stream", name, cost:m.cost, sub, warn, run:() => build(m)}) }
  if (plantable(p)) { const d = NEW && c.g ? comboPreview(p, k => { k.g++; k.pr = S.active }) : 0, dc = capPreview(p, k => { k.g++; k.pr = S.active });
    const base = c.g === 0 ? "Free next to your river. The ground you grow on" : c.g === 1 ? (c.nos ? "Cleared forest: no storage from it" : riverBy(p) ? "Beside your river: +1 storage for each tree next to it" : "Stores water only once it touches your river") : "No storage. Every 3 touching trees beside your river: +1 flow";
    out.push({k:"plant", name:["Plant grass", "Grow a meadow", "Grow trees"][c.g], cost:growCost(c), sub:`${dc > 0 ? `Store ${S.cap} → ${S.cap + dc} gal` : base}${d > 0 ? `. Grove: flow +${d}` : ""}${c.g === 0 && marshPreview(p, k => { k.g = 1 }).flow > 0 ? ". Marsh: flow +1" : ""}`,
      warn:[dc < 0 ? `Loses this meadow's storage: ${S.cap} → ${S.cap + dc} gal` : "", m ? "A stream running here later washes it away" : ""].filter(Boolean).join(". "), run:() => plant(p)}) }
  if (cuttable(p)) { const d = NEW ? comboPreview(p, k => { k.g--; if (k.wild) k.nos = 1; k.wild = false; if (k.pr < 0) k.pr = 0 }) : 0, dc = STORE ? capPreview(p, k => { k.g--; if (k.wild) k.nos = 1; k.wild = false }) : 0;
    out.push({k:"cut", name:c.wild ? "Cut the forest back" : `Cut back to ${c.g > 1 ? gName(c.g - 1) : "bare ground"}`, cost:cutCost(c),
      sub:[dc > 0 ? `Store ${S.cap} → ${S.cap + dc} gal` : "", d > 0 ? `Grove: flow +${d}` : ""].filter(Boolean).join(". ") || "Changes this tile one step",
      warn:[d < 0 ? `Breaks a grove: flow −${-d}` : "", dc < 0 ? `Storage −${-dc}` : ""].filter(Boolean).join(". "), run:() => cutBack(p)}) }
  if (c.pool && !c.river && nbrs(p).some(n => at(n).river && at(n).rid === S.active)) out.unshift({k:"collect", name:"Collect the rain pool", cost:0, sub:`+2 gal at once${STORE && S.water + 2 > S.cap ? ` (only ${Math.max(0, S.cap - S.water)} fit)` : ""}`, warn:"", run:() => collect(p)});
  if (canRechannel(p)) { const d = downstream(p); out.push({k:"rechannel", name:"Rechannel from here", cost:0, costText:"All water", sub:`${d.length} tile${d.length > 1 ? "s" : ""} downstream dry up. Your river ends here`, warn:S.water ? `Costs all your water (${S.water} gal)` : "Costs all your water: you have none, so it's free now", run:() => rechannel(p)}) }
  if (alpSite(p)) out.push({k:"alpine", name:"Grow alpine trees", cost:PLANT_COST, sub:`Collects ${snowRate(c)} snow each water cycle${c.ro ? " (water side)" : ""}, up to 3. Melt it any time`, warn:"Instead of a meadow: alpine trees don't grow on", run:() => growAlpine(p)});
  if (c.alp && !c.river && S.phase === "play" && snowTotal()) { const n = snowTotal(); out.unshift({k:"melt", name:"Melt the snow", cost:0, sub:n ? `All your snow: +${n} gal now${STORE && S.water + n > S.cap ? ` (${S.water + n - S.cap} over storage: spend it this turn)` : ""}` : "No snow yet: it settles at each water cycle", warn:"", run:() => meltSnow()}) }
  if (MOSS && c.t === "rock" && !c.river && nbrs(p).some(n => at(n).river && at(n).rid === S.active)) out.push({k:"moss", name:"Grow moss", cost:1, sub:"Breaks the rock into soil you can plant", warn:"", run:() => moss(p)});
  if (TRIB && c.t === "source" && !c.river) out.push({k:"trib", name:"Start a tributary", cost:0, sub:`Build it with your main river's water. Its +${c.yield} gal per water cycle joins your flow once it reaches the main river`, warn:"", run:() => startTributary(p)});
  return out;
}
const canDo = a => S.water >= a.cost;
function shortBy(a) { return STORE && a.cost > S.cap ? `You can only store ${S.cap} gal. Plant to store more` : `You have ${S.water} gal. Next Water Cycle brings +${S.income}` }
// Round icons for the tile card's actions (LOU-260)
const ICON = {
  cut:'<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M7.8 16.2L18 4M16.2 16.2L6 4"/></svg>',
  plant:'<svg viewBox="0 0 24 24"><path d="M12 21v-8"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/></svg>',
  meadow:'<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="2.2"/><path d="M12 4.5v2.3M12 11.2v2.3M7.5 9h2.3M14.2 9h2.3M12 13.5V21M12 18c-2-2.5-4.5-3-6-2.5M12 17c2-2 4-2.5 5.5-2"/></svg>',
  trees:'<svg viewBox="0 0 24 24"><path d="M12 3l6 9h-3.5l4 6H5.5l4-6H6z"/><path d="M12 18v3"/></svg>',
  collect:'<svg viewBox="0 0 24 24"><path d="M12 3c3.5 4.5 6 7.6 6 10.7a6 6 0 01-12 0C6 10.6 8.5 7.5 12 3z"/></svg>',
  alpine:'<svg viewBox="0 0 24 24"><path d="M12 2l-5 8h3l-4 7h12l-4-7h3z"/><path d="M12 17v5"/></svg>',
  rechannel:'<svg viewBox="0 0 24 24"><path d="M4 20V10a6 6 0 016-6h8"/><path d="M14 1l4 3-4 3"/><path d="M4 14h5" stroke-dasharray="2 2"/></svg>',
  melt:'<svg viewBox="0 0 24 24"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>',
  moss:'<svg viewBox="0 0 24 24"><path d="M4 18c2-6 7-10 16-12-1 8-6 13-13 13"/><path d="M4 21l7-8"/></svg>',
  trib:'<svg viewBox="0 0 24 24"><path d="M6 3v6c0 4 6 5 6 9v3"/><path d="M18 3v6c0 4-6 5-6 9"/></svg>',
  src:'<svg viewBox="0 0 24 24"><path d="M5 19h14"/><path d="M8 19c0-3 1.5-4 4-4s4 1 4 4"/><path d="M12 15V6"/><path d="M12 6c-2-2-5-1.5-6 1M12 6c2-2 5-1.5 6 1"/></svg>',
  sand:'<svg viewBox="0 0 24 24"><path d="M3 17c3-3 6-3 9 0s6 3 9 0"/><circle cx="7" cy="10" r=".9"/><circle cx="12" cy="8" r=".9"/><circle cx="17" cy="11" r=".9"/></svg>',
  rock:'<svg viewBox="0 0 24 24"><path d="M4 18l3-8 5-3 5 4 3 7z"/><path d="M12 7l-1 6 6-2"/></svg>',
  boulder:'<svg viewBox="0 0 24 24"><path d="M2 20l7-13 4 6 3-4 6 11z"/><path d="M7.5 10l1.5 1.5 1.5-1.5"/></svg>',
  bare:'<svg viewBox="0 0 24 24"><path d="M3 16l9-5 9 5-9 5z"/><path d="M9 15.5h1M14 16.5h1"/></svg>',
};
function renderCard() {
  info = false;
  const c = at(sel), el = $("tcard"); const p0 = sel;
  cardActs = S.phase === "pick" ? [{k:"src", name:"Place source here", cost:0, sub:`Your main river starts here: +${PLACE_FLOW} gal per water cycle`, warn:c.g ? `Covers the ${gName(c.g)}` : "", run:() => placeSrc(p0)}]
    : actions(sel).filter(a => a.k !== "stream"); // the stream moves only from its selected end
  el.innerHTML = `<div class="thead"><i class="swatch" style="background:${topColor(c)}"></i><div class="tname"><b>${tileName(c)}</b>${cardActs.length ? "" : `<small>${tileText(sel)}</small>`}</div><button class="tclose" id="tclose" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>` +
    cardActs.map((a, i) => `<button class="act ${a.k}" data-a="${i}" ${canDo(a) ? "" : "disabled"}><i class="aico">${ICON[a.k === "plant" ? ["plant", "meadow", "trees"][at(sel).g] : a.k] || ""}</i><span class="atext"><b>${a.name}</b>${canDo(a) ? (a.sub ? `<small>${a.sub}</small>` : "") : `<small>${shortBy(a)}</small>`}${a.warn && canDo(a) ? `<small class="awarn">${a.warn}</small>` : ""}</span><span class="acost">${a.costText || (a.cost ? a.cost + " gal" : "Free")}</span></button>`).join("");
  el.hidden = false; placeCard();
}
function placeCard() {
  if (!sel) return;
  const el = $("tcard"), o = iso(...sel), sx = (o.x * scale + off.x) / lay.dpr, sy = (o.y * scale + off.y) / lay.dpr;
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
    `<div class="wline"><span>Flow</span><b class="flw">+${S.income} gal per water cycle</b></div>${ALP && S.tiles.flat().some(c => c.alp) ? `<div class="wline"><span>Snow</span><b>${snowTotal()} banked (tap an alpine tree to melt)</b></div>` : ""}${S.phase === "play" ? `<div class="wline"><span>Next Water Cycle</span><b>+${Math.min(f.gain, STORE ? Math.max(0, S.cap - S.water) : f.gain)} gal${STORE && f.gain > S.cap - S.water ? `, ${f.gain - Math.max(0, S.cap - S.water)} spills` : ""}${f.dry ? " (drought)" : ""}</b></div>` : ""}${rv}`;
  el.className = "tcard"; el.style.top = ""; el.hidden = false;
}
$("cWater").onclick = () => { if (!tutGate("water")) return; if (info) { closeCard(); return } closeCard(); hsel = false; info = true; renderInfo(); sync() };
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
  on(x, y) { return !!at([x, y]).river }, g(x, y) { return at([x, y]).g || 0 }, // the tutorial (LOU-281) asks about single tiles
  next(l) { const q = l.find(([x, y]) => !at([x, y]).river); return q ? [q] : [] }, grown(l, k) { return l.filter(([x, y]) => (at([x, y]).g || 0) >= k).length },
  get water() { return S.water }, get cap() { return S.cap }, get income() { return S.income },
  get spill() { return S.phase === "play" && STORE ? Math.max(0, S.water + forecast().gain - S.cap) : 0 },
  beside(f) { return S.tiles.flatMap((r, y) => r.map((c, x) => [x, y])).filter(p => { const c = at(p); return !c.river && f(c) && nbrs(p).some(n => at(n).river && at(n).rid >= 0) }).length },
  get besideGrove() { const g = combos().flatMap(k => k.tiles); return S.tiles.flatMap((r, y) => r.map((c, x) => [x, y])).filter(p => { const c = at(p); return !c.river && c.g >= 1 && c.g < TREES && nbrs(p).some(n => g.some(q => same(q, n))) }).length },
};
const objDone = o => { try { return !!o.done(G) } catch (_) { return false } };
const objNow = () => S && OBJ.length && (S.obj || 0) < OBJ.length ? OBJ[S.obj || 0] : null;
// Tiles to highlight for the current objective (null: none). Buttons get a ring instead (see objCheck).
function objAim() { if (TUT) return tutAim(); const o = objNow(); if (!o || !o.target || o.target === "end" || o.target === "water") return null;
  const all = S.tiles.flatMap((r, y) => r.map((c, x) => [x, y])), t = o.target;
  const pick = Array.isArray(t) ? [t] : t === "head" ? (S.phase === "play" ? headTiles(S.active) : []) : t === "moves" ? [...moves().values()].map(m => m.p)
    : t === "plantable" ? all.filter(plantable) : all.filter(p => { const c = at(p); return {
      source:c.t === "source" && !c.river && (!M.mainSource || S.phase !== "pick" || same(M.mainSource, p)), sea:c.t === "ocean" && !c.river, lake:c.t === "lake" && !c.river,
      sand:c.t === "sand" && !c.river, rock:c.t === "rock" && !c.river, spring:c.t === "spring" && !c.river, runoff:c.ro === 1, main:c.river && c.rid >= 0 && onMain(c.rid) && c.t !== "source",
      grass:!c.river && c.g === 1, meadow:!c.river && c.g === MEADOW, trees:!c.river && c.g >= TREES, grove:combos().some(k => k.tiles.some(q => same(q, p))) }[t] });
  return pick.length ? new Set(pick.map(p => p + "")) : null }
let objShown = -1;
function objCheck() { if (!OBJ.length || !S) return; if (TUT) return tutCheck(); let moved = false;
  if (S.phase === "won" && (S.obj || 0) < OBJ.length) { S.obj = OBJ.length; moved = true } // reaching the sea finishes the lesson whatever the route
  while ((S.obj || 0) < OBJ.length && objDone(OBJ[S.obj || 0])) { S.obj = (S.obj || 0) + 1; moved = true }
  const i = S.obj || 0, o = OBJ[Math.min(i, OBJ.length - 1)];
  if (i !== objShown) { const el = $("obj"); tx("oText", i >= OBJ.length ? "Lesson complete!" : o.text);
    $("oDots").innerHTML = OBJ.map((_, k) => `<i class="${k < i ? "d" : k === i ? "c" : ""}"></i>`).join("");
    el.classList.toggle("all", i >= OBJ.length);
    if (objShown >= 0 && moved && !reduce) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick") }
    objShown = i; if (moved) save() }
  const tg = objNow() && objNow().target; $("end").classList.toggle("aim", tg === "end"); $("cWater").classList.toggle("aim", tg === "water") }
// ---------- directed tutorial (LOU-281): one micro goal at a time. The target glows and a hand points at it, the rest dims,
// and while a step is locked only its target answers taps (anything else shakes the card and repeats the hint). A goal ends
// with a tick, a sparkle and a one-word cheer; the next one appears 0.6s later, never behind an OK button.
// Step fields (MAP.objectives with MAP.tutorial): text and sub (string or g => string), target ("source", "end", [[x,y],…] or
// g => …), allow (the tiles that answer taps, default target), lock, move (keeps the river's end selected), needs (gal the
// step costs; short of it, the card says to tap Next Water Cycle), noCycle (Next Water Cycle waits), before/after: [where, text]
// callouts (where: "jar", "end", "river" or [x,y]), done(g).
const TUT = !!M.tutorial, CHEERS = ["Nice!", "Got it", "Great!", "Yes!", "Lovely"];
let tutWait = 0, tutArrive = null, tutCallT = 0;
const tval = (v, g) => typeof v === "function" ? v(g) : v;
const tutStep = () => S && (S.obj || 0) < OBJ.length ? OBJ[S.obj || 0] : null;
const tutTiles = t => Array.isArray(t) ? (Array.isArray(t[0]) ? t : [t]) : null;
const tutShort = o => { const n = o && tval(o.needs, G) || 0; return S.phase === "play" && n > S.water };
function tutAim() { const o = tutStep(); if (!o || now() < tutWait || tutShort(o)) return null; const t = tval(o.target, G); if (!t || t === "end" || t === "water") return null;
  if (t === "source") return new Set(S.phase === "pick" ? ORDER.filter(p => at(p).t === "source").map(String) : []);
  const l = tutTiles(t); return l && l.length ? new Set(l.map(String)) : null }
function tutUi() { const o = tutStep(); if (!o || now() < tutWait) return ""; if (tutShort(o)) return "end"; const t = tval(o.target, G); return t === "end" || t === "water" ? t : "" }
// May this tile be tapped now?
function tutTap(p) { if (tutArrive) { tutArrive.t0 = -1e9; return false } const o = tutStep(); if (!o || !o.lock || S.phase === "won") return true;
  if (now() < tutWait) return false; if (tutShort(o)) { tutNo(); return false }
  const allow = tutTiles(tval(o.allow || o.target, G)) || (tval(o.target, G) === "source" ? ORDER.filter(q => at(q).t === "source") : []);
  if (p && allow.some(q => same(q, p))) return true;
  if (p && o.move && headTiles(S.active).some(q => same(q, p))) { hsel = true; return false } // the end stays selected
  tutNo(); return false }
// May this button be pressed now?
function tutGate(k) { if (!TUT || S.phase !== "play") return true; const o = tutStep(); if (!o) return true;
  if (now() < tutWait) return false;
  if (k === "end") { if (o.noCycle) { tutNo(); return false } if (!o.lock || tutUi() === "end") return true; tutNo(); return false }
  if (k === "water" && tutUi() === "water") return true;
  if (o.lock) { tutNo(); return false } return true }
function tutNo() { const c = $("tutc"); if (!c || reduce) return; c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
  const a = tutAim(); if (a) for (const k of a) ring(k.split(",").map(Number)) }
function tutText() { const o = tutStep(), i = S.obj || 0, c = $("tutc"); if (!c) return;
  if (S.phase === "won" || !o) { tx("tutT", "You reached the sea!"); tx("tutS", ""); c.classList.add("all") }
  else if (tutShort(o)) { $("tutT").innerHTML = "Out of water. <b>Tap Next Water Cycle.</b>"; tx("tutS", `Your flow (+${S.income}) refills it every cycle.`) }
  else { $("tutT").innerHTML = tval(o.text, G); tx("tutS", tval(o.sub, G) || "") }
  $("tutD").innerHTML = OBJ.map((_, k) => `<i class="${k < i ? "d" : k === i ? "c" : ""}"></i>`).join("") }
// A small white pill pointing at the jar, a button, the river's end or a tile; it hides itself after 2.5s.
function callout(where, text) { const el = $("callout"); if (!el || !where) return; const r = cv.getBoundingClientRect(), d = cv.width / r.width;
  let x, y, below = false;
  if (where === "jar" || where === "end") { const b = $(where === "jar" ? "cWater" : "end").getBoundingClientRect(); x = b.left + b.width / 2; if (where === "jar") { y = b.bottom + 8; below = true } else y = b.top - 8 }
  else { const p = where === "river" ? S.head : where, o = iso(...p); x = r.left + (o.x * scale + off.x) / d; y = r.top + (o.y * scale + off.y) / d - 26 }
  el.innerHTML = tval(text, G); el.classList.toggle("below", below); el.hidden = false;
  const w = el.offsetWidth; el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px"; el.style.top = (below ? y : y - el.offsetHeight) + "px";
  el.style.setProperty("--ax", (x - Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))) + "px");
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); tutCallT = now() + 2500 }
// Point the hand at the target: a tile on the board or a button.
function tutHand() { const h = $("hand"); if (!h) return; const ui = tutUi(), a = tutAim(); let x = null, y = null;
  const cb = !$("tcard").hidden && a && sel && a.has(sel + "") && $("tcard").querySelector("button[data-a]:not([disabled])");
  if (cb) { const q = cb.getBoundingClientRect(); x = q.right - 40; y = q.top + q.height * .5 }
  else if (ui) { const b = $(ui === "end" ? "end" : "cWater").querySelector(ui === "end" ? "i" : ".jsvg") || $(ui === "end" ? "end" : "cWater"), q = b.getBoundingClientRect(); x = q.left + q.width / 2; y = q.top + q.height * .55 }
  else if (a && S.phase !== "won") { const r = cv.getBoundingClientRect(), d = cv.width / r.width, k = [...a][0].split(",").map(Number), o = iso(...k); x = r.left + (o.x * scale + off.x) / d; y = r.top + (o.y * scale + off.y) / d }
  if (x == null || tutArrive) { h.hidden = true; if (!tutArrive && now() >= tutWait) tutPlace(null); return } h.hidden = false; h.style.left = (x - 15.5) + "px"; h.style.top = (y - 1) + "px"; tutPlace(x, y) }
// The instruction card sits next to the action: under the target, or above it when the target is low on the screen.
// With no target it goes back to the bottom of the screen.
function tutPlace(x, y) { const c = $("tutc"); if (!c) return;
  if (x == null) { if (c.classList.contains("near")) { c.classList.remove("near", "up"); c.style.left = c.style.top = c.style.width = "" } return }
  const w = Math.min(330, innerWidth - 24), l = Math.max(12, Math.min(innerWidth - w - 12, x - w / 2)), up = y > innerHeight * .58;
  c.classList.add("near"); c.classList.toggle("up", up); c.style.width = w + "px"; c.style.left = l + "px"; c.style.setProperty("--ax", (x - l) + "px");
  c.style.top = (up ? y - 62 - c.offsetHeight : y + 58) + "px" }
// Glide the camera to the step's target tiles (or back to the river's end).
function tutLook() { const a = tutAim(); if (!a || view.z === null || !lay.w) { follow(true); return } let x = 0, y = 0, n = 0; for (const k of a) { const o = iso(...k.split(",").map(Number)); x += o.x; y += o.y; n++ }
  tgt = {x:x / n, y:y / n, n:0}; if (reduce) { view.cx = tgt.x; view.cy = tgt.y; tgt = null; applyView() } }
function tutCheck() {
  if (now() < tutWait) { tutHand(); return }
  if (S.phase === "won" && (S.obj || 0) < OBJ.length) { S.obj = OBJ.length; try { localStorage.setItem("flowtile.tutorial", "done") } catch (_) {} save() }
  let i = S.obj || 0;
  while (i < OBJ.length && objDone(OBJ[i])) { const o = OBJ[i], seen = objShown === i; S.obj = ++i; save();
    if (seen) { // tick, sparkle and cheer, then the next step after 0.6s
      const c = $("tutc"), a = tutTiles(tval(o.target, G)), p = a && a[0] && S.phase !== "pick" ? a[0] : S.head;
      tx("tutT", CHEERS[(i - 1) % CHEERS.length]); tx("tutS", ""); c.classList.add("ok"); if (!reduce) { c.classList.remove("tick"); void c.offsetWidth; c.classList.add("tick") }
      if (p) { float(p, "✓", "#ffffff"); ring(p) } if (o.after) callout(...o.after);
      tutWait = now() + 600; $("hand").hidden = true; return } }
  $("tutc").classList.remove("ok");
  const o = tutStep(); if (o && o.move && S.phase === "play" && !tutShort(o)) hsel = true;
  if (i !== objShown || tutShort(o) !== S.tutShort) { const first = objShown !== i; objShown = i; S.tutShort = tutShort(o); tutText(); if (first) { if (o && o.before) callout(...o.before); tutLook() } }
  else if (o && typeof o.text === "function") tutText();
  if (tutCallT && now() > tutCallT) { $("callout").hidden = true; tutCallT = 0 }
  const ui = tutUi(); $("end").classList.toggle("aim", ui === "end"); $("cWater").classList.toggle("aim", ui === "water");
  document.body.classList.toggle("tlock", !!(o && o.lock && S.phase !== "won")); tutHand() }
// Arrival: the camera glides in over the sea and settles on the island (3s; a tap skips it).
function arrive() { if (!lay.w || view.z === null) { draw(); return } const a = tutArrive;
  if (!a.from) { const f = focusPoint(); a.from = {x:B.x - B.w * .9, y:B.y + B.h * .2, z:Math.max(.55, lay.zAuto * .35)}; a.to = {x:f.x, y:f.y, z:lay.zAuto}; a.t0 = now() }
  if (a.hold) a.t0 = now(); // the welcome screen is up: wait at the start of the glide
  const k = Math.min(1, (now() - a.t0) / 3000), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  view.cx = a.from.x + (a.to.x - a.from.x) * e; view.cy = a.from.y + (a.to.y - a.from.y) * e; view.z = a.from.z + (a.to.z - a.from.z) * e; applyView();
  if (k >= 1) { tutArrive = null; tutText() } }
if (TUT) {
  $("wGo").onclick = () => { const w = $("welcome"); w.classList.add("bye"); if (tutArrive) { tutArrive.hold = false; tutArrive.t0 = now() } setTimeout(() => { w.hidden = true; w.classList.remove("bye") }, reduce ? 0 : 400) };
  $("wSkip").onclick = () => { try { localStorage.setItem("flowtile.tutorial", "skipped") } catch (_) {} location.href = ROOT };
  $("tutSkip").onclick = () => { if (!confirm("Skip the tutorial? You can replay it any time from the home page.")) return; try { localStorage.setItem("flowtile.tutorial", "skipped") } catch (_) {} location.href = ROOT };
}
if (OBJ.length && $("oSkip")) $("oSkip").onclick = () => { try { localStorage.setItem("flowtile.seen." + M.id, "skipped") } catch (_) {} location.href = M.next };

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
  if (WX) for (const [k, v] of Object.entries(WX)) if (+k > S.turn) ev.push({turn:+k, kind:v, text:`${{rain:"Rain", drought:"Dry", fire:"Storm", flood:"Flood"}[v] || v}`, long:`${{rain:"Rainstorm: +2 gal", drought:"Drought: −1 flow for 2 turns", fire:"Lightning: dry trees catch fire", flood:"Flood: the river washes away a grass tile beside it (meadows, trees and marsh-guarded grass hold)"}[v] || v} on turn ${k}`});
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
  if (M.noSand) list.push([won ? "got" : "live", "No sand"]);
  if (BLOOM_GOAL) list.push([bl >= BLOOM_GOAL ? "got" : "", `${BLOOM_LABEL} ${bl}/${BLOOM_GOAL}`, "cBloom"]);
  list.push([over ? "miss" : won ? "got" : "live",
    over ? `Missed turn ${TURN_GOAL}` : S.phase === "play" && left === 0 ? "Last turn" : `By turn ${TURN_GOAL}`]);
  $("goals").innerHTML = list.map(([k, t, id]) => `<span class="goal ${k}"${id ? ` id="${id}"` : ""}>${STAR}${t}</span>`).join("");
}

// ---------- persistence: keep the current run across app close/reopen
const SAVE_KEY = "flowtile.run.v5." + M.id; // v5: growth rebalance (LOU-279)
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

// ---------- drawing (A4): a storybook diorama. Pointy-top hexes built flat in world space (radius R), then projected
// isometrically; watercolour tiles with ink outlines on one continuous island with a layered soil cliff, in a paper sea.
// The sea and the island are drawn into two cached layers that are redrawn only when the view or the land changes; the
// river, everything standing on the land and all motion are drawn over them every frame.
const cv = $("cv"), mainCtx = cv.getContext("2d"); let ctx = mainCtx;
const seaC = document.createElement("canvas"), landC = document.createElement("canvas"); let seaKey = "", landKey = "", foamPath = null;
let scale = 1, off = {x:0, y:0}, t0 = now(), lastSize = "", lastHead = null;
// view.z is zoom relative to "whole map fits"; cx/cy is the world point at the middle of the free area
const view = {z:null, cx:0, cy:0}, lay = {w:0, h:0, topH:0, availH:0, dpr:1, fit:1, zAuto:1};
let tgt = null;
const R = 46, SQ3 = Math.sqrt(3), DEPTH = 30, PLAY_W = 390; // R = 46 at a 390px-wide screen (A4)
const INK = "rgba(40,70,60,.22)", INK_M = "rgba(50,60,55,.35)", INK_T = "rgba(40,80,60,.4)", PAPER = "#ffffff", HAND = "'M PLUS Rounded 1c', Nunito, sans-serif", NUM = HAND;
try { if (document.head && !document.querySelector("link[data-mplus]")) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap"; l.dataset.mplus = "1"; document.head.appendChild(l) } } catch (_) {}
const hsh = (x, y) => Math.abs(((x + 11) * 73856093) ^ ((y + 7) * 19349663)) % 97;
const world = (x, y) => [x * SQ3 * R + (y & 1 ? SQ3 * R / 2 : 0), y * 1.5 * R];
const proj = (wx, wy) => ({x:(wx - wy) * .7071, y:(wx + wy) * .3536});
const iso = (x, y) => { const [wx, wy] = world(x, y); return proj(wx, wy) };
const drawLevel = () => 0; // every map is flat
const ORDER = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ORDER.push([x, y]);
ORDER.sort((a, b) => iso(...a).y - iso(...b).y || iso(...a).x - iso(...b).x); // back to front
// The six corners of tile p at radius r (corner i at 60·i − 90°), optionally jittered for a hand-painted edge.
function hexPts(p, r = R, j = 0, seed = 0) { const [wx, wy] = world(...p), h = hsh(p[0] + seed, p[1]);
  return [0, 1, 2, 3, 4, 5].map(i => { const a = (60 * i - 90) * Math.PI / 180, rr = r + (j ? ((h * (i + 5) * 37 + seed * 13) % 17 / 17 - .5) * 2 * j : 0), q = proj(wx + rr * Math.cos(a), wy + rr * Math.sin(a)); return [q.x, q.y] }) }
const diamond = p => hexPts(p); // the tile's outline (kept under the old name for the test hook)
const landTile = q => inside(...q) && at(q).t !== "ocean";
// Edge i of a hex runs from corner i to corner i + 1 and faces neighbour (1 − i) mod 6; it faces the viewer when its
// outward normal points down the screen.
const EDGE_FACE = i => (7 - i) % 6, FRONT = [0, 1, 2, 3, 4, 5].map(i => { const a = (60 * i - 60) * Math.PI / 180; return Math.cos(a) + Math.sin(a) > .01 });
function rpath(pts, rad = 8) { const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath(); ctx.moveTo(...m(pts[n - 1], pts[0])); for (let i = 0; i < n; i++) ctx.arcTo(...pts[i], ...m(pts[i], pts[(i + 1) % n]), rad); ctx.closePath() }
function bounds() { let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const p of ORDER) for (const [x, y] of hexPts(p)) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y) }
  return {x:a - 14, y:b - 56, w:c - a + 28, h:d - b + 56 + DEPTH + 16} }
const B = bounds();
// Fit the map into the part of the game window not covered by the top bar and the message.
// Before a source is picked the whole island shows (the overview); after, play zoomed in like Polytopia (LOU-262):
// R is 46px on a 390px-wide screen and the camera follows the stream's end. The message is a toast, so it takes no room.
function resize() {
  const box = $("board"), w = box.clientWidth, h = box.clientHeight, dpr = Math.min(devicePixelRatio || 1, 3);
  if (!w || !h) return;
  const topH = $("top").offsetHeight, botH = 0;
  const key = [w, h, topH, botH, dpr].join(); if (key === lastSize) return; lastSize = key;
  const availH = Math.max(40, h - topH - botH), fit = Math.min(w / B.w, availH / B.h), play = Math.min(1.35, Math.max(1, w / PLAY_W));
  Object.assign(lay, {w, h, topH, availH, dpr, fit, zAuto:Math.max(1, play / fit)});
  if (view.z === null) { view.z = S.phase === "pick" ? 1 : lay.zAuto; const f = view.z === 1 ? {x:B.x + B.w / 2, y:B.y + B.h / 2} : focusPoint(); view.cx = f.x; view.cy = f.y }
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
  return iso(p[0], p[1]);
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
function ink(col = INK, w = 1.4) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke() }
function inkPoly(pts, fill, col = INK, w = 1.4) { poly(pts, fill); ink(col, w) }
function inkEll(x, y, rx, ry, fill, col = INK, w = 1.2) { ell(x, y, rx, ry, fill); ink(col, w) }
const TAU = Math.PI * 2, osc = (t, period, ph = 0) => reduce ? 0 : Math.sin((t / period + ph) * TAU); // −1..1 over one period
// Tile colours (painterly, LOU-280): base colours and the brush dabs that texture them
const COL = {bare:"#d6cf98",grass:"#86c46f",trees:"#7cbc68",meadow:"#d6e99a",sand:"#f1e6c2",rock:"#d6cf98",boulder:"#cdc59c",spring:STORE ? "#d6cf98" : "#d6e99a",lake:"#d3dfcf",water:"#8cc2d2",ocean:"#cfe6ea",source:"#d6cf98",river:"#5f9fbc",bloom:"#86c46f",shadow:"#cbbd8a",fertile:"#8f6d4c",marsh:"#a3c9ad",cave:"#cdc59c",bed:"#ddd3aa",runoff:"#a9d9c7",alpine:"#7ab872"};
const DABS = {grass:["#b3dc86","#5a9f62","#b9dc98"],bloom:["#b3dc86","#5a9f62","#b9dc98"],trees:["#5a9f62","#9bd07f","#b3dc86"],meadow:["#e3efb8","#c4df8a","#eef5cf"],bare:["#c9c48c","#e4dbb0","#dcd5a0"],rock:["#c9c48c","#e4dbb0"],source:["#c2bf86","#e4dbb0"],spring:["#c2bf86","#e4dbb0"],boulder:["#c2bf86","#e4dbb0"],cave:["#c2bf86","#e4dbb0"],
  sand:["#dccf9f","#f8efd6"],fertile:["#6f523a","#a5815c"],marsh:["#bfdcc6","#7fae94"],shadow:["#bcab78","#ddd0a2"],runoff:["#c8e9dd","#8fcab6"],alpine:["#5a9f62","#a8d49a"],bed:["#cfc398","#e8dfbd"]};
function kindOf(c) {
  if (c.t === "ocean") return "ocean";
  if (c.t === "lake") return c.river ? "water" : "lake";
  if (c.alp) return "alpine";
  if (!c.river) { if (c.g >= TREES) return "trees"; if (c.g === MEADOW) return "meadow"; if (c.g) return "grass" }
  if (c.rs && !c.river) return "shadow";
  if (c.fert && c.t === "bare") return "fertile";
  if (c.ro && c.t === "bare") return "runoff";
  if (c.bloom && c.t !== "meadow" && !c.river) return "bloom"; return COL[c.t] ? c.t : "bare" }
const topColor = c => COL[kindOf(c)];
// A seeded random stream per tile, so the same map always paints the same.
const rng = (...k) => { let s = 1; for (const v of [M.id || "", ...k].join("|")) s = (Math.imul(s ^ v.charCodeAt(0), 2654435761) >>> 0) || 7; s = s % 2147483646 + 1; return () => (s = s * 16807 % 2147483647) / 2147483647 };
// A point inside tile p, given in world offsets from its centre (radius up to k·R), projected.
const inTile = (p, r, k = .78) => { const [wx, wy] = world(...p), a = r() * TAU, d = Math.sqrt(r()) * R * k, q = proj(wx + d * Math.cos(a), wy + d * Math.sin(a)); return [q.x, q.y] };
let topPath = null, ps = 1; // the resolution the cached layers are painted at (device px per world unit)
// Fill a path with a feathered (blurred) edge: the shape is drawn far off to the left and only its shadow lands here.
function feather(path, col, blur) { ctx.save(); const sh = 5000; ctx.shadowColor = col; ctx.shadowBlur = blur * ps; ctx.shadowOffsetX = sh; ctx.translate(-sh / ps, 0); ctx.fillStyle = "#000"; ctx.fill(path); ctx.restore() }
const hexPath = (tiles, r = R + 1, rad = 0) => { const P = new Path2D(); for (const p of tiles) { const h = hexPts(p, r); if (rad) { const n = h.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; P.moveTo(...m(h[n - 1], h[0])); for (let i = 0; i < n; i++) P.arcTo(...h[i], ...m(h[i], h[(i + 1) % n]), rad); P.closePath() } else { h.forEach(([x, y], i) => i ? P.lineTo(x, y) : P.moveTo(x, y)); P.closePath() } } return P };
const HORIZON = B.y + 26; // world y of the far shore line behind the island

// ---------- the sea layer (screen space, cheap): sky, a soft line of distant trees, then the calm sea
function paintSea() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); const W0 = cv.width, H0 = cv.height, hz = Math.max(0, Math.min(H0, off.y + HORIZON * scale));
  if (hz > 0) { const g = ctx.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, "#cfe3ea"); g.addColorStop(1, "#eef4f2"); ctx.fillStyle = g; ctx.fillRect(0, 0, W0, hz) }
  const s = ctx.createLinearGradient(0, hz, 0, Math.max(hz + 1, H0)); s.addColorStop(0, "#cfe6ea"); s.addColorStop(.5, "#b3d6df"); s.addColorStop(1, "#8fbccb"); ctx.fillStyle = s; ctx.fillRect(0, hz, W0, H0 - hz);
  if (hz > 0 && hz < H0) { const r = rng("hz"), u = scale; // distant trees: two soft rows of blobs on the horizon
    for (const [a, col, k] of [[.42, "#a9c6c0", 1], [.6, "#93b8b0", .7]]) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath();
      for (let x = -20; x < W0 + 20; x += (10 + r() * 14) * u) { const rr = (6 + r() * 9) * u * k; ctx.moveTo(x + rr, hz); ctx.ellipse(x, hz - rr * .35, rr, rr * .9, 0, Math.PI, 0) } ctx.fill() }
    ctx.globalAlpha = 1; ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(0, hz - .5 * u, W0, 1.2 * u) }
}
// ---------- the island layer (world space, cached and painted at a fixed resolution so camera moves never repaint it)
const LPAD = 60;
function paintLand() {
  const land = ORDER.filter(landTile), edges = [];
  for (const p of land) { const h = hexPts(p); for (let i = 0; i < 6; i++) if (!landTile(step(p, EDGE_FACE(i)))) edges.push({a:h[i], b:h[(i + 1) % 6], front:FRONT[i], p, i}) }
  const top = hexPath(land, R + .6); topPath = top;
  // the island's soft shadow and faint reflection in the sea
  ctx.save(); ctx.translate(0, DEPTH + 10); feather(top, "rgba(70,110,120,.35)", 18); ctx.restore();
  // the sea goal (~): pale shallows with a soft dashed edge, so you can tell where to go
  const sea = ORDER.filter(q => at(q).t === "ocean"); if (sea.length) { const P = hexPath(sea, R - 4, 9); feather(P, "rgba(240,250,248,.85)", 10); ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1.5; ctx.stroke(P); ctx.restore() }
  // the cliff: an earth gradient with faint strata, a grass lip with drips, under one continuous top
  for (const e of edges) if (e.front) { const y0 = Math.min(e.a[1], e.b[1]), g = ctx.createLinearGradient(0, y0, 0, y0 + DEPTH); g.addColorStop(0, "#a99171"); g.addColorStop(1, "#6f5c48");
    poly([[e.a[0], e.a[1] - 1], [e.b[0], e.b[1] - 1], [e.b[0], e.b[1] + DEPTH], [e.a[0], e.a[1] + DEPTH]], g) }
  for (const e of edges) if (e.front) { const r = rng("cl", e.p, e.i);
    for (const y of [9, 15, 22]) { const w = (r() - .5) * 2; line([[e.a[0], e.a[1] + y + w], [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2 + y - w], [e.b[0], e.b[1] + y + w]], "rgba(70,52,36,.16)", 1) }
    poly([[e.a[0], e.a[1] - 1], [e.b[0], e.b[1] - 1], [e.b[0], e.b[1] + 3.5], [e.a[0], e.a[1] + 3.5]], "#6f9e5c");
    for (let k = 0; k < 3; k++) { const f = .15 + r() * .7, x = e.a[0] + (e.b[0] - e.a[0]) * f, y = e.a[1] + (e.b[1] - e.a[1]) * f, d = 3 + r() * 5;
      ctx.beginPath(); ctx.moveTo(x - 2.2, y + 2); ctx.quadraticCurveTo(x - 1.5, y + d, x, y + d + 1); ctx.quadraticCurveTo(x + 1.5, y + d, x + 2.2, y + 2); ctx.fillStyle = "#6f9e5c"; ctx.fill() } }
  foamPath = new Path2D(); for (const e of edges) { const y = e.front ? DEPTH + 1 : 1; foamPath.moveTo(e.a[0], e.a[1] + y); foamPath.lineTo(e.b[0], e.b[1] + y) }
  // the top: bare ground everywhere, then each terrain as a feathered region that blends into its neighbours
  ctx.save(); ctx.clip(top); ctx.fillStyle = COL.bare; ctx.fill(top);
  const groups = new Map(); for (const p of land) { const c = at(p); if (c.t === "lake") continue; const k = kindOf(c); if (k === "bare" || k === "rock" || k === "source" || k === "cave" || k === "boulder") continue; (groups.get(k) || groups.set(k, []).get(k)).push(p) }
  for (const k of ["sand", "shadow", "bed", "fertile", "runoff", "meadow", "bloom", "grass", "trees", "alpine", "marsh", "spring"]) if (groups.has(k)) feather(hexPath(groups.get(k), R + 3), COL[k], 14);
  for (const p of land) if (at(p).t !== "lake") paintTile(p, at(p));
  // lakes: one pool per lake, a wet bank feathered round it
  for (const L of S.lakes) { const P = hexPath(L.tiles, R + 1.5), full = L.filled; feather(hexPath(L.tiles, R + 6), "#b9c98f", 10);
    let y0 = 1e9, y1 = -1e9; for (const q of L.tiles) { const o = iso(...q); y0 = Math.min(y0, o.y - R * .5); y1 = Math.max(y1, o.y + R * .5) }
    const g = ctx.createLinearGradient(0, y0, 0, y1); if (full) { g.addColorStop(0, "#e7f4f6"); g.addColorStop(.5, "#a9d4e2"); g.addColorStop(1, "#7fb6c9") } else { g.addColorStop(0, "#e9eee0"); g.addColorStop(1, "#cdd9cf") }
    ctx.fillStyle = g; ctx.fill(P); ctx.save(); ctx.clip(P);
    if (full) for (const q of L.tiles) for (const n of nbrs(q)) if (at(n).g >= TREES || at(n).alp) { const a = iso(...q), b = iso(...n); ell(a.x + (b.x - a.x) * .45, a.y + (b.y - a.y) * .45 + 8, 16, 7, "rgba(60,110,90,.16)") } // trees reflected
    ctx.restore(); ctx.save(); if (!full) ctx.setLineDash([5, 5]); ctx.beginPath();
    for (const q of L.tiles) { const pts = hexPts(q, R + 1); for (let i = 0; i < 6; i++) { const n = step(q, EDGE_FACE(i)); if (inside(...n) && at(n).t === "lake" && at(n).lake === at(q).lake) continue; ctx.moveTo(...pts[i]); ctx.lineTo(...pts[(i + 1) % 6]) } }
    ctx.strokeStyle = full ? "rgba(255,255,255,.6)" : "rgba(90,130,140,.45)"; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.stroke(); ctx.restore() }
  // the hex grid, just a hint: a thin white line at 9%
  ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.lineWidth = 1; for (const p of land) if (at(p).t !== "lake") { rpath(hexPts(p, R - .5), 6); ctx.stroke() }
  ctx.restore();
}
// One tile's texture: its own slight tint shift, low-contrast brush dabs, then the details that lie flat on it.
function paintTile(p, c) {
  const k = kindOf(c), o = iso(...p), h = hsh(...p), r = rng("t", p), d = DABS[k] || DABS.bare;
  const tint = r() < .5 ? "#ffffff" : "#3d5a3a"; // each tile shifts its tint a little through its dabs
  for (let i = 0; i < 18; i++) { const [x, y] = inTile(p, r, 1.08); ctx.globalAlpha = .22 + r() * .2; ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 3.5, 1 + r() * 1.6, (r() - .5) * .8, 0, TAU); ctx.fillStyle = i % 5 === 4 ? tint : d[i % d.length]; ctx.fill() }
  ctx.globalAlpha = 1; flat(p, c, o.x, o.y, h, r);
}
const pebble = (x, y, s) => { ell(x, y + .6 * s, 2.4 * s, 1.2 * s, "rgba(70,60,40,.18)"); ell(x, y, 2.2 * s, 1.4 * s, "#b7b09c"); ell(x - .6 * s, y - .5 * s, 1 * s, .6 * s, "rgba(255,255,255,.6)") };
const FLD = [["#e0503c", "#f07a5a"], ["#f2d13a", "#f7e27a"], ["#9a7ad8", "#b9a2ea"], ["#fafaf0", "#ffffff"]];
function shrub(x, y, s, r) { ell(x + 2 * s, y + 1, 9 * s, 3 * s, "rgba(40,70,50,.2)");
  for (const [a, b, rr, col] of [[-5, -3, 5, "#3f7f5c"], [4, -3, 5.5, "#3f7f5c"], [0, -6, 6, "#4c9a74"], [-3, -7, 3.6, "#7cbf84"], [3, -8, 3, "#93cf8f"]]) ell(x + a * s, y + b * s, rr * s, rr * s * .8, col) }
// What lies flat on a tile (cached with the island): pebbles, cracks, moss, clover, ripples, pools, wildflower drifts.
function flat(p, c, cx, cy, h, r = rng("f", p)) {
  const k = kindOf(c);
  if (c.t === "bed") { ell(cx, cy, 22, 10, "#cbbd92"); ell(cx - 2, cy - 1, 15, 6, "#e2d8b6"); for (let i = 0; i < 4; i++) pebble(cx - 12 + r() * 24, cy - 4 + r() * 8, .8); return }
  if (c.t === "spring") { ell(cx, cy + 2, 21, 10, "rgba(120,160,120,.35)"); ell(cx, cy + 1, 18, 8.5, "#9fd0dd"); ell(cx + 1, cy + 2, 11, 5, "#7fb6c9"); ell(cx - 5, cy - 1, 8, 2.6, "rgba(255,255,255,.5)"); return }
  if (c.t === "marsh") { const on = marshBy(p); for (const [a, b, rx, ry] of [[-7, 3, 12, 5.5], [11, -6, 7, 3.3], [4, 9, 6, 2.6]]) { ell(cx + a, cy + b, rx + 2, ry + 1.5, "rgba(90,130,90,.3)"); ell(cx + a, cy + b, rx, ry, on ? "#8cc2d2" : "#9fbcb3") } return }
  if (c.beaver === 2) { ell(cx, cy + 1, 25, 12, "rgba(90,130,90,.35)"); ell(cx, cy + 1, 23, 11, "#8cc2d2"); ell(cx - 6, cy - 2, 10, 3, "rgba(255,255,255,.45)"); return }
  if (c.pool) { ell(cx + 1, cy + 2, 21, 10, "rgba(90,130,90,.3)"); ell(cx + 1, cy + 2, 19, 9, "#a9d4e2"); ell(cx - 5, cy, 7, 2.6, "rgba(255,255,255,.5)"); return }
  if (c.ro && c.t === "bare" && !c.river) { ell(cx, cy + 2, 17, 8, "rgba(90,140,110,.3)"); ell(cx, cy + 2, 15, 7, c.ro === 2 ? "#8cc2d2" : "#a9d9e2"); ell(cx - 3, cy + 1, 7, 2.5, "rgba(255,255,255,.5)") }
  if (c.g >= TREES || c.alp) { ell(cx + 2, cy + 3, 28, 12, "rgba(40,80,50,.14)"); for (let i = 0; i < 6; i++) { const [x, y] = inTile(p, r); line([[x, y], [x + (r() - .5) * 2, y - 3 - r() * 2]], "rgba(60,120,70,.45)", 1) } return }
  if (k === "grass" || k === "bloom") { // grass strokes, a stone or clover, sometimes a wildflower drift, a shrub near the river
    for (let i = 0; i < 9; i++) { const [x, y] = inTile(p, r); line([[x, y], [x + (r() - .5) * 2.5, y - 3 - r() * 3]], i % 3 ? "rgba(70,140,80,.55)" : "rgba(190,225,150,.7)", 1.1) }
    if (r() < .35) { const [x, y] = inTile(p, r, .6); pebble(x, y, 1) }
    if (r() < .35) { const [x, y] = inTile(p, r, .6); for (const [a, b] of [[-1.6, 0], [1.6, 0], [0, -1.6]]) ell(x + a, y + b, 1.8, 1.3, "#4f9a5a") }
    if (r() < .3) { const f = FLD[Math.floor(r() * 4)], [x0, y0] = inTile(p, r, .45); for (let i = 0; i < 8; i++) { const x = x0 + (r() - .5) * 20, y = y0 + (r() - .5) * 9;
      if (f[0] === "#9a7ad8") { line([[x, y], [x, y - 5]], "rgba(70,120,70,.6)", 1); for (let j = 0; j < 3; j++) ell(x, y - 2 - j * 1.6, 1.2, .9, f[j % 2]) } else { line([[x, y], [x, y - 3]], "rgba(70,120,70,.6)", .9); ell(x, y - 3.4, 1.8, 1.4, f[0]); ell(x - .4, y - 3.8, .7, .5, f[1]) } } }
    if (riverBy(p) && r() < .5) { const [x, y] = inTile(p, r, .5); shrub(x, y, .8, r) }
    return }
  if (k === "meadow") { for (let i = 0; i < 4; i++) { const [x, y] = inTile(p, r, .65); ell(x, y, 6 + r() * 5, 2.4 + r() * 1.8, i % 2 ? "rgba(250,246,200,.45)" : "rgba(214,236,160,.55)") }
    for (let i = 0; i < 10; i++) { const [x, y] = inTile(p, r, .75); ell(x, y, 1, .7, ["#ffffff", "#f2c531", "#e88fb0", "#b9a0e6"][i % 4]) } return } // sunlit patches and a scatter of tiny far-off blooms
  if (c.moss) { ell(cx - 10, cy + 2, 7, 3.5, "#6fa84a"); ell(cx + 8, cy - 5, 6, 3, "#7cb956"); ell(cx + 3, cy + 7, 5, 2.5, "#5f9a40") }
  if (c.ash) { ell(cx - 8, cy + 2, 9, 4, "rgba(40,30,25,.4)"); ell(cx + 9, cy - 4, 7, 3, "rgba(40,30,25,.35)") }
  if (M.salt && salty(p) && c.t === "bare") for (let i = 0; i < 7; i++) { const [x, y] = inTile(p, r, .7); ell(x, y, 2.2, 1.3, "#fbf8f0") }
  if (c.fert && c.t === "bare" && !c.ro) { for (let i = -2; i <= 2; i++) { line([[cx - 17 + i * 5, cy - 1 + i * 6], [cx + 13 + i * 5, cy - 9 + i * 6]], "#5e432c", 2.2); line([[cx - 16 + i * 5, cy - 2.2 + i * 6], [cx + 13 + i * 5, cy - 10 + i * 6]], "rgba(190,150,110,.45)", .8) } return }
  if (k === "sand") { for (let i = 0; i < 4; i++) { const [x, y] = inTile(p, r, .6); ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.quadraticCurveTo(x - 4, y - 2.5, x, y); ctx.quadraticCurveTo(x + 4, y + 2.5, x + 9, y); ctx.strokeStyle = "rgba(190,170,120,.55)"; ctx.lineWidth = 1; ctx.stroke() } return }
  if (c.t === "bare" || c.t === "source" || c.t === "rock" || c.t === "cave" || c.t === "boulder") {
    for (let i = 0; i < 3; i++) { const [x, y] = inTile(p, r); pebble(x, y, .6 + r() * .4) }
    if (r() < .3 && !c.rs) { const [x, y] = inTile(p, r, .5); line([[x - 6, y], [x - 1, y + 2], [x + 4, y - 1], [x + 7, y + 1]], "rgba(120,100,60,.35)", .9) }
    if (r() < .25) { const [x, y] = inTile(p, r, .5); ell(x, y, 5, 2.4, "rgba(110,160,90,.45)"); ell(x + 2, y - .5, 2.5, 1.2, "rgba(150,200,110,.5)") }
    if (c.rs) { const k2 = "rgba(110,80,40,.5)"; // cracked ground in the rain shadow
      line([[cx + 4, cy - 8], [cx + 10, cy - 3], [cx + 18, cy - 5]], k2, 1.2); line([[cx + 10, cy - 3], [cx + 9, cy + 3]], k2, 1); line([[cx - 4, cy + 6], [cx + 2, cy + 10], [cx + 9, cy + 9]], k2, 1.2); line([[cx - 18, cy], [cx - 11, cy - 3], [cx - 9, cy - 9]], k2, 1.1) } }
  if (c.t === "rock") { // a boulder: soft grey stone, lit from the upper left
    ell(cx + 3, cy + 7, 17, 5, "rgba(50,60,50,.2)"); ctx.beginPath(); ctx.moveTo(cx - 15, cy + 5); ctx.quadraticCurveTo(cx - 17, cy - 10, cx - 3, cy - 13); ctx.quadraticCurveTo(cx + 15, cy - 13, cx + 15, cy + 2); ctx.quadraticCurveTo(cx + 12, cy + 8, cx - 15, cy + 5);
    const g = ctx.createLinearGradient(cx - 12, cy - 12, cx + 12, cy + 6); g.addColorStop(0, "#c9c6bc"); g.addColorStop(1, "#8f9289"); ctx.fillStyle = g; ctx.fill();
    line([[cx - 4, cy - 12], [cx - 1, cy - 4], [cx - 6, cy + 2]], "rgba(70,70,60,.35)", 1); ell(cx - 7, cy - 7, 5, 2.2, "rgba(255,255,255,.35)"); ell(cx + 6, cy + 3, 4, 1.6, "rgba(110,160,90,.5)") }
  if (c.t === "cave") ell(cx, cy + 6, 20, 6, "rgba(50,50,40,.2)");
}
// ---------- the river: one smooth Catmull-Rom curve through the tile centres, a ribbon as wide as its flow
const same = (q, p) => !!q && q + "" === p + "";
const linked = (a, b) => { const A = at(a), B = at(b); return A.river && B.river && (same(B.from, a) || same(A.from, b) || same(A.to, b) || same(B.to, a)) };
// Each chain runs from a river's start (a source, a cave exit or a lake outlet) downstream to its end, a lake, the sea
// or the tile where it joins another river. Newly built tiles grow in.
function riverChains() {
  const isLake = q => at(q).t === "lake", down = p => nbrs(p).filter(n => at(n).river && (same(at(n).from, p) || same(at(p).to, n)));
  const starts = [];
  for (const p of ORDER) { const c = at(p); if (!c.river || c.t === "lake" || c.t === "ocean") continue;
    if (!c.from || !inside(...c.from) || !at(c.from).river) starts.push({p, pre:null, rid:c.rid}); else if (isLake(c.from)) starts.push({p, pre:c.from, rid:c.rid}) }
  starts.sort((a, b) => root(a.rid) - root(b.rid) || a.rid - b.rid);
  const seen = new Set(), out = [];
  for (const s of starts) { const ch = s.pre ? [s.pre] : []; let p = s.p;
    for (let i = 0; i < W * H; i++) { ch.push(p); if (seen.has(p + "") || isLake(p) || at(p).t === "ocean") break; seen.add(p + "");
      const ds = down(p); if (!ds.length) break; p = ds.find(n => !isLake(n)) || ds[0] }
    if (ch.length) out.push({tiles:ch, rid:s.rid}) }
  return out }
function chainPts(ch) { const pts = [];
  for (let i = 0; i < ch.tiles.length; i++) { const q = ch.tiles[i], o = iso(...q), k = i ? prog(q + "") : 1, sea = at(q).t === "ocean";
    let x = o.x, y = o.y; if (i && (k < 1 || sea)) { const a = pts[i - 1], f = sea ? Math.min(k, .55) : k; x = a[0] + (o.x - a[0]) * f; y = a[1] + (o.y - a[1]) * f }
    pts.push([x, y]); if (k < 1) break }
  return pts }
// The river's centre line (Dan, Nov 12: "the river turning looks bad"): straight from one tile edge to the next, and at a
// turn a round arc through the shared edge midpoints (the tile centre is the arc's control point), so a 60° hex turn is a
// smooth bend instead of a pinched corner. Sampled 8 points per tile step: sample 8·i sits at tile i, nearest its centre.
function crPath(pts) { const P = new Path2D(), smp = [pts[0]]; if (!pts.length) return {P, smp}; P.moveTo(...pts[0]);
  if (pts.length === 1) { P.lineTo(pts[0][0] + .01, pts[0][1]); return {P, smp} }
  const n = pts.length, mid = i => [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
  // the curve through tile i: from the entry midpoint to the exit midpoint, bent by the centre (ends are straight)
  const arc = (i, u) => { if (i === 0 || i === n - 1) { const a = pts[i], b = i === 0 ? mid(0) : mid(n - 2), k = i === 0 ? u : 1 - u; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] }
    const a = mid(i - 1), b = mid(i), c = pts[i], v = 1 - u; return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]] };
  // the end tiles run straight to or from their centre; a middle tile's centre point is the arc's midpoint
  const half = (i, first) => { const out = []; for (let k = 1; k <= 4; k++) { const q = k / 4; out.push(i === 0 ? arc(0, q) : i === n - 1 ? arc(n - 1, q) : arc(i, first ? .5 + q * .5 : q * .5)) } return out };
  for (let i = 0; i < n - 1; i++) { for (const q of [...half(i, true), ...half(i + 1, false)]) { smp.push(q); P.lineTo(...q) } }
  return {P, smp} }
// ---------- river width = flow (LOU-280). Walk each chain from its start keeping a running flow: a source gives its
// yield, then each thing that adds flow adds it at the river tile where it attaches (springs, mountain runoff, groves,
// marsh, beaver ponds, a tributary joining), and sand takes 1 away. The main river ends at your flow.
function chainFlows(chains) {
  const into = new Map(), carry = new Map(); let fl = [];
  for (let pass = 0; pass < 4; pass++) { const used = new Set(), cmb = combos(); fl = [];
    chains.forEach((ch, ci) => { const t0 = ch.tiles[0], c0 = at(t0); let f = c0.t === "source" ? c0.yield || 0 : carry.get(t0 + "") || 0; const out = [];
      ch.tiles.forEach((q, i) => { const c = at(q), key = q + "";
        if (i || c0.t !== "source") { if (c.t === "spring" && c.river) f += 1; if (c.t === "sand" && c.river && f > 0) f -= 1; if (c.beaver === 2) f += 1 }
        f += into.get(ci + ":" + key) || 0;
        for (const n of [q, ...nbrs(q)]) { const k = at(n), nk = n + ""; if (used.has(nk)) continue;
          if (k.ro === 2) { used.add(nk); f += 1 } else if (HAS_MARSH && k.t === "marsh" && marshBy(n) && marshGreen(n)) { used.add(nk); f += 1 } }
        for (const g of cmb) if (!used.has("g" + g.tiles[0]) && root(g.rid) === root(ch.rid) && g.tiles.some(t => hexDist(t, q) <= 1)) { used.add("g" + g.tiles[0]); f += g.bonus }
        out.push(Math.max(0, f)) });
      fl.push(out) });
    into.clear(); carry.clear();
    chains.forEach((ch, ci) => { const last = ch.tiles[ch.tiles.length - 1], c = at(last), f = fl[ci][fl[ci].length - 1];
      if (c.t === "lake") carry.set(last + "", (carry.get(last + "") || 0) + f); // a chain leaving the lake starts at the lake tile
      else if (c.t === "cave" && c.mate) carry.set(c.mate + "", f);
      else chains.forEach((o, oi) => { if (oi !== ci) { const j = o.tiles.findIndex((t, k) => k && same(t, last));
        // where both chains end on the same tile, only the tributary pours into the main river (never both ways)
        if (j > 0 && (j < o.tiles.length - 1 || root(ch.rid) !== 0 && root(o.rid) === 0 || (root(ch.rid) === root(o.rid) && ch.rid > o.rid))) into.set(oi + ":" + last, (into.get(oi + ":" + last) || 0) + f) } }) });
    for (const [k, v] of [...carry]) { const L = at(k.split(",").map(Number)); if (L.t === "lake") for (const q of S.lakes[L.lake].tiles) carry.set(q + "", v) } }
  // whatever the walk can't place (a bonus with no tile) goes in at the river's end only, so the river ends at your flow
  // without widening anything upstream (Dan, Nov 12: widen only "onwards")
  const mi = chains.findIndex(ch => root(ch.rid) === 0 && at(ch.tiles[0]).t === "source");
  if (mi >= 0 && S.phase !== "pick") { let end = 0; chains.forEach((ch, ci) => { if (root(ch.rid) === 0) { const l = ch.tiles[ch.tiles.length - 1]; if (at(l).t === "ocean" || l + "" === S.head + "") end = Math.max(end, fl[ci][fl[ci].length - 1]) } });
    const d = S.income - end; if (d && end) chains.forEach((ch, ci) => { if (root(ch.rid) === 0) { const l = ch.tiles.length - 1, q = ch.tiles[l]; if (at(q).t === "ocean" || q + "" === S.head + "") fl[ci][l] = Math.max(0, fl[ci][l] + d) } }) }
  return fl }
const dispF = new Map(); let lastRT = 0;
const smooth = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
function drawRivers(t) {
  const dt = Math.min(.1, Math.max(0, t - lastRT)); lastRT = t;
  const raw = riverChains(), flows = chainFlows(raw), joins = [];
  const chains = raw.map((ch, ci) => { const pts = chainPts(ch), cp = crPath(pts), n = pts.length;
    // eased flow per tile: it widens or narrows over about 0.6s
    const f = flows[ci].slice(0, n).map((v, i) => { const key = ci + ":" + ch.tiles[i]; let d = dispF.get(key); d = d == null || reduce ? v : d + (v - d) * Math.min(1, dt * 7); dispF.set(key, d); return d });
    return {...ch, ...cp, f, n, ci} }).filter(ch => ch.smp.length > 1);
  for (const ch of chains) { const s = ch.smp, m = s.length, L = [], Rt = [], C = [], W = [], T = [], hh = hsh(...ch.tiles[0]);
    for (let j = 0; j < m; j++) { const a = s[Math.max(0, j - 2)], b = s[Math.min(m - 1, j + 2)]; const gx = b[0] - a[0], gy = (b[1] - a[1]) * 2, l = Math.hypot(gx, gy) || 1; // the direction on the ground (the view squashes y by half)
      const a2 = s[Math.max(0, j - 4)], b2 = s[Math.min(m - 1, j + 4)], d1 = [s[j][0] - a2[0], s[j][1] - a2[1]], d2 = [b2[0] - s[j][0], b2[1] - s[j][1]];
      const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]) || 0; T.push(turn);
      const i = Math.floor(j / 8), u = (j % 8) / 8, fa = ch.f[Math.min(ch.n - 1, i)], fb = ch.f[Math.min(ch.n - 1, i + 1)], fl = fa + (fb - fa) * smooth((u - .6) / .4);
      const w = Math.max(4, 2.9 * fl + 1.2 * Math.min(1, Math.abs(turn) * 1.2) + .5 * Math.sin(j * .9 + hh));
      C.push([s[j][0], s[j][1], -gy / l, gx / l * .5]); W.push(w) }
    const ribbon = (k, add, shift = 0) => { ctx.beginPath(); for (let j = 0; j < m; j++) { const [x, y, nx, ny] = C[j], w = W[j] * k / 2 + add, o = shift * T[j] * W[j]; ctx.lineTo(x + nx * (w + o), y + ny * (w + o)) }
      for (let j = m - 1; j >= 0; j--) { const [x, y, nx, ny] = C[j], w = W[j] * k / 2 + add, o = shift * T[j] * W[j]; ctx.lineTo(x - nx * (w - o), y - ny * (w - o)) } ctx.closePath() };
    const cap = (j, k, add, col) => { const [x, y] = C[j], r = W[j] * k / 2 + add; ell(x, y, r, r * .62, col) };
    for (const [k, add, col] of [[1, 4.5, "rgba(95,143,92,.4)"], [1, 2, "#d9cfa3"], [1, 0, "#8cc2d2"]]) { ribbon(k, add); ctx.fillStyle = col; ctx.fill(); cap(0, k, add, col); cap(m - 1, k, add, col) }
    ribbon(.48, 0, -.55); ctx.fillStyle = "#6fa9c4"; ctx.fill(); ribbon(.16, 0, -.95); ctx.fillStyle = "rgba(63,127,159,.55)"; ctx.fill();
    // cut banks on the outside of sharp bends, pebbly point bars on the inside; riffles over a couple of stones
    for (let i = 1; i < ch.n - 1; i++) { const j = i * 8; if (j >= m) break; const tn = T[j], [x, y, nx, ny] = C[j], w = W[j] / 2, h = hsh(...ch.tiles[i]); if (Math.abs(tn) > .5) { const sg = tn > 0 ? -1 : 1;
      ctx.beginPath(); for (let q = -3; q <= 3; q++) { const [a, b, mx, my] = C[Math.max(0, Math.min(m - 1, j + q))], ww = W[Math.max(0, Math.min(m - 1, j + q))] / 2 + 3; ctx.lineTo(a + mx * ww * sg, b + my * ww * sg) } ctx.strokeStyle = "rgba(86,138,82,.5)"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.stroke(); // a mossy bank edge (Dan, Nov 12: not brown)
      for (let q = -2; q <= 2; q += 2) { const [a, b, mx, my] = C[Math.max(0, Math.min(m - 1, j + q))], ww = W[j] / 2 + 5; line([[a + mx * ww * sg, b + my * ww * sg], [a + mx * (ww - 2.5) * sg, b + my * (ww - 2.5) * sg + 1]], "#6f9e5c", 2) }
      const px = x - nx * (w + 1) * sg, py = y - ny * (w + 1) * sg; ell(px, py, 7, 3, "#e2d6ae"); pebble(px - 2, py, .55); pebble(px + 2.5, py + .5, .45) }
      else if (h % 4 === 1 && at(ch.tiles[i]).t !== "lake") { for (const [dx, dy] of [[-3, 1], [3, -1]]) { ell(x + dx, y + dy, 1.8, 1.1, "#9c9a8c"); ctx.globalAlpha = reduce ? .6 : .45 + .3 * osc(t, 1.4, h * .1 + dx);
        ctx.beginPath(); ctx.ellipse(x + dx - 1, y + dy - .3, 3, 1.6, 0, Math.PI * .9, Math.PI * 2.1); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = .9; ctx.stroke(); ctx.globalAlpha = 1 } } }
    ch.C = C; ch.W = W;
    // reeds with a few small yellow flowers along the banks, swaying ±1.5° from the base
    for (let i = 1; i < ch.n - 1; i++) { const h = hsh(...ch.tiles[i]); if (h % 3) continue; const j = i * 8 + 3; if (j >= m) break; const [x, y, nx, ny] = C[j], sg = h % 2 ? 1 : -1; reeds(x + nx * (W[j] / 2 + 5) * sg, y + ny * (W[j] / 2 + 5) * sg, t, h) }
    // a tributary's end flows into the river it joins: rings spread where they meet
    const last = ch.tiles[ch.tiles.length - 1]; if (ch.n === ch.tiles.length && at(last).t !== "ocean" && at(last).t !== "lake" && raw.some(o => o !== raw[ch.ci] && o.tiles.some((q, k) => k && same(q, last)))) joins.push(C[m - 1]) }
  if (!reduce) { // two layers of current streaks at different speeds, then a leaf, a fish
    // (Dan, Nov 12: "the white line looks bad"): no white streak; short, soft pale-blue glints drift with the current
    for (const [dash, sp, a, lw] of [[[4, 34], 22, .32, 1.6], [[3, 47], 14, .22, 1.2]]) { ctx.save(); ctx.setLineDash(dash); ctx.lineDashOffset = -t * sp; ctx.globalAlpha = a; ctx.strokeStyle = "#dff1f8"; ctx.lineWidth = lw; ctx.lineCap = "round";
      for (const ch of chains) { ctx.beginPath(); ch.C.forEach(([x, y, nx, ny], j) => { const o = (lw > 1.2 ? -.18 : .2) * ch.W[j]; j ? ctx.lineTo(x + nx * o, y + ny * o) : ctx.moveTo(x + nx * o, y + ny * o) }); ctx.stroke() } ctx.restore() }
    for (const ch of chains) { if (!flowOf(ch.rid >= 0 ? ch.rid : S.active)) continue; const s = ch.C, cum = [0];
      for (let i = 1; i < s.length; i++) cum.push(cum[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
      const L = cum[cum.length - 1], v = 34, gap = v * 1.6; if (L < 20) continue;
      const at2 = d => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const k = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [s[i - 1][0] + (s[i][0] - s[i - 1][0]) * k, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * k] };
      // no teal flow drops in the river (Dan, Nov 12: "what is that green bubble in the river..get rid of it")
      const lk = (t / 18 + hsh(...ch.tiles[0]) * .07) % 1; if (lk < .7 && L > 80) { const d = lk / .7 * L, [x, y] = at2(d); ctx.save(); ctx.translate(x, y); ctx.rotate(t * .8); ctx.globalAlpha = Math.min(1, d / 30, (L - d) / 30);
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(0, -3, 4, 0); ctx.quadraticCurveTo(0, 3, -4, 0); ctx.fillStyle = "#c9a24a"; ctx.fill(); ctx.restore(); ctx.globalAlpha = 1 } }
    const fk = (t % 11) / 11, fc = chains.find(ch => ch.C.length > 30); if (fc && fk < .12) { const j = Math.floor((hsh(Math.floor(t / 11), 3) / 97) * (fc.C.length - 16)) + 8, [x, y] = fc.C[j], k = fk / .12;
      ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(x, y, 3 + k * 9, 1.5 + k * 4.5, 0, 0, TAU); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
      if (k < .8) { const q = k / .8; ctx.save(); ctx.translate(x - 8 + q * 16, y - Math.sin(q * Math.PI) * 12); ctx.rotate(-.9 + q * 1.8); ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(0, -3, 5, 0); ctx.quadraticCurveTo(0, 3, -5, 0); ctx.moveTo(-5, 0); ctx.lineTo(-8, -2.5); ctx.lineTo(-8, 2.5); ctx.closePath(); ctx.fillStyle = "#7d97a3"; ctx.fill(); ctx.restore() } } }
  // the mouth: soft foam where the river meets the sea; rings where a tributary joins
  for (const ch of chains) { const last = ch.tiles[ch.tiles.length - 1]; if (at(last).t !== "ocean" || prog(last + "") < 1) continue; const [x, y] = ch.C[ch.C.length - 1], a = .7 + .2 * osc(t, 4.5);
    ctx.globalAlpha = a; for (let i = -2; i <= 2; i++) ell(x + i * 6, y + Math.abs(i) * 1.5, 4 - Math.abs(i) * .6, 2, "#f7fbf6"); ctx.globalAlpha = 1 }
  if (!reduce) for (const [x, y] of joins) for (let i = 0; i < 2; i++) { const k = (t / 2.4 + i * .5) % 1; ctx.globalAlpha = (1 - k) * .7; ctx.beginPath(); ctx.ellipse(x, y, 4 + k * 12, 2 + k * 6, 0, 0, TAU); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1 }
  // mountain runoff feeds the river through a small stream with flowing dashes
  for (const p of ORDER) { const c = at(p); if (c.ro !== 2 || c.river) continue; const n = nbrs(p).find(q => at(q).river && at(q).t !== "ocean"); if (!n) continue; const a = iso(...p), b = iso(...n), m = [(a.x + b.x) / 2 + 3, (a.y + b.y) / 2];
    ctx.beginPath(); ctx.moveTo(a.x, a.y + 2); ctx.quadraticCurveTo(m[0], m[1], b.x, b.y); ctx.strokeStyle = "#8cc2d2"; ctx.lineWidth = 3.4; ctx.lineCap = "round"; ctx.stroke();
    if (!reduce) { ctx.save(); ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 18; ctx.beginPath(); ctx.moveTo(a.x, a.y + 2); ctx.quadraticCurveTo(m[0], m[1], b.x, b.y); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.1; ctx.stroke(); ctx.restore();
      const k = (t / 2.4 + hsh(...p) * .1) % 1; ctx.globalAlpha = (1 - k) * .7; ctx.beginPath(); ctx.ellipse(b.x, b.y, 3 + k * 9, 1.5 + k * 4.5, 0, 0, TAU); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.1; ctx.stroke(); ctx.globalAlpha = 1 } }
}
function reeds(x, y, t, h) { for (let i = 0; i < 4; i++) { const hx = x + (i - 1.5) * 2.2, ht = 7 + (h + i * 3) % 5;
  ctx.save(); ctx.translate(hx, y); ctx.rotate(osc(t, 3.2 + i * .3, h * .07 + i * .2) * 1.5 * Math.PI / 180); line([[0, 0], [(i - 1.5) * .8, -ht]], i % 2 ? "#5f8f4f" : "#7aa65e", 1.2);
  if ((h + i) % 4 === 0) ell((i - 1.5) * .8, -ht - 1, 1.3, 1.1, "#f2d13a"); ctx.restore() } }
// Distance along the river from its source, for the shimmer that runs down it when a turn ends.
function riverDist() {
  const dist = new Map(), q = [];
  for (const r of S.rivers) if (r.src) { dist.set(r.src + "", 0); q.push(r.src) }
  while (q.length) { const p = q.shift(), d = dist.get(p + "");
    for (const n of nbrs(p)) if (!dist.has(n + "") && at(n).river && (linked(p, n) || (at(n).t === "lake" && at(p).t === "lake" && at(n).lake === at(p).lake))) { dist.set(n + "", d + 1); q.push(n) } }
  return dist }
// ---------- standing things (drawn every frame, back to front): they sway, lean and twinkle around fixed roots; nothing drifts
// Trees are painted once into sprites at the layer resolution, then drawn leaning at most ±0.8° from the trunk base.
const sprites = new Map();
function sprite(key, w, h, paint) { const k = key + "@" + ps; let c = sprites.get(k);
  if (!c) { if (sprites.size > 160) sprites.clear(); c = document.createElement("canvas"); c.width = Math.ceil(w * ps); c.height = Math.ceil(h * ps); const keep = ctx; ctx = c.getContext("2d"); ctx.setTransform(ps, 0, 0, ps, w / 2 * ps, (h - 4) * ps); paint(rng("sp", key)); ctx = keep; sprites.set(k, c) }
  return c }
const leaf = (x, y, r, col) => ell(x, y, r, r * .86, col);
const TREE = {
  round(r) { line([[0, 0], [0, -11]], "#6b4a32", 3); line([[0, -7], [-4, -13]], "#6b4a32", 1.8); line([[0, -8], [4, -14]], "#6b4a32", 1.6);
    const cl = [[-8, -16, 7], [8, -16, 7], [0, -22, 8], [-5, -26, 6.5], [6, -26, 6.5], [0, -30, 6], [-9, -21, 5.5], [9, -21, 5.5]];
    for (const [x, y, s] of cl) leaf(x, y + 1.5, s, "#2c6a5a"); for (const [x, y, s] of cl) leaf(x - .8, y, s * .82, "#4c9a74");
    for (const [x, y, s] of cl) if (x <= 2 && y < -18) leaf(x - 1.8, y - 1.5, s * .55, "#93cf8f"); for (let i = 0; i < 6; i++) leaf(-7 + r() * 9, -30 + r() * 12, 1.4 + r(), "#e2f0b0");
    for (let i = 0; i < 10; i++) { const x = -10 + r() * 20, y = -30 + r() * 18; line([[x, y], [x + 1.6, y - 1]], "rgba(44,106,90,.6)", .8) } },
  pine(r) { line([[0, 0], [0, -6]], "#5a3d22", 2.6);
    for (let i = 0; i < 5; i++) { const y0 = -4 - i * 6.5, w = 11 - i * 1.9, y1 = y0 - 10; ctx.beginPath(); ctx.moveTo(-w, y0); ctx.quadraticCurveTo(-w * .3, y0 - 4, 0, y1); ctx.quadraticCurveTo(w * .3, y0 - 4, w, y0); ctx.quadraticCurveTo(0, y0 + 2.5, -w, y0); ctx.fillStyle = "#2f5f55"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-w, y0); ctx.quadraticCurveTo(-w * .3, y0 - 4, 0, y1); ctx.lineTo(-1, y0 + 1); ctx.closePath(); ctx.fillStyle = "#4f8a72"; ctx.fill() } },
  willow() { ctx.beginPath(); ctx.moveTo(-1.5, 0); ctx.quadraticCurveTo(-3, -12, 2, -20); ctx.lineTo(4, -19); ctx.quadraticCurveTo(0, -11, 2, 0); ctx.fillStyle = "#6b4a32"; ctx.fill();
    leaf(1, -24, 11, "#5f9a64"); leaf(-1, -26, 9, "#7fb878"); leaf(-3, -28, 5, "#a5d08f");
    for (let i = 0; i < 16; i++) { const x = -11 + i * 1.5, top = -22 - Math.sin(i / 15 * Math.PI) * 5; ctx.beginPath(); ctx.moveTo(x, top); ctx.quadraticCurveTo(x + .6, top + 8, x - .4, -5 - (i % 3) * 2); ctx.strokeStyle = i % 2 ? "#7fb878" : "#5a9a64"; ctx.lineWidth = 1.3; ctx.lineCap = "round"; ctx.stroke() } },
  birch(r) { ctx.fillStyle = "#f2efe6"; ctx.fillRect(-1.3, -24, 2.6, 24); for (let i = 0; i < 5; i++) line([[-1.3, -3 - i * 4.4 - r() * 2], [r() * 1.6 - .3, -3 - i * 4.4 - r() * 2]], "#3a3a3a", 1.1);
    for (let i = 0; i < 9; i++) leaf(-7 + r() * 14, -30 + r() * 12, 3 + r() * 2.2, ["#8cc47a", "#a8d48a", "#cfe6a0"][i % 3]) },
  poplar() { line([[0, 0], [0, -6]], "#6b4a32", 2.4); ell(0, -22, 5.5, 17, "#3f7f5c"); ell(-1.2, -23, 4.4, 15, "#4f9a64"); ell(-2, -26, 2.4, 10, "#7cbf7a") },
  blossom(r) { TREE.round(r); for (let i = 0; i < 16; i++) leaf(-10 + r() * 20, -32 + r() * 18, 1.3 + r() * .8, i % 3 ? "#f4b8c8" : "#ffffff") } };
const TREE_W = {round:30, pine:26, willow:28, birch:22, poplar:16, blossom:30};
function tree(kind, v, x, y, s, ph, t, dark) {
  ell(x + 3 * s, y + 1, 10 * s, 3.2 * s, "rgba(40,70,50,.22)");
  const c = sprite(kind + v, 34, 46, TREE[kind]);
  ctx.save(); ctx.translate(x, y); ctx.rotate(osc(t, 3.6 + ph * 1.5, ph) * (kind === "willow" ? 1.6 : .8) * Math.PI / 180); ctx.scale(s, s);
  if (dark) ctx.filter = "brightness(.85)"; ctx.drawImage(c, -17, -42, 34, 46); ctx.restore() }
// Which kinds grow where, seeded per tile: pines by mountains (and alpine trees), willows by water, otherwise a mix.
function treeKinds(p) { const r = rng("tk", p), nb = nbrs(p);
  if (at(p).alp || nb.some(n => at(n).t === "boulder")) return ["pine", "pine", "pine", "pine"];
  const wet = nb.some(n => at(n).river || at(n).t === "lake");
  return [0, 1, 2, 3].map(i => { const v = r(); if (wet && i === 1) return "willow"; return v < .44 ? "round" : v < .64 ? "birch" : v < .84 ? "poplar" : v < .92 ? "round" : "blossom" }) }
function tufts(cx, cy, h, t) { // soft painted grass blades that rotate ±2° around their roots
  [[-17, 2], [-6, -9], [12, -5], [2, 9], [17, 5]].forEach(([a, b], i) => { if ((h + i) % 5 === 4) return; const x = cx + a, y = cy + b;
    ctx.save(); ctx.translate(x, y); ctx.rotate(osc(t, 2.6 + (i % 3) * .5, (h + i) * .17) * 2 * Math.PI / 180);
    ctx.beginPath(); ctx.moveTo(-3.5, -5); ctx.quadraticCurveTo(-2, -2, -1.5, 0); ctx.moveTo(.5, -7); ctx.lineTo(0, 0); ctx.moveTo(4, -5); ctx.quadraticCurveTo(2, -2, 1.5, 0); ctx.strokeStyle = "rgba(70,140,80,.7)"; ctx.lineWidth = 1.2; ctx.lineCap = "round"; ctx.stroke(); ctx.restore() }) }
const FLW = ["#f4b8c8", "#f2d13a", "#ffffff", "#b9a2ea", "#e0503c"];
// Meadows (Dan, Nov 12: "make meadows more visually appealing"): two or three drifts of mixed wildflowers (daisies, poppies,
// cornflowers, buttercups, lavender) over a soft sunlit patch, seeded per tile. Heads twinkle and sway half a pixel.
const MFL = [["#ffffff", "#f2c531"], ["#e5573f", "#3b2a2a"], ["#5b8fe0", "#d9e6ff"], ["#f4c531", "#fff3b0"], ["#a985da", "#a985da"]];
function flowers(cx, cy, h, t, full) { const r = rng("mf", h), drifts = full ? 4 : 3;
  for (let d = 0; d < drifts; d++) { const a = r() * Math.PI * 2, rr = 5 + r() * 9, dx = cx + Math.cos(a) * rr * 1.3, dy = cy + Math.sin(a) * rr * .55, kind = Math.floor(r() * 5), n = 6 + Math.floor(r() * 4);
    ell(dx, dy + 1, 10, 4.2, "rgba(255,252,214,.35)");
    for (let i = 0; i < n; i++) { const x0 = dx + (r() - .5) * 15, y = dy + (r() - .5) * 6, k = (i + d) % 4 === 3 ? (kind + 1) % 5 : kind, [c1, c2] = MFL[k], sw = reduce ? 0 : .5 * Math.sin(t * 1.4 + h * .3 + i), x = x0 + sw, st = 2.5 + r() * 2.5;
      line([[x0, y + 1], [x, y + 1 - st]], "rgba(78,128,66,.75)", .9); const hy = y + 1 - st;
      ctx.globalAlpha = .85 + .15 * osc(t, 2.4 + (i % 4) * .4, (h * 3 + i + d) * .13);
      if (k === 0) { for (let q = 0; q < 5; q++) { const b = q / 5 * Math.PI * 2; ell(x + Math.cos(b) * 1.5, hy + Math.sin(b) * .9, 1.1, .8, c1) } ell(x, hy, .9, .7, c2) }
      else if (k === 4) { for (let q = 0; q < 3; q++) ell(x, hy - q * 1.5, 1, .8, q ? "#c3a6ec" : c1) }
      else { ell(x, hy, k === 3 ? 1.6 : 2, k === 3 ? 1.3 : 1.6, c1); ell(x - .2, hy - .2, .7, .55, c2) }
      ctx.globalAlpha = 1 } } }
function mountain(cx, cy, t, face) {
  ell(cx + 4, cy + 9, 34, 10, "rgba(50,70,70,.2)");
  const fx = face == null ? null : (() => { const a = -60 * face * Math.PI / 180, q = proj(R * .82 * Math.cos(a), R * .82 * Math.sin(a)); return [q.x, q.y] })();
  const fall = () => { if (!fx) return; const x0 = cx + fx[0] * .3, y0 = cy - 30 + Math.max(0, fx[1]) * .2, x1 = cx + fx[0], y1 = cy + fx[1], mx = (x0 + x1) / 2 + 3, my = (y0 + y1) / 2;
    const P = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1) };
    P(); ctx.strokeStyle = "#7fb6c9"; ctx.lineWidth = 5.5; ctx.lineCap = "round"; ctx.stroke(); P(); ctx.strokeStyle = "#cfe9f0"; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.save(); ctx.setLineDash([3, 5]); ctx.lineDashOffset = reduce ? 0 : -(t % 1.6) / 1.6 * 32; P(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
    ell(x1, y1 + 2, 9, 3.8, "#a9d4e2"); ell(x1 - 2, y1 + 1, 4, 1.4, "rgba(255,255,255,.6)") };
  if (fx && fx[1] < 0) fall(); // a water side at the back shows behind the peak
  poly([[cx + 6, cy + 8], [cx + 19, cy - 24], [cx + 33, cy + 5]], "#aeb8c2"); poly([[cx + 19, cy - 24], [cx + 33, cy + 5], [cx + 20, cy + 7]], "#8995a3");
  poly([[cx - 30, cy + 7], [cx - 4, cy - 50], [cx + 26, cy + 6]], "#b9c4cc"); poly([[cx - 4, cy - 50], [cx + 26, cy + 6], [cx + 4, cy + 10]], "#8e9aa8");
  for (let i = 0; i < 5; i++) { const k = .3 + i * .12; line([[cx - 4 - 24 * k, cy - 50 + 56 * k], [cx - 4 - 24 * k + 7, cy - 50 + 56 * k + 4]], "rgba(120,135,150,.35)", 1) }
  poly([[cx - 4, cy - 50], [cx - 14, cy - 30], [cx - 8, cy - 33], [cx - 3, cy - 27], [cx + 3, cy - 32], [cx + 9, cy - 28]], "#f7fafb");
  poly([[cx - 4, cy - 50], [cx + 9, cy - 28], [cx + 3, cy - 32], [cx - 1, cy - 30]], "#dfe8ee");
  poly([[cx + 19, cy - 24], [cx + 14, cy - 15], [cx + 18, cy - 17], [cx + 23, cy - 13]], "#f7fafb");
  ctx.globalAlpha = .9; poly([[cx - 30, cy + 7], [cx - 18, cy - 3], [cx - 8, cy + 1], [cx + 4, cy - 4], [cx + 14, cy + 2], [cx + 26, cy + 6], [cx + 33, cy + 5], [cx + 20, cy + 10], [cx - 10, cy + 11]], "#5f8f6a"); ctx.globalAlpha = 1;
  if (fx && fx[1] >= 0) fall() }
function cloud(x, y, s) { // a soft cumulus: white puffs with a cool shaded base
  const bumps = [[-30, 4, 15], [-12, -7, 19], [10, -3, 17], [28, 5, 12], [0, 7, 20]];
  ctx.globalAlpha = .9; ctx.beginPath(); for (const [a, b, r] of bumps) { ctx.moveTo(x + (a + r) * s, y + b * s + 3 * s); ctx.ellipse(x + a * s, y + b * s + 3 * s, r * s, r * s * .78, 0, 0, 7) } ctx.fillStyle = "#dbe7ea"; ctx.fill();
  ctx.beginPath(); for (const [a, b, r] of bumps) { ctx.moveTo(x + (a + r) * s, y + b * s); ctx.ellipse(x + a * s, y + b * s, r * s, r * s * .78, 0, 0, 7) } ctx.fillStyle = "#fbfdfd"; ctx.fill(); ctx.globalAlpha = 1 }
// ---------- wildlife (cosmetic only, LOU-280): at most three at once, never on the river's end or a target tile
function critters(t) {
  if (reduce || S.phase === "pick") return; const far = q => (!S.head || hexDist(q, S.head) >= 2) && !(sel && same(sel, q)), out = [];
  const pickT = f => { let best = null, bh = 1e9; for (const p of ORDER) { const c = at(p); if (!f(c, p) || !far(p)) continue; const h = hsh(p[0] * 3, p[1] * 5); if (h < bh) { bh = h; best = p } } return best };
  const L = S.lakes.find(L => L.filled); if (L) out.push(["ducks", L.tiles[Math.floor(L.tiles.length / 2)]]);
  const mq = pickT(c => !c.river && (c.g === MEADOW || (c.t === "meadow" && !c.g))); if (mq) out.push(["fly", mq]);
  const rq = pickT(c => c.river && c.t !== "ocean" && c.t !== "lake" && c.t !== "source"); if (rq) out.push(["drag", rq]);
  const gq = pickT((c, p) => !c.river && (c.g === 1 || c.g === MEADOW) && !nbrs(p).some(n => at(n).g >= TREES)); if (gq) out.push(["deer", gq]);
  for (const [k, p] of out.slice(0, 3)) { const o = iso(...p), h = hsh(...p);
    if (k === "ducks") for (const [dx, ph] of [[-7, 0], [8, .4]]) { const x = o.x + dx + Math.sin(t / 7 + ph * 5) * 4, y = o.y + 3 + Math.sin(t * 1.6 + ph * 4) * .8;
      ell(x, y + 2, 6, 1.6, "rgba(255,255,255,.4)"); ell(x, y, 5.5, 3, "#8a6a48"); ell(x - 1, y - .8, 3, 1.4, "#a8896a"); ell(x + 4, y - 3.5, 2.2, 2, "#2f6a4a"); poly([[x + 6, y - 3.8], [x + 8.6, y - 3.2], [x + 6, y - 2.6]], "#f2c14e") }
    if (k === "fly") for (const ph of [0, .5]) { const a = t * .9 + ph * 7 + h, x = o.x + Math.sin(a) * 14, y = o.y - 12 + Math.sin(a * 1.7) * 6 + ph * 6, f = Math.abs(Math.sin(t * 14 + ph * 3));
      for (const sg of [-1, 1]) { ctx.save(); ctx.translate(x, y); ctx.scale(sg * (.25 + f * .75), 1); ell(2.6, -1, 2.8, 2.2, ph ? "#ffffff" : "#f2a86b"); ell(2, 1.6, 1.8, 1.4, ph ? "#e8eef0" : "#f6c79a"); ctx.restore() } line([[x, y - 2], [x, y + 2]], "#4a3a2a", 1) }
    if (k === "drag") { const seg = Math.floor(t / 1.6), u = smooth(Math.min(1, (t % 1.6) / .35)), P = n => [o.x + (hsh(n, h) % 30) - 15, o.y - 10 - (hsh(h, n) % 10)], a = P(seg), b = P(seg + 1), x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      ctx.globalAlpha = .55 + .3 * Math.abs(Math.sin(t * 30)); for (const [wx, wy] of [[-4, -1.5], [4, -1.5], [-3.4, 1], [3.4, 1]]) ell(x + wx, y + wy, 3.6, 1.1, "#e6f6f8"); ctx.globalAlpha = 1; line([[x, y - 3], [x, y + 6]], "#2f8a9a", 1.6); ell(x, y - 3.5, 1.4, 1.4, "#2f6a7a") }
    if (k === "deer") { const up = Math.max(0, Math.sin((t + h) / 6 * TAU)) > .8 ? -5 : 2; deerSprite(o.x + 6, o.y - 6, up) } }
}
// a leafy branch overhanging the top-left corner like a painted foreground, swaying slightly from its stem
function branch(t) { if (lay.w < 340) return; ctx.save(); ctx.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0); ctx.translate(-6, lay.topH + 8); ctx.rotate(osc(t, 5.5) * 1 * Math.PI / 180);
  const r = rng("branch"); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(60, 8, 128, 34); ctx.strokeStyle = "#6b4a32"; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.stroke();
  for (let i = 0; i < 15; i++) { const u = .1 + i / 16, x = u * 128, y = 8 * u * 2 * (1 - u) + 34 * u * u * .98, a = (i % 2 ? .6 : -.5) + (r() - .5) * .5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + .9); ctx.beginPath(); ctx.ellipse(0, 7, 3.4, 8, 0, 0, TAU); ctx.fillStyle = ["#3f7f5c", "#5f9a64", "#93cf8f"][i % 3]; ctx.globalAlpha = .92; ctx.fill(); ctx.restore() }
  ctx.restore() }
// Fish: one for every 4 river tiles once the river is 6 long (they also count toward the Perfection score).
function fishCount() { const n = S.tiles.flat().filter(c => c.river && c.t !== "source" && c.t !== "ocean").length; return n >= 6 ? Math.floor(n / 4) : 0 }
function deerSprite(x, y, b) { ell(x, y + 10, 12, 3, "rgba(60,45,30,.2)"); line([[x - 7, y + 9], [x - 7, y + 1]], "#6b4326", 2); line([[x + 6, y + 9], [x + 5, y + 1]], "#6b4326", 2);
  inkEll(x, y, 10, 5, "#b0703c"); inkEll(x + 10, y - 6 + b, 4, 3.5, "#b0703c"); line([[x + 10, y - 9 + b], [x + 8, y - 15 + b], [x + 5, y - 17 + b]], "#6b4326", 1.6); line([[x + 11, y - 9 + b], [x + 14, y - 15 + b]], "#6b4326", 1.6) }
function bee(x, y, t, ph) { // a little inked bee; only its wings flicker
  ctx.globalAlpha = .55 + .35 * osc(t, 1.2, ph); ell(x - 1, y - 4, 3, 2, "#ffffff"); ell(x + 2, y - 4, 3, 2, "#ffffff"); ctx.globalAlpha = 1;
  inkEll(x, y, 4.5, 3, "#f5d04a", "#3a2600", 1); line([[x - 1, y - 2.5], [x - 1, y + 2.5]], "#3a2600", 1.2); line([[x + 1.6, y - 2.2], [x + 1.6, y + 2.2]], "#3a2600", 1.2) }
function fish(x, y, dir) { ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(0, -5, 7, 0); ctx.quadraticCurveTo(0, 5, -7, 0); ctx.moveTo(7, 0); ctx.lineTo(12, -3.5); ctx.lineTo(12, 3.5); ctx.closePath();
  ctx.fillStyle = "rgba(29,74,107,.45)"; ctx.fill(); ctx.restore() }
function source(o, t) { // the source: a small pool with ripple rings spreading out
  ell(o.x, o.y + 2, 21, 10.5, "rgba(90,140,110,.35)"); ell(o.x, o.y + 1, 19, 9.5, "#a9d4e2"); ell(o.x + 1, o.y + 2, 11, 5, "#7fb6c9"); ell(o.x - 5, o.y - 1, 9, 3.4, "rgba(255,255,255,.5)");
  if (reduce) return; for (const ph of [0, .5]) { const k = (t / 2.4 + ph) % 1; ctx.globalAlpha = (1 - k) * .8; ctx.beginPath(); ctx.ellipse(o.x, o.y + 1, 5 + k * 14, 2.5 + k * 7, 0, 0, 7); ink("#ffffff", 1.3); ctx.globalAlpha = 1 } }
function lodge(cx, cy, pond, t, h) { // a beaver lodge on the bank; once dammed, a stick dam across the water
  if (pond) for (let i = 0; i < 5; i++) line([[cx - 14 + i * 6, cy + 4 + i * 1.5], [cx - 9 + i * 6, cy - 2 + i * 1.5]], "#6b4a2b", 3);
  const x = cx + 13, y = cy - 6; ell(x + 1, y + 4, 11, 4, "rgba(60,45,30,.2)"); ctx.beginPath(); ctx.ellipse(x, y, 10, 8, 0, Math.PI, 0); ctx.closePath(); ctx.fillStyle = "#7a5233"; ctx.fill(); ink(INK_M, 1.2);
  for (let i = 0; i < 4; i++) line([[x - 9 + i * 5, y], [x - 6 + i * 4, y - 6 - (i % 2) * 2]], "#4a2f1a", 1.4); ell(x, y - 1, 2.5, 2, "#2a1a0e") }
function caveArch(cx, cy, c, t, h) { // an inked rock arch over a dark opening, with a numbered paper tag
  ctx.beginPath(); ctx.moveTo(cx - 20, cy + 6); ctx.quadraticCurveTo(cx - 22, cy - 22, cx, cy - 26); ctx.quadraticCurveTo(cx + 22, cy - 22, cx + 20, cy + 6); ctx.closePath(); ctx.fillStyle = "#9c958c"; ctx.fill(); ink(INK_M, 1.5);
  ctx.beginPath(); ctx.moveTo(cx + 2, cy - 26); ctx.quadraticCurveTo(cx + 22, cy - 22, cx + 20, cy + 6); ctx.lineTo(cx + 10, cy + 6); ctx.closePath(); ctx.fillStyle = "#857e75"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - 10, cy + 6); ctx.quadraticCurveTo(cx - 11, cy - 12, cx, cy - 13); ctx.quadraticCurveTo(cx + 11, cy - 12, cx + 10, cy + 6); ctx.closePath(); ctx.fillStyle = "#2a221c"; ctx.fill(); ink(INK_M, 1.2);
  if (c.river) { inkEll(cx, cy + 5, 9, 3, "#3d8fc4", "#2c5f80", 1); if (!reduce) { const k = (t / 1.8 + h / 10) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(cx, cy + 5, 4 + k * 6, 1.5 + k * 2, 0, 0, 7); ink("#f4fbff", 1); ctx.globalAlpha = 1 } }
  if (c.dry) { ctx.globalAlpha = .6; ell(cx, cy - 2, 9, 7, "#ddcba5"); ctx.globalAlpha = 1 }
  if (c.cave) tag(cx + 16, cy - 26, String(c.cave), "#3d2a17", 12) }
// A small paper tag with an ink border and handwriting.
function tag(x, y, text, col, size = 15) { ctx.save(); ctx.font = `800 ${size - 2}px ${HAND}`; const w = Math.max(18, ctx.measureText(text).width + 14), hh = size + 5;
  const pill = (dx, dy) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2 + dx, y - hh / 2 + dy, w, hh, hh / 2) : ctx.rect(x - w / 2 + dx, y - hh / 2 + dy, w, hh) };
  pill(0, 1.5); ctx.fillStyle = "rgba(30,60,70,.16)"; ctx.fill(); pill(0, 0); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fill();
  ctx.fillStyle = col; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y + 1); ctx.restore() }
function deco(p, c, o, t, h) {
  const {x: cx, y: cy} = o;
  if (c.t === "cave") { caveArch(cx, cy, c, t, h); return }
  if (c.t === "source") { source(o, t); return }
  if (c.t === "spring" && !c.river && !reduce) { const k = (t / 2.6 + h / 13) % 1; ctx.globalAlpha = (1 - k) * .7; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 4 + k * 12, 2 + k * 6, 0, 0, 7); ink("#f4fbff", 1.2); ctx.globalAlpha = 1 }
  if (c.river && c.t === "lake" && !reduce && h % 3 === 0) { const k = (t / 5 + h / 9) % 1; ctx.globalAlpha = Math.sin(k * Math.PI) * .6; ctx.beginPath(); ctx.ellipse(cx, cy, 6 + k * 18, 3 + k * 9, 0, 0, 7); ink("#e8f6ff", 1.2); ctx.globalAlpha = 1 }
  if (c.river) { if (c.beaver) lodge(cx, cy, c.beaver === 2, t, h); return } // river tiles are drawn with the river
  if (c.t === "ocean") return;
  if (c.t === "marsh") { const on = marshBy(p);
    for (const [rx, ry, hgt] of [[-16, -4, 13], [-12, -7, 16], [4, 6, 12], [8, 3, 15], [14, 8, 11], [-2, -10, 12]]) { const x0 = cx + rx, y0 = cy + ry;
      ctx.save(); ctx.translate(x0, y0); ctx.rotate(osc(t, 3.2, (rx + ry) * .05) * 4 * Math.PI / 180); line([[0, 0], [0, -hgt]], "#4a6b3a", 1.6);
      if (hgt > 13) { ctx.beginPath(); ctx.ellipse(0, -hgt + 3, 1.9, 4, 0, 0, 7); ctx.fillStyle = "#7a4a2a"; ctx.fill(); ink(INK_M, .7) } ctx.restore() }
    if (on && marshGreen(p)) tag(cx, cy - 26, "+1 flow", "#1d8f78", 13);
    return }
  if (c.fire) { tree("round", 0, cx - 12, cy + 1, .75, 0, 0, true); tree("pine", 1, cx + 11, cy - 3, .8, 0, 0, true);
    for (let i = 0; i < 4; i++) { const fx0 = cx - 15 + i * 10, fl = reduce ? 1 : .85 + .15 * osc(t, 1.1, i * .3), fy = cy - 6 - i % 2 * 8;
      ctx.beginPath(); ctx.moveTo(fx0 - 6, fy + 8); ctx.quadraticCurveTo(fx0 - 7, fy - 8 * fl, fx0, fy - 20 * fl); ctx.quadraticCurveTo(fx0 + 7, fy - 8 * fl, fx0 + 6, fy + 8); ctx.fillStyle = "#f08a3a"; ctx.fill(); ink("#8a3a1a", 1);
      ctx.beginPath(); ctx.moveTo(fx0 - 3, fy + 7); ctx.quadraticCurveTo(fx0 - 3, fy - 3 * fl, fx0, fy - 10 * fl); ctx.quadraticCurveTo(fx0 + 3, fy - 3 * fl, fx0 + 3, fy + 7); ctx.fillStyle = "#f5d04a"; ctx.fill() }
    return }
  if (c.alp) { tufts(cx, cy, h + 2, t); const sn = c.snow || 0;
    for (const [dx, dy, s, i] of [[3, -11, .7, 3], [12, -3, .82, 1], [-14, 2, .78, 0], [0, 9, .9, 2]]) { tree("pine", i, cx + dx, cy + dy, s, i * .21 + h * .01, t); ell(cx + dx, cy + dy - 30 * s, 3 * s, 2 * s, "#ffffff") }
    for (let i = 0; i < sn; i++) inkEll(cx - 10 + i * 9, cy + 12 - (i % 2) * 3, 5, 2.4, "#fbf7ee", "rgba(90,64,41,.4)", .8);
    if (sn) tag(cx + 18, cy - 22, `${sn} snow`, "#2f7fb8", 13);
    return }
  if (c.g >= TREES) { const kinds = treeKinds(p); // three trees a tile (four in wild forest), back to front
    for (const [dx, dy, k, i] of [[2, -12, .74, 3], [13, -4, .86, 1], [-14, 1, .82, 0], [-1, 9, .95, 2]].filter(q => c.wild || q[3] !== 3)) tree(kinds[i], (h + i) % 4, cx + dx, cy + dy, k, (h * 7 + i * 5) % 10 / 10, t, c.wild); return }
  if ((c.t === "meadow" && !c.g) || c.g === MEADOW) { flowers(cx, cy, h, t, c.bloom || c.g === MEADOW); return }
  if (c.g === 1 || (c.bloom && c.t !== "spring")) { tufts(cx, cy, h, t); return }
  if (c.beaver === 1) { ell(cx + 2, cy + 6, 22, 7, "rgba(60,45,30,.2)"); ctx.beginPath(); ctx.ellipse(cx, cy, 20, 13, 0, Math.PI, 0); ctx.closePath(); ctx.fillStyle = "#7a5233"; ctx.fill(); ink(INK_M, 1.4);
    for (let i = 0; i < 6; i++) line([[cx - 18 + i * 7, cy - 1], [cx - 12 + i * 6, cy - 10 - (i % 2) * 3]], "#4a2f1a", 1.8); ell(cx, cy - 1, 4, 3, "#2a1a0e"); return }
  if (c.beaver === 2) { for (let i = 0; i < 5; i++) line([[cx + 10 + i * 2, cy + 9 - i * 3], [cx + 18 + i * 2, cy + 7 - i * 3]], "#6b4a2b", 2.5); return }
  if (c.fert && c.t === "bare" && !c.ro) { for (const [sx, sy, i] of [[-10, 2, 0], [2, -4, 1], [10, 6, 2], [-2, 10, 3]]) { ctx.save(); ctx.translate(cx + sx, cy + sy); ctx.rotate(osc(t, 2.8, i * .2 + h * .01) * 4 * Math.PI / 180);
    line([[0, 0], [0, -6]], "#4a7a32", 1.5); inkEll(-2, -6, 2.4, 1.3, "#93c565", "#4a7a32", .6); inkEll(2, -7, 2.4, 1.3, "#93c565", "#4a7a32", .6); ctx.restore() } return }
  if (c.t === "boulder") mountain(cx, cy, t, c.ws);
}

function draw() {
  if (!S) return; objCheck();
  const T = now(), t = (T - t0) / 1000, mv = moves(), aim = objAim(), tq = TUT && S.phase === "play" && (aim || tutUi()); // tq: a tutorial step has a target, so other hints stay quiet
  // the cached layers: the sky and sea (screen space, cheap) and the island (world space, painted at a fixed resolution)
  const lw = B.w + 2 * LPAD, lh = B.h + 2 * LPAD; ps = Math.min(Math.pow(2, Math.ceil(Math.log2(scale) * 2) / 2), 4096 / Math.max(lw, lh));
  const vk = [cv.width, cv.height, scale.toFixed(4), off.x.toFixed(1), off.y.toFixed(1)].join();
  const lk = ps + "|" + S.tiles.map(r => r.map(c => [c.t, c.g, c.river ? 1 : 0, c.ro, c.rs ? 1 : 0, c.alp ? 1 : 0, c.beaver, c.pool ? 1 : 0, c.moss ? 1 : 0, c.ash ? 1 : 0, c.fire ? 1 : 0, c.dry ? 1 : 0, c.bloom ? 1 : 0, c.wild ? 1 : 0].join("")).join(",")).join(";")
    + S.lakes.map(L => L.filled ? 1 : 0).join("") + (HAS_MARSH ? S.tiles.flatMap((r, y) => r.map((c, x) => c.t === "marsh" && marshBy([x, y]) ? 1 : 0)).join("") : "");
  if (seaKey !== vk) { if (seaC.width !== cv.width || seaC.height !== cv.height) { seaC.width = cv.width; seaC.height = cv.height } ctx = seaC.getContext("2d"); ctx.save(); paintSea(); ctx.restore(); ctx = mainCtx; seaKey = vk }
  if (landKey !== lk) { landC.width = Math.ceil(lw * ps); landC.height = Math.ceil(lh * ps); ctx = landC.getContext("2d"); ctx.save(); ctx.setTransform(ps, 0, 0, ps, -(B.x - LPAD) * ps, -(B.y - LPAD) * ps); paintLand(); ctx.restore(); ctx = mainCtx; landKey = lk }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(seaC, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, off.x, off.y);
  // sky clouds that barely drift; slow glints on the sea; the foam ring breathing around the shore
  if (!reduce) for (let i = 0; i < 3; i++) { const k = ((t / 260) + i * .37) % 1; cloud(B.x - 120 + k * (B.w + 240), HORIZON - 70 - i * 34 - (i % 2) * 14, .9 - i * .15) }
  else for (let i = 0; i < 2; i++) cloud(B.x + B.w * (.25 + i * .45), HORIZON - 70 - i * 30, .8);
  for (const [x, y, i] of WAVES) { if (y < HORIZON + 10) continue; ctx.globalAlpha = reduce ? .35 : .2 + .3 * Math.max(0, osc(t, 5 + (i % 4), i * .13)); ell(x, y, 9, 1.4, "#ffffff"); ctx.globalAlpha = 1 }
  if (foamPath) { ctx.save(); ctx.lineCap = "round"; ctx.globalAlpha = reduce ? .6 : .55 + .2 * osc(t, 4.5); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.stroke(foamPath);
    ctx.globalAlpha *= .45; ctx.lineWidth = 12; ctx.stroke(foamPath); ctx.restore() }
  ctx.drawImage(landC, B.x - LPAD, B.y - LPAD, landC.width / ps, landC.height / ps);
  // grass "wind": a very faint brightening that passes over the island; it never moves anything
  if (!reduce && topPath) { const k = (t / 9) % 1, x = B.x - 200 + k * (B.w + 400), g = ctx.createLinearGradient(x - 90, 0, x + 90, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.5, "rgba(255,255,255,.1)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save(); ctx.clip(topPath); ctx.fillStyle = g; ctx.fillRect(x - 90, B.y, 180, B.h); ctx.restore() }
  const badges = [], wd = T - wave < 4000 ? riverDist() : null;
  // a lake still filling shows its empty basin fading out
  for (const p of ORDER) { const c = at(p); if (c.t === "lake" && c.river && prog(p + "") < 1) { ctx.globalAlpha = 1 - prog(p + ""); rpath(hexPts(p, R - 2), 10); ctx.fillStyle = "#dfe7d8"; ctx.fill(); ctx.globalAlpha = 1 } }
  drawRivers(t);
  for (const p of ORDER) {
    const c = at(p), o = iso(...p), h = hsh(...p);
    const kg = prog("g:" + p);
    if (kg < 1) { ctx.globalAlpha = 1 - kg; ctx.beginPath(); ctx.ellipse(o.x, o.y, 10 + kg * 34, 5 + kg * 17, 0, 0, 7); ink("rgba(255,255,255,.9)", 2.6); ctx.globalAlpha = 1 } // the green ripple
    const s = kg < 1 ? easeBack(kg) : 1;
    if (s !== 1) { ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s, s); ctx.translate(-o.x, -o.y) }
    deco(p, c, o, t, h);
    if (s !== 1) ctx.restore();
  }
  if (!TUT && hsel && S.phase === "play" && mv.size) { ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); for (const k of mv.keys()) hexPts(k.split(",").map(Number), R - 2).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.fillStyle = "rgba(222,228,229,.34)"; ctx.fill("evenodd") } // the river's end is selected: the tiles it can flow to stay bright
  if (tq && !aim) { ctx.fillStyle = "rgba(222,228,229,.62)"; ctx.fillRect(-1e5, -1e5, 2e5, 2e5) } // the target is a button: grey the whole board
  else if (aim && TUT) { ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); for (const k of aim) hexPts(k.split(",").map(Number), R - 2).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.fillStyle = "rgba(222,228,229,.62)"; ctx.fill("evenodd") } // tutorial: everything but the target greys out
  else if (aim) { ctx.beginPath(); for (const p of ORDER) { if (aim.has(p + "") || !landTile(p)) continue; hexPts(p, R - 2).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath() } ctx.fillStyle = TUT ? "rgba(30,50,60,.34)" : "rgba(30,50,60,.16)"; ctx.fill() } // the objective's target stays bright, the rest dims a little
  for (const p of ORDER) {
    const c = at(p), o = iso(...p), h = hsh(...p), d = () => hexPts(p, R - 4);
    if (wd && c.river && wd.has(p + "")) { const k = (T - wave - wd.get(p + "") * 90) / 450; if (k > 0 && k < 1) { ctx.globalAlpha = Math.sin(k * Math.PI) * .35; rpath(d(), 8); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.globalAlpha = 1 } }
    const m = hsel && S.phase === "play" && (!TUT || !aim || aim.has(p + "")) ? mv.get(p + "") : null, pk = c.t === "source" && !c.river && ((S.phase === "pick" && (!M.mainSource || p + "" === M.mainSource + "")) || (TRIB && S.phase === "play"));
    if (m || pk) { // a target tile: an amber wash with a marching dashed outline and a cost bubble; grey if you can't afford it
      const ok = pk || S.water >= m.cost, pu = reduce ? 1 : .5 + .5 * osc(t, 1.6, h * .03); rpath(d(), 9); ctx.fillStyle = ok ? `rgba(255,224,150,${.3 + .12 * pu})` : "rgba(150,150,150,.22)"; ctx.fill();
      if (ok) { rpath(hexPts(p, R - 9), 8); ctx.fillStyle = "rgba(255,255,240,.22)"; ctx.fill() } // a soft lit centre
      ctx.save(); if (ok) { ctx.shadowColor = "#ffcf6a"; ctx.shadowBlur = (12 + 6 * pu) * scale } rpath(d(), 9); ink(ok ? `rgba(255,212,120,${.85 + .15 * pu})` : "rgba(150,150,150,.75)", 3.4); ctx.restore();
      if (ok) { rpath(d(), 9); ink("rgba(255,255,255,.75)", 1.2) }
      badges.push({o, pk, ok, text: pk ? `+${c.yield}` : m.cost ? `−${m.cost}` : "0", sand: !!m && c.t === "sand"});
    } else if (c.ro === 1 && !c.river) { badges.push({o, drop:true});
    } else if (PLACE && S.phase === "pick" && placeable(p)) { // tiles you can place a source on glow softly (LOU-263)
      rpath(d(), 8); ctx.fillStyle = `rgba(255,255,255,${.2 + .12 * osc(t, 2.5, h * .05)})`; ctx.fill();
    } else if (plantable(p) && (!c.pre || riverBy(p)) && (!tq || (aim && aim.has(p + "")))) { // a map's own greens away from the river can still be grown by tapping
      ctx.save(); ctx.setLineDash([4, 5]); rpath(d(), 8); ink(S.water >= growCost(c) ? "rgba(255,255,255,.6)" : "rgba(150,150,150,.35)", 1.4); ctx.restore();
      badges.push({o, plant:true, ok:S.water >= growCost(c)});
    }
  }
  // Landscape mode: the river's whole run, an inked dashed line with a number where each water cycle ends
  // groves: a golden thread through the tiles and the flow they give
  for (const k of combos()) { for (const q of k.bees) { const o = iso(...q), h = hsh(...q); bee(o.x - 9, o.y - 18, t, h * .1); bee(o.x + 11, o.y - 10, t, h * .1 + .5) }
    const pts = k.tiles.map(q => { const o = iso(...q); return [o.x, o.y + 6] }), P = q => { const o = iso(...q); return [o.x, o.y + 6] };
    ctx.save(); ctx.setLineDash([3, 6]); ctx.lineDashOffset = reduce ? 0 : -(t % 1.5) / 1.5 * 9; for (const [a, b] of k.links) line([P(a), P(b)], "rgba(255,217,138,.95)", 2.6); ctx.restore();
    const mid = pts[Math.floor(pts.length / 2)]; badges.push({o:{x:mid[0], y:mid[1] - 34}, combo:`+${k.bonus}`}) }
  // fish come to long rivers
  const rl = fishCount(); if (rl) { let i = 0; for (const p of ORDER) { const c = at(p); if (!c.river || c.t === "source" || c.t === "ocean" || c.t === "lake" || hsh(...p) % 3) continue; if (i++ >= rl) break;
    const o = iso(...p), k = osc(t, 4.5, hsh(...p) * .1); fish(o.x + k * 8, o.y + 1.5, Math.cos((t / 4.5 + hsh(...p) * .1) * TAU) > 0 ? 1 : -1) } }
  critters(t);
  for (let i = deer.length - 1; i >= 0; i--) { const d = deer[i], k = (T - d.t0) / 2600; if (k >= 1 || reduce) { deer.splice(i, 1); continue }
    const o = iso(...d.p); ctx.globalAlpha = Math.min(1, Math.sin(k * Math.PI) * 2); deerSprite(o.x + 8 - k * 20, o.y - 4, 0); ctx.globalAlpha = 1 }
  for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i], k = (T - b.t0) / 700; if (k >= 1 || reduce) { bolts.splice(i, 1); continue }
    const o = iso(...b.p); ctx.globalAlpha = 1 - k; line([[o.x + 10, o.y - 160], [o.x - 6, o.y - 100], [o.x + 8, o.y - 90], [o.x - 4, o.y - 20]], "#f5d04a", 5); line([[o.x + 10, o.y - 160], [o.x - 6, o.y - 100], [o.x + 8, o.y - 90], [o.x - 4, o.y - 20]], "#fffaf0", 2); ctx.globalAlpha = 1 }
  // the end of each stream: a dashed ink ring with marching dashes; selected, it's bolder with a teal wash
  for (const i of liveRivers()) for (const q of headTiles(i)) { const o = iso(...q), on = hsel && i === S.active, k = reduce ? 0 : (t / 1.6) % 1;
    if (on) ell(o.x, o.y, R * .7, R * .35, "rgba(255,255,255,.22)");
    ctx.beginPath(); ctx.ellipse(o.x, o.y, R * .62, R * .31, 0, 0, 7); ink("rgba(255,255,255,.95)", on ? 3.4 : 2.4);
    if (!reduce) { ctx.globalAlpha = (1 - k) * .8; ctx.beginPath(); ctx.ellipse(o.x, o.y, R * (.62 + .22 * k), R * (.31 + .11 * k), 0, 0, 7); ink("#ffffff", 2); ctx.globalAlpha = 1 } }
  if (aim) { const k = reduce ? 1 : .6 + .4 * osc(t, 1.4); for (const key of aim) { const q = key.split(",").map(Number); ctx.globalAlpha = k; rpath(hexPts(q, R - 1), 9); ctx.save(); ctx.shadowColor = "#ffd98a"; ctx.shadowBlur = 10 * scale; ink("#ffd98a", 3.5); ctx.restore(); ctx.globalAlpha = 1 } }
  if (sel) { rpath(hexPts(sel, R - 3), 9); ctx.fillStyle = "rgba(255,217,138,.25)"; ctx.fill(); ctx.save(); ctx.shadowColor = "#ffd98a"; ctx.shadowBlur = 10 * scale; ink("#ffd98a", 3); ctx.restore() }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i], k = (T - r.t0) / 350; if (k >= 1) { rings.splice(i, 1); continue }
    ctx.globalAlpha = 1 - k; rpath(hexPts(r.p, R * (1 + k * .25)), 9); ink("#ffffff", 2.2); ctx.globalAlpha = 1 }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const b of badges) badge(b, t);
  // paper clouds drift across, each with a shadow on the ground; inked birds cross now and then
  if (!reduce) {
    const bk = (t % 34) / 12; if (bk < 1) { const x0 = B.x - 60 + bk * (B.w + 120), y0 = B.y + B.h * .3 - bk * 40;
      for (const [dx, dy] of [[0, 0], [-16, 8], [-12, -9]]) { const x = x0 + dx, y = y0 + dy, f = osc(t, 1.1, dx * .02) * 3;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 2 - f); ctx.quadraticCurveTo(x - 4, y - 4 - f, x, y); ctx.quadraticCurveTo(x + 4, y - 4 - f, x + 8, y - 2 - f); ink("#55666a", 1.5) } } }
  // the water cycle: clouds go from where they spilled to where they'll rain; rain falls in streaks
  for (const c of S.clouds || []) { const k = clamp01(1 - (c.turn - S.turn - 1) / 2), a = c.from || c.to, b = c.to || c.from; if (!a) continue;
    const oa = iso(...a), ob = iso(...b), x = oa.x + (ob.x - oa.x) * k, y = oa.y + (ob.y - oa.y) * k - 92;
    cloud(x, y, .5); tag(x + 26, y - 14, `+${c.gal}`, "#2f7fb8", 14);
    if (c.turn === S.turn + 1 && !reduce) { ctx.globalAlpha = .55; for (let i = 0; i < 5; i++) { const dx = -22 + i * 11, dy = ((t * 26 + i * 13) % 26); line([[x + dx, y + 12 + dy], [x + dx - 3, y + 20 + dy]], "#3d8fc4", 1.6) } ctx.globalAlpha = 1 } }
  for (let i = rains.length - 1; i >= 0; i--) { const r = rains[i], k = (T - r.t0) / 1600; if (k >= 1 || reduce) { rains.splice(i, 1); continue }
    const o = iso(...r.p); ctx.globalAlpha = Math.sin(k * Math.PI); cloud(o.x, o.y - 100, .6);
    for (let j = 0; j < 9; j++) { const dx = -30 + j * 7.5, dy = ((k * 400 + j * 17) % 70); line([[o.x + dx, o.y - 86 + dy], [o.x + dx - 4, o.y - 74 + dy]], "#3d8fc4", 1.8) } ctx.globalAlpha = 1 }
  for (let i = birds.length - 1; i >= 0; i--) { const b = birds[i], k = (T - b.t0) / 1100; if (k >= 1 || reduce) { birds.splice(i, 1); continue } if (k < 0) continue;
    const oa = iso(...b.from), ob = iso(...b.to), x = oa.x + (ob.x - oa.x) * k, y = oa.y + (ob.y - oa.y) * k - 40 - Math.sin(k * Math.PI) * 50, f = Math.sin(k * TAU * 2) * 4;
    ctx.beginPath(); ctx.moveTo(x - 10, y - f); ctx.quadraticCurveTo(x - 4, y - 4, x, y + 1); ctx.quadraticCurveTo(x + 4, y - 4, x + 10, y - f); ink("#55666a", 2); ell(x + 2, y + 6, 2.2, 2.2, "#f5d04a") }
  if (sky && !reduce) { const k = (T - sky.t0) / 2200; if (k >= 1) sky = null; else { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const a = Math.sin(k * Math.PI);
    if (sky.kind === "rain") { ctx.strokeStyle = `rgba(61,143,196,${.45 * a})`; ctx.lineWidth = 1.6 * lay.dpr; ctx.beginPath(); for (let j = 0; j < 70; j++) { const x = (hsh(j, 1) / 97) * cv.width, y = ((hsh(1, j) / 97) * cv.height + k * cv.height * 1.6) % cv.height; ctx.moveTo(x, y); ctx.lineTo(x - 6 * lay.dpr, y + 22 * lay.dpr) } ctx.stroke() }
    else { ctx.fillStyle = `rgba(240,180,60,${.2 * a})`; ctx.fillRect(0, 0, cv.width, cv.height) }
    ctx.restore() } }
  // floating numbers: what a move gave or cost, in handwriting
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i], k = (T - f.t0) / 1300; if (k >= 1) { fx.splice(i, 1); continue } if (k < 0) continue;
    const o = iso(...f.p), y = o.y - 34 - 46 * (1 - Math.pow(1 - k, 2));
    ctx.globalAlpha = k < .75 ? 1 : (1 - k) / .25; ctx.font = `800 19px ${HAND}`;
    ctx.lineWidth = 4.5; ctx.strokeStyle = "rgba(25,55,65,.6)"; ctx.lineJoin = "round"; ctx.strokeText(f.text, o.x, y); ctx.fillStyle = f.col; ctx.fillText(f.text, o.x, y); ctx.globalAlpha = 1 }
  branch(t);
}
// Wave marks sit on open water around the island (worked out once).
const WAVES = []; for (let i = 0; i < 40; i++) { const x = B.x - 40 + (B.w + 80) * (hsh(i, 5) / 97), y = B.y + (B.h + 40) * (hsh(9, i) / 97);
  if (!ORDER.some(q => { const o = iso(...q); return Math.abs(o.x - x) < 64 && Math.abs(o.y - y + 12) < 46 })) WAVES.push([x, y, i]) }
function bubble(x, y, r, fill, text, col, font) { ell(x + 1, y + 2.5, r, r, "rgba(30,60,80,.22)"); ell(x, y, r, r, fill); ctx.beginPath(); ctx.ellipse(x, y, r, r, 0, 0, 7); ink("rgba(255,255,255,.95)", 2.2);
  ctx.fillStyle = col; ctx.font = font; ctx.fillText(text, x, y + 1) }
function badge(b, t) {
  const {o} = b;
  if (b.combo) { tag(o.x, o.y, b.combo + " flow", "#1d8f78", 15); return }
  if (b.drop) { ctx.globalAlpha = .8 + .2 * osc(t, 2.2, o.x * .01); tag(o.x + 4, o.y - 24, "+1 flow", "#1d8f78", 15); ctx.globalAlpha = 1; return } // a paper "+1 flow" tag until the river claims it
  if (b.plant) { const x = o.x, y = o.y + 4, f = b.ok ? "#7cc46a" : "#b9b6ac", k = b.ok ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.6)"; // a small inked sprout: you can plant here
    line([[x, y], [x, y - 7]], k, 1.4);
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.quadraticCurveTo(x - 8, y - 6, x - 9, y - 12); ctx.quadraticCurveTo(x - 2, y - 12, x, y - 5); ctx.fillStyle = f; ctx.fill(); ink(k, 1);
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 7, y - 8, x + 8, y - 14); ctx.quadraticCurveTo(x + 1, y - 14, x, y - 7); ctx.fillStyle = f; ctx.fill(); ink(k, 1); return }
  const y = o.y - 4;
  if (b.pk) bubble(o.x, y, 16, PAPER, b.text, "#1d8f78", `800 17px ${HAND}`);
  else bubble(o.x, y, 14, b.ok ? "#4a8fb8" : "#9aa0a4", b.text, PAPER, `800 15px ${HAND}`);
  if (b.sand) tag(o.x, y + 25, "−1 flow", "#1d8f78", 14);
}

// ---------- input
function tileAt(cx, cy) {
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
  const x = ((cx - r.left) * dpr - off.x) / scale, y = ((cy - r.top) * dpr - off.y) / scale;
  // back to world space, then the nearest hex centre (a hex is everything nearer its centre than any other)
  const a = x / .7071, b = y / .3536, wx = (a + b) / 2, wy = (b - a) / 2, ry = Math.round(wy / (1.5 * R)); let best = null, bd = 1e9;
  for (let yy = ry - 1; yy <= ry + 1; yy++) { const rx = Math.round((wx - (yy & 1 ? SQ3 * R / 2 : 0)) / (SQ3 * R));
    for (let xx = rx - 1; xx <= rx + 1; xx++) { if (!inside(xx, yy)) continue; const [cx, cy] = world(xx, yy), dd = Math.hypot(cx - wx, cy - wy); if (dd < bd) { bd = dd; best = [xx, yy] } } }
  return best && bd <= R ? best : null }
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
  if (TUT && !tutTap(p)) return;
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
$("end").onclick = () => tutGate("end") && endTurn(); $("undo").onclick = () => tutGate("undo") && undo(); $("restart").onclick = () => tutGate("restart") && restart(); $("again").onclick = restart;
addEventListener("keydown", e => { if (e.key === "Escape") closeCard(); });
addEventListener("keydown", e => { if (e.key === " " && !$("help").open && !$("goal").open) { e.preventDefault(); if (tutGate("end")) endTurn() } });
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
function loop() { if (tutArrive) arrive(); else if (tgt) glide(); else draw(); if (!reduce) requestAnimationFrame(loop) }
if (!load()) { S = fresh(); if (TUT) { $("welcome").hidden = false; if (!reduce) tutArrive = {hold:true} } }
if (TUT) document.body.classList.add("tut");
else if (S.phase === "pick" && !S.turn) showGoal(); // a new run opens on the map's goal card (the tutorial has none)
sync(); document.fonts && document.fonts.ready.then(() => { lastSize = ""; resize() }); loop();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register(SW_URL).catch(() => {}));

// for debugging / tests
window.FT = {get lay() { return lay }, get S() { return S }, set S(v) { S = v; anim.clear(); fx.length = 0 }, set quiet(v) { quiet = v }, get history() { return history }, get view() { return view }, get sel() { return sel }, moves, plantable, diamond, endTurn, restart, bloomCount, actions, combos, pick, placeSrc, placeable, score, objAim, objCheck, get obj() { return S.obj || 0 }, openInfo() { info = true }, drawMs(n = 20) { const a = now(); for (let i = 0; i < n; i++) draw(); return (now() - a) / n }, flows() { const ch = riverChains(); return chainFlows(ch).map((f, i) => [ch[i].tiles.map(String), f]) }, selectHead() { hsel = true }, scr(x, y) { const r = cv.getBoundingClientRect(), d = cv.width / r.width, o = iso(x, y); return [r.left + (o.x * scale + off.x) / d, r.top + (o.y * scale + off.y) / d] }, select(p) { sel = p },
  switchTo(i) { activate(i) },
  act(p, k) { const a = actions(p).find(a => a.k === k); if (!a || !canDo(a)) return false; a.run(); return true },
  tap(p) { const o = iso(...p), r = cv.getBoundingClientRect(), dpr = cv.width / r.width, cx = o.x, cy = o.y;
    cv.dispatchEvent(new PointerEvent("pointerup", {clientX:r.left + (cx * scale + off.x) / dpr, clientY:r.top + (cy * scale + off.y) / dpr, bubbles:true})) }};
})();
