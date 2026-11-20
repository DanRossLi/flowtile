// Flowgrow (LOU-298): an ecology and nature building game on Flow Tile's hex grid, in Flow Tile's look.
// It is a standalone test page (/flowgrow/). Nothing in the river game changes: play.js is not loaded and not edited, and
// what this page needs from it (the hex maths, the camera, the painting and the sound) is copied here. Each copied part
// says where it came from.
//
// The rules Dan has set (Nov 19), in his words. Everything else is a placeholder (see "Open for Dan" in CANON.md):
//   1. "this is going to be a hex based additive game, we're going to get tiles that need to be placed. for example
//      dorfromantik, there will be a tile queue. players can then add tiles to the map."
//   2. "Tiles can be "additive" / "combined". only if they're the same level. for example lvl 1 + lvl 1. you cannot add a
//      tile that are different levels."
//   3. "it's not a city game, it's an ecology nature building game."
//   4. "make the scoring +1, +3, +6, +10....as tiles are added."
//   5. "Rivers also need to be placed, this expands how far out you can place your tile from your river."
//
// Words: a tile is a habitat or a river tile. Putting a habitat on empty land is planting. Two habitats of the same level
// combine into one habitat of the next level. A river tile extends the river or widens it. The pile is the tiles still to come.
//
// The file has two parts. Part 1 is the rules: plain functions on plain data that never touch the page, so
// tools/flowgrow-sim.mjs loads this same file in Node and the simulator and the game can't drift apart. Part 2 is the page.
(() => {
const G = typeof window !== "undefined" ? window : globalThis;

// ====================================================================================================================
// Part 1: the rules
// ====================================================================================================================
// A run is plain data:
//   cfg      the config the run started with (a Tuning change applies from the next run)
//   seed     the number the pile is dealt from; rs is the state of the random numbers
//   h        habitats, {"x,y": level}
//   r        river tiles, {"x,y": {l: level, from: the river tile it joins (only for drawing), n: the order it was laid}}
//   q        the front of the pile: q[0] is the tile in hand, the rest are the next tiles shown
//   dealt    tiles dealt into q so far; used: tiles placed or discarded
//   score, top (the highest habitat level on the map), planted, combined, extended, widened, discarded
//   moves    every move so far: {a:"p", i, x, y} put tile i of q on x,y · {a:"d", i} discarded it
//   log      one entry per move, for the run log
//   over     true once the pile is empty
// A tile is {k: "h" (habitat) or "r" (river), l: level}.
// A run is its config, its seed and its moves: replay() rebuilds it from those three, and undo, saving and reload all use it.

// Hex grid, copied from play.js: pointy-top hexes in "odd-r" offset rows (odd rows sit half a tile right). Six faces,
// 0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE.
const HEX = [[[1,0],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]], [[1,0],[1,-1],[0,-1],[-1,0],[0,1],[1,1]]];
const step = ([x, y], d) => { const o = HEX[y & 1][((d % 6) + 6) % 6]; return [x + o[0], y + o[1]] };
const hexDist = (a, b) => { const dq = (a[0] - (a[1] - (a[1] & 1)) / 2) - (b[0] - (b[1] - (b[1] & 1)) / 2), dr = a[1] - b[1]; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 };
const key = p => p[0] + "," + p[1], unkey = k => k.split(",").map(Number);

// ---------- the config: every value, how it is checked, and what the Tuning panel calls it
const asNum = v => typeof v === "string" && v.trim() !== "" ? Number(v) : v;
const whole = (lo, hi) => v => { const n = asNum(v); return typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : undefined };
const real = (lo, hi) => v => { const n = asNum(v); return typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi ? n : undefined };
const listOf = (item, min, max) => v => { const a = typeof v === "string" ? v.split(/[,\n]/).map(s => s.trim()).filter(Boolean) : v;
  if (!Array.isArray(a) || a.length < min || a.length > max) return undefined; const out = a.map(item); return out.some(x => x === undefined) ? undefined : out };
// The island: rows of equal length in the usual map codes (T source, _ bare ground, B mountain), with exactly one source.
function mapOf(v) { const rows = (typeof v === "string" ? v.split(/[\s,]+/) : Array.isArray(v) ? v.map(String) : []).map(s => s.trim()).filter(Boolean);
  if (rows.length < 3 || rows.length > 24) return undefined; const w = rows[0].length; if (w < 3 || w > 24) return undefined;
  let src = 0; for (const r of rows) { if (r.length !== w || /[^T_B]/.test(r)) return undefined; src += r.split("T").length - 1 }
  return src === 1 ? rows : undefined }
// A tile written in words, as in the config's opening list: "habitat 3", "river" (level 1) or "river 2".
function parseTile(s) { const m = /^\s*(habitat|river)(?:\s+(\d+))?\s*$/i.exec(String(s)); if (!m) return null;
  const k = m[1].toLowerCase() === "river" ? "r" : "h", l = m[2] ? +m[2] : 1; return l >= 1 && l <= 24 && (k === "r" || m[2]) ? {k, l} : null }
const tileWord = t => t.k === "r" ? (t.l > 1 ? "river " + t.l : "river") : "habitat " + t.l;
// [key, check, name in Tuning, note, kind of field]
const KEYS = [
  ["map", mapOf, "Island", "rows of T (source), _ (land) and B (mountain)", "rows"],
  ["stackSize", whole(0, 2000), "Tiles in a run", "0: endless", "int"],
  ["queueShown", whole(0, 6), "Next tiles shown", "after the tile in hand", "int"],
  ["pickFrom", whole(1, 7), "Pick from", "1: only the tile in hand", "int"],
  ["riverShare", real(0, 1), "River tile chance", "0 to 1", "num"],
  ["opening", listOf(s => { const t = parseTile(s); return t ? tileWord(t) : undefined }, 0, 40), "First tiles", "such as habitat 1, river", "list"],
  ["maxLevel", whole(1, 12), "Top level", "the highest a habitat can reach", "int"],
  ["levelOdds", real(0.01, 4), "Level odds", "each level is this many times as likely as the one below", "num"],
  ["scoreByLevel", listOf(real(0, 100000), 1, 24), "Points by level", "level 1 first", "list"],
  ["riverReach", listOf(whole(0, 12), 1, 4), "River reach", "tiles out, by river level", "list"],
  ["tilesAcross", real(2, 16), "Tiles across", "opening zoom on a phone", "num"],
  ["levelNames", listOf(s => { const t = String(s).trim().slice(0, 24); return t ? t : undefined }, 1, 24), "Level names", "level 1 first", "list"],
];
// Check a config. Every value that passes is kept; a value that doesn't is refused and the one from `base` stands.
function tidy(raw, base) { const cfg = {}, bad = [];
  for (const [k, check] of KEYS) { let v = raw && raw[k] !== undefined ? check(raw[k]) : undefined;
    if (v === undefined) { if (raw && raw[k] !== undefined) bad.push(k); v = base ? base[k] : undefined }
    if (v === undefined) throw new Error("Flowgrow: the config has no usable value for " + k); cfg[k] = v }
  return {cfg, bad} }

// ---------- the island. What never changes for a config (its tiles, their neighbours, which of them are land) is worked out once.
const inside = (c, p) => p[0] >= 0 && p[1] >= 0 && p[1] < c.map.length && p[0] < c.map[0].length;
const codeAt = (c, p) => inside(c, p) ? c.map[p[1]][p[0]] : "";
const nbrs = (c, p) => [0, 1, 2, 3, 4, 5].map(d => step(p, d)).filter(q => inside(c, q));
const GRIDS = new WeakMap();
function grid(c) { let g = GRIDS.get(c); if (g) return g; g = {land:[], bare:new Set(), nb:{}, at:{}}; // land: the bare ground tiles in reading order
  c.map.forEach((row, y) => [...row].forEach((ch, x) => { const k = x + "," + y; g.at[k] = [x, y]; g.nb[k] = nbrs(c, [x, y]).map(key); if (ch === "_") { g.land.push(k); g.bare.add(k) } }));
  GRIDS.set(c, g); return g }
// empty land: bare ground with no habitat and no river on it
const openKey = (S, k) => grid(S.cfg).bare.has(k) && !(k in S.h) && !(k in S.r), isOpen = (S, p) => openKey(S, key(p));

// ---------- levels and points
const levelName = (c, l) => c.levelNames[Math.min(l, c.levelNames.length) - 1] || "Level " + l;
// Points for leaving a habitat of this level on the map. Past the end of the table the pattern carries on (36, 45 …).
function scoreOf(c, l) { const t = c.scoreByLevel; if (l <= t.length) return t[l - 1];
  let v = t[t.length - 1], d = t.length > 1 ? v - t[t.length - 2] : v; for (let i = t.length; i < l; i++) { d += 1; v += d } return v }
const riverTop = c => c.riverReach.length;                                  // the widest a river tile can get
const reachAt = (c, l) => c.riverReach[Math.min(l, c.riverReach.length) - 1] || 0;

// ---------- dealing. Seeded, so a run can be replayed: the same seed and the same moves always give the same pile.
const seedOf = v => { const n = Number(v); if (v !== "" && v != null && Number.isFinite(n)) return Math.abs(Math.floor(n)) % 4294967296;
  let h = 2166136261; for (const ch of String(v)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0 };
function rand(S) { let t = (S.rs = (S.rs + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
// One new tile. The first tiles of a run are fixed (cfg.opening). After that a tile is a river tile riverShare of the time;
// otherwise a habitat whose level is rolled from 1 up to the highest habitat level on the map right now, each level
// levelOdds times as likely as the one below.
function roll(S) { const c = S.cfg;
  if (S.dealt < c.opening.length) { const t = parseTile(c.opening[S.dealt]); return {k:t.k, l:Math.min(t.l, t.k === "r" ? riverTop(c) : c.maxLevel)} }
  if (rand(S) < c.riverShare) return {k:"r", l:1};
  const top = Math.max(1, Math.min(c.maxLevel, S.top)); let total = 0; for (let l = 1; l <= top; l++) total += Math.pow(c.levelOdds, l - 1);
  let x = rand(S) * total; for (let l = 1; l <= top; l++) { x -= Math.pow(c.levelOdds, l - 1); if (x < 0) return {k:"h", l} }
  return {k:"h", l:top} }
// Top the pile's front up. A tile is rolled when it enters q, and q and rs are part of the run, so undo and reload never re-roll.
function fill(S) { const c = S.cfg;
  while (S.q.length < 1 + c.queueShown && (c.stackSize === 0 || S.dealt < c.stackSize)) { S.q.push(roll(S)); S.dealt++ }
  if (!S.q.length) S.over = true }
// Tiles left to use: the ones shown plus the rest of the stack (Infinity when the stack is endless).
const left = S => S.cfg.stackSize === 0 ? Infinity : S.q.length + S.cfg.stackSize - S.dealt;

function fresh(cfg, seed) { seed = seedOf(seed);
  const S = {cfg, seed, rs:(Math.imul(seed ^ 0x9E3779B9, 0x85EBCA6B) ^ 0x5bd1e995) >>> 0, h:{}, r:{}, rn:1, q:[], dealt:0, used:0, score:0, top:0,
    planted:0, combined:0, extended:0, widened:0, discarded:0, moves:[], log:[], over:false};
  cfg.map.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "T") S.r[key([x, y])] = {l:1, from:null, n:0} })); // the source counts as a level 1 river tile
  fill(S); return S }

// ---------- reach: a river tile of level l reaches riverReach[l - 1] tiles out, in hex steps. Mountains don't block it.
// Every tile within n steps of p, added to the set `out`.
function ball(c, p, n, out) { const H = c.map.length, W = c.map[0].length, pq = p[0] - (p[1] - (p[1] & 1)) / 2;
  for (let y = Math.max(0, p[1] - n); y <= Math.min(H - 1, p[1] + n); y++) for (let x = Math.max(0, p[0] - n); x <= Math.min(W - 1, p[0] + n); x++) {
    const dq = pq - (x - (y - (y & 1)) / 2), dr = p[1] - y; if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= n) out.add(x + "," + y) }
  return out }
