#!/usr/bin/env node
// Flowgrow simulator (LOU-298). A developer tool: it is not part of the game and nothing here is loaded by a page.
//
// It plays Flowgrow with the game's own rules. flowgrow.config.js and flowgrow.js themselves are loaded here, with a
// stand-in for the page's window (the file stops after its rules when there is no page), so the simulator and the game
// can't drift apart. No build step and no packages: plain Node 18 or newer.
//
//   node tools/flowgrow-sim.mjs                      1,000 seeded runs with the config file's values
//   node tools/flowgrow-sim.mjs 500 riverShare=0.15  500 runs with one value changed (any config value, as key=value)
//   node tools/flowgrow-sim.mjs --test               the rule checks; exits with an error if one fails
//
// The simple player combines when it can, otherwise plants, and uses each river tile where it opens the most land.
// No run may crash or stall, and every run must rebuild exactly from its seed and moves.
import fs from "fs"; import path from "path"; import {fileURLToPath} from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- the game's rules, loaded as they are
function load() { const window = {FLOWGROW_SIM:true};
  for (const f of ["flowgrow.config.js", "flowgrow.js"]) new Function("window", fs.readFileSync(path.join(ROOT, f), "utf8"))(window);
  return {R:window.Flowgrow.rules, base:window.FLOWGROW} }
const {R, base} = load();
const BASE = R.tidy(base).cfg;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- the simple player: one turn
// The tile a lock would bank the most copies from (the first one, on a tie).
function bestLock(S) { let best = null, n = -1;
  for (const k of [...Object.keys(S.h), ...Object.keys(S.r)]) { const p = R.unkey(k); if (!R.lockable(S, p)) continue; const c = R.copiesOf(S, p).copies.length; if (c > n) { n = c; best = p } }
  return best ? {p:best, n} : null }
function turn(S) { const c = S.cfg;
  if (c.lockEnabled) { const b = R.hasLock(S) ? bestLock(S) : null;
    if (!S.q.length) return b && b.n > 0 ? R.lock(S, b.p) : R.end(S);                            // the pile is empty: lock while that banks a copy
    if (b && b.n > 0 && c.lockEvery > 0 && S.toLock === c.lockEvery - 1) return R.lock(S, b.p) } // use each lock just before the next one arrives
  const opts = R.options(S, 0), t = S.q[0]; if (!opts.length) return R.discard(S, 0);
  let o = null;
  if (t.k === "h") o = opts.find(x => x.does === "combine") || opts[0];      // combine when it can, otherwise plant
  else { let best = -1; for (const x of opts) { const n = R.opens(S, 0, x) + (x.does === "widen" ? .5 : 0); if (n > best) { best = n; o = x } } } // a tie goes to widening, which uses no land
  return R.place(S, 0, o.p) }
// One whole run. Returns the run, how many turns were tight, and what went wrong (if anything).
function play(cfg, seed) { const out = {S:null, tight:0, error:""};
  try { const S = out.S = R.fresh(cfg, seed), cap = 6000; let n = 0;
    while (!S.over) { if (++n > cap) { out.error = "stalled"; break } if (S.q.length && R.plantable(S).length <= 2) out.tight++; if (!turn(S)) { out.error = "a move was refused"; break } }
    if (!out.error && !same(S, R.replay(cfg, seed, S.moves))) out.error = "did not rebuild from its seed and moves";
  } catch (e) { out.error = "crashed: " + (e && e.message || e) }
  return out }

