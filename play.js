// Flow Tile: shared engine and UI for every map (Spring Hill, 1, 1a, 2, 3).
// Each map page sets window.MAP before loading this file:
//   id, label, types[], elev[], bloomGoal, turnGoal, startHint, help[] (HTML strings), next (URL or null)
//   pickHint: message when the player taps a non-source tile before starting (default: startHint)
//   tileCost: every tile costs this many gal before modifiers (omit for downhill 1 / flat 2)
//   lakeTileCost: gal per lake tile (default 2)
//   speedRule: "perLevel" (+1 per level dropped, flat -1) or "waterfall" (default: drop-1, so 2+ level drops)
//   showSpeed / showBloom: show those chips (default: shown when the map uses them)
(() => {
const M = window.MAP;
const SW_URL = new URL("sw.js", document.currentScript.src).href; // sw.js sits next to play.js
const TYPES = M.types, ELEV = M.elev, BLOOM_GOAL = M.bloomGoal, TURN_GOAL = M.turnGoal;
const LAKE_TILE_COST = M.lakeTileCost ?? 2;
const SHOW_SPEED = M.showSpeed ?? M.speedRule === "perLevel";
const SHOW_BLOOM = M.showBloom ?? BLOOM_GOAL > 0;
const W = TYPES[0].length, H = TYPES.length, TW = 96, TH = 48, ZH = 14;
const COL = {meadow:"#8fce5a",sand:"#f0d48a",rock:"#a9a49b",boulder:"#86b852",spring:"#8fce5a",lake:"#c9b98f",ocean:"#2f7fc4",source:"#7a8f9e",river:"#4aa3e8",bloom:"#45b043"};
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
      <div class="hud">
        <div class="chip water" id="cWater"><span>Water</span><b><i id="hWater">0</i><small>gal</small></b></div>
        <div class="chip" id="cFlow"><span>Flow</span><b><i id="hFlow">+0</i><small>/turn</small></b></div>
        ${SHOW_SPEED ? `<div class="chip" id="cSpeed"><span>Speed</span><b id="hSpeed">0</b></div>` : ""}
        <div class="chip"><span>Turn</span><b><i id="hTurn">0</i><small>/${TURN_GOAL}</small></b></div>
        ${SHOW_BLOOM ? `<div class="chip"><span>Bloom</span><b><i id="hBloom">0</i><small>/${BLOOM_GOAL}</small></b></div>` : ""}
      </div>
    </div>
    <div class="overlay bottom" id="bottom"><div class="msg" id="msg" role="status"></div></div>
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
    <button id="undo">Undo</button>
    <button id="restart">Restart</button>
    <button id="end" class="end">End turn</button>
  </div>
</div>
<dialog id="help" aria-labelledby="helpTitle">
  <h2 id="helpTitle">How to play</h2>
  <ul>
    <li><b>Water</b> is what you have, in gallons. <b>Flow</b> is how many gallons you get each turn.</li>
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
    const t = {".":"meadow",s:"sand",r:"rock",B:"boulder",o:"spring",L:"lake","~":"ocean",S:"source",T:"source"}[ch];
    tiles[y].push({t, e:+ELEV[y][x], river:false, bloom:false, lake:-1, yield:ch==="S"?2:ch==="T"?3:0, from:null});
  }}
  const lakes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = tiles[y][x]; if (c.t !== "lake" || c.lake >= 0) continue;
    const id = lakes.length, members = [], st = [[x, y]]; c.lake = id;
    while (st.length) { const p = st.pop(); members.push(p);
      for (const n of nbrs(p)) { const nc = tiles[n[1]][n[0]]; if (nc.t === "lake" && nc.lake < 0) { nc.lake = id; st.push(n) } } }
    lakes.push({tiles:members, filled:false});
  }
  return {tiles, lakes, phase:"pick", water:0, income:0, speed:0, turn:0, head:null, msg:M.startHint, warn:false};
}
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
function nbrs([x, y]) { return [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => [x+dx, y+dy]).filter(([a,b]) => inside(a, b)) }
const at = p => S.tiles[p[1]][p[0]];
function level(p) { const c = at(p); return c.t === "lake" && S.lakes[c.lake].filled ? c.e + 1 : c.e }

