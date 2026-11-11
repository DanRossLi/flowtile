# Flow Tile

A small, mobile-first, turn-based river puzzle in the style of Polytopia. Pick a source, earn water each turn, and build your river tile by tile down to the sea. It's a spin-off of Flow, used to prove out ideas on a phone before they go back into the main game.

Plain HTML/JS, no build step, no framework.

## How to play

- **Water** is what you have, in gallons. **Flow** is how many gallons you get each turn.
- Pick a source. On Spring Hill the left one has a flow of **2 gal** a turn, the right one **3 gal**.
- Tap your stream's **end** to select it (it gets a white ring), then tap a glowing tile to extend the river there. The number is its cost in gallons of **water**. Out of water? Tap **Next Water Cycle** and your **flow** refills it.
- Every map is **flat** (Nov 9 rules): no slopes, waterfalls or speed. Most tiles cost **1 gal**. The river only grows from its end and never re-enters a tile.
- **Sand** is **free** to enter and blooms the land around it (on storage maps, it turns the bare ground next to it into grass), but it cuts your **flow by 1** for the rest of the run.
- **Rock** costs **2 gal** to cross, and tiles touching it don't turn green. **Mountains** block the river. **Springs** are free and add **+1 flow**.
- **Lakes** cost **2 gal a tile** and fill all at once. A full lake lets the river leave from any side, and on storage maps you can plant up to **2 tiles** from it (reach).
- **Bare ground** (maps 4 onward): you can **store 3 gal** at the start; water over that spills at the next water cycle. Plant **grass** on bare ground next to the river (1 gal, +1 storage), grow it into a **meadow** (1 gal, +1 more), then **trees** (1 gal, +1 more): one tile stores up to 3 extra gal. A river running over grass or trees washes them away, and you lose that storage.
- **Groves:** 3+ **trees in a row** (planted or wild forest) beside the river give **+1 flow**, +1 per extra tree. **Pollinators:** each **meadow** (wild or grown) touching a grove adds **+1 flow** more. Trees cost the normal price to cross; they're for storage and groves, not defense.
- **Tributaries** (map 6): tap a second source to start a tributary. It has no water, flow or storage of its own: you build it with the main river's water, and it earns nothing until it connects. Once it reaches the main river (or the main river reaches it), its source and anything it picked up join your flow. Tap a river, or its pill at the top, to choose which one you build.
- **Ideas** (Nov 10), each switched on by a map: the **water cycle** (spilled water rises as a cloud and rains back 2 turns later) and a **weather forecast** (a rainstorm gives +2 gal, a drought cuts flow by 1 for 2 turns), shown in the Sky chip; **living spread** (grass beside the river greens a bare bank tile next to it at the next water cycle, always when a meadow is next to it, and every 3rd turn a bird carries a seed from each grove); the **floodplain** (at full storage the spill floods a bare bank tile and greens it); **harvests** (collect a rain pool beside the river for +2 gal, snowmelt gives +3 gal the first time you reach a mountain's water side, moss turns rock beside the river into soil for 1 gal); **wildlife** (beavers dam a pond for +1 flow when your river runs through their colony with trees next to it; deer graze a grass tile with no trees beside it every 3rd turn; fish come to long rivers); **nature pushes back** (lightning on a forecast turn sets dry trees alight and fire spreads from tiles with no water beside them; salt stops land next to the sea from greening).
- **Wind** (map 10): rain runs off the windward side of each mountain into a pool. Run the river through or beside it for **+1 flow**. The far side is in rain shadow: nothing grows there.
- Reach the sea. Stars for arriving, for the bloom goal (on Spring Hill, **6**+ tiles), and for arriving by the turn goal (turn **6** on Spring Hill).

Every map opens on a **goal card**: what the map teaches and its three star goals. It shows again after **Restart**, and the map's lesson is at the top of the help (?).

Controls: tap your stream's **end** to select it, then tap a glowing tile to move the stream there; the end stays selected so you can keep going, and tapping it again (or empty space) lets go. Tapping any other tile opens a card showing what it does and what it costs, then choose an action (tap the same tile again to do the first one; a tile with only one option and nothing to warn about acts on the first tap). Tapping land never moves the stream. **Undo** steps back one action, **Restart** resets the map, **Next Water Cycle** (or Space on a keyboard) adds your **flow** to your **water**; its badge shows what you will get, and warns when some would spill. Water is blue and flow is teal everywhere. A finished run isn't restored: the next visit starts the map fresh. The board shows the whole island until you pick a source, then zooms in on your stream and follows it: drag to look around, pinch or scroll to zoom, and the corner button shows the whole map.

## Tutorial

New players start at https://danrossli.github.io/flowtile/tutorial/: twelve short islands, one new rule each, each opening on its goal card and ending with **Next lesson**. The index shows a tick for each finished step and a **Continue** button. Each step teaches through objectives on the map, one at a time (Skip lesson moves on). The home page marks the tutorial "New here?" for a first-time visitor.

| Step | URL | Teaches |
|---|---|---|
| 1 · First stream | https://danrossli.github.io/flowtile/tutorial/1/ | Move your stream (tap its end, then a tile), water vs flow, Next Water Cycle |
| 2 · Grass | https://danrossli.github.io/flowtile/tutorial/2/ | Plant grass to store more water; storage and spill |
| 3 · Meadow | https://danrossli.github.io/flowtile/tutorial/3/ | Grow grass into a meadow for more storage on the same tile |
| 4 · Trees | https://danrossli.github.io/flowtile/tutorial/4/ | Grow a meadow into trees: one tile stores 3 extra gal |
| 5 · Groves | https://danrossli.github.io/flowtile/tutorial/5/ | 3 trees in a row beside the river: +1 flow |
| 6 · Pollinators | https://danrossli.github.io/flowtile/tutorial/6/ | A meadow touching a grove: +1 flow |
| 7 · Sand | https://danrossli.github.io/flowtile/tutorial/7/ | Free to cross, −1 flow, greens the land around it |
| 8 · Oases | https://danrossli.github.io/flowtile/tutorial/8/ | Plan a route from oasis to oasis that keeps your flow |
| 9 · Rock | https://danrossli.github.io/flowtile/tutorial/9/ | Rock costs 2 gal; the way around the mountains costs more |
| 10 · Lakes | https://danrossli.github.io/flowtile/tutorial/10/ | Fill all at once for 2 gal a tile; plant up to 2 tiles out |
| 11 · Tributaries | https://danrossli.github.io/flowtile/tutorial/11/ | Build a tributary; it earns only once it connects |
| 12 · Mountains | https://danrossli.github.io/flowtile/tutorial/12/ | Runoff on the windward side, rain shadow behind |

## Landscape mode

The river flows on its own and you shape the land. Each water cycle it moves as many tiles as its flow, always to the cheapest next tile (the sea first, then sand and springs, then ground, then rock), with ties going toward the sea. Build first: while you build, the river waits, and a dashed line shows its whole run, with a number where each water cycle ends and a red ✕ where it would get stuck. Tap land to change it, paid in water. Then tap **Flow** and it runs on its own until it reaches the sea or gets stuck; **Stop** pauses it. The list is at https://danrossli.github.io/flowtile/landscape/.

| Level | URL | Goal |
|---|---|---|
| 1 · Two springs | https://danrossli.github.io/flowtile/landscape/1/ | Bend the river through both springs |
| 2 · Ten green | https://danrossli.github.io/flowtile/landscape/2/ | Green 10 tiles before it reaches the sea |
| 3 · Keep off the sand | https://danrossli.github.io/flowtile/landscape/3/ | Reach the sea without crossing sand |
| Sandbox | https://danrossli.github.io/flowtile/landscape/sandbox/ | Shape an island, then copy it as a River mode map |

## River mode

Dan's original maps in their original order, with no guidance: you choose where the river goes and what to grow. The list with your stars is at https://danrossli.github.io/flowtile/river/, and each map's win card goes on with **Next map**.

| Map | URL |
|---|---|
| 1 · Flat | https://danrossli.github.io/flowtile/1/ |
| 1a · Sand | https://danrossli.github.io/flowtile/1a/ |
| 3 · Lake | https://danrossli.github.io/flowtile/3/ |
| 4 · Grass | https://danrossli.github.io/flowtile/4/ |
| 4a · Trees | https://danrossli.github.io/flowtile/4a/ |
| 5 · Desert | https://danrossli.github.io/flowtile/5/ |
| 6 · Tributary | https://danrossli.github.io/flowtile/6/ |
| 7 · Rock | https://danrossli.github.io/flowtile/7/ |
| 8 · Grove | https://danrossli.github.io/flowtile/8/ |
| 9 · Pollinators | https://danrossli.github.io/flowtile/9/ |
| 10 · Mountains | https://danrossli.github.io/flowtile/10/ |

Map 2 · Slope is retired (`/2/` goes to Map 3). Maps 11–19 below carry on from Map 10.

## More maps

| Map | URL | Teaches |
|---|---|---|
| Spring Hill | https://danrossli.github.io/flowtile/spring-hill/ | The original test map, now flat |
| 11 · Forest | https://danrossli.github.io/flowtile/11/ | Cut through the forest where the trees left beside you become groves |
| 12 · Rain | https://danrossli.github.io/flowtile/12/ | Spill becomes a cloud that rains back; a rainstorm and a drought are forecast |
| 13 · Spread | https://danrossli.github.io/flowtile/13/ | Grass spreads along the bank; plant next to meadows to make it certain |
| 14 · Floodplain | https://danrossli.github.io/flowtile/14/ | Spill floods the bank green |
| 15 · Harvest | https://danrossli.github.io/flowtile/15/ | Rain pools, snowmelt and moss: make room in storage before you collect |
| 16 · Wildlife | https://danrossli.github.io/flowtile/16/ | Route through a beaver colony and grow trees by it for a pond (+1 flow); trees keep deer off your grass |
| 17 · Wildfire | https://danrossli.github.io/flowtile/17/ | Lightning sets dry forest alight; keep your trees away from it |
| 18 · Fertile ground | https://danrossli.github.io/flowtile/18/ | Rich soil: green on it stores 1 more, its trees count double toward a grove |
| 19 · Marsh | https://danrossli.github.io/flowtile/19/ | Run beside a marsh: it stores 2; green on both sides adds +1 flow |
| Perfection island | https://danrossli.github.io/flowtile/perfection/ | Every rule on: the best score in 20 turns |
| Daily island | https://danrossli.github.io/flowtile/daily/ | A new generated island every day, the same for everyone; share your score |
| Test · Big 18×18 | https://danrossli.github.io/flowtile/big/ | Sandbox: every tile type on one big slope, with storage |

Every map shares `play.js` (rules, drawing, HUD) and `play.css` (layout). Each map's `index.html` (tutorial steps live in `tutorial/N/`; the site root is the home page) only sets `window.MAP`: the layout, elevations, goals and rule tweaks. To add a map, copy one of the numbered folders, edit its `window.MAP`, and add the folder to `LOCAL` in `sw.js`.

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
