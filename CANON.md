# Flow Tile canon

These are the instructions Dan has given for this project, kept in one place. They are settled. **Don't change, undo or "improve" any of them on your own**: if something here seems wrong, or a task would break it, ask Dan first. Add each new instruction here as Dan gives it, and mark one that a later instruction replaces as superseded instead of deleting it.

## How to work

1. **Source of work:** Linear, workspace *loudega*, initiative **Flow Tile**, project **Initial Prototype**. Read the initiative description first. It holds the game rules and the working rules.
2. **Order:** take the highest-priority unblocked issue, one at a time, strictly in priority order.
3. **Per issue:** follow these steps.
   - Move it to In Progress.
   - Read the issue, its Agent notes and any attached documents.
   - Do the work, commit with the issue ID in the message, and push.
   - Check every "Done when" item.
   - Add the GitHub Pages URL as a link, comment a short summary of what changed, and move the issue to Done.
4. **Pausing between issues:** at first Dan asked to stop and check in before each next issue. Later Dan said "execute overnight" (Nov 10) and then "check linear and do all tickets related to flowtile" (Nov 10). When Dan asks for a batch like that, work through the whole batch without stopping.
5. **Plain HTML/JS, no build step.** No bundlers, no package.json, no SST.
6. **Ask, don't guess.** If anything needs Dan's decision, ask Dan. Examples are making the repo public, gh auth, hosting, or a rule the issue leaves open.
7. **Quick questions first:** when Dan says to ask questions before going to bed, ask them all at once at the start, then work without stopping.
8. **Linear tracking:** make one issue per piece of new work.

## Hosting

- **Repo:** GitHub repo `DanRossLi/flowtile`, public.
- **Site:** GitHub Pages at https://danrossli.github.io/flowtile/. Each map lives in its own folder, for example `/1/`.
- **No SST:** Dan asked for SST once. We chose GitHub Pages instead, because that's what the issue says.
- **Cache:** bump `VERSION` in `sw.js` whenever cached files change.

## Words

- **Flow** is income, the water you get each turn.
- **Water** is what you have right now.
- **Gallons (gal)** measure water.
- **Storage** is how much water you can hold.
- **Mountain:** call them mountains, not boulders, in the text.

## Game rules Dan has set