// ---------- rules
function cost(from, to) {
  const b = at(to);
  if (b.river || b.t === "boulder" || b.t === "source") return -1;
  if (b.e > level(from)) return -1;
  if (b.t === "lake") return LAKE_TILE_COST * S.lakes[b.lake].tiles.length;
  let c = M.tileCost ?? (b.e < level(from) ? 1 : 2); // sand costs the normal price; it cuts flow instead (see build)
  if (b.t === "spring") c = 0;
  return c;
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

function snapshot() { history.push(JSON.stringify(S)) }
function build(mv) {
  if (S.water < mv.cost) { say(`That tile costs ${mv.cost} gal and you have ${S.water} gal. End the turn to collect your flow of ${S.income} gal.`, true); return }
  snapshot();
  S.water -= mv.cost;
  const b = at(mv.p), drop = level(mv.from) - b.e;
  S.speed = M.speedRule === "perLevel" ? (drop > 0 ? S.speed + drop : Math.max(0, S.speed - 1)) : Math.max(0, S.speed + drop - 1);
  const notes = []; let bl = 0;
  if (b.t === "lake") { const L = S.lakes[b.lake]; L.filled = true;
    for (const p of L.tiles) { const c = at(p); c.river = true; c.bloom = false; c.from = mv.from }
    S.income += 1; for (const p of L.tiles) for (const n of nbrs(p)) bl += tryBloom(n);
    notes.push("Lake filled: flow +1 gal a turn"); bump("cFlow") }
  else { b.river = true; b.bloom = false; b.from = mv.from;
    if (b.t === "spring") { S.income += 1; notes.push("Spring joined: flow +1 gal a turn"); bump("cFlow") }
    if (b.t === "sand") { for (const n of nbrs(mv.p)) bl += tryBloom(n);
      const was = S.income; S.income = Math.max(0, S.income - 1);
      notes.push(was > S.income ? `Sand soaked up 1 flow: now +${S.income} gal a turn` : "Sand soaked the ground"); bump("cFlow") } }
  if (bl) notes.push(`${bl} tile${bl > 1 ? "s" : ""} bloomed`);
  if (M.speedRule === "perLevel") notes.push(drop >= 1 ? `Downhill: speed ${S.speed}` : S.speed ? `Flat: speed down to ${S.speed}` : "Flat: no speed");
  else if (drop >= 2) notes.push("Waterfall! Speed up");
  S.head = mv.p;
  if (b.t === "ocean") { S.phase = "won"; say(`You reached the sea on turn ${S.turn}.`); return }
  if (!moves().size) { S.phase = "stuck"; say("Dead end: nowhere left to go. Undo or restart.", true); return }
  if (S.income === 0 && !affordable()) { S.phase = "stuck"; say("Your flow is 0 and you can't afford another tile. Undo or restart.", true); return }
  if (!affordable()) notes.push(`Out of water. End the turn for +${S.income} gal`);
  say(notes.length ? notes.join(". ") + "." : "Keep building, or end the turn.");
}
function endTurn() { if (S.phase !== "play") return; snapshot(); S.turn++; S.water += S.income; bump("cWater");
  say(`Turn ${S.turn}: +${S.income} gal of water.`) }
function pick(p) {
  const c = at(p); if (c.t !== "source") { say(M.pickHint ?? M.startHint, true); return }
  snapshot(); c.river = true; S.head = p; S.income = c.yield; S.turn = 1; S.water = c.yield; S.phase = "play";
  say(`Your source has a flow of ${c.yield} gal a turn. Tap a glowing tile to build.`);
}
function undo() { if (!history.length) return; S = JSON.parse(history.pop()); say("Stepped back.") }
function restart() { S = fresh(); history = []; say(M.startHint) }

// ---------- UI
function say(t, warn = false) { S.msg = t; S.warn = warn; sync() }
function bump(id) { const e = $(id); if (!e || reduce) return; e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump") }
function sync() {
  tx("hWater", S.water); tx("hFlow", "+" + S.income); tx("hSpeed", S.speed); tx("hTurn", S.turn); tx("hBloom", bloomCount());
  $("cSpeed")?.classList.toggle("fast", S.speed >= 1);
  $("msg").textContent = S.msg || ""; $("msg").classList.toggle("warn", !!S.warn);
  $("end").disabled = S.phase !== "play"; $("undo").disabled = !history.length;
  $("end").classList.toggle("ready", S.phase === "play" && !affordable());
  const won = S.phase === "won"; $("win").hidden = !won; $("bottom").hidden = won;
  if (won) {
    const bl = bloomCount(), goals = [[true, "Reached the sea"], [bl >= BLOOM_GOAL, BLOOM_GOAL ? `Bloomed ${bl}/${BLOOM_GOAL} tiles` : "Bloom goal (none on this map)"], [S.turn <= TURN_GOAL, `Turn ${S.turn} (goal: by turn ${TURN_GOAL})`]];
    const n = goals.filter(g => g[0]).length;
    $("wStars").innerHTML = "★".repeat(n) + `<span class="off">${"★".repeat(3 - n)}</span>`;
    $("wStars").setAttribute("aria-label", `${n} of 3 stars`);
    $("wGoals").innerHTML = goals.map(([ok, t]) => `<li class="${ok ? "got" : ""}">${t}</li>`).join("");
  }
  save(); resize(); draw();
}

// ---------- persistence: keep the current run across app close/reopen
const SAVE_KEY = "flowtile.run.v2." + M.id;
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({S, history})) } catch (_) {} }
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!d || !d.S || !Array.isArray(d.S.tiles) || d.S.tiles.length !== H || d.S.tiles[0].length !== W || !Array.isArray(d.history)) return false;
    S = d.S; history = d.history; return true;
  } catch (_) { return false }
}

