const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.22.6003-405-37f210f74c7b4ec8/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
