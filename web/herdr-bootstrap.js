const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.22.6001-403-b52a93bf3ad52c45/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
