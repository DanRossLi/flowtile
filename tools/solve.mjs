#!/usr/bin/env node
// Flow Tile level solver (LOU-291). A developer tool: it is not part of the game and nothing here is loaded by a page.
//
// It plays each campaign level with the game's own rules. play.js itself is loaded here, in a Node sandbox with a stub page,
// so the solver and the game can't drift apart. No build step and no packages: plain Node 18 or newer.
//
//   node tools/solve.mjs                 every campaign level: a report table
//   node tools/solve.mjs 7 12            just Levels 7 and 12
//   node tools/solve.mjs --write         also set each level's "By turn N" and save the 3-star solutions to solutions.js (for hints)
//   node tools/solve.mjs 7 -v            print the solutions too
//   node tools/solve.mjs --jobs 4        levels solved at once (default: one fewer than your cores, at most 6)
//
// For each level it finds the fewest turns to reach the sea, the fewest turns with all three stars, and what the plain
// cheapest route earns. It exits with an error if a level has no 3-star solution.
//   By turn N = best 3-star turn + 1 (+2 in Chapter 1). Levels 1 to 3 are guided and keep their own goals.
//   Flags: NO 3-STAR SOLUTION; "no choice" (the cheapest route already earns every star); "over budget" (the best 3-star
//   solution is longer than the chapter's turn budget); "turn goal" (the saved goal differs from what this run would set).
// The search is a beam search, turn by turn, so its turn counts are upper bounds: a better solution may exist, a worse one never.
// Rerun it whenever a level or a rule changes (CANON).
import fs from 'fs'; import vm from 'vm'; import os from 'os'; import path from 'path'; import {fileURLToPath} from 'url'; import {spawn} from 'child_process';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = 24, BUDGET = [5, 7, 9, 12], FINALE = 15; // the most turns a 3-star solution should take, by chapter (LOU-290)

// ---------- the game, loaded as it is
const stub = () => { const f = function () {}; return new Proxy(f, {
  get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (k === 'then') return undefined; if (k === 'length') return 0; return stub() },
  set() { return true }, apply() { return stub() }, construct() { return stub() } }) };
export function load(dir) {
  const html = fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8'), mapSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1], els = {};
  const ctx = {console, Math, JSON, Date, URLSearchParams, Map, Set, Array, Object, Number, String, Symbol, Proxy, URL, Infinity, isNaN, parseInt, TextEncoder,
    setTimeout: () => 0, clearTimeout: () => 0, performance: {now: () => Date.now()}, matchMedia: () => ({matches: true}), localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    navigator: {}, addEventListener() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 1, requestAnimationFrame() {}, Path2D: stub(),
    document: {currentScript: {src: 'http://x/play.js'}, body: stub(), head: stub(), createElement: () => stub(), createElementNS: () => stub(), querySelector: () => null, fonts: undefined,
      getElementById: id => (els[id] ||= (id === 'jNotch' ? {children: [], appendChild(c) { this.children.push(c) }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1) }, lastChild: null, style: {}} : stub()))}};
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(mapSrc, ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'play.js'), 'utf8'), ctx);
  return ctx;
}

