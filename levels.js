// Single player campaign (Dan, Nov 12): 20 brand-new levels that grow from a small island to a 40×40 finale.
// One list for the home page, the Single player page and All islands. A level opens when the one before it reached the sea.
window.LEVELS = [
  // [number, name, what's new or what makes it hard, size, chapter]
  [1, "Morning Stream", "A small island to warm up", "9×6", 0],
  [2, "Sandbar", "Sand and oases", "10×6", 0],
  [3, "Two Peaks", "A ridge with one way through", "11×7", 0],
  [4, "Still Water", "New: lakes", "12×7", 0],
  [5, "Old Wood", "New: wild forest", "12×8", 0],
  [6, "The Fork", "New: tributaries", "13×8", 1],
  [7, "Rich Soil", "New: fertile ground", "14×8", 1],
  [8, "Wetland", "New: marsh", "14×9", 1],
  [9, "Dam Builders", "New: beavers", "15×9", 1],
  [10, "Under the Hill", "New: caves", "15×9", 1],
  [11, "Snowline", "New: alpine trees", "16×10", 2],
  [12, "Rain Pools", "New: rain pools and weather", "16×10", 2],
  [13, "Second Thoughts", "New: rechannel", "17×10", 2],
  [14, "Dry Lightning", "New: wildfire", "17×11", 2],
  [15, "High Water", "New: floods", "18×11", 2],
  [16, "Dunes", "New: salt flats. A long desert", "20×12", 3],
  [17, "Highlands", "Ridges, caves and a second spring", "22×13", 3],
  [18, "Delta", "Three springs, lakes and marsh", "24×14", 3],
  [19, "Wild Country", "Everything, on one wild island", "28×18", 3],
  [20, "The Great Island", "The finale: 40×40", "40×40", 4],
];
window.CHAPTERS = ["Shores", "Inland", "High country", "Far islands", "The Great Island"];
window.levelStars = n => { try { return +localStorage.getItem("flowtile.stars.level-" + n) || 0 } catch (_) { return 0 } };
// open: level 1, and any level whose previous level reached the sea (at least one star)
window.levelOpen = n => n === 1 || window.levelStars(n - 1) > 0;
