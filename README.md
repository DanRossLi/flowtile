# Flow Tile

A small, mobile-first, turn-based river puzzle in the style of Polytopia. Pick a source, earn water each turn, and build your river tile by tile down to the sea. It's a spin-off of Flow, used to prove out ideas on a phone before they go back into the main game.

Plain HTML/JS, no build step, no framework.

## How to play

- **Water** is what you have, in gallons. **Flow** is how many gallons you get each turn.
- Pick a source. On Spring Hill the left one has a flow of **2 gal** a turn, the right one **3 gal**.
- Tap your river's **end** to select it (it gets a white ring), then tap a ring to flow there. The number is its cost in gallons of **water**. Out of water? Tap **Next water cycle** and your **flow** refills it.
- Every map is **flat** (Nov 9 rules): no slopes, waterfalls or speed. Most tiles cost **1 gal**. The river only grows from its end and never re-enters a tile.
- **Sand** is **free** to enter and blooms the land around it (on storage maps, it turns the bare ground next to it into grass), but it cuts your **flow by 1** for the rest of the run.
- **Rock** costs **2 gal** to cross, and tiles touching it don't turn green. **Mountains** block the river. **Springs** are free and add **+1 flow**.
- **Lakes** cost **2 gal a tile** and fill all at once. A full lake lets the river leave from any side, and on storage maps you can plant up to **2 tiles** from it (reach).
- **Bare ground** (maps 4 onward): you can **store 5 gal** at the start; water over that spills at the next water cycle. **Grass** on bare ground next to the river is free and stores nothing. Grow it into a **meadow** (1 gal): beside the river it stores **+1 gal for each tree touching it**. Grow a meadow into **trees** (1 gal): no storage, but they make groves. A river running over green washes it away (LOU-279).
- **Groves:** 3+ **touching trees** (on any hex side; planted or wild forest) beside the river give **+1 flow for every 3 trees** (fertile trees count double). Meadows add no flow (pollinators were removed in LOU-279). Trees cost the normal price to cross; they're for storage and groves, not defense.
- **Tributaries** (map 6): tap a second source to start a tributary. It has no water, flow or storage of its own: you build it with the main river's water, and it earns nothing until it connects. Once it reaches the main river (or the main river reaches it), its source and anything it picked up join your flow. Tap a river, or its pill at the top, to choose which one you build.
- **Ideas** (Nov 10), each switched on by a map: the **water cycle** (spilled water rises as a cloud and rains back 2 turns later) and a **weather forecast** (a rainstorm gives +2 gal, a drought cuts flow by 1 for 2 turns), shown in the Sky chip; **living spread** (grass beside the river greens a bare bank tile next to it at the next water cycle, always when a meadow is next to it, and every 3rd turn a bird carries a seed from each grove); the **floodplain** (at full storage the spill floods a bare bank tile and greens it); **harvests** (collect a rain pool beside the river for +2 gal, snowmelt gives +3 gal the first time you reach a mountain's water side, moss turns rock beside the river into soil for 1 gal); **wildlife** (beavers dam a pond for +1 flow when your river runs through their colony with trees next to it; deer graze a grass tile with no trees beside it every 3rd turn; fish come to long rivers); **nature pushes back** (lightning on a forecast turn sets dry trees alight and fire spreads from tiles with no water beside them; salt stops land next to the sea from greening).
- **Wind** (map 10): rain runs off the windward side of each mountain into a pool. Run the river through or beside it for **+1 flow**. The far side is in rain shadow: nothing grows there.
- Reach the sea. Stars for arriving, for the bloom goal (on Spring Hill, **6**+ tiles), and for arriving by the turn goal (turn **6** on Spring Hill).

Every map opens on a **goal card**: what the map teaches and its three star goals. It shows again after **Restart**, and the map's lesson is at the top of the help (?).

Controls: tap your river's **end** to select it. Every tile it can flow to gets a **ring** with its cost above it (grey if you can't afford it), and a river panel takes the bottom bar's place; tap a ring to flow there, and the rings follow the new end. Tap the end again, the panel's chevron or empty space to let go. Tapping any other tile opens the **tile panel**: what the tile is and does right now, with every option as its own round button along the bottom (label, cost and effect; the main choice is mint-teal, unaffordable ones are grey). Tapping land never moves the river by itself; **Flow here** is one of the buttons when the tile is next to the river's end. The bottom bar is **☰ Menu**, a big **Next water cycle** pill and **Undo**. Undo steps back one action; Restart, How to play (a guide to the tiles on the map), the whole-island view, Hard mode and Home are in the menu. **Next water cycle** (or Space on a keyboard) adds your **flow** to your **water**; its badge shows what you will get, and warns when some would spill. Water is blue and flow is teal everywhere. A finished run isn't restored: the next visit starts the map fresh. The board shows the whole island until you pick a source, then zooms in on your river and follows it: drag to look around, pinch or scroll to zoom, and the corner button shows the whole map.

