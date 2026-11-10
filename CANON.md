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
  - **Trees:** 1 more gal turns grass into trees, for +1 more storage.
  - Start at **3 flow and 3 storage**.
  - A river can flow through grass or trees, but washes them away.
  - Water over storage **spills** at the end of the turn.
- **Clicking tiles:** tiles are clickable. Tap one to see what it does, then choose. A tile with only one option builds on the first tap.
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
  - **Mountain runoff** on the windward side, with a rain shadow on the other.
  - ~~**Trees as defense:** trees cost 3 gal to cut through~~, rock 2. *Superseded Nov 10: trees no longer defend; sediment is the defense tile.*
- **Wild forest** counts toward groves (Nov 10).
- **Beavers** (Nov 10): you have to route your river THROUGH a beaver colony to get its bonus (with trees next to it). Running beside it isn't enough.
- **No oxbow lakes** (Nov 10): Dan said "do not make oxbow lakes". The river never cuts a bend off into a lake, and Map 14 is now Floodplain. Don't bring them back.
- **New maps:** one new map per new rule.

## Look and feel

- **Style:** Flow Tile's own look, styled like **Polytopia**, chunky and animated. Rivers animate as they're added, and the whole game has motion. Use no outside design system.
- **One screen:** everything fits on one screen, inside the game window.
- **Opening view:** the game opens on the whole island.
- **Big map:** there's a big test map at `/big/`, 18×18.
- **No water border** around the map (Nov 10). Don't put the ring of sea tiles back. The goal sea tiles (`~`) stay.

## Linear scope (Nov 10)

- **Scope:** "Check linear and do all tickets related to flowtile" covers the **Ideas** project. Dan is reviewing **Terrain Features** first, so don't build those specs until Dan says so. **Nov 10: Dan said "Apply them now"**, so the Terrain Features decisions are now in force (rival-only parts still skipped).
- **Conflicts:** when Linear's spec decisions (Nov 9) conflict with what's built, **Linear wins**. Those decisions sit in Terrain Features, so apply them once Dan's review is done. Examples: trees no longer defend (sediment does), meadows next to a grove give +1 flow, sand is free to enter, lakes cost 2 gal a tile, and Map 2 · Slope is retired.
- **Rivals:** skip them for now. No rival rivers, capture or stealing, and leave out the rival parts of any Idea.
- **Tracking:** one new Initial Prototype issue per piece of work, linking the Idea it builds.