// Every tile within reach of the river, as a set of keys. It only changes when the river does, so it is kept until then
// (don't change the set you get back). `plus` ({"x,y": level}) asks "what if these river tiles were there too", without
// changing the run.
const REACH = new WeakMap();
function reachOf(S, plus) { const c = S.cfg, g = grid(c); let n = 0, sum = 0; for (const k in S.r) { n++; sum += S.r[k].l }
  let hit = REACH.get(S); const ver = n + "/" + sum;
  if (!hit || hit.ver !== ver) { const set = new Set(); for (const k in S.r) ball(c, g.at[k], reachAt(c, S.r[k].l), set); hit = {ver, set}; REACH.set(S, hit) }
  if (!plus) return hit.set; const out = new Set(hit.set); for (const k in plus) ball(c, unkey(k), reachAt(c, plus[k]), out); return out }
// The empty land within reach, as keys in reading order: where a habitat can be planted.
function plantable(S, reach = reachOf(S)) { const out = []; for (const k of grid(S.cfg).land) if (reach.has(k) && !(k in S.h) && !(k in S.r)) out.push(k); return out }

// ---------- moves
// Everything tile i of the pile's front can do: [{p, does, l, pts}]. does: "plant" on empty land within reach · "combine" on
// a habitat of the same level, which goes up one · "extend" the river onto empty land that touches it · "widen" a river tile
// of the same level. l is the level left on the map and pts the points the move scores. A different level is never allowed.
function options(S, i = 0) { const c = S.cfg, g = grid(c), t = S.q[i], out = [], at = k => [g.at[k][0], g.at[k][1]]; if (!t || S.over) return out;
  if (t.k === "h") {
    if (t.l < c.maxLevel) for (const k in S.h) if (S.h[k] === t.l) out.push({p:at(k), does:"combine", l:t.l + 1, pts:scoreOf(c, t.l + 1)});
    for (const k of plantable(S)) out.push({p:at(k), does:"plant", l:t.l, pts:scoreOf(c, t.l)});
  } else {
    if (t.l < riverTop(c)) for (const k in S.r) if (S.r[k].l === t.l) out.push({p:at(k), does:"widen", l:t.l + 1, pts:0});
    for (const k of g.land) if (!(k in S.h) && !(k in S.r) && g.nb[k].some(q => q in S.r)) out.push({p:at(k), does:"extend", l:t.l, pts:0});
  }
  return out }
// How much land a river move would open: the empty land it newly brings within reach.
function opens(S, i, o) { const t = S.q[i]; if (!t || t.k !== "r") return 0;
  const before = reachOf(S), k0 = key(o.p); let n = 0;
  for (const k of ball(S.cfg, o.p, reachAt(S.cfg, o.l), new Set())) if (!before.has(k) && k !== k0 && openKey(S, k)) n++; return n }