## Look

Since Nov 12 the game uses the painterly look (LOU-280): an isometric island of hex tiles painted as one soft surface, with tree kinds, reeds, wildlife and white glass panels (M PLUS Rounded 1c). **The river is as wide as the flow it carries**, so you can see where springs, runoff, groves and tributaries join and where sand thins it. Every tile has six neighbours. The top bar's **water jar** shows the water you have (blue), your storage (the jar and its notches) and next cycle's flow (teal); when that flow won't fit, it pours over the lip and the text says how much will spill.

## Single player

A 24-level campaign in four chapters of six (LOU-290). Levels 1 to 3 are short guided levels that teach the game (there is no separate tutorial). A new mechanic appears only on Levels 7, 9, 13, 15, 19 and 21, each opening with two or three guided steps. Reaching the sea opens the next level; the other two stars are for replaying. Every level is hand-built and checked with the level solver, which also sets each "By turn N".

| Level | Size | About | Stars 2 and 3 |
|---|---|---|---|
| **Chapter 1 · Shores** | | | |
| 1 · First river | 8×5 | Water, flow and Next water cycle | Use Next water cycle · Arrive by turn 3 |
| 2 · Read the land | 9×6 | Rock, sand, springs and mountain pools | Reach the spring · Finish with flow 4 or more |
| 3 · Grow the land | 9×6 | Storage, meadows, trees and groves | Grow a grove · Finish with storage 6 or more |
| 4 · Sandbar | 10×6 | A shortcut that drinks your flow | Finish with flow 3 or more · Arrive by turn 5 |
| 5 · Two Peaks | 11×7 | One pass, two mountain pools | Reach both mountain pools · Arrive by turn 6 |
| 6 · Green Shore | 11×7 | Route and grow together | Grow a grove · Never spill water |
| **Chapter 2 · Inland** | | | |
| 7 · Still Water | 11×7 | New: lakes | Fill the lake · Arrive by turn 6 |
| 8 · Lake Country | 12×7 | Wait for a lake without spilling | Never spill water · Arrive by turn 6 |
| 9 · Old Wood | 12×8 | New: wild forest | Make a grove with old forest · Wash away no forest |
| 10 · The Clearing | 12×8 | Forest in the way of the short route | Finish with flow 5 or more · Arrive by turn 5 |
| 11 · Lakeside Wood | 13×8 | Lakes and forest together | Fill the lake · Grow 2 groves |
| 12 · The Heartland | 13×8 | Everything from the inland, at once | Finish with flow 6 or more · Arrive by turn 5 |
| **Chapter 3 · High country** | | | |
| 13 · Rich Soil | 13×8 | New: fertile ground | Grow a grove on fertile ground · Finish with storage 8 or more |
| 14 · Black Earth | 14×8 | Fertile ground off the direct route | Finish with flow 6 or more · Arrive by turn 6 |
| 15 · Wetland | 14×9 | New: marsh | Get a marsh's +1 flow · Drain no marsh |
| 16 · Reed Beds | 14×9 | A wall of marsh: hug it or cut through | Finish with storage 12 or more · Arrive by turn 6 |
| 17 · Highland Lakes | 15×9 | Fertile ground, marsh and lakes | Grow 2 groves · Never spill water |
| 18 · High Meadow | 15×9 | The high country, all together | Finish with flow 7 or more · Arrive by turn 7 |
| **Chapter 4 · Far islands** | | | |
| 19 · Under the Hill | 15×9 | New: caves | Use a cave · Arrive by turn 7 |
| 20 · Hollow Ridge | 15×10 | Two cave pairs and three springs | Reach 2 springs · Arrive by turn 7 |
| 21 · Storm Season | 16×10 | New: weather | Never spill water · Arrive by turn 7 |
| 22 · Dry Spell | 16×10 | A drought in the middle of the level | Finish with flow 6 or more · Arrive by turn 7 |
| 23 · Wild Country | 16×10 | Everything so far | Grow 3 groves · Never spill water |
| 24 · The Great Island | 20×12 | The finale | Finish with flow 8 or more · Arrive by turn 9 |