// ---------- the search
const HEX = [[[1,0],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]], [[1,0],[1,-1],[0,-1],[-1,0],[0,1],[1,1]]];
const cube = ([x, y]) => [x - (y - (y & 1)) / 2, y], hd = (a, b) => { const [q1, r1] = cube(a), [q2, r2] = cube(b), dq = q1 - q2, dr = r1 - r2; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) };
const J = o => o == null ? o : JSON.parse(JSON.stringify(o));
const tile = c => { const o = {...c}; for (const k in o) if (o[k] && typeof o[k] === 'object') o[k] = J(o[k]); return o };
const clone = S => { const o = {...S}; for (const k in o) if (o[k] && typeof o[k] === 'object') o[k] = k === 'tiles' ? S.tiles.map(r => r.map(tile)) : J(o[k]); return o };
function open(dir) {
  const w = load(dir), F = w.FT, M = w.MAP; F.quiet = true; F.noUndo = true; const T = M.types, H = T.length, W = T[0].length;
  if (F.S.phase === 'pick') { let src = M.mainSource; if (!src) T.forEach((r, y) => [...r].forEach((c, x) => { if (!src && (c === 'S' || c === 'T')) src = [x, y] })); F.pick(src) }
  F.history.length = 0;
  const nb = ([x, y]) => HEX[y & 1].map(([a, b]) => [x + a, y + b]).filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H), at = p => F.S.tiles[p[1]][p[0]];
  // the cheapest cost from every tile to the sea (a lake is paid once), for the search's sense of direction; caves aren't in it
  const dist = new Map(), q = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at([x, y]).t === 'ocean') { dist.set(x + ',' + y, 1); q.push([x, y]) }
  const enter = c => c.t === 'boulder' || c.t === 'source' ? Infinity : c.t === 'lake' ? 2 * F.S.lakes[c.lake].tiles.length : c.t === 'rock' ? 2 : c.t === 'sand' || c.t === 'spring' ? 0 : 1;
  while (q.length) { q.sort((a, b) => dist.get(b + '') - dist.get(a + '')); const p = q.pop(), dp = dist.get(p + '');
    for (const n of nb(p)) { const c = at(n), cp = at(p); let nd = dp + (cp.t === 'ocean' ? 0 : enter(cp)); if (c.t === 'boulder') continue; if (c.t === 'lake' && cp.t === 'lake' && c.lake === cp.lake) nd = dp;
      if (!dist.has(n + '') || nd < dist.get(n + '')) { dist.set(n + '', nd); q.push(n) } } }
  return {w, F, M, W, H, nb, at, dist};
}
// One action: ["m", x, y] flow to a tile; ["g", x, y] the next paid growth step there (bare ground: grass, then meadow);
// ["gr", x, y] free grass only; ["c"] Next water cycle.
function act(E, a) { const {F, at} = E;
  if (a[0] === 'm') { const m = F.moves().get(a[1] + ',' + a[2]); if (!m || m.cost > F.S.water) return false; F.raw.build(m) }
  else if (a[0] === 'gr') { const p = [a[1], a[2]]; if (at(p).g !== 0 || !F.plantable(p)) return false; F.raw.plant(p) }
  else if (a[0] === 'g') { const p = [a[1], a[2]]; if (!F.plantable(p)) return false; if (at(p).g === 0) F.raw.plant(p); if (at(p).g >= 3 || F.S.water < 1) return false; const g0 = at(p).g; F.raw.plant(p); if (at(p).g === g0) return false }
  else F.endTurn(); return true }