// The one-line reason tile i can't go on p.
function why(S, i, p) { const c = S.cfg, t = S.q[i]; if (!t) return "No tiles left."; if (!p || !inside(c, p)) return "";
  const k = key(p), hl = S.h[k], rv = S.r[k];
  if (codeAt(c, p) === "B") return t.k === "r" ? "The river can't cross a mountain." : "Nothing grows on a mountain.";
  if (t.k === "h") {
    if (rv) return "That's the river. Plant beside it.";
    if (hl) return hl >= c.maxLevel ? `${levelName(c, hl)} is the top level.` : `That's level ${hl}. Only a level ${hl} tile can go on it.`;
    return "Too far from the river." }
  if (hl) return "A river tile needs empty land.";
  if (rv) return rv.l >= riverTop(c) ? "The river is at its widest here." : `Only a level ${rv.l} river tile widens this.`;
  return "A river tile has to touch the river." }
// Which river tile a new one joins, for drawing: the river's end if it touches one, otherwise the newest river tile it touches.
function joinTo(S, p) { const has = new Set(Object.values(S.r).map(v => v.from)); let best = null;
  for (const q of nbrs(S.cfg, p)) { const k = key(q), v = S.r[k]; if (!v) continue; const end = !has.has(k);
    if (!best || (end && !best.end) || (end === best.end && v.n > best.n)) best = {k, end, n:v.n} }
  return best ? best.k : null }
function note(S, t, did, p, l, pts) { S.log.push({n:S.moves.length, t, did, at:p ? [p[0], p[1]] : null, l, pts, score:S.score, room:plantable(S).length}) }
// Put tile i on p. Returns what happened ({does, l, pts, tile, greened: the land newly within reach}), or null if it can't go there.
function place(S, i, p) { const o = options(S, i).find(o => o.p[0] === p[0] && o.p[1] === p[1]); if (!o) return null;
  const t = S.q.splice(i, 1)[0], k = key(p), before = t.k === "r" ? reachOf(S) : null;
  if (o.does === "plant") { S.h[k] = t.l; S.planted++ }
  else if (o.does === "combine") { S.h[k] = o.l; S.combined++ }
  else if (o.does === "extend") { S.r[k] = {l:t.l, from:joinTo(S, p), n:S.rn++}; S.extended++ }
  else { S.r[k].l = o.l; S.widened++ }
  if (t.k === "h") { S.score += o.pts; S.top = Math.max(S.top, o.l) }
  S.used++; S.moves.push({a:"p", i, x:p[0], y:p[1]});
  const greened = before ? [...reachOf(S)].filter(q => !before.has(q)) : [];
  fill(S); note(S, t, o.does, p, o.l, o.pts); return {...o, tile:t, greened} }
// Throw tile i away. It scores nothing and still uses up the tile, so a run can never get stuck.
function discard(S, i = 0) { if (S.over || !S.q[i]) return null; const t = S.q.splice(i, 1)[0];
  S.discarded++; S.used++; S.moves.push({a:"d", i}); fill(S); note(S, t, "discard", null, 0, 0); return {does:"discard", tile:t} }
function apply(S, m) { return m.a === "p" ? place(S, m.i, [m.x, m.y]) : m.a === "d" ? discard(S, m.i) : null }
function replay(cfg, seed, moves) { const S = fresh(cfg, seed);
  for (const m of moves) if (!apply(S, m)) throw new Error("Flowgrow: move " + (S.moves.length + 1) + " can't be replayed"); return S }

// ---------- words
const tileText = (c, t) => t.k === "r" ? (t.l > 1 ? `River tile (level ${t.l})` : "River tile") : `${levelName(c, t.l)} (level ${t.l})`;
const DID = {plant:"planted", combine:"combined", extend:"extended the river", widen:"widened the river", discard:"discarded"};
// The run log: one line per move, with the tile dealt, what was done and where, the points, the score and the plantable tiles left.
function logText(S) { const c = S.cfg, lines = [`Flowgrow run log · seed ${S.seed} · ${c.stackSize ? c.stackSize + " tiles" : "endless"} · places are column,row from 0`];
  for (const e of S.log) lines.push(`${e.n}. ${tileText(c, e.t)} · ${DID[e.did]}${e.at ? ` at ${e.at[0]},${e.at[1]}` : ""}${e.did === "combine" ? `, now level ${e.l} ${levelName(c, e.l)}` : e.did === "widen" ? `, now level ${e.l}` : ""} · +${e.pts} · score ${e.score} · ${e.room} plantable left`);
  lines.push(S.over ? `Run over · score ${S.score} · top level ${S.top} · planted ${S.planted} · combined ${S.combined} · river extended ${S.extended}, widened ${S.widened} · discarded ${S.discarded}` : `Still playing · score ${S.score} · ${left(S)} tiles left`);
  return lines.join("\n") }
const settingsText = c => ["Flowgrow settings", ...KEYS.map(([k, , label]) => `${label}: ${k === "map" ? "\n  " + c.map.join("\n  ") : Array.isArray(c[k]) ? c[k].join(", ") : c[k]}`)].join("\n");

const rules = {HEX, step, hexDist, key, unkey, KEYS, tidy, mapOf, parseTile, tileWord, inside, codeAt, nbrs, isOpen, levelName, scoreOf, riverTop, reachAt, seedOf,
  roll, fill, left, fresh, reachOf, plantable, options, opens, why, place, discard, replay, tileText, logText, settingsText};
G.Flowgrow = {rules};
// With no page, or when the simulator asks (FLOWGROW_SIM), the file stops here: only the rules are loaded.
if (typeof document === "undefined" || G.FLOWGROW_SIM) return;

// ====================================================================================================================
// Part 2: the page. A quick prototype (Dan, Nov 19: "just make a quick MVP to prototype"): the island, the river, the pile
// and the seven levels, in Flow Tile's hexes and colours. The projection, the land painting and the tree painters are
// trimmed copies from play.js. Not built yet: Tuning, sound, the settings sheet and the painterly extras.
// ====================================================================================================================
const SW_URL = new URL("sw.js", document.currentScript.src).href; // sw.js sits next to this file
const $ = id => document.getElementById(id), tx = (id, v) => { const e = $(id); if (e) e.textContent = v };
const mem = {get(k) { try { return localStorage.getItem("flowtile.flowgrow." + k) } catch (_) { return null } },
  set(k, v) { try { if (v == null) localStorage.removeItem("flowtile.flowgrow." + k); else localStorage.setItem("flowtile.flowgrow." + k, v) } catch (_) {} }};
const CFG = tidy(G.FLOWGROW).cfg, GRID = grid(CFG), W = CFG.map[0].length, H = CFG.map.length;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, now = () => performance.now();
let S = null, opts = [], landSig = "", wonShown = false, msgT = 0;
const pops = {}, fx = [];

