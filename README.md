# Flow Tile

A small, mobile-first, turn-based river puzzle in the style of Polytopia. Pick a source, earn water each turn, and build your river tile by tile down to the sea. It's a spin-off of Flow, used to prove out ideas on a phone before they go back into the main game.

Everything lives in a single `index.html`: plain HTML/JS, no build step, no framework.

## How to play

- Pick a source. The left one makes **2 water** a turn, the right one **3**.
- Tap a glowing tile to extend the river. The number is its water cost. Out of water? **End turn** to collect more.
- Water only runs **downhill (1)** or **flat (2)**, never uphill.
- **Sand** costs +1 but blooms every land tile around it.
- **Rock** can be crossed, but tiles touching it only bloom when you have **speed**. A waterfall (a 2-level drop) gives speed; flat tiles drain it.
- **Boulders** block the river. **Springs** are free and add +1 water a turn.
- **Lakes** (blue rings) cost 2 water per tile to fill. Once full the water rises over the rim, adds +1 a turn and blooms the shore.
- Reach the sea. Stars for arriving, for blooming **10**+ tiles, and for arriving by turn **6**.

Controls: tap tiles to build, **Undo** steps back one action, **Restart** resets the map, **End turn** (or Space on a keyboard) collects income.

## Install on your phone

Open https://danrossli.github.io/flowtile/ and add it to your home screen: **Share → Add to Home Screen** in Safari on iPhone, or **⋮ → Add to Home screen / Install app** in Chrome on Android. It opens full-screen, works offline after the first visit, and remembers a run in progress.

To ship changes to installed copies, bump `VERSION` in `sw.js` when you change cached files.

## Run it

Open `index.html` in a browser. To test on a phone over your local network, serve the folder:

```bash
npx serve .
```

Or use any static file server, such as `python -m http.server`.
