const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.22.6004-406-2891b3329e9ff1a1/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