- **Map 1** is flat plains, and the stream goes in one direction, **left to right**. Maps run left to right in general.
- **Tile cost:** adding a tile costs 1 water (gal).
- ~~**Map 2** slopes. Going downhill picks up +1 speed per tile, and flat ground takes 1 speed away.~~ *Superseded Nov 10: Map 2 · Slope is retired and every map is flat, with no speed (Terrain Features, applied on Dan's "Apply them now").*
- **Map 3** is flat with a **lake**.
- **Map 1a** introduces **sand**. ~~Sand costs 1 to enter~~ *(superseded Nov 10: sand is free to enter)* but takes away 1 flow. On the desert map with storage (5), sand also turns the bare ground next to it into grass.
- **Bare ground:** a stream through it costs 1 gal.
  - **Grass:** 1 gal turns bare ground next to the river into grass, for +1 storage.
  - ~~**Trees:** 1 more gal turns grass into trees, for +1 more storage.~~ *Superseded Nov 10 by the meadow chain below.*
  - **Grass → meadow → trees** (Dan, Nov 10, LOU-261, on every map): 1 gal turns grass into a meadow, then 1 more gal turns the meadow into trees, +1 storage each step, so one tile stores up to 3 extra gal. A grown meadow counts as a meadow for pollinators.
  - Start at **3 flow and 3 storage**.
  - A river can flow through grass or trees, but washes them away.
  - Water over storage **spills** at the end of the turn.
- **Clicking tiles:** tiles are clickable. Tap one to see what it does, then choose. A tile with only one option builds on the first tap.
- **Goal card** (Nov 10): every map starts with a prompt saying what the player is supposed to learn and accomplish (its lesson and star goals).
- ~~**Quick tap and hold** (Nov 10): a quick tap on a tile the stream can reach extends the stream. Press and hold opens the menu (the tile card).~~ *Superseded by LOU-258 (playtest, Nov 10): see "Moving the stream".*
- **Moving the stream** (LOU-258): tap the stream's **end** to select it, then tap a glowing tile to move it there; the end stays selected. Tap the end again or empty space to let go. Tapping land never moves the stream; it opens the tile card. Tapping a tributary's end selects that river.
- **Water vs flow** (LOU-258): water is blue, flow is teal (`#62e0c8`), everywhere. Green means grass, never flow. ~~Flow has its own chip, "per water cycle".~~ *Superseded Nov 11 by the top bar (LOU-267): flow shows in teal brackets next to water.*
- **Top bar** (Dan, Nov 11, LOU-267): like Polytopia, three stats straight on the map with no panels: **Score · Turn · Water (+flow)**, a small label over a big number. Water has a blue drop, the amount in blue, the flow in teal brackets, and "(of N)" storage in the label. Tap Water for the Water card (storage cells, flow, next cycle, and each river on tributary maps).
- **Next Water Cycle** (LOU-258): the End turn button is now **Next Water Cycle**. No "End turn" text anywhere. The counter stays "Turn".
- **Can't afford = grey** (LOU-258): unaffordable buttons and tiles are grey, not orange or brown.
- **Fresh start** (LOU-258): a finished run (won, scored or stuck) is never restored; an in-progress run older than 12 hours starts fresh too.
- **Meadow** (LOU-258): its own soft light-green tile with pale patches and wildflowers, never grass tufts.
- **Banks** on rivers and lakes are only for looks.
- **Tributaries:**
  - You start one by tapping a second source.
  - ~~It's a separate river with **its own metrics kept separate**.~~ *Superseded Nov 10: a tributary has no water, flow or storage of its own. You build it with the main river's water, and its source adds to your flow only once it connects (Terrain Features).*
  - You select a river by tapping it.
  - When a tributary meets the main river, it **pours into the main river** and adds its flow.
- **Nov 10 rules** (on maps with storage):
  - **Groves:** 3 or more trees in a row beside the river.
  - ~~**Wildflower patches:** 4 or more meadows in a row.~~ *Superseded Nov 10 by pollinators: a meadow next to a grove adds +1 flow.*
  - **Sand** greens its neighbours.
  - **Mountain runoff** on the windward side, with a rain shadow on the other. Since Nov 11 (LOU-269) this is each mountain's **water side**: see below.
  - ~~**Trees as defense:** trees cost 3 gal to cut through~~, rock 2. *Superseded Nov 10: trees no longer defend; sediment is the defense tile.*
- **Wild forest** counts toward groves (Nov 10).
- **Oases (springs)** (Nov 10): an oasis just adds +1 flow and doesn't green the ground around it. The oasis tile itself can still bloom when sand next to it blooms, and it counts toward the bloom goal. Sand keeps blooming the sand around it and greening the bare ground beside it.
- **Beavers** (Nov 10): you have to route your river THROUGH a beaver colony to get its bonus (with trees next to it). Running beside it isn't enough.
- **No oxbow lakes** (Nov 10): Dan said "do not make oxbow lakes". The river never cuts a bend off into a lake, and Map 14 is now Floodplain. Don't bring them back.
- **Place your source anywhere** (Dan, Nov 11, LOU-263): on Big, Daily, Perfection and Custom, tap any allowed land tile at the start to place your source there; it becomes your source and the start of your main river, with 3 flow. Allowed: bare ground, grass, meadow or sand, at least 4 tiles from the sea (not sea, mountains, lakes, rock or a source). Pre-placed sources stay as a choice. Tutorial steps keep their fixed sources.
- **Mountain water side** (Dan, Nov 11, LOU-269): each mountain has exactly one water side, one face with water running down it and **one runoff tile** in front of it (+1 flow when your river reaches it, through or beside). The side is set per mountain in the map data (`waterSides: {"x,y": [dx, dy]}`); otherwise it comes from the map's wind. The runoff tile shows a pool and a teal "+1" drop until claimed; the other faces are dry and the far tile is a cracked rain shadow. Tapping a mountain or its runoff tile explains it.
- **New maps:** one new map per new rule.
- **Tutorial** (LOU-261): the lesson maps are one ordered tutorial at `/tutorial/1/` … `/tutorial/12/`, one new rule per step, each ending in **Next lesson** (the last goes to the Daily island). `/tutorial/` shows progress and Continue. A first-time visitor to the site root is offered the tutorial. ~~The old lesson URLs redirect to their step.~~ *Superseded Nov 11 by River mode (LOU-265).*
- **River mode** (Dan, Nov 11, LOU-265): River mode = Dan's original maps in original order (1, 1a, 3, 4, 4a, 5 … 17), free control, no objectives; the tutorial is separate and guided. **Never redirect one into the other.** Each keeps its own progress (tutorial steps have their own `tut-N-…` ids). River maps link with **Next map** in the original order. Map 2 · Slope stays retired (/2/ points to Map 3).
- **Home page** (LOU-265): the site root is a home page with Tutorial, River mode, Daily island and Perfection side by side (and Landscape mode since LOU-266); a first-time visitor sees the tutorial marked "New here?". The old root test map, Spring Hill, is at `/spring-hill/`.
- **Landscape mode** (Dan, Nov 11, LOU-266): the alternate to River mode. The river is given and **flows on its own**: each water cycle it moves as many tiles as its flow, always to the cheapest next tile (the sea first, then sand and springs 0, ground 1, rock 2), ties toward the sea, never into mountains. You reshape the land, paid in **water** (sand, rock, bare ground, grass → meadow → trees 1 gal each; a mountain, or clearing one, 3 gal). Numbered circles **show the river's path** for the next water cycle. At `/landscape/`: 3 puzzle levels (Two springs, Ten green, Keep off the sand) and a sandbox; a landscape copies as a map code (Custom page) to play in River mode. Map data: `landscape: true`, `budget`, `noSand`, `bloomKind: "springs"`.
- **Tutorial objectives** (Dan, Nov 11, LOU-264): every tutorial step teaches through in-map objectives, one at a time in a small bar at the top, checked by the game (never by tapping OK). Its target tile or button is highlighted with a pulsing gold ring and the rest of the board dims a little. Dots show progress, and reaching the sea completes the lesson. **Skip lesson** marks the step as seen (skipped) and goes to the next one. Objectives are data in `window.MAP.objectives`.

## Look and feel

- **Style:** Flow Tile's own look, styled like **Polytopia**, chunky and animated. Rivers animate as they're added, and the whole game has motion. Use no outside design system.
- ~~**One screen:** everything fits on one screen, inside the game window.~~ *Superseded Nov 11 by "Play zoom" (LOU-262).*
- ~~**Opening view:** the game opens on the whole island.~~ *Superseded Nov 11 by "Play zoom" (LOU-262).*
- **Play zoom** (Dan, Nov 11, LOU-262): the game opens on the whole island (to pick a source), then plays zoomed in like Polytopia: a tile is about 118px wide, so 3–4 fit across a phone, and the camera follows the stream's end. The whole-island view stays available as an overview on the corner zoom button, which toggles back to play zoom. The message is a short toast that fades.
- **Big map:** there's a big test map at `/big/`, 18×18.
- **No water border** around the map (Nov 10). Don't put the ring of sea tiles back. The goal sea tiles (`~`) stay.

## Linear scope (Nov 10)

- **Scope:** "Check linear and do all tickets related to flowtile" covers the **Ideas** project. Dan is reviewing **Terrain Features** first, so don't build those specs until Dan says so. **Nov 10: Dan said "Apply them now"**, so the Terrain Features decisions are now in force (rival-only parts still skipped).
- **Conflicts:** when Linear's spec decisions (Nov 9) conflict with what's built, **Linear wins**. Those decisions sit in Terrain Features, so apply them once Dan's review is done. Examples: trees no longer defend (sediment does), meadows next to a grove give +1 flow, sand is free to enter, lakes cost 2 gal a tile, and Map 2 · Slope is retired.
- **Rivals:** skip them for now. No rival rivers, capture or stealing, and leave out the rival parts of any Idea.
- **Tracking:** one new Initial Prototype issue per piece of work, linking the Idea it builds.

## Nov 11 answers

- **Landscape mode** (LOU-266): both a puzzle mode and a map builder (sandbox + puzzle levels, and a finished landscape copies as a map code for River mode). Terrain is paid for with **water**. The map **shows the river's path** for the next water cycle.
- **Place your source anywhere** (LOU-263): use the draft defaults: bare ground, grass, meadow or sand only; at least 4 tiles from the sea; a placed source gives 3 flow; only on Big, Daily, Perfection and Custom; tutorial steps keep their fixed sources.
