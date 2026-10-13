const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.22.6002-404-53778c10127edd70/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
