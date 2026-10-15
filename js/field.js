/*
 * Out in the field: where you are on the map.
 *
 * A Locate button on the map watches the phone's GPS, shows a blue dot with
 * an accuracy ring, and gives the distance and direction from you to
 * anything on the map. Used in view-only mode (share links). Nothing is
 * stored or sent anywhere; the position stays in the browser.
 */
window.SMC = window.SMC || {};

SMC.field = (function () {
  var geo = SMC.geo;
  var FOLLOW_ZOOM = 17;
  var MIN_MOVE_METRES = 3;
  var COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  var map = null;
  var hooks = {};
  var button = null;
  var watchId = null;
  var pos = null;          // { latlng: [lat, lng], accuracy: metres }
  var following = false;
  var dot = null, ring = null;
  var listeners = [];
  var statusTimer = null;

  function supported() {
    return !!(navigator.geolocation && (location.protocol === 'https:' || location.hostname === 'localhost' || location.protocol === 'file:'));
  }

  // Adds the Locate button and the pane the blue dot sits in.
  function init(leafletMap, appHooks) {
    if (map) return;
    map = leafletMap;
    hooks = appHooks || {};
    map.createPane('smc-you').style.zIndex = 625;

    var Locate = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        var bar = L.DomUtil.create('div', 'leaflet-bar smc-locate-bar');
        button = L.DomUtil.create('a', 'smc-locate', bar);
        button.href = '#';
        button.title = 'Show where I am';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'Show where I am');
        button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<circle cx="12" cy="12" r="2.2" fill="currentColor"/>' +
          '<path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.on(button, 'click', function (e) { L.DomEvent.preventDefault(e); toggle(); });
        return bar;
      }
    });
    map.addControl(new Locate());
    // Dragging the map means the person wants to look elsewhere: stop
    // recentring on them, but keep the dot updating.
    map.on('dragstart', function () { if (following) { following = false; paint(); } });
  }

  // Off: start watching and follow. On but not following: follow again.
  // Following: switch off.
  function toggle() {
    if (!supported()) {
      say('Location is not available in this browser.', 5000);
      return;
    }
    if (watchId === null) { start(); return; }
    if (following) { stop(); return; }
    following = true;
    if (pos) recentre(true);
    paint();
  }

  function start() {
    following = true;
    paint();
    say('Finding where you are…', 0);
    watchId = navigator.geolocation.watchPosition(onFix, onError, {
      enableHighAccuracy: true, maximumAge: 5000, timeout: 20000
    });
  }

  function stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    following = false;
    pos = null;
    if (dot) { map.removeLayer(dot); dot = null; }
    if (ring) { map.removeLayer(ring); ring = null; }
    say('', 0);
    paint();
    notify();
  }

  function onFix(p) {
    var ll = [p.coords.latitude, p.coords.longitude];
    var first = !pos;
    var moved = first || geo.distance(pos.latlng, ll) >= MIN_MOVE_METRES ||
      Math.abs((pos.accuracy || 0) - (p.coords.accuracy || 0)) > 5;
    pos = { latlng: ll, accuracy: p.coords.accuracy || 0 };
    if (first) say('', 0);
    drawDot();
    if (following && (first || moved)) recentre(first);
    paint();
    if (moved) notify();
  }

  function onError(err) {
    if (err.code === 1) {
      stop();
      say('Location is blocked for this site. Allow location in your browser settings, then try again.', 7000);
    } else if (err.code === 3 && !pos) {
      say('Still waiting for a GPS fix. Open sky helps.', 6000);
    } else if (!pos) {
      say('Could not get a location fix right now.', 6000);
    }
  }

  function drawDot() {
    var ll = L.latLng(pos.latlng);
    if (!dot) {
      ring = L.circle(ll, { pane: 'smc-you', radius: pos.accuracy, interactive: false,
        color: '#1e88e5', weight: 1, opacity: 0.5, fillColor: '#1e88e5', fillOpacity: 0.12 }).addTo(map);
      dot = L.circleMarker(ll, { pane: 'smc-you', radius: 8, interactive: false, className: 'smc-you-dot',
        color: '#ffffff', weight: 3, fillColor: '#1e88e5', fillOpacity: 1 }).addTo(map);
    } else {
      ring.setLatLng(ll).setRadius(pos.accuracy);
      dot.setLatLng(ll);
    }
  }

  function recentre(zoomIn) {
    var z = zoomIn ? Math.max(map.getZoom(), FOLLOW_ZOOM) : map.getZoom();
    map.setView(pos.latlng, z, { animate: true });
  }

  function paint() {
    if (!button) return;
    button.classList.toggle('on', watchId !== null);
    button.classList.toggle('following', following && watchId !== null);
    button.classList.toggle('searching', watchId !== null && !pos);
    button.title = watchId === null ? 'Show where I am' : following ? 'Stop showing where I am' : 'Centre the map on me';
    button.setAttribute('aria-label', button.title);
  }

  function say(msg, ms) {
    if (!hooks.status) return;
    clearTimeout(statusTimer);
    hooks.status(msg);
    if (msg && ms) statusTimer = setTimeout(function () { hooks.status(''); }, ms);
  }

  function notify() {
    listeners.forEach(function (fn) { fn(pos); });
  }

  function onUpdate(fn) { listeners.push(fn); }

  function position() { return pos ? pos.latlng : null; }

  // The spot on an item that distances are measured to. For a line it is
  // the closest point along it, so "Course route 40 m W" means the nearest
  // bit of the course.
  function targetPoint(item) {
    if (item.latlng) return item.latlng;
    if (item.center) return item.center;
    if (!item.latlngs || !item.latlngs.length) return null;
    var type = SMC.TYPE_BY_ID[item.type];
    if (type && type.kind === 'line' && pos) return geo.nearestOnLine(pos.latlng, item.latlngs).point;
    return geo.centroid(item.latlngs);
  }

  // { metres, bearing, text } from the person to the item, or null when
  // there is no fix yet.
  function distanceTo(item) {
    if (!pos) return null;
    var p = targetPoint(item);
    if (!p) return null;
    var m = geo.distance(pos.latlng, p);
    var b = geo.bearing(pos.latlng, p);
    return { metres: m, bearing: b, text: formatDistance(m) + (m < 10 ? '' : ' ' + compass(b)) };
  }

  function formatDistance(m) {
    if (m < 10) return 'right here';
    if (m < 1000) return Math.round(m / 5) * 5 + ' m';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  }

  function compass(bearing) {
    return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
  }

  // The closest items to the person, nearest first.
  function nearest(items, n) {
    if (!pos) return [];
    return items.map(function (item) {
      var d = distanceTo(item);
      return d ? { item: item, distance: d } : null;
    }).filter(Boolean).sort(function (a, b) { return a.distance.metres - b.distance.metres; }).slice(0, n || 8);
  }

  return {
    init: init,
    supported: supported,
    toggle: toggle,
    stop: stop,
    active: function () { return watchId !== null; },
    position: position,
    onUpdate: onUpdate,
    distanceTo: distanceTo,
    nearest: nearest,
    formatDistance: formatDistance,
    compass: compass
  };
})();
