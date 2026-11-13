// Single player campaign (LOU-290): 24 levels in four chapters of six. One list for the home page, the Levels page and All islands.
// Reaching the sea always opens the next level; the turn goal is only ever a star.
window.LEVELS = [
  // [number, name, what's new or what makes it hard, size, chapter]
  [1, "First river", "Guided: water and flow", "8×5", 0],
  [2, "Read the land", "Guided: rock, sand, springs", "9×6", 0],
  [3, "Grow the land", "Guided: storage and groves", "9×6", 0],
  [4, "Sandbar", "A shortcut that drinks your flow", "10×6", 0],
  [5, "Two Peaks", "One pass, two mountain pools", "11×7", 0],
  [6, "Green Shore", "Route and grow together", "11×7", 0],
  [7, "Still Water", "New: lakes", "11×7", 1],
  [8, "Lake Country", "Wait for a lake without spilling", "12×7", 1],
  [9, "Old Wood", "New: wild forest", "12×8", 1],
  [10, "The Clearing", "Forest in the way of the short route", "12×8", 1],
  [11, "Lakeside Wood", "Lakes and forest together", "13×8", 1],
  [12, "The Heartland", "Everything from the inland, at once", "13×8", 1],
  [13, "Rich Soil", "New: fertile ground", "13×8", 2],
  [14, "Black Earth", "Fertile ground off the direct route", "14×8", 2],
  [15, "Wetland", "New: marsh", "14×9", 2],
  [16, "Reed Beds", "A wall of marsh: hug it or cut through", "14×9", 2],
  [17, "Highland Lakes", "Fertile ground, marsh and lakes", "15×9", 2],
  [18, "High Meadow", "The high country, all together", "15×9", 2],
  [19, "Under the Hill", "New: caves", "15×9", 3],
  [20, "Hollow Ridge", "Two cave pairs and three springs", "15×10", 3],
  [21, "Storm Season", "New: weather", "16×10", 3],
  [22, "Dry Spell", "A drought in the middle of the level", "16×10", 3],
  [23, "Wild Country", "Everything so far", "16×10", 3],
  [24, "The Great Island", "The finale", "20×12", 3],
];
window.CHAPTERS = ["Shores", "Inland", "High country", "Far islands"];
// What each chapter adds (the banner the first time it opens)
window.CHAPTER_NEW = ["water, flow and growing", "lakes and old forest", "fertile ground and marsh", "caves and weather"];
// Extra islands: levels from the first campaign whose mechanics are held back from the campaign. Not counted in its stars.
window.EXTRAS = [
  // [folder, name, what it's about]
  ["fork", "The Fork", "Tributaries"],
  ["dam-builders", "Dam Builders", "Beavers"],
  ["snowline", "Snowline", "Alpine trees"],
  ["rain-pools", "Rain Pools", "Rain pools and weather"],
  ["second-thoughts", "Second Thoughts", "Rechannel"],
  ["dry-lightning", "Dry Lightning", "Wildfire"],
  ["high-water", "High Water", "Floods"],
  ["dunes", "Dunes", "Salt flats and a long desert"],
];
window.levelId = n => "c2-" + n;
// The first campaign's 20 levels were replaced, so their stars and saved runs are cleared once. Daily and Perfection bests stay.
try { if (localStorage.getItem("flowtile.campaign") !== "2") { const old = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^flowtile\.(stars|best|run\.v\d+|seen|guide)\.level-\d+$/.test(k || "")) old.push(k) }
  old.forEach(k => localStorage.removeItem(k)); localStorage.setItem("flowtile.campaign", "2") } } catch (_) {}
window.levelStars = n => { try { return +localStorage.getItem("flowtile.stars." + window.levelId(n)) || 0 } catch (_) { return 0 } };
// "I've played before" (home page) turns guidance off and opens Level 4 as well as Levels 1 to 3.
window.playedBefore = () => { try { return localStorage.getItem("flowtile.guidance") === "off" } catch (_) { return false } };
// open: Level 1, any level whose previous level reached the sea (at least one star), and Levels 1 to 4 for players who know the game
window.levelOpen = n => n <= 1 || window.levelStars(n - 1) > 0 || (window.playedBefore() && n <= 4);