// ---------- the report
const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1), pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2), share = (a, f) => Math.round(100 * a.filter(f).length / (a.length || 1)) + "%";
function report(cfg, runs) { const res = []; for (let seed = 1; seed <= runs; seed++) res.push(play(cfg, seed));
  const bad = res.filter(r => r.error), ok = res.filter(r => !r.error).map(r => ({...r, hab:Object.keys(r.S.h).length, riv:Object.keys(r.S.r).length, room:R.plantable(r.S).length}));
  const S = ok.map(r => r.S), sc = S.map(s => s.score), top = S.map(s => s.top), lv = [4, 5, 6, 7].filter(l => l <= cfg.maxLevel);
  console.log(`Flowgrow: ${runs} runs, ${cfg.stackSize} tiles each${cfg.lockEnabled ? `, locking on (${cfg.lockEvery ? `a lock every ${cfg.lockEvery} tiles placed, ${cfg.lockHold} held` : "locks free, used when the pile is empty"})` : ", locking off"}`);
  console.log(`  score                average ${Math.round(avg(sc))} · 10th percentile ${pct(sc, .1)} · 90th percentile ${pct(sc, .9)}`);
  console.log(`  top level            average ${f1(avg(top))}${lv.map(l => ` · level ${l}+ in ${share(top, t => t >= l)}`).join("")}`);
  console.log(`  habitats on the map  ${f1(avg(ok.map(r => r.hab)))} (planted ${f1(avg(S.map(s => s.planted)))}, combined ${f1(avg(S.map(s => s.combined)))})`);
  console.log(`  river tiles          ${f1(avg(ok.map(r => r.riv)))} with the source (extended ${f1(avg(S.map(s => s.extended)))}, widened ${f1(avg(S.map(s => s.widened)))})`);
  console.log(`  discards             ${f2(avg(S.map(s => s.discarded)))} a run · at least one in ${share(S, s => s.discarded > 0)} of runs`);
  console.log(`  tight turns          ${f1(avg(ok.map(r => r.tight)))} a run with 2 or fewer plantable tiles · ${f1(avg(ok.map(r => r.room)))} plantable tiles left at the end`);
  if (cfg.lockEnabled) {
    console.log(`  moves                ${f1(avg(S.map(s => s.moves.length)))} a run`);
    console.log(`  locks                ${f1(avg(S.map(s => s.lockUsed)))} used · ${f1(avg(S.map(s => s.lockLost)))} lost · ${f1(avg(S.map(s => Object.keys(s.lk).length)))} tiles locked at the end`);
    console.log(`  copies               ${f1(avg(S.map(s => s.copyBanked)))} banked · ${f1(avg(S.map(s => s.copyPlaced)))} placed · ${f2(avg(S.map(s => s.copyDiscarded)))} discarded · ${f1(avg(S.map(s => s.copyPoints)))} points from copies`) }
  if (bad.length) { console.log(`  ${bad.length} of ${runs} runs went wrong:`); for (const r of bad.slice(0, 10)) console.log(`    seed ${r.S ? r.S.seed : "?"}: ${r.error}`); process.exitCode = 1 }
  else console.log("  no run crashed or stalled, and every run rebuilt exactly from its seed and moves") }

