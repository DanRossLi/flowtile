# Flow Tile

A small, mobile-first, turn-based river puzzle in the style of Polytopia. Pick a source, earn water each turn, and build your river tile by tile down to the sea. It's a spin-off of Flow, used to prove out ideas on a phone before they go back into the main game.

Plain HTML/JS, no build step, no framework.

## How to play

- **Water** is what you have, in gallons. **Flow** is how many gallons you get each turn.
- Pick a source. On Spring Hill the left one has a flow of **2 gal** a turn, the right one **3 gal**.
- Tap a glowing tile to extend the river. The number is its cost in gallons. Out of water? **End turn** and your flow refills it.
- Every map is **flat** (Nov 9 rules): no slopes, waterfalls or speed. Most tiles cost **1 gal**. The river only grows from its end and never re-enters a tile.
- **Sand** is **free** to enter and blooms the land around it (on storage maps, it turns the bare ground next to it into grass), but it cuts your **flow by 1** for the rest of the run.
- **Rock** costs **2 gal** to cross, and tiles touching it don't turn green. **Mountains** block the river. **Springs** are free and add **+1 flow**.
- **Lakes** cost **2 gal a tile** and fill all at once. A full lake lets the river leave from any side, and on storage maps you can plant up to **2 tiles** from it (reach).
- **Bare ground** (maps 4 onward): you can **store 3 gal** at the start; water over that spills when you end the turn. Plant **grass** on bare ground next to the river (1 gal, +1 storage), then **trees** (1 gal, +1 more). A river running over grass or trees washes them away, and you lose that storage.
- **Groves:** 3+ **trees in a row** (planted or wild forest) beside the river give **+1 flow**, +1 per extra tree. **Pollinators:** each **meadow** touching a grove adds **+1 flow** more. Trees cost the normal price to cross; they're for storage and groves, not defense.
- **Tributaries** (map 6): tap a second source to start a tributary. It has no water, flow or storage of its own: you build it with the main river's water, and it earns nothing until it connects. Once it reaches the main river (or the main river reaches it), its source and anything it picked up join your flow. Tap a river, or its pill at the top, to choose which one you build.
- **Ideas** (Nov 10), each switched on by a map: the **water cycle** (spilled water rises as a cloud and rains back 2 turns later) and a **weather forecast** (a rainstorm gives +2 gal, a drought cuts flow by 1 for 2 turns), shown in the Sky chip; **living spread** (grass beside the river greens a bare bank tile next to it at the end of a turn, always when a meadow is next to it, and every 3rd turn a bird carries a seed from each grove); the **floodplain** (at full storage the spill floods a bare bank tile and greens it); **harvests** (collect a rain pool beside the river for +2 gal, snowmelt gives +3 gal the first time you reach a mountain's water side, moss turns rock beside the river into soil for 1 gal); **wildlife** (beavers dam a pond for +1 flow when your river runs through their colony with trees next to it; deer graze a grass tile with no trees beside it every 3rd turn; fish come to long rivers); **nature pushes back** (lightning on a forecast turn sets dry trees alight and fire spreads from tiles with no water beside them; salt stops land next to the sea from greening).
- **Wind** (map 10): rain runs off the windward side of each mountain into a pool. Run the river through or beside it for **+1 flow**. The far side is in rain shadow: nothing grows there.
- Reach the sea. Stars for arriving, for the bloom goal (on Spring Hill, **6**+ tiles), and for arriving by the turn goal (turn **6** on Spring Hill).

Controls: tap a tile to open a card showing what it does and what it costs, then choose an action (tap the same tile again to do the first one; a tile with only one option and nothing to warn about acts on the first tap), **Undo** steps back one action, **Restart** resets the map, **End turn** (or Space on a keyboard) adds your flow to your water; its badge shows what you will get, and warns when some would spill. The board shows the whole island until you pick a source, then zooms in on your stream and follows it: drag to look around, pinch or scroll to zoom, and the corner button shows the whole map.

## Maps

| Map | URL | Teaches |
|---|---|---|
| Spring Hill | https://danrossli.github.io/flowtile/ | The original test map, now flat |
| 1 · Flat | https://danrossli.github.io/flowtile/1/ | Running a stream: 1 gal a tile, left to right |
| 1a · Sand | https://danrossli.github.io/flowtile/1a/ | Sand: free, blooms the tiles around it, but costs 1 flow |
| 3 · Lake | https://danrossli.github.io/flowtile/3/ | Lakes: 2 gal a tile, filled all at once; carry on from any side |
| 4 · Grass | https://danrossli.github.io/flowtile/4/ | Storage: plant grass by the stream to store enough for a lake |
| 4a · Trees | https://danrossli.github.io/flowtile/4a/ | Trees: grow grass into trees when there's no room for more grass |
| 5 · Desert | https://danrossli.github.io/flowtile/5/ | Sand bands and bare corridors: every sand tile cuts flow by 1, so go oasis to oasis |
| 6 · Tributary | https://danrossli.github.io/flowtile/6/ | Build a tributary with the main river's water; once connected, its source adds to your flow |
| 7 · Rock | https://danrossli.github.io/flowtile/7/ | Rock costs 2 gal, but it's a shortcut through the mountains |
| 8 · Grove | https://danrossli.github.io/flowtile/8/ | Plant 3 trees in a row along the river for +1 flow, to save up for the lake |
| 9 · Pollinators | https://danrossli.github.io/flowtile/9/ | Grow a grove beside meadows: each meadow touching it adds +1 flow |
| 10 · Mountains | https://danrossli.github.io/flowtile/10/ | Wind: runoff on the windward side gives flow, the far side stays dry |
| 11 · Forest | https://danrossli.github.io/flowtile/11/ | Cut through the forest where the trees left beside you become groves |
| 12 · Rain | https://danrossli.github.io/flowtile/12/ | Spill becomes a cloud that rains back; a rainstorm and a drought are forecast |
| 13 · Spread | https://danrossli.github.io/flowtile/13/ | Grass spreads along the bank; plant next to meadows to make it certain |
| 14 · Floodplain | https://danrossli.github.io/flowtile/14/ | Spill floods the bank green |
| 15 · Harvest | https://danrossli.github.io/flowtile/15/ | Rain pools, snowmelt and moss: make room in storage before you collect |
| 16 · Wildlife | https://danrossli.github.io/flowtile/16/ | Route through a beaver colony and grow trees by it for a pond (+1 flow); trees keep deer off your grass |
| 17 · Wildfire | https://danrossli.github.io/flowtile/17/ | Lightning sets dry forest alight; keep your trees away from it |
| Perfection island | https://danrossli.github.io/flowtile/perfection/ | Every rule on: the best score in 20 turns |
| Daily island | https://danrossli.github.io/flowtile/daily/ | A new generated island every day, the same for everyone; share your score |
| Test · Big 18×18 | https://danrossli.github.io/flowtile/big/ | Sandbox: every tile type on one big slope, with storage |

Every map shares `play.js` (rules, drawing, HUD) and `play.css` (layout). Each map's `index.html` (the root one is Spring Hill) only sets `window.MAP`: the layout, elevations, goals and rule tweaks. To add a map, copy one of the numbered folders, edit its `window.MAP`, and add the folder to `LOCAL` in `sw.js`.

## Modes

- **Islands** (https://danrossli.github.io/flowtile/world/): the campaign. Islands are grouped by biome, show your best stars, and each one opens when the one before it has a star.
- **Perfection** (`mode: "perfection"`): the best score in 20 turns. You get 1 point per river tile, green tile and fish, 3 per grove, and 2 per full lake. Reaching the sea ends the run with +5 and +1 per turn left. Your best score is saved.
- **Daily island** (`/daily/`): generated from the date, so everyone gets the same island. Add `?d=YYYY-MM-DD` to play another day's island. **Share score** copies your result.
- **Hard mode**: tick it in the **?** menu to get 3 undos per map.
- **Map codes**: **?** → **Copy map code** copies a link that plays the map at `/custom/#<code>`.

## Install on your phone

Open https://danrossli.github.io/flowtile/ and add it to your home screen: **Share → Add to Home Screen** in Safari on iPhone, or **⋮ → Add to Home screen / Install app** in Chrome on Android. It opens full-screen, works offline after the first visit, and remembers a run in progress.

To ship changes to installed copies, bump `VERSION` in `sw.js` whenever you change `play.js`, `play.css` or the icons. Pages are fetched fresh when online, but those files are served from the cache.

## Run it

Open `index.html` in a browser. To test on a phone over your local network, serve the folder:

```bash
npx serve .
```

Or use any static file server, such as `python -m http.server`.