// ---------- the hex projection (from play.js): pointy-top hexes built flat in world space (radius R), then projected isometrically
const cv = $("cv"), ctx0 = cv.getContext("2d"); let ctx = ctx0;
const R = 46, SQ3 = Math.sqrt(3), DEPTH = 30, TAU = Math.PI * 2, HAND = "'M PLUS Rounded 1c', Nunito, sans-serif";
const world = (x, y) => [x * SQ3 * R + (y & 1 ? SQ3 * R / 2 : 0), y * 1.5 * R];
const proj = (wx, wy) => ({x:(wx - wy) * .7071, y:(wx + wy) * .3536});
const iso = (x, y) => { const [wx, wy] = world(x, y); return proj(wx, wy) };
const ORDER = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ORDER.push([x, y]);
ORDER.sort((a, b) => iso(...a).y - iso(...b).y || iso(...a).x - iso(...b).x); // back to front
function hexPts(p, r = R) { const [wx, wy] = world(...p); return [0, 1, 2, 3, 4, 5].map(i => { const a = (60 * i - 90) * Math.PI / 180, q = proj(wx + r * Math.cos(a), wy + r * Math.sin(a)); return [q.x, q.y] }) }
// edge i of a hex runs from corner i to corner i + 1 and faces neighbour (7 - i) mod 6; it faces the viewer when its normal points down the screen
const EDGE_FACE = i => (7 - i) % 6, FRONT = [0, 1, 2, 3, 4, 5].map(i => { const a = (60 * i - 60) * Math.PI / 180; return Math.cos(a) + Math.sin(a) > .01 });
function rpath(pts, rad = 8) { const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath(); ctx.moveTo(...m(pts[n - 1], pts[0])); for (let i = 0; i < n; i++) ctx.arcTo(...pts[i], ...m(pts[i], pts[(i + 1) % n]), rad); ctx.closePath() }
const hexPath = (tiles, r = R + 1) => { const P = new Path2D(); for (const p of tiles) { hexPts(p, r).forEach(([x, y], i) => i ? P.lineTo(x, y) : P.moveTo(x, y)); P.closePath() } return P };
const B = (() => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of ORDER) for (const [x, y] of hexPts(p)) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y) }
  return {x:a - 14, y:b - 112, w:c - a + 28, h:d - b + 112 + DEPTH + 16} })(); // room above for the tallest tree

// ---------- paint helpers (from play.js)
function poly(pts, fill) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill() }
function line(pts, col, w) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke() }
function ell(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fillStyle = fill; ctx.fill() }
function ink(col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke() }
const rng = (...k) => { let s = 1; for (const v of ["flowgrow", ...k].join("|")) s = (Math.imul(s ^ v.charCodeAt(0), 2654435761) >>> 0) || 7; s = s % 2147483646 + 1; return () => (s = s * 16807 % 2147483647) / 2147483647 };
const inTile = (p, r, k = .78) => { const [wx, wy] = world(...p), a = r() * TAU, d = Math.sqrt(r()) * R * k, q = proj(wx + d * Math.cos(a), wy + d * Math.sin(a)); return [q.x, q.y] };
let ps = 1; // the resolution the island is painted at (device px per world unit)
function feather(path, col, blur) { ctx.save(); const sh = 5000; ctx.shadowColor = col; ctx.shadowBlur = blur * ps; ctx.shadowOffsetX = sh; ctx.translate(-sh / ps, 0); ctx.fillStyle = "#000"; ctx.fill(path); ctx.restore() }
const pebble = (x, y, s) => { ell(x, y + .6 * s, 2.4 * s, 1.2 * s, "rgba(70,60,40,.18)"); ell(x, y, 2.2 * s, 1.4 * s, "#b7b09c"); ell(x - .6 * s, y - .5 * s, 1 * s, .6 * s, "rgba(255,255,255,.6)") };
// A small white pill with text (from play.js): the level on a habitat, the points on a ring.
function tag(x, y, text, col = "#24434a", size = 15) { ctx.save(); ctx.font = `800 ${size - 2}px ${HAND}`; const w = Math.max(18, ctx.measureText(text).width + 14), hh = size + 5;
  const pill = (dx, dy) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2 + dx, y - hh / 2 + dy, w, hh, hh / 2) : ctx.rect(x - w / 2 + dx, y - hh / 2 + dy, w, hh) };
  pill(0, 1.5); ctx.fillStyle = "rgba(30,60,70,.2)"; ctx.fill(); pill(0, 0); ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.fill();
  ctx.fillStyle = col; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y + 1); ctx.restore() }

// ---------- the island: bare ground, and grass on the land within reach of the river. Painted once and kept until reach changes.
const COL = {bare:"#d6cf98", grass:"#86c46f"}, DABS = {grass:["#b3dc86", "#5a9f62", "#b9dc98"], bare:["#c9c48c", "#e4dbb0", "#dcd5a0"]};
const landC = document.createElement("canvas"), LPAD = 60; let landKey = "";
const isGreen = (reach, p) => reach.has(key(p)) && CFG.map[p[1]][p[0]] === "_";
function paintLand(reach) { const edges = [];
  for (const p of ORDER) { const h = hexPts(p); for (let i = 0; i < 6; i++) if (!inside(CFG, step(p, EDGE_FACE(i)))) edges.push({a:h[i], b:h[(i + 1) % 6], front:FRONT[i]}) }
  const top = hexPath(ORDER, R + .6);
  ctx.save(); ctx.translate(0, DEPTH + 10); feather(top, "rgba(70,110,120,.35)", 18); ctx.restore();     // the island's soft shadow on the sea
  for (const e of edges) if (e.front) { const y0 = Math.min(e.a[1], e.b[1]), g = ctx.createLinearGradient(0, y0, 0, y0 + DEPTH); g.addColorStop(0, "#a99171"); g.addColorStop(1, "#6f5c48"); // the earth cliff with a grass lip
    poly([[e.a[0], e.a[1] - 1], [e.b[0], e.b[1] - 1], [e.b[0], e.b[1] + DEPTH], [e.a[0], e.a[1] + DEPTH]], g);
    poly([[e.a[0], e.a[1] - 1], [e.b[0], e.b[1] - 1], [e.b[0], e.b[1] + 3.5], [e.a[0], e.a[1] + 3.5]], "#6f9e5c") }
  ctx.save(); ctx.clip(top); ctx.fillStyle = COL.bare; ctx.fill(top);
  const green = ORDER.filter(p => isGreen(reach, p)); if (green.length) feather(hexPath(green, R + 3), COL.grass, 14); // grass blends into the bare ground
  for (const p of ORDER) { const k = isGreen(reach, p) ? "grass" : "bare", r = rng("t", p), d = DABS[k], tint = r() < .5 ? "#ffffff" : "#3d5a3a";
    for (let i = 0; i < 18; i++) { const [x, y] = inTile(p, r, 1.08); ctx.globalAlpha = .22 + r() * .2; ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 3.5, 1 + r() * 1.6, (r() - .5) * .8, 0, TAU); ctx.fillStyle = i % 5 === 4 ? tint : d[i % d.length]; ctx.fill() }
    ctx.globalAlpha = 1;
    if (k === "grass") { for (let i = 0; i < 9; i++) { const [x, y] = inTile(p, r); line([[x, y], [x + (r() - .5) * 2.5, y - 3 - r() * 3]], i % 3 ? "rgba(70,140,80,.55)" : "rgba(190,225,150,.7)", 1.1) } }
    else { for (let i = 0; i < 3; i++) { const [x, y] = inTile(p, r); pebble(x, y, .6 + r() * .4) }
      if (r() < .3) { const [x, y] = inTile(p, r, .5); line([[x - 6, y], [x - 1, y + 2], [x + 4, y - 1], [x + 7, y + 1]], "rgba(120,100,60,.35)", .9) } } }
  ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.lineWidth = 1; for (const p of ORDER) { rpath(hexPts(p, R - .5), 6); ctx.stroke() } // the hex grid, just a hint
  ctx.restore() }
function land() { const lw = B.w + 2 * LPAD, lh = B.h + 2 * LPAD; ps = Math.min(Math.pow(2, Math.ceil(Math.log2(scale) * 2) / 2), 4096 / Math.max(lw, lh));
  const lk = ps + "|" + landSig; if (lk === landKey) return; landKey = lk; landC.width = Math.ceil(lw * ps); landC.height = Math.ceil(lh * ps);
  ctx = landC.getContext("2d"); ctx.setTransform(ps, 0, 0, ps, -(B.x - LPAD) * ps, -(B.y - LPAD) * ps); paintLand(reachOf(S)); ctx = ctx0 }