// solve(dir, {mode: "sea" | "star", beam, pm, pg, maxTurn, w, from}) -> {turn, acts, stars, flow, cap} or null.
// Within a turn the order is fixed (moves, then growth in tile order, then a last step into the sea), which loses nothing:
// growth only pays out at the water cycle, and it needs the river beside it. `from` is a list of actions played first
// (a level's guided opening).
function solve(dir, opt = {}) {
  const E = open(dir), {F, M, W, H, at, nb, dist} = E, mode = opt.mode || 'star', K = opt.beam || 24, PM = opt.pm || 28, PG = opt.pg || 10, MAXT = opt.maxTurn || 24, wts = opt.w || {};
  const need = (M.stars || []).filter(s => !['sea', 'byTurn'].includes(s.type)), wantStars = mode === 'star' && need.length > 0, types = new Set(wantStars ? need.map(s => s.type) : []);
  const growUseful = ['groves', 'groveFertile', 'groveWild', 'storage', 'flow', 'noSpill', 'marshFlow'].some(t => types.has(t));
  const all = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) all.push([x, y]);
  const marshNb = new Set(all.filter(p => at(p).t === 'marsh').flatMap(p => nb(p).map(String))), span = W + H;
  const key = () => { const S = F.S, r = [], g = []; for (const [x, y] of all) { const c = S.tiles[y][x]; if (c.river) r.push(x * 64 + y); if (c.g && !c.wild) g.push(x * 64 + y + ':' + c.g) }
    return [S.turn, S.water, S.income, S.cap, S.head, S.spilled || 0, S.dry || 0, r.join('.'), g.join('.')].join('|') };
  const headDist = () => { const h = F.S.head; return h ? (dist.get(h + '') ?? 99) : 99 };
  const trees = () => { let n = 0; for (const p of all) { const c = at(p); if (c.g >= 3 && !c.river && F.raw.riverBy(p)) n++ } return n };
  const fertTrees = () => { let n = 0; for (const p of all) { const c = at(p); if (c.g >= 3 && !c.river && c.fert && F.raw.riverBy(p)) n += 2 } return n };
  const grown = () => { let n = 0; for (const p of all) { const c = at(p); if (!c.river && !c.wild && c.g >= 2) n += c.g - 1 } return n };
  // how far along each star is, 0 to 1
  function progress() { let p = 0; const S = F.S; let rt = null; const near = (tg, fromRiver) => { if (!tg.length) return 0; rt ||= all.filter(q => at(q).river && at(q).t !== 'ocean'); let d = 99; for (const a of fromRiver ? rt : [S.head]) for (const b of tg) d = Math.min(d, hd(a, b)); return 1 - Math.min(1, d / span) };
    for (const s of F.stars()) { if (!types.has(s.type)) continue; if (s.state === 'miss') { p -= 5; continue } if (s.ok) { p += ['noSpill', 'noForest', 'noDrain'].includes(s.type) ? 0 : 1; continue } const n = s.n || 1;
      if (s.type === 'flow') p += .8 * Math.min(1, S.income / n) + .1 * trees() / 3;
      else if (s.type === 'storage') p += .8 * Math.min(1, (S.cap - 5) / Math.max(1, n - 5)) + .05 * grown();
      else if (s.type === 'groves') p += .8 * Math.min(1, trees() / (3 * n)) + .03 * grown();
      else if (s.type === 'groveWild') p += .5 * near(all.filter(q => at(q).wild && !at(q).river), true) + .3 * Math.min(1, trees() / 3);
      else if (s.type === 'groveFertile') p += .4 * near(all.filter(q => at(q).fert && !at(q).river), true) + .4 * Math.min(1, fertTrees() / 3) + .03 * grown();
      else if (s.type === 'springs') p += .8 * all.filter(q => at(q).t === 'spring' && at(q).river).length / n + .2 * near(all.filter(q => at(q).t === 'spring' && !at(q).river));
      else if (s.type === 'pools') p += .8 * all.filter(q => at(q).ro === 2).length / n + .2 * near(all.filter(q => at(q).ro === 1));
      else if (s.type === 'lake') p += .8 * S.lakes.filter(L => L.filled).length / n + .2 * near(all.filter(q => at(q).t === 'lake' && !at(q).river));
      else if (s.type === 'cave') p += .8 * near(all.filter(q => at(q).t === 'cave'));
      else if (s.type === 'marshFlow') p += .6 * near(all.filter(q => at(q).t === 'marsh'), true) + .1 * all.filter(q => marshNb.has(q + '') && at(q).g >= 1 && !at(q).river).length }
    return p }
  const minCost = () => Math.min(...[...F.moves().values()].map(m => m.cost), 99);
  // "Never spill": flow that can't fit in the jar at the next cycle (with rain still to come) will spill, so steer away from it early
  const rainTurns = Object.entries(M.weather || {}).filter(([, v]) => v === 'rain').map(([t]) => +t);
  const spillRisk = () => { if (!types.has('noSpill')) return 0; const S = F.S; return Math.max(0, S.income + (rainTurns.some(t => t > S.turn) ? 2 : 0) - S.cap) };
  const score = () => { const S = F.S, c = minCost();
    return -(wts.risk ?? 12) * spillRisk() + (wantStars ? (wts.star ?? 30) * progress() : 0) - (wts.dist ?? 1.6) * headDist() + (wts.water ?? .5) * Math.min(S.water, S.cap || 99) + (wts.flow ?? 1.2) * S.income + (c > (S.cap || 99) ? 2 * S.cap : (wts.cap ?? .3) * (S.cap || 0)) - (c >= 99 ? 50 : 0) };
  const starsOkAtSea = () => F.stars().every(s => s.type === 'sea' || s.type === 'byTurn' || s.ok);
  const bad = () => { const S = F.S; return (types.has('noSpill') && S.spilled) || (types.has('noForest') && S.cutForest) || (types.has('noDrain') && S.drained) };
  const moveList = () => { const S = F.S, out = []; for (const m of F.moves().values()) if (m.cost <= S.water) { const c = at(m.p);
      if (wantStars && ((types.has('noForest') && c.wild) || (types.has('noDrain') && c.t === 'marsh'))) continue; out.push(m) } return out };
  // growth worth trying here, best first
  function growList() { const S = F.S, out = []; if (!M.storage) return out; const forced = minCost() > S.cap; if (!growUseful && !forced) return out;
    for (const p of all) { const c = at(p); if (c.river || c.wild || c.g >= 3 || !F.plantable(p)) continue; if (!F.raw.riverBy(p) && !c.pre) continue;
      let v = c.g, tn = 0; for (const n of nb(p)) { const d = at(n); if (d.g >= 3 && !d.river) { tn++; v += F.raw.riverBy(n) ? 2 : .5 } else if (d.g === 2 && !d.river) v += .6 }
      if (c.fert) v += types.has('groveFertile') ? 3 : 1; if (types.has('storage') && c.g < 2) v += tn; if (c.g === 0 && types.has('marshFlow') && marshNb.has(p + '')) out.push([p[0], p[1], 'gr', v + 5]);
      if (c.g === 1 && types.has('marshFlow') && marshNb.has(p + '') && !types.has('noSpill') && !forced) continue;
      if (S.water >= 1) out.push([p[0], p[1], 'g', v]) }
    return out.sort((a, b) => b[3] - a[3]).slice(0, opt.gtop || 7) }
  const list = n => { const o = []; for (let a = n; a; a = a.prev) o.push(a.a); return o.reverse() };
  let best = null; const win = node => { const st = F.stars(), ok = st.filter(s => s.type !== 'byTurn').every(s => s.ok); if ((!wantStars || ok) && (!best || F.S.turn < best.turn)) best = {turn:F.S.turn, acts:list(node), stars:st, flow:F.S.income, cap:F.S.cap} };
  let start = null; for (const a of opt.from || []) { if (!act(E, a)) throw new Error(`${dir}: the opening step ${a} can't be played`); start = {a, prev:start} }
  let beam = [{S:clone(F.S), acts:start, h:0}];
  for (let turn = F.S.turn; turn <= MAXT && beam.length && !best; turn++) { const next = new Map();
    for (const b of beam) { const seen = new Set(), todo = [{S:b.S, acts:b.acts, h:0}], ends = []; let n = 0;
      while (todo.length && n < PM) { todo.sort((x, y) => x.h - y.h); const cur = todo.pop(); n++; ends.push(cur); F.S = clone(cur.S);
        for (const m of moveList()) { F.S = clone(cur.S); if (at(m.p).t === 'ocean' && wantStars && !starsOkAtSea()) continue; const a = ['m', m.p[0], m.p[1]]; if (!act(E, a)) continue; const node = {a, prev:cur.acts};
          if (F.S.phase === 'won') { win(node); continue } if (F.S.phase !== 'play' || bad()) continue; const k = key(); if (seen.has(k)) continue; seen.add(k); todo.push({S:F.S, acts:node, h:score()}) } }
      const fin = [...ends], gfrom = [ends[0], ...ends.slice(1).sort((x, y) => y.h - x.h).slice(0, opt.ge || 7)];
      for (const e of gfrom) { const go = [{S:e.S, acts:e.acts, last:-1, h:0}]; let g = 0;
        while (go.length && g < PG) { go.sort((x, y) => x.h - y.h); const cur = go.pop(); g++; F.S = clone(cur.S);
          for (const c of growList()) { const idx = c[1] * 64 + c[0]; if (idx < cur.last) continue; F.S = clone(cur.S); const a = [c[2], c[0], c[1]]; if (!act(E, a)) continue; const k = key(); if (seen.has(k)) continue; seen.add(k);
            const node = {S:F.S, acts:{a, prev:cur.acts}, last:idx, h:score()}; go.push(node); fin.push(node);
            if (wantStars && starsOkAtSea()) { const S0 = F.S; for (const m of moveList()) if (at(m.p).t === 'ocean') { F.S = clone(S0); if (act(E, ['m', m.p[0], m.p[1]]) && F.S.phase === 'won') win({a:['m', m.p[0], m.p[1]], prev:node.acts}) } F.S = S0 } } } }
      for (const e of fin) { F.S = clone(e.S); F.endTurn(); if (F.S.phase !== 'play' || bad()) continue; const k = key(), h = score(), old = next.get(k); if (!old || h > old.h) next.set(k, {S:F.S, acts:{a:['c'], prev:e.acts}, h, hk:F.S.head + '|' + F.S.income}) }
      if (next.size > 8 * K) { const keep = [...next.entries()].sort((x, y) => y[1].h - x[1].h).slice(0, 4 * K); next.clear(); for (const [k, v] of keep) next.set(k, v) }
      if (best) break }
    // keep the best, but no more than a quarter of the beam at one river's end with one flow, so it doesn't collapse onto one idea
    const per = new Map(), cap = Math.max(2, Math.ceil(K / 4)); beam = [];
    for (const s of [...next.values()].sort((a, b) => b.h - a.h)) { const c = per.get(s.hk) || 0; if (c >= cap) continue; per.set(s.hk, c + 1); beam.push(s); if (beam.length >= K) break } }
  return best;
}
// The plain cheapest route: always the step that costs least on the way to the sea, waiting a cycle when it can't be paid. No growing.
function cheapest(dir) { const E = open(dir), {F, at, dist} = E, acts = []; let guard = 0;
  while (F.S.phase === 'play' && guard++ < 400) { let best = null; for (const m of F.moves().values()) { const c = m.cost + (at(m.p).t === 'ocean' ? 0 : (dist.get(m.p + '') ?? 99)); if (!best || c < best.c) best = {m, c} }
    if (!best || F.S.turn > 40) break; if (best.m.cost <= F.S.water) { acts.push(['m', ...best.m.p]); F.raw.build(best.m) } else { acts.push(['c']); F.endTurn() } }
  return F.S.phase === 'won' ? {turn:F.S.turn, acts, stars:F.stars(), flow:F.S.income, cap:F.S.cap} : null }
