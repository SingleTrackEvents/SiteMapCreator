/*
 * Import from Google My Maps (or any KML / KMZ file).
 *
 * A My Maps link carries the map id (mid=...). Google serves a public
 * map's KML at /maps/d/kml?mid=...&forcekml=1 with open CORS headers, so
 * the browser can fetch it directly as long as the map is shared as
 * "Anyone with the link can view".
 */
window.SMC = window.SMC || {};

SMC.kml = (function () {
  var JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  function midFromUrl(url) {
    var m = /[?&]mid=([A-Za-z0-9_-]+)/.exec(url || '');
    return m ? m[1] : null;
  }

  function fetchMyMaps(url) {
    var mid = midFromUrl(url);
    if (!mid) {
      return Promise.reject(new Error('That does not look like a Google My Maps link. ' +
        'It should contain "mid=" (copy it from the browser address bar while viewing the map).'));
    }
    return fetch('https://www.google.com/maps/d/kml?forcekml=1&mid=' + encodeURIComponent(mid))
      .catch(function () {
        // Google leaves off the sharing headers when a map is private or the id is wrong,
        // which the browser reports the same way as a dropped connection.
        throw new Error('Could not load that map. Check the link is right and the map is shared as ' +
          '"Anyone with this link can view". If it still fails, check your internet connection.');
      })
      .then(function (r) {
        return r.text().then(function (text) {
          if (!r.ok || text.indexOf('<kml') === -1) {
            throw new Error('Google would not share this map. In My Maps, click Share and turn on ' +
              '"Anyone with this link can view", then try again. Or export it to KML and import the file.');
          }
          return text;
        });
      });
  }

  function loadJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = JSZIP_URL;
      s.onload = function () { resolve(window.JSZip); };
      s.onerror = function () { reject(new Error('Could not load the KMZ reader. Check your connection.')); };
      document.head.appendChild(s);
    });
  }

  function readFile(file) {
    if (/\.kmz$/i.test(file.name)) {
      return loadJsZip()
        .then(function (JSZip) { return JSZip.loadAsync(file); })
        .then(function (zip) {
          var name = Object.keys(zip.files).filter(function (n) { return /\.kml$/i.test(n); })[0];
          if (!name) throw new Error('No KML found inside that KMZ file.');
          return zip.files[name].async('string');
        });
    }
    return file.text();
  }

  // ------------------------------------------------------------ parsing

  function child(el, tag) {
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) if (n.localName === tag) return n;
    return null;
  }

  function children(el, tag) {
    var out = [];
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) if (n.localName === tag) out.push(n);
    return out;
  }

  function descendants(el, tag) {
    return Array.prototype.slice.call(el.getElementsByTagNameNS('*', tag));
  }

  function text(el, tag) {
    var c = el && child(el, tag);
    return c ? c.textContent.trim() : '';
  }

  // KML colours are aabbggrr.
  function kmlColor(s) {
    s = (s || '').trim();
    if (!/^[0-9a-fA-F]{8}$/.test(s)) return null;
    return ('#' + s.slice(6, 8) + s.slice(4, 6) + s.slice(2, 4)).toLowerCase();
  }

  function parseStyles(doc) {
    var styles = {};
    descendants(doc, 'Style').forEach(function (st) {
      var id = st.getAttribute('id');
      if (!id) return;
      var icon = child(st, 'IconStyle'), line = child(st, 'LineStyle'), poly = child(st, 'PolyStyle');
      var fromId = /-([0-9A-Fa-f]{6})(-|$)/.exec(id);
      styles[id] = {
        icon: kmlColor(text(icon, 'color')) || (fromId ? '#' + fromId[1].toLowerCase() : null),
        line: kmlColor(text(line, 'color')) || (fromId ? '#' + fromId[1].toLowerCase() : null),
        poly: kmlColor(text(poly, 'color'))
      };
    });
    // StyleMaps point at the "normal" style.
    descendants(doc, 'StyleMap').forEach(function (sm) {
      var id = sm.getAttribute('id');
      children(sm, 'Pair').forEach(function (pair) {
        if (text(pair, 'key') === 'normal') {
          var ref = text(pair, 'styleUrl').replace(/^#/, '');
          if (styles[ref]) styles[id] = styles[ref];
        }
      });
    });
    return styles;
  }

  function parseCoords(s) {
    return (s || '').trim().split(/\s+/).map(function (t) {
      var p = t.split(',');
      return [parseFloat(p[1]), parseFloat(p[0])];
    }).filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); });
  }

  var scratch = document.createElement('div');

  function htmlToText(html) {
    scratch.innerHTML = (html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
    var t = scratch.textContent.replace(/\n{3,}/g, '\n\n').trim();
    // Drop the descriptions My Maps writes automatically for imported GPX.
    if (/^(Elevation:|Statistics computed from imported data)/.test(t)) return '';
    return t;
  }

  function geometries(pm) {
    var out = [];
    (function walk(el) {
      for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
        if (n.localName === 'Point') {
          var c = parseCoords(text(n, 'coordinates'));
          if (c.length) out.push({ kind: 'point', latlng: c[0] });
        } else if (n.localName === 'LineString') {
          var l = parseCoords(text(n, 'coordinates'));
          if (l.length > 1) out.push({ kind: 'line', latlngs: l });
        } else if (n.localName === 'Polygon') {
          var outer = child(n, 'outerBoundaryIs');
          var ring = outer && child(outer, 'LinearRing');
          var r = ring ? parseCoords(text(ring, 'coordinates')) : [];
          if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
          if (r.length > 2) out.push({ kind: 'area', latlngs: r });
        } else if (n.localName === 'MultiGeometry') {
          walk(n);
        }
      }
    })(pm);
    return out;
  }

  // Returns { name, folders: [{ name, features: [...] }] }.
  function parse(kmlText) {
    var xml = new DOMParser().parseFromString(kmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('That file is not valid KML.');
    var doc = descendants(xml, 'Document')[0] || xml.documentElement;
    var styles = parseStyles(doc);
    var folders = [];

    function placemarksIn(el, folderName) {
      var feats = [];
      children(el, 'Placemark').forEach(function (pm) {
        var name = text(pm, 'name');
        var notes = htmlToText(text(pm, 'description'));
        var style = styles[text(pm, 'styleUrl').replace(/^#/, '')] || {};
        geometries(pm).forEach(function (g) {
          g.name = name;
          g.notes = notes;
          g.color = g.kind === 'point' ? style.icon : g.kind === 'line' ? style.line : (style.poly || style.line);
          g.type = guessType(g.kind, name, folderName);
          feats.push(g);
        });
      });
      if (feats.length) folders.push({ name: folderName, features: feats });
    }

    (function walk(el, path) {
      placemarksIn(el, path || text(doc, 'name') || 'Map');
      children(el, 'Folder').forEach(function (f) {
        var n = text(f, 'name') || 'Folder';
        walk(f, path ? path + ' / ' + n : n);
      });
    })(doc, '');

    return { name: text(doc, 'name'), folders: folders };
  }

  // --------------------------------------------------- type guessing

  var POINT_RULES = [
    [/water (only|station|stop)/, 'water-station'],
    [/aid ?station|\baid\b|feed ?station/, 'aid-station'],
    [/marshal/, 'marshal'],
    [/timing|\bchip\b|timing mat/, 'timing'],
    [/crew/, 'crew-access'],
    [/cut.?off/, 'cut-off'],
    [/first aid|medical|\bmedic/, 'first-aid'],
    [/defib|\baed\b/, 'aed'],
    [/ambulance/, 'ambulance'],
    [/evac|assembly/, 'evac-point'],
    [/helicopter|helipad|\bhlz\b|landing zone/, 'helipad'],
    [/toilet|portaloo|\bloo\b|\bwc\b/, 'toilets'],
    [/registration|\brego\b|check.?in/, 'registration'],
    [/bag drop|drop bag/, 'bag-drop'],
    [/\binfo/, 'info'],
    [/road closure|closed road/, 'road-closure'],
    [/traffic/, 'traffic-control'],
    [/\bbus\b|shuttle/, 'shuttle'],
    [/parking|car ?park/, 'parking-point'],
    [/\bgate\b/, 'gate'],
    [/road crossing|crossing/, 'road-crossing'],
    [/km marker|\bkm mark/, 'km-marker'],
    [/sign|stake|arrow|course marking|flag/, 'course-sign'],
    [/generator/, 'generator'],
    [/\bbins?\b|waste|rubbish/, 'bins'],
    [/start ?\/ ?finish/, 'start-finish'],
    [/^start|\bstart\b/, 'start'],
    [/^end\b|^end of|finish/, 'finish'],
    [/water/, 'water-refill']
  ];

  var LINE_RULES = [
    [/emergency|evac/, 'emergency-route'],
    [/fenc/, 'fencing'],
    [/barrier/, 'barrier'],
    [/bunting|tape/, 'bunting'],
    [/pedestrian|walkway|footpath/, 'pedestrian-route'],
    [/vehicle|drive|access road|car route/, 'vehicle-route'],
    [/course|\brun\b|\d+ ?k(m)?\b|loop|trail|\bleg\b|route|race/, 'course-line']
  ];

  var AREA_RULES = [
    [/parking|car ?park/, 'parking'],
    [/restricted|no access|exclusion|no go/, 'restricted'],
    [/spectator/, 'spectator'],
    [/chute/, 'finish-chute'],
    [/village|hub|festival|precinct/, 'village-zone']
  ];

  var FALLBACK = { point: 'pin', line: 'other-line', area: 'other-area' };

  function match(rules, s) {
    s = (s || '').toLowerCase();
    for (var i = 0; i < rules.length; i++) if (rules[i][0].test(s)) return rules[i][1];
    return null;
  }

  // The placemark name wins; the folder name is the fallback.
  function guessType(kind, name, folder) {
    var rules = kind === 'point' ? POINT_RULES : kind === 'line' ? LINE_RULES : AREA_RULES;
    return match(rules, name) || match(rules, folder) || FALLBACK[kind];
  }

  return {
    midFromUrl: midFromUrl,
    fetchMyMaps: fetchMyMaps,
    readFile: readFile,
    parse: parse,
    guessType: guessType
  };
})();