// ---------- the seven levels: sprouts, meadow, thicket, saplings, grove, forest, old forest. Each is painted once into a
// sprite, lit from the upper left, and each is clearly bigger and taller than the one before. The trees are play.js's.
const leaf = (x, y, r, col) => ell(x, y, r, r * .86, col);
const TREE = {
  round(r) { line([[0, 0], [0, -11]], "#6b4a32", 3); line([[0, -7], [-4, -13]], "#6b4a32", 1.8); line([[0, -8], [4, -14]], "#6b4a32", 1.6);
    const cl = [[-8, -16, 7], [8, -16, 7], [0, -22, 8], [-5, -26, 6.5], [6, -26, 6.5], [0, -30, 6], [-9, -21, 5.5], [9, -21, 5.5]];
    for (const [x, y, s] of cl) leaf(x, y + 1.5, s, "#2c6a5a"); for (const [x, y, s] of cl) leaf(x - .8, y, s * .82, "#4c9a74");
    for (const [x, y, s] of cl) if (x <= 2 && y < -18) leaf(x - 1.8, y - 1.5, s * .55, "#93cf8f"); for (let i = 0; i < 6; i++) leaf(-7 + r() * 9, -30 + r() * 12, 1.4 + r(), "#e2f0b0") },
  pine() { line([[0, 0], [0, -6]], "#5a3d22", 2.6);
    for (let i = 0; i < 5; i++) { const y0 = -4 - i * 6.5, w = 11 - i * 1.9, y1 = y0 - 10; ctx.beginPath(); ctx.moveTo(-w, y0); ctx.quadraticCurveTo(-w * .3, y0 - 4, 0, y1); ctx.quadraticCurveTo(w * .3, y0 - 4, w, y0); ctx.quadraticCurveTo(0, y0 + 2.5, -w, y0); ctx.fillStyle = "#2f5f55"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-w, y0); ctx.quadraticCurveTo(-w * .3, y0 - 4, 0, y1); ctx.lineTo(-1, y0 + 1); ctx.closePath(); ctx.fillStyle = "#4f8a72"; ctx.fill() } },
  birch(r) { ctx.fillStyle = "#f2efe6"; ctx.fillRect(-1.3, -24, 2.6, 24); for (let i = 0; i < 5; i++) line([[-1.3, -3 - i * 4.4 - r() * 2], [r() * 1.6 - .3, -3 - i * 4.4 - r() * 2]], "#3a3a3a", 1.1);
    for (let i = 0; i < 9; i++) leaf(-7 + r() * 14, -30 + r() * 12, 3 + r() * 2.2, ["#8cc47a", "#a8d48a", "#cfe6a0"][i % 3]) },
  poplar() { line([[0, 0], [0, -6]], "#6b4a32", 2.4); ell(0, -22, 5.5, 17, "#3f7f5c"); ell(-1.2, -23, 4.4, 15, "#4f9a64"); ell(-2, -26, 2.4, 10, "#7cbf7a") } };
const put = (x, y, s, f, r) => { ell(x + 3 * s, y + 1, 10 * s, 3.2 * s, "rgba(40,70,50,.22)"); ctx.save(); ctx.translate(x, y); ctx.scale(s, s); f(r); ctx.restore() };
function shrub(x, y, s) { ell(x + 2 * s, y + 1, 9 * s, 3 * s, "rgba(40,70,50,.2)");
  for (const [a, b, rr, col] of [[-5, -3, 5, "#3f7f5c"], [4, -3, 5.5, "#3f7f5c"], [0, -6, 6, "#4c9a74"], [-3, -7, 3.6, "#7cbf84"], [3, -8, 3, "#93cf8f"]]) ell(x + a * s, y + b * s, rr * s, rr * s * .8, col) }
function sapling(x, y, s) { ell(x + 2 * s, y + 1, 7 * s, 2.4 * s, "rgba(40,70,50,.2)"); line([[x, y], [x + .6 * s, y - 20 * s]], "#7a5a3a", 1.8 * s);
  for (const [a, b, rr, col] of [[-3.2, -17, 4.2, "#5fae6c"], [3.6, -20, 4.6, "#6dbb72"], [0, -25, 5, "#8fd08a"], [-2.6, -27, 2.6, "#c8ecae"]]) ell(x + a * s, y + b * s, rr * s, rr * s * .86, col) }
const MFL = [["#ffffff", "#f2c531"], ["#e5573f", "#3b2a2a"], ["#5b8fe0", "#d9e6ff"], ["#f4c531", "#fff3b0"], ["#a985da", "#d6c2f2"]];
const LEVEL = [null,
  () => { ell(0, 3, 27, 12, "rgba(64,120,70,.4)"); ell(-2, 2, 20, 8, "rgba(126,186,100,.5)");                    // 1 Sprouts: seedlings and clover on a mossy bed
    for (const [x, y] of [[-19, 0], [2, -5], [19, 1], [-8, 7]]) for (const [a, b] of [[-1.7, 0], [1.7, 0], [0, -1.7]]) ell(x + a, y + b, 2, 1.5, "#4f9a5a");
    for (const [x, y] of [[12, -4], [-6, -3], [-15, 4], [6, 1], [15, 7], [-1, 9]]) { line([[x, y], [x, y - 6]], "#4a7a32", 1.5); ell(x - 2.5, y - 6.5, 2.8, 1.6, "#93c565"); ell(x + 2.5, y - 7.4, 2.8, 1.6, "#b6e088") } },
  r => { ell(0, 3, 30, 13, "rgba(226,240,170,.85)"); ell(-4, 1, 18, 7, "rgba(250,246,200,.55)");                 // 2 Meadow: a drift of wildflowers
    const f = []; for (let i = 0; i < 32; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 25; f.push([Math.cos(a) * d, Math.sin(a) * d * .45 + 3, 4 + r() * 6, i % 5]) }
    for (const [x, y, st, k] of f.sort((a, b) => a[1] - b[1])) { line([[x, y], [x, y - st]], "rgba(78,128,66,.85)", 1); ell(x, y - st, 2.4, 2, MFL[k][0]); ell(x, y - st, 1, .8, MFL[k][1]) } },
  r => { ell(2, 5, 31, 12, "rgba(40,80,50,.22)"); shrub(-13, -3, 1.3); shrub(13, -5, 1.4); shrub(-3, 7, 1.7); shrub(19, 8, 1.05);  // 3 Thicket: shrubs and bushes
    for (let i = 0; i < 8; i++) ell(-12 + r() * 22, -8 + r() * 9, 1.4, 1.4, "#d8453a") },
  () => { ell(1, 4, 28, 11, "rgba(64,120,70,.3)"); sapling(12, -5, 1.1); sapling(-13, -1, 1); sapling(1, 9, 1.25) }, // 4 Saplings: three young trees
  r => { ell(1, 4, 32, 12, "rgba(40,80,50,.2)"); put(2, -11, .95, TREE.birch, r); put(-16, 1, 1.05, TREE.round, r); put(15, 5, 1, TREE.poplar, r) }, // 5 Grove: three full trees
  r => { ell(0, 5, 38, 14, "rgba(30,70,45,.3)");                                                                 // 6 Forest: tall, dense trees of mixed kinds
    put(-18, -10, 1.3, TREE.pine, r); put(5, -14, 1.5, TREE.pine, r); put(24, -6, 1.3, TREE.poplar, r); put(-25, 4, 1.25, TREE.round, r); put(-3, 7, 1.45, TREE.round, r); put(20, 10, 1.2, TREE.birch, r) },
  r => { ell(4, 5, 42, 14, "rgba(30,60,45,.3)");                                                                 // 7 Old forest: one giant old tree that fills the tile
    ctx.beginPath(); ctx.moveTo(-17, 5); ctx.quadraticCurveTo(-7, -2, -7, -30); ctx.lineTo(8, -30); ctx.quadraticCurveTo(8, -2, 19, 5); ctx.quadraticCurveTo(0, 9, -17, 5); ctx.fillStyle = "#6b4a32"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, 7); ctx.quadraticCurveTo(3, -10, 2, -30); ctx.lineTo(8, -30); ctx.quadraticCurveTo(8, -2, 19, 5); ctx.closePath(); ctx.fillStyle = "#553926"; ctx.fill();
    ell(-2, -11, 3, 4.6, "#35231a"); line([[-4, -27], [-20, -46]], "#6b4a32", 5); line([[4, -27], [22, -48]], "#553926", 5); line([[0, -29], [1, -54]], "#6b4a32", 6);
    const cl = [[-30, -52, 17], [31, -54, 17], [0, -62, 22], [-17, -73, 17], [18, -75, 17], [0, -87, 15], [-37, -66, 12], [39, -66, 12], [-9, -48, 14], [13, -50, 14]];
    for (const [x, y, s] of cl) leaf(x, y + 3, s, "#245c4e"); for (const [x, y, s] of cl) leaf(x - 1.5, y, s * .84, "#3f8f6a");
    for (const [x, y, s] of cl) if (x <= 4 && y < -56) leaf(x - 4, y - 3.5, s * .55, "#8fcf8a"); for (let i = 0; i < 18; i++) leaf(-34 + r() * 56, -94 + r() * 40, 1.6 + r() * 1.6, "#e2f0b0");
    ell(-22, 6, 7, 3, "#6fa84a"); ell(22, 7, 6, 2.6, "#5f9a40") }];