// ---------- drawing (isometric prisms)
const cv = $("cv"), ctx = cv.getContext("2d");
let scale = 1, off = {x:0, y:0}, t0 = performance.now(), lastSize = "";
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
function resize() {
  const box = $("board"), w = box.clientWidth, h = box.clientHeight, dpr = Math.min(devicePixelRatio || 1, 3);
  if (!w || !h) return;
  const topH = $("top").offsetHeight, botH = $("bottom").hidden ? 0 : $("bottom").offsetHeight;
  const key = [w, h, topH, botH, dpr].join(); if (key === lastSize) return; lastSize = key;
  const availH = Math.max(40, h - topH - botH), s = Math.min(w / B.w, availH / B.h);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  scale = s * dpr;
  off = {x:(cv.width - B.w * scale) / 2 - B.x * scale, y:topH * dpr + (availH * dpr - B.h * scale) / 2 - B.y * scale};
  draw();
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  return `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})` }
function poly(pts, fill) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill() }
function topColor(c) { if (c.t === "ocean") return COL.ocean; if (c.river) return COL.river; if (c.bloom) return COL.bloom; return COL[c.t] }
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
    if (c.river && c.from) { const f = iso(c.from[0], c.from[1], drawLevel(c.from));
      ctx.strokeStyle = "#bfe4ff"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo((f.x + o.x) / 2, (f.y + o.y) / 2); ctx.lineTo(o.x, o.y); ctx.stroke() }
    const m = mv.get(p + ""), pk = S.phase === "pick" && c.t === "source";
    if (m || pk) {
      const ok = pk || S.water >= m.cost, pulse = reduce ? 1 : .6 + .4 * Math.sin(t * 4);
      poly(d, ok ? `rgba(255,255,255,${.12 + .1 * pulse})` : "rgba(255,159,90,.12)");
      ctx.strokeStyle = ok ? `rgba(255,255,255,${pulse})` : "rgba(255,159,90,.9)"; ctx.lineWidth = 3.5; ctx.stroke();
      badges.push({o, pk, text: pk ? `+${c.yield}` : m.cost, sand: !!m && c.t === "sand"});
    }
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const {o, pk, text, sand} of badges) {
    ctx.fillStyle = "rgba(8,24,38,.88)"; ctx.beginPath(); ctx.arc(o.x, o.y - 2, pk ? 20 : 15, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `700 ${pk ? 15 : 19}px Fredoka, Nunito, sans-serif`; ctx.fillText(text, o.x, o.y - 1);
    if (sand) { // sand also costs 1 flow: show it under the price
      ctx.fillStyle = "rgba(8,24,38,.92)"; ctx.beginPath(); ctx.arc(o.x - 16, o.y + 21, 9, 0, 7); ctx.arc(o.x + 16, o.y + 21, 9, 0, 7); ctx.fill(); ctx.fillRect(o.x - 16, o.y + 12, 32, 18);
      ctx.fillStyle = "#ff9f5a"; ctx.font = "700 12px Fredoka, Nunito, sans-serif"; ctx.fillText("−1 flow", o.x, o.y + 21);
    }
  }
}
function deco(p, c, o, t) {
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
cv.addEventListener("pointerup", e => {
  const p = tileAt(e.clientX, e.clientY); if (!p) return;
  if (S.phase === "pick") return pick(p);
  if (S.phase !== "play") return;
  const m = moves().get(p + "");
  if (m) build(m); else say("Tap a glowing tile next to your stream.", true);
});
$("end").onclick = endTurn; $("undo").onclick = undo; $("restart").onclick = restart; $("again").onclick = restart;
addEventListener("keydown", e => { if (e.key === " " && !$("help").open) { e.preventDefault(); endTurn() } });
$("helpBtn").onclick = () => $("help").showModal();
$("help").addEventListener("click", e => { if (e.target === $("help")) $("help").close() }); // tap backdrop to close
addEventListener("resize", resize);
if (window.ResizeObserver) { const ro = new ResizeObserver(resize); ro.observe($("board")); ro.observe($("top")); ro.observe($("bottom")) }
function loop() { draw(); if (!reduce) requestAnimationFrame(loop) }
if (!load()) S = fresh();
sync(); document.fonts && document.fonts.ready.then(() => { lastSize = ""; resize() }); loop();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register(SW_URL).catch(() => {}));

// for debugging / tests
window.FT = {get S() { return S }, get history() { return history }, moves, diamond, endTurn, restart, bloomCount,
  tap(p) { const d = diamond(p), r = cv.getBoundingClientRect(), dpr = cv.width / r.width, cx = (d[0][0] + d[2][0]) / 2, cy = (d[0][1] + d[2][1]) / 2;
    cv.dispatchEvent(new PointerEvent("pointerup", {clientX:r.left + (cx * scale + off.x) / dpr, clientY:r.top + (cy * scale + off.y) / dpr, bubbles:true})) }};
})();
