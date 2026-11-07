# Flow Tile

A small, mobile-first, turn-based river puzzle in the style of Polytopia. Pick a source, earn water each turn, and build your river tile by tile down to the sea. It's a spin-off of Flow, used to prove out ideas on a phone before they go back into the main game.

Plain HTML/JS, no build step, no framework.

## How to play

- **Water** is what you have, in gallons. **Flow** is how many gallons you get each turn.
- Pick a source. The left one has a flow of **2 gal** a turn, the right one **3 gal**.
- Tap a glowing tile to extend the river. The number is its cost in gallons. Out of water? **End turn** and your flow refills it.
- Water only runs **downhill (1)** or **flat (2)**, never uphill.
- **Sand** costs +1 but blooms every land tile around it.
- **Rock** can be crossed, but tiles touching it only bloom when you have **speed**. A waterfall (a 2-level drop) gives speed; flat tiles drain it.
- **Boulders** block the river. **Springs** are free and add **+1 flow**.
- **Lakes** (blue rings) cost 2 gal per tile to fill. Once full the water rises over the rim, adds +1 flow and blooms the shore.
- Reach the sea. Stars for arriving, for blooming **10**+ tiles, and for arriving by turn **6**.

Controls: tap tiles to build, **Undo** steps back one action, **Restart** resets the map, **End turn** (or Space on a keyboard) adds your flow to your water.

## Maps

| Map | URL | Teaches |
|---|---|---|
| Spring Hill | https://danrossli.github.io/flowtile/ | The full v0.1 rules |
| 1 · Flat | https://danrossli.github.io/flowtile/1/ | Running a stream: 1 gal a tile, left to right |
| 1a · Sand | https://danrossli.github.io/flowtile/1a/ | Sand: +1 gal, blooms the tiles around it |
| 2 · Slope | https://danrossli.github.io/flowtile/2/ | Downhill: +1 speed per level, flat tiles take 1 away |
| 3 · Lake | https://danrossli.github.io/flowtile/3/ | Lakes: save up to fill, +1 flow, blooms the shore |

Every map shares `play.js` (rules, drawing, HUD) and `play.css` (layout). Each map's `index.html` (the root one is Spring Hill) only sets `window.MAP`: the layout, elevations, goals and rule tweaks. To add a map, copy one of the numbered folders, edit its `window.MAP`, and add the folder to `LOCAL` in `sw.js`.

## Install on your phone

Open https://danrossli.github.io/flowtile/ and add it to your home screen: **Share → Add to Home Screen** in Safari on iPhone, or **⋮ → Add to Home screen / Install app** in Chrome on Android. It opens full-screen, works offline after the first visit, and remembers a run in progress.

To ship changes to installed copies, bump `VERSION` in `sw.js` whenever you change `play.js`, `play.css` or the icons. Pages are fetched fresh when online, but those files are served from the cache.

## Run it

Open `index.html` in a browser. To test on a phone over your local network, serve the folder:

```bash
npx serve .
```

Or use any static file server, such as `python -m http.server`.