const TALL = [0, 10, 14, 24, 36, 46, 74, 104];                                         // how far each level stands above its tile's centre
const SPX = 3, HB = {w:116, h:132, ox:58, oy:110}, sprites = {};                       // sprite px per world unit; the box, and where the tile's centre sits in it
function hsprite(l) { l = Math.max(1, Math.min(l, 7)); if (sprites[l]) return sprites[l]; const c = document.createElement("canvas"); c.width = HB.w * SPX; c.height = HB.h * SPX;
  const keep = ctx; ctx = c.getContext("2d"); ctx.setTransform(SPX, 0, 0, SPX, HB.ox * SPX, HB.oy * SPX); LEVEL[l](rng("lv", l)); ctx = keep; return sprites[l] = c }
// A tile as a small picture, for the pile: a habitat's own sprite, or a stretch of river.
const ICON = [0, [62, .6], [66, .62], [70, .72], [74, .82], [88, .85], [106, .87], [124, .88]]; // per level: the world units the picture spans, and how far down the tile's centre sits
function tileIcon(t, px) { const c = document.createElement("canvas"), d = Math.min(devicePixelRatio || 1, 3); c.width = c.height = Math.round(px * d); c.style.width = c.style.height = px + "px";
  const keep = ctx; ctx = c.getContext("2d");
  if (t.k === "h") { const [span, cy] = ICON[Math.min(t.l, 7)], u = px / span * d; ctx.drawImage(hsprite(t.l), px * d / 2 - HB.ox * u, px * d * cy - HB.oy * u, HB.w * u, HB.h * u) }
  else { const u = px / 64 * d, w = t.l > 1 ? 15 : 9; ctx.setTransform(u, 0, 0, u, px * d / 2, px * d / 2);
    for (const [add, col] of [[5, "rgba(95,143,92,.5)"], [2.5, "#d9cfa3"], [0, "#8cc2d2"], [-w * .55, "#6fa9c4"]]) { ctx.beginPath(); ctx.moveTo(-26, 9); ctx.bezierCurveTo(-8, 14, 4, -14, 26, -8); ink(col, w + add * 2) }
    ctx.beginPath(); ctx.moveTo(-12, 5); ctx.quadraticCurveTo(-4, 4, 2, -1); ink("rgba(255,255,255,.7)", 1.6) }
  ctx = keep; return c }

function mountain(cx, cy) { // from play.js
  ell(cx + 4, cy + 9, 34, 10, "rgba(50,70,70,.2)");
  poly([[cx + 6, cy + 8], [cx + 19, cy - 24], [cx + 33, cy + 5]], "#aeb8c2"); poly([[cx + 19, cy - 24], [cx + 33, cy + 5], [cx + 20, cy + 7]], "#8995a3");
  poly([[cx - 30, cy + 7], [cx - 4, cy - 50], [cx + 26, cy + 6]], "#b9c4cc"); poly([[cx - 4, cy - 50], [cx + 26, cy + 6], [cx + 4, cy + 10]], "#8e9aa8");
  poly([[cx - 4, cy - 50], [cx - 14, cy - 30], [cx - 8, cy - 33], [cx - 3, cy - 27], [cx + 3, cy - 32], [cx + 9, cy - 28]], "#f7fafb");
  poly([[cx - 4, cy - 50], [cx + 9, cy - 28], [cx + 3, cy - 32], [cx - 1, cy - 30]], "#dfe8ee"); poly([[cx + 19, cy - 24], [cx + 14, cy - 15], [cx + 18, cy - 17], [cx + 23, cy - 13]], "#f7fafb");
  ctx.globalAlpha = .9; poly([[cx - 30, cy + 7], [cx - 18, cy - 3], [cx - 8, cy + 1], [cx + 4, cy - 4], [cx + 14, cy + 2], [cx + 26, cy + 6], [cx + 33, cy + 5], [cx + 20, cy + 10], [cx - 10, cy + 11]], "#5f8f6a"); ctx.globalAlpha = 1 }
function source(o, t) { // from play.js: a small pool with ripple rings spreading out
  ell(o.x, o.y + 2, 21, 10.5, "rgba(90,140,110,.35)"); ell(o.x, o.y + 1, 19, 9.5, "#a9d4e2"); ell(o.x + 1, o.y + 2, 11, 5, "#7fb6c9"); ell(o.x - 5, o.y - 1, 9, 3.4, "rgba(255,255,255,.5)");
  if (reduce) return; for (const ph of [0, .5]) { const k = (t / 2.4 + ph) % 1; ctx.globalAlpha = (1 - k) * .8; ctx.beginPath(); ctx.ellipse(o.x, o.y + 1, 5 + k * 14, 2.5 + k * 7, 0, 0, 7); ink("#ffffff", 1.3); ctx.globalAlpha = 1 } }
// The river: each river tile is joined to the one it came from. A level 2 tile is drawn wider.
function river(t) { const seg = []; for (const k in S.r) { const v = S.r[k], a = iso(...GRID.at[k]), b = v.from ? iso(...GRID.at[v.from]) : a; seg.push({a, b, w:v.l > 1 ? 18 : 9.5}) }
  const pass = (add, col, mul = 1) => { ctx.strokeStyle = col; ctx.lineCap = "round"; for (const s of seg) { ctx.lineWidth = s.w * mul + add * 2; ctx.beginPath(); ctx.moveTo(s.b.x, s.b.y); ctx.lineTo(s.a.x + .01, s.a.y); ctx.stroke() } };
  pass(5, "rgba(95,143,92,.4)"); pass(2.5, "#d9cfa3"); pass(0, "#8cc2d2"); pass(0, "#6fa9c4", .45);
  if (!reduce) { ctx.save(); ctx.setLineDash([4, 30]); ctx.lineDashOffset = -t * 22; ctx.globalAlpha = .45; pass(-3.9, "#dff1f8", .0001); ctx.restore() } } // soft pale-blue glints drift with the current