The first campaign's levels with rules the campaign now holds back (tributaries, beavers, alpine trees, rain pools, rechannel, wildfire, floods, salt) are **Extra islands** under All islands: `/extra/fork/`, `/extra/dam-builders/`, `/extra/snowline/`, `/extra/rain-pools/`, `/extra/second-thoughts/`, `/extra/dry-lightning/`, `/extra/high-water/`, `/extra/dunes/`. Its 40×40 finale is a big map at `/big/40/`.

### Level solver and hints

`node tools/solve.mjs` (plain Node, no packages) plays every campaign level with the game's own rules and reports the fewest turns to the sea, the fewest with all three stars, and any weak level. `node tools/solve.mjs --write` also sets each "By turn N" and saves the 3-star solutions to `solutions.js`, which the in-game **Hint** button reads (3 hints per attempt, campaign levels only). Rerun it whenever a level or a rule changes.

## More maps

| Map | URL | Teaches |
|---|---|---|
| Spring Hill | https://danrossli.github.io/flowtile/spring-hill/ | The original test map, now flat |
| Perfection island | https://danrossli.github.io/flowtile/perfection/ | Every rule on: the best score in 20 turns |
| Daily island | https://danrossli.github.io/flowtile/daily/ | A new generated island every day, the same for everyone; share your score |
| Test · Big 18×18 | https://danrossli.github.io/flowtile/big/ | Sandbox: every tile type on one big slope, with storage |
| Big map · 40×40 | https://danrossli.github.io/flowtile/big/40/ | The first campaign's finale, kept as a very long game |

Every map shares `play.js` (rules, drawing, HUD) and `play.css` (layout); the menu pages share `paper.css`. Each map's `index.html` (the site root is the home page) only sets `window.MAP`: the layout, elevations, goals and rule tweaks. To add a map, copy a map folder (such as `spring-hill/`), edit its `window.MAP`, and add the folder to `LOCAL` in `sw.js`.

## Modes

**Map generator:** https://danrossli.github.io/flowtile/generator/ builds a seeded island from your options (size, goal, sources, storage, how much of each terrain, wind and weather), previews it, and plays it on the Custom page or copies it as a map code.

- **All islands** (https://danrossli.github.io/flowtile/world/): every level by chapter, plus Perfection and the Daily island, with your best stars.
- **Perfection** (`mode: "perfection"`): the best score in 20 turns. You get 1 point per river tile, meadow you grow and fish, 3 per grove, and 2 per full lake. Reaching the sea ends the run with +5 and +1 per turn left. Your best score is saved.
- **Daily island** (`/daily/`): generated from the date, so everyone gets the same island. Add `?d=YYYY-MM-DD` to play another day's island. **Share score** copies your result.
- **Hard mode**: turn it on in the **☰** menu to get 3 undos per level.
- **Map codes**: **☰** → **How to play** → **Copy map code** copies a link that plays the map at `/custom/#<code>`.

## Install on your phone

Open https://danrossli.github.io/flowtile/ and add it to your home screen: **Share → Add to Home Screen** in Safari on iPhone, or **⋮ → Add to Home screen / Install app** in Chrome on Android. It opens full-screen, works offline after the first visit, and remembers a run in progress.

To ship changes to installed copies, bump `VERSION` in `sw.js` whenever you change `play.js`, `play.css` or the icons. Pages are fetched fresh when online, but those files are served from the cache.

## Run it

Open `index.html` in a browser. To test on a phone over your local network, serve the folder:

```bash
npx serve .
```

Or use any static file server, such as `python -m http.server`.
