/*!
 * OpenSEO web analytics tracker (~3 KB gzipped)
 * Usage: <script defer data-site-id="SITE_ID" src="https://YOUR-OPENSEO-HOST/analytics/script.js"></script>
 * Goals: add data-wa-goal="signup_click" to any element (optional data-wa-goal-* props),
 *        or window.openseoAnalytics('goal', 'signup_click', { plan: 'pro' }).
 * Opt out: visit any page with ?wa_ignore=true (undo with ?wa_ignore=false).
 *
 * Ported from the Minilytics tracker (MIT, Copyright (c) 2026 surendrapandar)
 * https://github.com/surendrapandar/minilytics/blob/main/public/js/script.js
 * (payment-link tagging and visitor identify intentionally not ported).
 */
(function () {
  'use strict';
  var w = window, d = document, loc = w.location, nav = w.navigator;
  var script = d.currentScript;
  if (!script) return;

  var siteId = script.getAttribute('data-site-id');
  var endpoint = script.getAttribute('data-api') || new URL(script.src).origin + '/api/wa/event';
  var allowLocal = script.hasAttribute('data-allow-localhost');
  var cookieDomain = script.getAttribute('data-domain');
  var VID = 'wa_vid', SID = 'wa_sid', YEAR = 31536000, SESSION = 1800;

  var queued = (w.openseoAnalytics && w.openseoAnalytics.q) || [];
  function noop() {}

  // Opt yourself out: visit any page with ?wa_ignore=true (undo with ?wa_ignore=false).
  try {
    var ig = new URLSearchParams(loc.search).get('wa_ignore');
    if (ig === 'true') localStorage.setItem('wa_ignore', '1');
    if (ig === 'false') localStorage.removeItem('wa_ignore');
  } catch (e) {}
  var ignored = false;
  try { ignored = localStorage.getItem('wa_ignore') === '1'; } catch (e) {}
  var local = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local$)/.test(loc.hostname) || loc.protocol === 'file:';
  if (!siteId || ignored || nav.webdriver || (local && !allowLocal)) {
    w.openseoAnalytics = noop;
    return;
  }

  // ---- cookies (first-party, shared across subdomains so app.site.com and site.com are one visitor)
  function readCookie(name) {
    var m = d.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function rootDomain() {
    if (cookieDomain) return cookieDomain;
    var parts = loc.hostname.split('.');
    if (parts.length < 2 || /^\d+$/.test(parts[parts.length - 1])) return null;
    for (var i = parts.length - 2; i >= 0; i--) {
      var cand = parts.slice(i).join('.');
      d.cookie = 'wa_t=1; path=/; domain=' + cand + '; SameSite=Lax';
      if (readCookie('wa_t')) {
        d.cookie = 'wa_t=; path=/; domain=' + cand + '; max-age=0';
        return cand;
      }
    }
    return null;
  }
  var domain = rootDomain();
  function writeCookie(name, value, maxAge) {
    d.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + maxAge + '; SameSite=Lax' +
      (domain ? '; domain=' + domain : '') + (loc.protocol === 'https:' ? '; Secure' : '');
  }
  function uuid() {
    if (w.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  function ids() {
    var vid = readCookie(VID) || uuid();
    var sid = readCookie(SID) || uuid();
    writeCookie(VID, vid, YEAR);
    writeCookie(SID, sid, SESSION); // sliding 30 minute session
    return { vid: vid, sid: sid };
  }

  // ---- transport
  // Personal data in URLs (e.g. ?email= on a payment return page) never leaves the browser.
  var PRIVATE_PARAM = /^(e-?mail|name|phone|password|pass|token|access_token|id_token|auth|code|secret|key|api_key|license_key|license)$/i;
  function cleanUrl(href) {
    try {
      var u = new URL(href);
      var drop = [];
      u.searchParams.forEach(function (_, k) { if (PRIVATE_PARAM.test(k)) drop.push(k); });
      for (var i = 0; i < drop.length; i++) u.searchParams.delete(drop[i]);
      return u.toString();
    } catch (e) { return href; }
  }
  function send(type, extra, beacon) {
    var id = ids();
    var body = { w: siteId, t: type, u: cleanUrl(loc.href), vid: id.vid, sid: id.sid, sw: w.screen ? screen.width : 0 };
    for (var k in extra) if (extra[k] !== undefined) body[k] = extra[k];
    var json = JSON.stringify(body);
    // text/plain keeps this a "simple" request: no CORS preflight, works with sendBeacon.
    if (beacon && nav.sendBeacon) {
      try { if (nav.sendBeacon(endpoint, new Blob([json], { type: 'text/plain' }))) return; } catch (e) {}
    }
    try {
      fetch(endpoint, { method: 'POST', body: json, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }).catch(noop);
    } catch (e) {}
  }

  // ---- engaged time (only while the tab is visible)
  var visibleSince = d.visibilityState === 'visible' ? Date.now() : 0;
  var pending = 0, pings = 0;
  function flushTime(beacon) {
    if (visibleSince) { pending += Date.now() - visibleSince; visibleSince = d.visibilityState === 'visible' ? Date.now() : 0; }
    if (pending >= 1000) { send('ping', { d: Math.round(pending) }, beacon); pending = 0; }
  }
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'visible') visibleSince = Date.now();
    else flushTime(true);
  });
  w.addEventListener('pagehide', function () { flushTime(true); });
  setInterval(function () {
    if (d.visibilityState === 'visible' && pings < 30) { pings++; flushTime(false); }
  }, 60000);

  // ---- pageviews (including single-page-app navigation)
  var lastPage = null, firstView = true;
  function pageview() {
    var page = loc.pathname + loc.search;
    if (page === lastPage) return;
    if (lastPage !== null) flushTime(false);
    lastPage = page;
    pings = 0;
    send('pageview', { r: firstView ? d.referrer : '' });
    firstView = false;
  }
  var hist = w.history;
  if (hist && hist.pushState) {
    ['pushState', 'replaceState'].forEach(function (fn) {
      var orig = hist[fn];
      hist[fn] = function () { var r = orig.apply(this, arguments); setTimeout(pageview, 0); return r; };
    });
    w.addEventListener('popstate', pageview);
  }

  // ---- goals and outbound links
  function goal(name, props) {
    if (!name) return;
    send('goal', { n: String(name).slice(0, 64), p: props || undefined }, true);
  }
  function onClick(e) {
    var el = e.target && e.target.closest ? e.target : null;
    if (!el) return;
    var g = el.closest('[data-wa-goal]');
    if (g) {
      var props = {};
      for (var i = 0; i < g.attributes.length; i++) {
        var at = g.attributes[i];
        if (at.name.indexOf('data-wa-goal-') === 0) props[at.name.slice(13)] = at.value.slice(0, 255);
      }
      goal(g.getAttribute('data-wa-goal'), Object.keys(props).length ? props : undefined);
    }
    var a = el.closest('a[href]');
    if (a) {
      try {
        var u = new URL(a.href, loc.href);
        if (/^https?:$/.test(u.protocol) && u.hostname !== loc.hostname && !(domain && u.hostname.slice(-domain.length) === domain)) {
          send('outbound', { n: u.origin + u.pathname }, true);
        }
      } catch (err) {}
    }
  }
  d.addEventListener('click', onClick, true);
  d.addEventListener('auxclick', onClick, true);

  // ---- public API
  function api(cmd, a, b) {
    if (cmd === 'goal' || cmd === 'track') goal(a, b);
    else if (cmd === 'pageview') { lastPage = null; pageview(); }
  }
  w.openseoAnalytics = api;

  pageview();
  for (var q = 0; q < queued.length; q++) api.apply(null, queued[q]);
})();