const starry = r => !!r && r.stars.filter(s => s.type !== 'byTurn').every(s => s.ok);
const WEIGHTS = [{}, {dist:.8, star:45, flow:2}, {dist:3, star:20}, {dist:.8, star:80}]; // a few leanings; the best result wins
function solveBest(dir, mode, opt = {}) { let best = null; for (const w of (mode === 'sea' ? WEIGHTS.slice(0, 2) : WEIGHTS)) { const r = solve(dir, {...opt, mode, w}); if (r && (!best || r.turn < best.turn)) best = r } return best }
// Everything the report needs for one level.
export function study(n) { const dir = 'level/' + n, t0 = Date.now(), M = load(dir).MAP, big = M.types.length * M.types[0].length > 200, opt = big ? {beam:32} : {};
  let sea = solveBest(dir, 'sea', opt), star = solveBest(dir, 'star', opt); if (starry(sea) && (!star || sea.turn <= star.turn)) star = sea; if (star && (!sea || star.turn < sea.turn)) sea = star; // a 3-star run also reaches the sea
  // a level with a guided opening (MAP.opening) is first played from the end of that opening, so it must be 3-starred from there too
  let guided = null; if (M.opening && M.opening.length) { guided = solveBest(dir, 'star', {...opt, from:M.opening}); if (!guided) { const s = solveBest(dir, 'sea', {...opt, from:M.opening}); if (starry(s)) guided = s } }
  const cheap = cheapest(dir), turnStar = (M.stars || []).find(s => s.type === 'byTurn');
  return {n, id:M.id, label:M.label, size:M.types[0].length + '×' + M.types.length, sea, star, guided, cheap, opening:!!M.opening, noChoice:starry(cheap), byTurn:turnStar ? turnStar.n : null, sec:Math.round((Date.now() - t0) / 1000)} }

