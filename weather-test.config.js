// Flow Tile weather test (LOU-296): every number the test uses, in one place. The test is an experiment on its own map
// (/weather-test/); no other map reads this file.
// The tuning panel (menu > Tuning, on the weather test map) changes these for one device; Reset goes back to this file.
window.WEATHER_TEST = {
  // As today
  startWater: 3,        // gal in the jar when the run starts (applies on restart)
  riverFlow: 3,         // the river's own flow each water cycle: the only flow the weather changes
  startStorage: 5,      // how much the jar holds at the start (applies on restart)

  // The reserve: a level, not a charge. Nothing is deducted for it.
  reserve: 2,           // starting reserve, gal
  reserveEvery: 5,      // the reserve rises by 1 for every this many river tiles (0: it never rises)

  // Weather: a multiple for the river's own flow. Terrain flow (springs, groves, marsh, runoff) is added after it.
  weather: {normal: 1, flood: 2, drought: 1 / 3},
  schedule: "4 normal, 1 flood, 2 normal, 2 drought", // one entry per water cycle, starting with cycle 1; then it repeats
  forecast: 5,          // how many coming cycles the weather strip shows

  // Consequences, worked out right after flow arrives
  floodOrder: "end",    // each gal over storage floods one bank tile. "end": nearest the river's end first; "grown": grown tiles first, then nearest the end
  dryOrder: "far",      // each gal under the reserve dries one tile by one stage. "far": furthest from the river first; "near": nearest first

  turnLimit: 30,        // water cycles in a run; life is counted when they are up

  // Not in the draft: what one tile is worth in life, and the star thresholds on the result sheet. Placeholders.
  life: {grass: 1, meadow: 2, trees: 3},
  stars: [40, 70, 100],
};