// ---------- the camera (from play.js): view.z is zoom relative to "the whole island fits"; cx, cy is the world point in the middle
const view = {z:null, cx:0, cy:0}, lay = {w:0, h:0, topH:0, availH:0, dpr:1, fit:1, zAuto:1}; let scale = 1, off = {x:0, y:0}, lastSize = "";
const SRC = unkey(Object.keys(fresh(CFG, 1).r)[0]);
function resize() { const box = $("board"), w = box.clientWidth, h = box.clientHeight, dpr = Math.min(devicePixelRatio || 1, 3); if (!w || !h) return;
  const topH = $("top").offsetHeight, k = [w, h, topH, dpr].join(); if (k === lastSize) return; lastSize = k;
  const availH = Math.max(40, h - topH), fit = Math.min(w / B.w, availH / B.h), play = Math.min(1.3, w / (CFG.tilesAcross * 89)); // a hex is about 89 world px across
  Object.assign(lay, {w, h, topH, availH, dpr, fit, zAuto:Math.max(1, play / fit)});
  if (view.z === null) { view.z = lay.zAuto; const o = iso(...SRC); view.cx = o.x; view.cy = o.y }   // open on the source, with about tilesAcross tiles across
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); $("fitBtn").style.top = topH + 6 + "px"; applyView() }
function applyView() { view.z = Math.min(Math.max(5, lay.zAuto * 1.6), Math.max(1, view.z)); const s = lay.fit * view.z, vw = lay.w / s, vh = lay.availH / s;
  view.cx = vw >= B.w ? B.x + B.w / 2 : Math.min(B.x + B.w - vw / 2, Math.max(B.x + vw / 2, view.cx));
  view.cy = vh >= B.h ? B.y + B.h / 2 : Math.min(B.y + B.h - vh / 2, Math.max(B.y + vh / 2, view.cy));
  scale = s * lay.dpr; off = {x:lay.w / 2 * lay.dpr - view.cx * scale, y:(lay.topH + lay.availH / 2) * lay.dpr - view.cy * scale};
  const zoomed = view.z > 1.02, fb = $("fitBtn");
  fb.innerHTML = zoomed ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6"/></svg>';
  fb.setAttribute("aria-label", zoomed ? "Show the whole island" : "Zoom in"); draw() }
function tileAt(cx, cy) { const r = cv.getBoundingClientRect(), d = cv.width / r.width, x = ((cx - r.left) * d - off.x) / scale, y = ((cy - r.top) * d - off.y) / scale;
  const a = x / .7071, b = y / .3536, wx = (a + b) / 2, wy = (b - a) / 2, ry = Math.round(wy / (1.5 * R)); let best = null, bd = 1e9;
  for (let yy = ry - 1; yy <= ry + 1; yy++) { const rx = Math.round((wx - (yy & 1 ? SQ3 * R / 2 : 0)) / (SQ3 * R));
    for (let xx = rx - 1; xx <= rx + 1; xx++) { if (!inside(CFG, [xx, yy])) continue; const [qx, qy] = world(xx, yy), dd = Math.hypot(qx - wx, qy - wy); if (dd < bd) { bd = dd; best = [xx, yy] } } }
  return best && bd <= R ? best : null }
const scr = p => { const r = cv.getBoundingClientRect(), d = cv.width / r.width, o = iso(...p); return [r.left + (o.x * scale + off.x) / d, r.top + (o.y * scale + off.y) / d] };

// ---------- drawing, every frame: the sea, the island, the river, then everything standing on it from back to front
const easeBack = k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
function draw() { if (!S || !lay.w) return; const T = now(), t = T / 1000;
  land(); ctx = ctx0; ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, "#cfe3ea"); g.addColorStop(.3, "#cfe6ea"); g.addColorStop(1, "#8fbccb"); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(scale, 0, 0, scale, off.x, off.y); ctx.drawImage(landC, B.x - LPAD, B.y - LPAD, landC.width / ps, landC.height / ps);
  river(t);
  for (const p of ORDER) { const k = key(p), o = iso(...p), code = CFG.map[p[1]][p[0]], l = S.h[k];
    if (code === "T") source(o, t); else if (code === "B") mountain(o.x, o.y);
    if (l) { const a = pops[k] ? (T - pops[k]) / 320 : 1, s = a < 1 && !reduce ? easeBack(Math.max(.05, a)) : 1; if (a >= 1) delete pops[k]; // a quick pop when a tile lands
      ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s, s); ctx.drawImage(hsprite(l), -HB.ox, -HB.oy, HB.w, HB.h); ctx.restore() } }
  // what the tile in hand can do: a faint outline on land it can be planted on, a ring on tiles it can combine with or widen
  if (!S.over) { const pu = reduce ? .5 : .5 + .5 * Math.sin(t * 3);
    for (const o of opts) { const c = iso(...o.p);
      if (o.does === "plant") { rpath(hexPts(o.p, R - 6), 8); ctx.fillStyle = `rgba(255,255,255,${.07 + .06 * pu})`; ctx.fill(); ink(`rgba(255,255,255,${.5 + .25 * pu})`, 1.8) }
      else { const rx = o.does === "extend" ? 22 + 2 * pu : 31 + 2 * pu; ctx.beginPath(); ctx.ellipse(c.x, c.y + 1, rx, rx / 2, 0, 0, 7); ink("rgba(232,255,248,.95)", 4.5); ctx.beginPath(); ctx.ellipse(c.x, c.y + 1, rx, rx / 2, 0, 0, 7); ink("rgba(63,191,164,.9)", 1.6);
        if (o.does === "extend") ell(c.x, c.y + 1, 12, 6, "rgba(98,224,200,.55)") } } }
  for (const k in S.h) { const o = iso(...GRID.at[k]); tag(o.x + 25, o.y + 13, String(S.h[k]), "#24434a", 14) }     // every habitat carries its level
  if (!S.over) for (const o of opts) { const c = iso(...o.p); if (o.does === "combine") tag(c.x, c.y - TALL[Math.min(o.l - 1, 7)] - 14, "+" + o.pts, "#7a5a10", 15); else if (o.does === "widen") tag(c.x, c.y - 20, "wider", "#0f7a66", 14) }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i], k = (T - f.t0) / 900; if (k >= 1) { fx.splice(i, 1); continue } const o = iso(...f.p), y = o.y - f.up - 26 * (1 - Math.pow(1 - k, 2)); // points float up in pale gold
    ctx.globalAlpha = k < .5 ? 1 : (1 - k) / .5; ctx.font = `800 ${17 * lay.dpr / scale}px ${HAND}`; ctx.lineWidth = 3.5 * lay.dpr / scale; ctx.strokeStyle = "rgba(60,45,10,.6)"; ctx.lineJoin = "round"; ctx.strokeText(f.text, o.x, y); ctx.fillStyle = "#ffe9a8"; ctx.fillText(f.text, o.x, y); ctx.globalAlpha = 1 } }

// ---------- the pile, the top bar and the messages
function say(t, warn) { const m = $("msg"); m.textContent = t || ""; m.classList.toggle("warn", !!warn); m.classList.toggle("fade", !t); clearTimeout(msgT); if (t) msgT = setTimeout(() => m.classList.add("fade"), warn ? 3200 : 4500) }
function tileEl(t, px, cls) { const el = document.createElement("div"); el.className = "fgt " + cls; el.title = tileText(CFG, t); el.appendChild(tileIcon(t, px));
  if (t.k === "h" || t.l > 1) { const b = document.createElement("i"); b.className = "fgl"; b.textContent = t.l; el.appendChild(b) } return el }