// ---------- the rule checks: small set-ups with a fixed pile (the config's opening list), checked one fact at a time
function checks() { let n = 0; const fails = [];
  const ok = (what, cond) => { n++; if (!cond) fails.push(what) };
  const cfgWith = o => { const t = R.tidy({...BASE, ...o}, BASE); if (t.bad.length) throw new Error("bad test config: " + t.bad); return t.cfg };
  const run = (opening, o = {}) => R.fresh(cfgWith({opening, ...o}), 7);
  const at = (S, p) => S.h[R.key(p)], riv = (S, p) => S.r[R.key(p)], does = (S, p, i = 0) => (R.options(S, i).find(o => o.p + "" === p + "") || {}).does;
  const SRC = [6, 4], E = [7, 4], W = [5, 4], FAR = [9, 4];

  { const t = R.tidy(base); ok("the config file passes its own checks", t.bad.length === 0 && same(t.cfg.map, base.map)) }
  { const S = R.fresh(BASE, 1); ok("a run starts with the source as a level 1 river tile", riv(S, SRC) && riv(S, SRC).l === 1 && Object.keys(S.r).length === 1);
    ok("the first three tiles are habitat 1, habitat 1, river", same(S.q.slice(0, 3), [{k:"h", l:1}, {k:"h", l:1}, {k:"r", l:1}]));
    ok("the pile shows the tile in hand and the next 3, with 80 tiles left", S.q.length === 4 && S.dealt === 4 && R.left(S) === 80);
    ok("at the start the 6 tiles round the source can be planted", R.plantable(S).length === 6 && R.plantable(S).every(k => R.hexDist(R.unkey(k), SRC) === 1)) }
  { const S = run(["habitat 1", "habitat 1", "habitat 2", "habitat 1"]);
    ok("land 2 tiles from a level 1 river tile is too far", R.place(S, 0, [8, 4]) === null && R.why(S, 0, [8, 4]) === "Too far from the river.");
    const a = R.place(S, 0, E); ok("planting a level 1 tile scores 1", a && a.does === "plant" && a.pts === 1 && S.score === 1 && at(S, E) === 1 && S.planted === 1 && S.top === 1);
    const b = R.place(S, 0, E); ok("a level 1 tile on a level 1 habitat makes level 2 and scores 3", b && b.does === "combine" && b.pts === 3 && at(S, E) === 2 && S.score === 4 && S.combined === 1 && Object.keys(S.h).length === 1);
    const c = R.place(S, 0, E); ok("a level 2 tile on a level 2 habitat makes level 3 and scores 6", c && c.pts === 6 && at(S, E) === 3 && S.score === 10 && S.top === 3);
    ok("a different level is never allowed", R.place(S, 0, E) === null && R.why(S, 0, E) === "That's level 3. Only a level 3 tile can go on it." && at(S, E) === 3 && S.score === 10) }
  { const S = run(["habitat 3"]); const a = R.place(S, 0, E); ok("a level 3 tile planted on empty land scores 6", a && a.does === "plant" && a.pts === 6 && S.score === 6 && S.top === 3) }
  { const S = run(["habitat 7", "habitat 7"]); R.place(S, 0, E);
    ok("a level 7 habitat can't be combined", R.place(S, 0, E) === null && R.why(S, 0, E) === "Old forest is the top level." && does(S, W) === "plant") }
  { const S = run(["river", "river", "river", "river", "habitat 1"]);
    ok("a river tile can't go on land that doesn't touch the river", R.place(S, 0, FAR) === null && R.why(S, 0, FAR) === "A river tile has to touch the river.");
    const a = R.place(S, 0, E); ok("a river tile extends the river onto empty land that touches it, for no points", a && a.does === "extend" && a.pts === 0 && S.score === 0 && riv(S, E).l === 1 && S.extended === 1);
    ok("a level 1 river tile reaches 1 tile out", R.plantable(S).length === 8 && a.greened.length === 3 && !R.plantable(S).includes("9,4"));
    ok("a new river tile joins the river's end", riv(S, E).from === "6,4");
    const b = R.place(S, 0, SRC); ok("a river tile on a level 1 river tile widens it to level 2", b && b.does === "widen" && riv(S, SRC).l === 2 && S.widened === 1 && S.score === 0);
    ok("a level 2 river tile reaches 2 tiles out", R.reachOf(S).has("4,4") && R.reachOf(S).has("6,2") && !R.reachOf(S).has("3,4") && b.greened.length > 0);
    ok("level 2 is the widest", R.place(S, 0, SRC) === null && R.why(S, 0, SRC) === "The river is at its widest here.");
    const c = R.place(S, 0, W); ok("the river can branch", c && c.does === "extend" && riv(S, W).from === "6,4" && Object.keys(S.r).length === 3);
    R.place(S, 0, [8, 4]); ok("a tile further along joins the newest end it touches", riv(S, [8, 4]).from === "7,4");
    ok("a habitat can't go on the river", R.place(S, 0, E) === null && R.why(S, 0, E) === "That's the river. Plant beside it.") }
  { const S = run(["habitat 1", "river"]); R.place(S, 0, E);
    ok("a river tile can't go on a habitat", R.place(S, 0, E) === null && R.why(S, 0, E) === "A river tile needs empty land.") }
  { const S = run(["river", "habitat 1", "river"], {map:["_____", "_TB__", "_____"]}); R.place(S, 0, [1, 1]);
    ok("mountains don't block reach", R.plantable(S).includes("3,1"));
    ok("nothing goes on a mountain", R.place(S, 0, [2, 1]) === null && R.why(S, 0, [2, 1]) === "Nothing grows on a mountain." && R.why(S, 1, [2, 1]) === "The river can't cross a mountain.") }
  { const S = run(["habitat 1", "habitat 1", "habitat 1"], {stackSize:3, queueShown:1}); const d = R.discard(S, 0);
    ok("a discard scores nothing and still uses up the tile", d && S.discarded === 1 && S.score === 0 && S.used === 1 && R.left(S) === 2);
    R.place(S, 0, E); ok("the run isn't over while a tile is left", !S.over && R.left(S) === 1);
    R.place(S, 0, E); ok("the run ends when the last tile is used", S.over && R.left(S) === 0 && R.options(S, 0).length === 0 && R.discard(S, 0) === null && R.place(S, 0, W) === null) }
  { const S = run([], {stackSize:0}); let riv2 = 0, N = 30000; for (let i = 0; i < N; i++) if (R.roll(S).k === "r") riv2++;
    ok("one dealt tile in ten is a river tile", Math.abs(riv2 / N - .1) < .008);
    let all1 = true; for (let i = 0; i < 300; i++) { const t = R.roll(S); if (t.k === "h" && t.l !== 1) all1 = false } ok("with no habitat on the map every habitat dealt is level 1", all1);
    S.top = 3; const c = [0, 0, 0, 0]; for (let i = 0; i < N; i++) { const t = R.roll(S); if (t.k === "h") c[t.l]++ } const h = c[1] + c[2] + c[3];
    ok("levels 1, 2 and 3 are dealt 4 : 2 : 1 when 3 is the top level on the map", c[0] === 0 && Math.abs(c[1] / h - 4 / 7) < .012 && Math.abs(c[2] / h - 2 / 7) < .012 && Math.abs(c[3] / h - 1 / 7) < .012);
    S.top = 9; let over = false; for (let i = 0; i < 3000; i++) if (R.roll(S).l > 7) over = true; ok("no tile is dealt above the top level", !over) }
  { const NOLOCK = cfgWith({lockEnabled:false}), a = play(NOLOCK, 42), b = play(NOLOCK, 42), c = play(NOLOCK, 43), BASE = NOLOCK;
    ok("the same seed and the same moves give the same run", !a.error && same(a.S, b.S));
    ok("another seed gives another pile", !same(a.S.log.map(e => e.t), c.S.log.map(e => e.t)));
    ok("a whole run uses every tile and its score is the sum of its moves", a.S.over && a.S.used === 80 && a.S.moves.length === 80 && a.S.log.reduce((s, e) => s + e.pts, 0) === a.S.score && a.S.planted + a.S.combined + a.S.extended + a.S.widened + a.S.discarded === 80);
    const part = R.replay(BASE, 42, a.S.moves.slice(0, 30)), back = R.replay(BASE, 42, a.S.moves.slice(0, 29)), again = R.replay(BASE, 42, a.S.moves.slice(0, 29)); R.place(again, a.S.moves[29].i, [a.S.moves[29].x ?? 0, a.S.moves[29].y ?? 0]) || R.discard(again, 0);
    ok("undo steps back one move and never re-rolls a tile", same(back.q.slice(0, 3), R.replay(BASE, 42, a.S.moves.slice(0, 29)).q.slice(0, 3)) && same(part, again));
    ok("the run log has one line per move", a.S.log.length === 80 && R.logText(a.S).split("\n").length === 82 && a.S.log.every((e, i) => e.n === i + 1)) }
  { ok("levels 1 to 7 score 1, 3, 6, 10, 15, 21, 28", same([1, 2, 3, 4, 5, 6, 7].map(l => R.scoreOf(BASE, l)), [1, 3, 6, 10, 15, 21, 28]));
    ok("past level 7 the score carries on the pattern", R.scoreOf(BASE, 8) === 36 && R.scoreOf(BASE, 9) === 45) }
  { const t = R.tidy({...BASE, map:["___", "_X_", "___"], stackSize:"12", riverShare:5, opening:"habitat 2, river, habitat 1", levelNames:""}, BASE);
    ok("a bad map or a bad number is refused and the old value stands", same(t.bad, ["map", "riverShare", "levelNames"]) && same(t.cfg.map, BASE.map) && t.cfg.riverShare === .1 && t.cfg.stackSize === 12 && same(t.cfg.opening, ["habitat 2", "river", "habitat 1"]));
    ok("a map needs exactly one source", R.mapOf(["___", "___", "___"]) === undefined && R.mapOf(["T__", "__T", "___"]) === undefined && !!R.mapOf("_T_ ___ _B_")) }
  { const S = run(["habitat 1", "habitat 2", "habitat 1"], {pickFrom:3}); const a = R.place(S, 1, E);
    ok("with pick from 3, the second tile can be taken instead", a && at(S, E) === 2 && same(S.q[0], {k:"h", l:1}) && same(R.replay(S.cfg, 7, S.moves), S)) }
  { const S = run(["river 2", "river 2"]); const a = R.place(S, 0, E);
    ok("a level 2 river tile extends at level 2, reaches 2 tiles out and can't widen", a && a.does === "extend" && riv(S, E).l === 2 && R.reachOf(S).has("9,4") && does(S, SRC) === undefined && does(S, E) === undefined) }

  // ----- locking (LOU-299). A set-up puts habitats and river tiles straight on the island and gives the player one lock.
  const setup = (h, r = {}, o = {}) => { const S = R.fresh(cfgWith({opening:[], ...o}), 7); for (const k in h) S.h[k] = h[k]; for (const k in r) S.r[k] = {l:r[k], from:null, n:S.rn++};
    S.top = Math.max(0, ...Object.values(S.h)); S.locks = 1; return S };
  const C = [8, 6], N = ["9,6", "8,5", "7,5", "7,6", "7,7", "8,7"];   // a tile with six land neighbours, and those neighbours
  const got = (S, p = C) => R.copiesOf(S, p).copies.map(t => (t.k === "r" ? "r" : "") + t.l).join(" ");
  { const S = setup({"8,6":5, [N[0]]:5, [N[1]]:3, [N[2]]:5, [N[3]]:1, [N[4]]:5, [N[5]]:2});
    ok("lock: a level 5 habitat beside habitats 1, 2, 3, 5, 5, 5 copies 1, 2, 3, 5, 5, 5", got(S) === "1 2 3 5 5 5") }
  { const S = setup({"8,6":2, [N[0]]:5, [N[1]]:5, [N[2]]:5, [N[3]]:5, [N[4]]:5, [N[5]]:5});
    ok("lock: a level 2 habitat beside six level 5 habitats copies nothing", got(S) === "" && R.copiesOf(S, C).high.length === 6) }
  { const S = setup({"8,6":3, [N[0]]:4, [N[1]]:2, [N[2]]:3});
    ok("lock: a level 3 habitat beside habitats 2, 3, 4 copies 2 and 3", got(S) === "2 3" && same(R.copiesOf(S, C).high, [N[0]])) }
  { const S = setup({"8,6":3}, {[N[0]]:2});
    ok("lock: a level 3 habitat beside a level 2 river tile gets one level 2 river copy", got(S) === "r2") }
  { const S = setup({"8,6":1}, {[N[0]]:2});
    ok("lock: a level 1 habitat beside a level 2 river tile gets no copy", got(S) === "") }
  { const S = setup({[N[0]]:1, [N[1]]:4}, {"8,6":1});
    ok("lock: a level 1 river tile beside a level 1 and a level 4 habitat gets one level 1 habitat copy", got(S) === "1" && R.lockable(S, C)) }
  { const S = setup({"5,6":3, "6,6":1}); S.lk["6,6"] = 1;   // 4,6 is a mountain and the other neighbours are empty land
    ok("lock: a locked neighbour, a mountain and empty land give no copy", got(S, [5, 6]) === "" && R.codeAt(S.cfg, [4, 6]) === "B") }
  { const S = setup({"8,6":3, [N[0]]:1, [N[1]]:2}, {[N[2]]:1}), q0 = JSON.stringify(S.q), sc = S.score; const a = R.lock(S, C);
    ok("lock: copies are exact, river tiles first, then habitats from the lowest level", a && same(a.copies, [{k:"r", l:1, c:1}, {k:"h", l:1, c:1}, {k:"h", l:2, c:1}]) && same(S.bank, a.copies));
    ok("lock: it doesn't use the tile in hand, scores nothing, and the originals stay", JSON.stringify(S.q) === q0 && S.score === sc && S.h[N[0]] === 1 && S.h[N[1]] === 2 && S.locks === 0 && S.lockUsed === 1 && S.copyBanked === 3);
    ok("lock: tiles left counts the banked copies", R.left(S) === 83);
    ok("lock: a locked tile can't be locked again, and with no lock held nothing can be locked", R.lock(S, C) === null && !R.lockable(S, [9, 6]));
    S.locks = 1; ok("lock: a locked tile is not copied when a neighbour is locked", got(S, [9, 6]) === "" && got(S, [8, 5]) === "r1 1" && !R.copiesOf(S, [8, 5]).from.includes("8,6")) }
  { const S = run(["habitat 1", "habitat 1", "river", "river", "habitat 1"]); R.place(S, 0, E); S.locks = 2; R.lock(S, E);
    ok("lock: a locked habitat can't be combined onto", R.place(S, 0, E) === null && R.why(S, 0, E) === "That tile is locked." && does(S, E) === undefined);
    R.place(S, 0, W); R.lock(S, SRC);
    ok("lock: a locked river tile can't be widened", R.place(S, 0, SRC) === null && R.why(S, 0, SRC) === "That tile is locked.");
    ok("lock: a locked river tile still reaches land and the river can still be extended from it", R.plantable(S).length > 0 && does(S, [6, 3]) === "extend" && R.place(S, 0, [6, 3]) !== null && S.r["6,3"].from === "6,4") }
  { const S = run(["habitat 1", "habitat 2", "habitat 1", "habitat 1"], {stackSize:4, queueShown:1}); R.place(S, 0, E); S.locks = 1; R.lock(S, SRC);
    ok("lock: copies wait at the back of the pile, behind every tile still to be dealt", same(S.bank, [{k:"h", l:1, c:1}]) && S.q.every(t => !t.c) && R.left(S) === 4);
    R.place(S, 0, W); R.place(S, 0, E); R.place(S, 0, [6, 3]);
    ok("lock: a copy arrives once the dealt tiles are used up", !S.over && S.q.length === 1 && S.q[0].c === 1 && S.bank.length === 0 && R.left(S) === 1);
    const a = R.place(S, 0, [6, 5]); ok("lock: a copy plays and scores like a dealt tile", a && a.does === "plant" && a.pts === 1 && S.copyPlaced === 1 && S.copyPoints === 1 && S.over) }
  { const S = R.fresh(cfgWith({opening:[], riverShare:0, stackSize:40}), 3); let n = 0; const tick = () => { const o = R.options(S, 0); return o.length ? R.place(S, 0, o[0].p) : R.discard(S, 0) };
    for (let i = 0; i < 9; i++) tick(); ok("lock: no lock before 10 tiles are placed", S.locks === 0 && S.toLock === 9 - S.discarded);
    R.discard(S, 0); ok("lock: a discard doesn't count toward a lock", S.locks === 0);
    while (S.toLock !== 0 || S.locks === 0) tick(); ok("lock: one lock is earned for every 10 tiles placed", S.locks === 1 && S.planted + S.combined === 10);
    while (S.planted + S.combined < 20) tick(); ok("lock: only one can be held, and one earned while holding it is lost", S.locks === 1 && S.lockLost === 1);
    const moves = S.moves.length; R.lock(S, R.unkey(Object.keys(S.h)[0])); const back = R.replay(S.cfg, 3, S.moves.slice(0, -1));
    ok("lock: undo steps back over a lock, and a reload brings the locked tiles and banked copies back", S.moves.length === moves + 1 && S.moves[moves].a === "l" && back.locks === 1 && Object.keys(back.lk).length === 0 && back.bank.length === 0 && same(R.replay(S.cfg, 3, S.moves), S)) }
  { const S = run(["habitat 1", "habitat 1"], {stackSize:2, queueShown:1}); R.place(S, 0, E); S.locks = 1; R.place(S, 0, W);
    ok("lock: with the pile empty the run goes on while a lock would bank a copy", !S.over && S.q.length === 0 && R.lockWouldCopy(S) && R.options(S, 0).length === 0);
    const T = R.replay(S.cfg, 7, []); R.place(T, 0, E); T.locks = 1; R.place(T, 0, W); ok("lock: End run ends it by hand", R.end(T) && T.over && R.end(T) === null);
    R.lock(S, SRC); ok("lock: locking then brings the copies in", !S.over && S.q.length === 2 && S.q[0].c === 1);
    R.place(S, 0, E); R.place(S, 0, W); ok("lock: the run ends when the pile is empty and no lock is held", S.over && S.h["7,4"] === 2 && S.h["5,4"] === 2) }
  { const S = run(["habitat 1"], {stackSize:1, queueShown:0}); R.place(S, 0, E); ok("lock: with no lock held the run ends when the pile is empty", S.over && R.end(S) === null) }
  { const A = setup({"8,6":1, [N[0]]:4}, {[N[1]]:2}, {lockLevelCap:false}); ok("lock: with the level cap off, every unlocked neighbour is copied", got(A) === "r2 4");
    const B2 = setup({"8,6":3}, {[N[0]]:1}, {lockRivers:false}); ok("lock: with river locking off, river tiles are neither locked nor copied", got(B2) === "" && !R.lockable(B2, R.unkey(N[0])) && R.lockable(B2, C));
    const F = setup({"8,6":3, [N[0]]:2}, {}, {lockCopiesGo:"front"}), hand = JSON.stringify(F.q[0]); R.lock(F, C); ok("lock: with copies to the front, they are the next tiles", JSON.stringify(F.q[0]) === hand && same(F.q[1], {k:"h", l:2, c:1}) && F.bank.length === 0);
    const Z = setup({"8,6":3, [N[0]]:2}, {}, {lockEvery:0}); Z.locks = 0; ok("lock: with lockEvery 0, locks are free and unlimited", R.lockable(Z, C) && R.lock(Z, C) && R.lockable(Z, R.unkey(N[0])) && Z.locks === 0);
    const O = setup({"8,6":3, [N[0]]:2}, {}, {lockEnabled:false}); ok("lock: with locking off, nothing can be locked", !R.lockable(O, C) && R.lock(O, C) === null) }

  { const a = play(BASE, 42), S = a.S;
    ok("lock: a whole run with locking ends, and its score is the sum of its moves", !a.error && S.over && S.lockUsed > 0 && S.log.reduce((s, e) => s + e.pts, 0) === S.score && S.planted + S.combined + S.extended + S.widened + S.discarded === S.used && S.used === 80 + S.copyPlaced + S.copyDiscarded);
    ok("lock: the run log has a line for every move, and marks locks and copies", R.logText(S).split("\n").length === S.moves.length + 2 && /\. Locked .* banked /.test(R.logText(S)) && /, copy · /.test(R.logText(S)) && /, dealt · /.test(R.logText(S))) }

  for (const f of fails) console.log("FAILED: " + f);
  console.log(fails.length ? `${fails.length} of ${n} rule checks failed` : `all ${n} rule checks passed`);
  if (fails.length) process.exitCode = 1 }

// ---------- command line
const args = process.argv.slice(2);
if (args.includes("--test")) checks();
else { let runs = 1000; const over = {};
  for (const a of args) { if (/^\d+$/.test(a)) runs = +a; else { const m = /^([A-Za-z]+)=(.*)$/.exec(a); if (!m || !R.KEYS.some(k => k[0] === m[1])) { console.error(`Unknown setting: ${a}. Use key=value with one of: ${R.KEYS.map(k => k[0]).join(", ")}`); process.exit(1) } over[m[1]] = m[2] } }
  const t = R.tidy({...BASE, ...over}, BASE); if (t.bad.length) { console.error("Refused: " + t.bad.join(", ")); process.exit(1) }
  if (!t.cfg.stackSize) { console.error("The simulator needs a run that ends: stackSize can't be 0 here."); process.exit(1) }
  report(t.cfg, runs) }