// ---------- the report
const show = a => a.map(x => x[0] === 'c' ? '|' : x[0] + x[1] + ',' + x[2]).join(' ');
function goal(r) { if (r.n <= 3 || r.byTurn == null || !r.star) return null; const best = Math.max(r.star.turn, r.guided ? r.guided.turn : 0); return best + (r.n <= 6 ? 2 : 1) }
function flags(r) { const f = [], ch = Math.floor((r.n - 1) / 6), budget = r.n === LEVELS ? FINALE : BUDGET[ch];
  if (!r.star) f.push('NO 3-STAR SOLUTION'); if (r.opening && !r.guided) f.push('NO 3-STAR SOLUTION AFTER THE GUIDED OPENING');
  if (r.noChoice) f.push('no choice: the cheapest route earns every star'); if (r.star && r.star.turn > budget) f.push(`over budget: ${r.star.turn} turns, chapter budget ${budget}`);
  const g = goal(r); if (g != null && g !== r.byTurn) f.push(`turn goal: saved ${r.byTurn}, solver says ${g}`); if (r.n <= 3 && r.byTurn != null && r.star && r.star.turn > r.byTurn) f.push(`turn goal ${r.byTurn} can't be met`);
  return f }
function report(rows, verbose) { const out = ['| Level | Size | Sea | 3 stars | By turn | Cheapest route | Flags |', '|---|---|---|---|---|---|---|'];
  for (const r of rows) { const c = r.cheap, miss = c ? c.stars.filter(s => !s.ok && s.type !== 'byTurn').map(s => s.type).join(', ') : '';
    out.push(`| ${r.label.replace('Level ', '')} | ${r.size} | ${r.sea ? r.sea.turn : '-'} | ${r.star ? r.star.turn : 'none'}${r.guided && r.star && r.guided.turn !== r.star.turn ? ` (${r.guided.turn} after the opening)` : ''} | ${goal(r) ?? r.byTurn ?? '-'} | ${c ? `turn ${c.turn}, misses ${miss || 'nothing'}` : 'stuck'} | ${flags(r).join('; ') || '-'} |`);
    if (verbose) { if (r.sea) out.push('    sea:   ' + show(r.sea.acts)); const s = r.guided || r.star; if (s) out.push('    stars: ' + show(s.acts)) } }
  return out.join('\n') }