function drawPile() { const q = $("queue"); q.textContent = "";
  if (S.q[0]) { q.appendChild(tileEl(S.q[0], 56, "now")); for (const t of S.q.slice(1)) q.appendChild(tileEl(t, 32, "")) }
  tx("hName", S.q[0] ? tileText(CFG, S.q[0]) : "") }
function sync() { opts = options(S, 0); landSig = [...reachOf(S)].join(";");
  tx("hScore", S.score); tx("hLeft", left(S) === Infinity ? "∞" : left(S)); tx("hTop", S.top || "–");
  $("undoBtn").disabled = !S.moves.length; $("discardBtn").disabled = S.over; drawPile();
  if (S.over && !wonShown) result(); if (!S.over) wonShown = false; $("win").hidden = !S.over; $("app").classList.toggle("won", S.over);
  mem.set("run.v1", S.over ? null : JSON.stringify({seed:S.seed, moves:S.moves, at:Date.now()})); draw() }
// When the tiles run out: the score, the best score on this device, the top level and what was done.
function result() { wonShown = true; const best = +mem.get("best") || 0; if (S.score > best) mem.set("best", String(S.score));
  $("wScore").innerHTML = `<b>${S.score} points</b> · ${S.score > best ? (best ? `New best (was ${best})` : "New best") : `Best ${best}`}`;
  $("wGoals").innerHTML = [[`Top level ${S.top}${S.top ? " · " + levelName(CFG, S.top) : ""}`, `${Object.keys(S.h).length} habitats on the island`], [`${S.planted} planted · ${S.combined} combined`, `${S.discarded} discarded`],
    [`River: ${S.extended} extended · ${S.widened} widened`, `${Object.keys(S.r).length} river tiles with the source`]].map(([b, s]) => `<li><div><b>${b}</b><small>${s}</small></div></li>`).join("") }

// ---------- a run: new, saved after every move, rebuilt from its seed and moves on reload (a finished or day-old run starts fresh)
const urlSeed = new URLSearchParams(location.search).get("seed");
function newRun() { S = fresh(CFG, urlSeed != null && urlSeed !== "" ? urlSeed : Math.floor(Math.random() * 1e9)); for (const k in pops) delete pops[k]; fx.length = 0; say("Tap the green land to plant."); sync() }
function load() { try { const d = JSON.parse(mem.get("run.v1") || "null"); if (!d || !Array.isArray(d.moves) || Date.now() - d.at > 12 * 3600e3) return false; S = replay(CFG, d.seed, d.moves); return !S.over } catch (_) { return false } }
function tap(p) { if (!S || S.over || !p) return; const res = place(S, 0, p);
  if (!res) { say(why(S, 0, p), true); return }
  pops[key(p)] = now(); if (res.pts) fx.push({p, text:"+" + res.pts, t0:now(), up:TALL[Math.min(res.l, 7)]}); say(""); sync() }
function undo() { if (!S.moves.length) return; S = replay(CFG, S.seed, S.moves.slice(0, -1)); say("Stepped back."); sync() }
async function copyText(t) { try { await navigator.clipboard.writeText(t); return true } catch (_) {} try { const a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select(); const ok = document.execCommand("copy"); a.remove(); return ok } catch (_) { return false } }

// ---------- input: drag to pan, pinch or wheel to zoom; a touch that barely moves is a tap (from play.js)
const ptrs = new Map(); let drag = null, dragged = false;
cv.addEventListener("pointerdown", e => { ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY}); try { cv.setPointerCapture(e.pointerId) } catch (_) {} const pts = [...ptrs.values()];
  if (pts.length === 1) { drag = {x:e.clientX, y:e.clientY, cx:view.cx, cy:view.cy}; dragged = false } else if (pts.length === 2) { drag = {pinch:Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), z:view.z}; dragged = true } });
cv.addEventListener("pointermove", e => { if (!ptrs.has(e.pointerId) || !drag) return; ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY}); const pts = [...ptrs.values()];
  if (drag.pinch && pts.length >= 2) { view.z = drag.z * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / drag.pinch; applyView(); return } if (drag.pinch) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!dragged && Math.hypot(dx, dy) < 9) return; dragged = true; const s = lay.fit * view.z; view.cx = drag.cx - dx / s; view.cy = drag.cy - dy / s; applyView() });
const lift = e => { ptrs.delete(e.pointerId); if (!ptrs.size) drag = null };
cv.addEventListener("pointercancel", e => { lift(e); dragged = false });
cv.addEventListener("contextmenu", e => e.preventDefault());
cv.addEventListener("wheel", e => { e.preventDefault(); view.z *= Math.exp(-e.deltaY * .0015); applyView() }, {passive:false});
cv.addEventListener("pointerup", e => { const wasDrag = dragged; lift(e); if (wasDrag) { if (!ptrs.size) dragged = false; return } tap(tileAt(e.clientX, e.clientY)) });
$("fitBtn").onclick = () => { view.z = view.z > 1.02 ? 1 : lay.zAuto; applyView() };
$("undoBtn").onclick = undo;
$("discardBtn").onclick = () => { if (discard(S, 0)) { say("Discarded."); sync() } };
$("again").onclick = newRun;
$("copyLog").onclick = async () => { const e = $("dToast"); e.textContent = await copyText(logText(S)) ? "Run log copied." : "Couldn't copy on this device."; e.hidden = false; setTimeout(() => { e.hidden = true }, 2200) };
// The menu: how to play, the seven levels, a new run, the run log and Home. Tap outside to close.
const menu = open => { $("mConf").hidden = true; tx("mSeed", "Seed " + S.seed); $("menu").hidden = !open };
$("menuBtn").onclick = () => menu(true);
$("menu").addEventListener("click", async e => { if (e.target === $("menu")) { menu(false); return } const b = e.target.closest("[data-m]"); if (!b) return; const k = b.dataset.m;
  if (k === "new") { $("mConf").hidden = false; return } if (k === "newNo") { $("mConf").hidden = true; return }
  if (k === "log") { const ok = await copyText(logText(S)); menu(false); say(ok ? "Run log copied." : "Couldn't copy on this device."); return }
  menu(false); if (k === "newYes") newRun(); else if (k === "zoom") { view.z = view.z > 1.02 ? 1 : lay.zAuto; applyView() } });
addEventListener("keydown", e => { if (e.key === "Escape") menu(false) });
{ const L = $("ladder"); for (let l = 1; l <= Math.min(7, CFG.maxLevel); l++) { const d = document.createElement("div"); d.appendChild(tileEl({k:"h", l}, 40, "")); const n = document.createElement("small"); n.innerHTML = `${levelName(CFG, l)}<b>+${scoreOf(CFG, l)}</b>`; d.appendChild(n); L.appendChild(d) } }

addEventListener("resize", resize);
if (window.ResizeObserver) { const ro = new ResizeObserver(resize); ro.observe($("board")); ro.observe($("top")) }
function loop() { draw(); requestAnimationFrame(loop) }
if (load()) sync(); else newRun();
resize(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastSize = ""; resize(); drawPile() });
if (reduce) draw(); else loop();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register(SW_URL).catch(() => {}));
// for checking the page from a script
Object.assign(G.Flowgrow, {run:() => S, tap, undo, discard:() => $("discardBtn").click(), newRun, scr, options:() => opts,
  show(h, r) { S.h = h; if (r) S.r = r; S.top = Math.max(0, ...Object.values(h)); sync() }, look(p, z) { const o = iso(...p); view.cx = o.x; view.cy = o.y; if (z) view.z = z; applyView() }});
})();