// --write: By turn N into each level's page, and the 3-star solutions into solutions.js (the hint button reads it)
function write(rows) { const file = path.join(ROOT, 'solutions.js'); let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8').match(/window\.SOLUTIONS = (\{[\s\S]*\});/)[1]) } catch (_) {}
  for (const r of rows) { const s = r.guided || r.star; if (s) all[r.id] = {turn:s.turn, steps:s.acts}; const g = goal(r); if (g == null) continue;
    const p = path.join(ROOT, 'level', String(r.n), 'index.html'), html = fs.readFileSync(p, 'utf8'), to = html.replace(/\{type: "byTurn", n: \d+\}/, `{type: "byTurn", n: ${g}}`); if (to !== html) { fs.writeFileSync(p, to); r.byTurn = g } }
  const ids = Object.keys(all).sort((a, b) => +a.split('-')[1] - +b.split('-')[1]);
  fs.writeFileSync(file, '// Each campaign level\'s 3-star solution, for the hint button (LOU-291). Written by `node tools/solve.mjs --write`: don\'t edit by hand.\n// steps: ["m", x, y] flow to a tile · ["g", x, y] grow one paid step there · ["gr", x, y] free grass · ["c"] Next water cycle\nwindow.SOLUTIONS = {\n'
    + ids.map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(all[id])}`).join(',\n') + '\n};\n') }

// ---------- command line
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const args = process.argv.slice(2), flag = f => args.includes(f), val = f => { const i = args.indexOf(f); return i < 0 ? null : args[i + 1] };
  if (flag('--one')) { process.stdout.write(JSON.stringify(study(+val('--one')))) } // one level, as JSON, for the parent process
  else { const nums = args.filter(a => /^\d+$/.test(a) && args[args.indexOf(a) - 1] !== '--jobs').map(Number), levels = nums.length ? nums : Array.from({length:LEVELS}, (_, i) => i + 1);
    const jobs = Math.max(1, +(val('--jobs') || Math.min(6, os.cpus().length - 1))), rows = [], queue = [...levels];
    const one = n => new Promise(done => { let out = '', err = ''; const p = spawn(process.execPath, ['--max-old-space-size=3000', fileURLToPath(import.meta.url), '--one', String(n)]);
      p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d); p.on('close', () => { try { rows.push(JSON.parse(out)) } catch (_) { rows.push({n, label:'Level ' + n, size:'?', error:err.slice(-300) || 'no result'}) } process.stderr.write(`level ${n} done\n`); done() }) });
    const worker = async () => { while (queue.length) await one(queue.shift()) };
    await Promise.all(Array.from({length:Math.min(jobs, levels.length)}, worker)); rows.sort((a, b) => a.n - b.n);
    const failed = rows.filter(r => r.error); for (const r of failed) console.error(`Level ${r.n} could not be solved: ${r.error}`); const good = rows.filter(r => !r.error);
    if (flag('--write')) write(good);
    console.log(report(good, flag('-v')));
    const none = good.filter(r => !r.star || (r.opening && !r.guided));
    if (none.length) console.error('FAILED: no 3-star solution for ' + none.map(r => 'Level ' + r.n).join(', '));
    if (failed.length) console.error('FAILED: the solver stopped with an error on ' + failed.map(r => 'Level ' + r.n).join(', '));
    if (none.length || failed.length) process.exit(1) } }
