/*
 * Site Map Creator: draw event villages, aid stations and safety
 * infrastructure over satellite imagery, then print a map for permits.
 *
 * All map content lives in `state.items`. Leaflet layers are rebuilt from
 * that data, which keeps save, load and undo simple.
 */
(function () {
  'use strict';

  var TYPES = SMC.TYPE_BY_ID;
  var geo = SMC.geo;
  var AUTOSAVE_KEY = 'smc.autosave.v1';
  var PAPER_MM = { A3: [420, 297], A4: [297, 210] };
  var MAX_EDITABLE_VERTICES = 600;

  var state = {
    meta: defaultMeta(),
    items: [],
    view: { basemap: 'vic', labels: false },
    hidden: {}
  };

  var map, baseLayer, labelLayer;
  var groups = {};
  var layers = {};
  var selectedId = null;
  var placingType = null;
  var history = [];
  var historyIndex = -1;
  var printMode = false;
  // True when the page was opened from a share link: nothing can be changed
  // and the viewer's own saved map in this browser is left alone.
  var viewMode = false;

  function defaultMeta() {
    return {
      name: '', subtitle: 'Event site plan', date: '', revision: 'Rev A',
      venue: '', organiser: 'SingleTrack Events', preparedBy: '', contact: '', notes: ''
    };
  }

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function newId() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  function itemColor(item) {
    return item.color || TYPES[item.type].color;
  }

  function status(msg) {
    var el = $('status');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  // ---------------------------------------------------------------- map

  function initMap() {
    map = L.map('map', {
      center: [-36.9, 146.5],
      zoom: 7,
      maxZoom: 21,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90
    });
    L.control.scale({ imperial: false, maxWidth: 220, position: 'bottomleft' }).addTo(map);
    map.attributionControl.setPrefix(false);

    SMC.CATEGORIES.forEach(function (c) {
      groups[c.id] = L.featureGroup().addTo(map);
    });

    map.pm.setGlobalOptions({ snappable: true, snapDistance: 12, allowSelfIntersection: true });

    map.on('click', onMapClick);
    map.on('pm:create', onDrawCreate);
    map.on('moveend', function () { if (!printMode) autosave(); });

    setBasemap(state.view.basemap);
  }

  function makeTileLayer(def) {
    return L.tileLayer(def.url, {
      maxZoom: 21,
      maxNativeZoom: def.maxNativeZoom,
      attribution: def.attribution
    });
  }

  function setBasemap(key) {
    if (!SMC.BASEMAPS[key]) key = 'vic';
    state.view.basemap = key;
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = makeTileLayer(SMC.BASEMAPS[key]).addTo(map);
    baseLayer.bringToBack();
    $('basemap-select').value = key;
    setLabels(state.view.labels);
  }

  function setLabels(on) {
    state.view.labels = !!on;
    $('labels-toggle').checked = !!on;
    if (labelLayer) { map.removeLayer(labelLayer); labelLayer = null; }
    if (!on) return;
    var def = state.view.basemap === 'vic' ? SMC.OVERLAYS.vic : SMC.OVERLAYS.esri;
    labelLayer = makeTileLayer(def).addTo(map);
  }

  // ------------------------------------------------------------- layers

  function pointIcon(type, selected, color) {
    var size = type.size || 26;
    var glyph = type.glyph || '';
    var fs = glyph.length <= 1 ? 14 : glyph.length === 2 ? 11 : 9;
    return L.divIcon({
      className: 'smc-pt-wrap',
      html: '<div class="smc-pt' + (selected ? ' sel' : '') + '" style="background:' + (color || type.color) +
        ';width:' + size + 'px;height:' + size + 'px;font-size:' + fs + 'px">' + esc(glyph) + '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function pathStyle(item, selected) {
    var type = TYPES[item.type];
    var color = itemColor(item);
    var cls = selected ? 'smc-path sel' : 'smc-path';
    if (type.kind === 'line') {
      return { color: color, weight: type.weight || 3, dashArray: type.dashArray || null,
        lineCap: 'round', lineJoin: 'round', opacity: 1, className: cls };
    }
    if (type.kind === 'area') {
      return { color: color, weight: 2, fillColor: color, fillOpacity: 0.22,
        dashArray: item.type === 'restricted' ? '6 4' : null, className: cls };
    }
    // rect
    return { color: '#1b1b1b', weight: 1.5, fillColor: color, fillOpacity: 0.9, className: cls };
  }

  function buildLayer(item) {
    var type = TYPES[item.type];
    var selected = item.id === selectedId;
    var layer;

    if (type.kind === 'point') {
      layer = L.marker(item.latlng, { icon: pointIcon(type, selected, itemColor(item)), draggable: !printMode && !viewMode, keyboard: false });
      layer.on('dragend', function () {
        var p = layer.getLatLng();
        item.latlng = [p.lat, p.lng];
        commit();
        if (item.showKm) rerender(item.id);
        if (item.id === selectedId) renderInspector();
      });
    } else if (type.kind === 'rect') {
      layer = L.polygon(geo.rectCorners(item.center, item.width, item.length, item.rotation), pathStyle(item, selected));
    } else if (type.kind === 'line') {
      layer = L.polyline(item.latlngs, pathStyle(item, selected));
    } else {
      layer = L.polygon(item.latlngs, pathStyle(item, selected));
    }

    var text = labelText(item);
    if (text) {
      var isPoint = type.kind === 'point';
      layer.bindTooltip(esc(text), {
        permanent: true,
        direction: isPoint ? 'right' : 'center',
        offset: isPoint ? [(type.size || 26) / 2, 0] : [0, 0],
        className: 'item-label'
      });
    }

    layer.on('click', function (e) {
      if (e.originalEvent) e.originalEvent._smcHandled = true;
      if (isDrawing() || printMode) return;
      if (placingType) { placeAt(e.latlng, e.originalEvent && e.originalEvent.shiftKey); return; }
      select(item.id);
    });

    return layer;
  }

  // The map label: the item's label, plus its km on the chosen course if asked for.
  function labelText(item) {
    var label = item.showLabel !== false ? (item.label || '') : '';
    if (!item.showKm) return label;
    var d = courseDistance(item);
    if (!d) return label;
    var km = d.kms.map(function (m) { return (m / 1000).toFixed(1); }).join(' / ') + ' km';
    return label ? label + ' (' + km + ')' : km;
  }

  // Distances along the item's chosen course, or the first course it sits on.
  function courseDistance(item) {
    var all = SMC.reports.distancesFor(item, state.items);
    if (!all.length) return null;
    for (var i = 0; i < all.length; i++) if (all[i].course.id === item.courseRef) return all[i];
    return all[0];
  }

  function refreshKmLabels() {
    state.items.forEach(function (i) { if (i.showKm) rerender(i.id); });
  }

  function addLayer(item) {
    var layer = buildLayer(item);
    layers[item.id] = layer;
    groups[TYPES[item.type].category].addLayer(layer);
    if (item.id === selectedId && !printMode && !viewMode) enableEditing(item, layer);
  }

  function removeLayer(id) {
    var layer = layers[id];
    if (!layer) return;
    if (layer.pm && layer.pm.enabled && layer.pm.enabled()) layer.pm.disable();
    Object.keys(groups).forEach(function (k) { groups[k].removeLayer(layer); });
    delete layers[id];
  }

  function rerender(id) {
    var item = findItem(id);
    removeLayer(id);
    if (item) addLayer(item);
  }

  function renderAll() {
    Object.keys(layers).forEach(removeLayer);
    state.items.forEach(addLayer);
    applyLayerVisibility();
    renderLayerbar();
  }

  // Selected rects can be dragged; selected lines and areas get vertex handles.
  function enableEditing(item, layer) {
    var kind = TYPES[item.type].kind;
    if (kind === 'rect') {
      layer.pm.enableLayerDrag();
      layer.on('pm:dragend', function () {
        item.center = geo.centroid(layer.getLatLngs()[0].map(function (p) { return [p.lat, p.lng]; }));
        commit();
        rerender(item.id);
        renderInspector();
      });
    } else if (kind === 'line' || kind === 'area') {
      if (item.latlngs.length > MAX_EDITABLE_VERTICES) return;
      layer.pm.enable({ allowSelfIntersection: true, removeVertexOn: 'contextmenu' });
      layer.on('pm:edit', function () {
        var ll = kind === 'line' ? layer.getLatLngs() : layer.getLatLngs()[0];
        item.latlngs = ll.map(function (p) { return [p.lat, p.lng]; });
        commit();
        if (item.type === 'course-line') refreshKmLabels();
        renderInspector();
      });
    }
  }

  function applyLayerVisibility() {
    SMC.CATEGORIES.forEach(function (c) {
      var g = groups[c.id];
      if (state.hidden[c.id]) { if (map.hasLayer(g)) map.removeLayer(g); }
      else if (!map.hasLayer(g)) map.addLayer(g);
    });
  }

  // --------------------------------------------------------- selection

  function select(id) {
    var prev = selectedId;
    selectedId = id;
    if (prev && prev !== id) rerender(prev);
    if (id) rerender(id);
    renderInspector();
  }

  function deselect() {
    if (selectedId) select(null);
  }

  // ---------------------------------------------------------- placing

  function isDrawing() {
    return map.pm.globalDrawModeEnabled();
  }

  function startPlacing(typeId) {
    cancelPlacing();
    deselect();
    var type = TYPES[typeId];
    placingType = typeId;
    markActiveLibraryItem();
    if (type.kind === 'point' || type.kind === 'rect') {
      $('map').classList.add('placing');
      status('Click the map to place ' + type.name.toLowerCase() + '. Hold Shift to place several. Esc to cancel.');
    } else {
      var style = pathStyle({ type: typeId }, false);
      map.pm.enableDraw(type.kind === 'line' ? 'Line' : 'Polygon', {
        pathOptions: style,
        templineStyle: style,
        hintlineStyle: { color: style.color, dashArray: '4 6' },
        snappable: true
      });
      status('Click to add points for ' + type.name.toLowerCase() +
        '. Click the last point or press Enter to finish. Esc to cancel.');
    }
  }

  function cancelPlacing() {
    if (isDrawing()) map.pm.disableDraw();
    placingType = null;
    $('map').classList.remove('placing');
    markActiveLibraryItem();
    status('');
  }

  function finishDrawing() {
    if (!isDrawing()) return;
    var shape = map.pm.Draw.getActiveShape();
    var draw = shape && map.pm.Draw[shape];
    if (draw && draw._finishShape) draw._finishShape();
  }

  function placeAt(latlng, keepPlacing) {
    var type = TYPES[placingType];
    var item = { id: newId(), type: type.id, label: '', notes: '', showLabel: true };
    if (type.kind === 'point') {
      item.latlng = [latlng.lat, latlng.lng];
    } else {
      item.center = [latlng.lat, latlng.lng];
      item.width = type.width;
      item.length = type.length;
      item.rotation = 0;
    }
    state.items.push(item);
    if (keepPlacing) {
      addLayer(item);
      commit();
      renderLayerbar();
      return;
    }
    cancelPlacing();
    selectedId = item.id;
    addLayer(item);
    commit();
    renderLayerbar();
    renderInspector();
    focusLabel();
  }

  function onDrawCreate(e) {
    var typeId = placingType;
    var type = TYPES[typeId];
    var ll = e.layer.getLatLngs();
    if (type.kind === 'area') ll = ll[0];
    map.removeLayer(e.layer);
    cancelPlacing();
    var item = {
      id: newId(), type: typeId, label: '', notes: '', showLabel: true,
      latlngs: ll.map(function (p) { return [p.lat, p.lng]; })
    };
    state.items.push(item);
    selectedId = item.id;
    addLayer(item);
    commit();
    renderLayerbar();
    renderInspector();
    focusLabel();
  }

  function onMapClick(e) {
    if (e.originalEvent && e.originalEvent._smcHandled) return;
    if (printMode || isDrawing()) return;
    if (placingType) { placeAt(e.latlng, e.originalEvent && e.originalEvent.shiftKey); return; }
    deselect();
  }

  function focusLabel() {
    var el = $('f-label');
    if (el) el.focus();
  }

  // ----------------------------------------------------------- editing

  function deleteSelected() {
    if (!selectedId) return;
    var id = selectedId;
    selectedId = null;
    removeLayer(id);
    state.items = state.items.filter(function (i) { return i.id !== id; });
    refreshKmLabels();
    commit();
    renderLayerbar();
    renderInspector();
  }

  function duplicateSelected() {
    var item = findItem(selectedId);
    if (!item) return;
    var copy = JSON.parse(JSON.stringify(item));
    copy.id = newId();
    var shift = function (p) { return geo.offset(p, 4, -4); };
    if (copy.latlng) copy.latlng = shift(copy.latlng);
    if (copy.center) copy.center = shift(copy.center);
    if (copy.latlngs) copy.latlngs = copy.latlngs.map(shift);
    state.items.push(copy);
    var prev = selectedId;
    selectedId = copy.id;
    rerender(prev);
    addLayer(copy);
    commit();
    renderLayerbar();
    renderInspector();
  }

  function rotateSelected(deg) {
    var item = findItem(selectedId);
    if (!item || TYPES[item.type].kind !== 'rect') return;
    item.rotation = (((item.rotation || 0) + deg) % 360 + 360) % 360;
    rerender(item.id);
    commit();
    renderInspector();
  }

  // ----------------------------------------------------------- history

  function snapshot() {
    return JSON.stringify({ meta: state.meta, items: state.items, hidden: state.hidden });
  }

  function commit() {
    var snap = snapshot();
    if (history[historyIndex] === snap) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    if (history.length > 150) history.shift();
    historyIndex = history.length - 1;
    updateUndoButtons();
    autosave();
  }

  function restore(snap) {
    var s = JSON.parse(snap);
    state.meta = s.meta;
    state.items = s.items;
    state.hidden = s.hidden || {};
    if (selectedId && !findItem(selectedId)) selectedId = null;
    renderAll();
    renderInspector();
    renderTitle();
    autosave();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restore(history[historyIndex]);
    updateUndoButtons();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    restore(history[historyIndex]);
    updateUndoButtons();
  }

  function updateUndoButtons() {
    $('undo-btn').disabled = historyIndex <= 0;
    $('redo-btn').disabled = historyIndex >= history.length - 1;
  }

  function resetHistory() {
    history = [];
    historyIndex = -1;
    commit();
  }

  // -------------------------------------------------------- swatches

  function swatch(type, color) {
    color = color || type.color;
    if (type.kind === 'point') {
      var g = type.glyph || '';
      var fs = g.length <= 1 ? 11 : g.length === 2 ? 9 : 7;
      return '<span class="sw sw-pt" style="background:' + color + ';font-size:' + fs + 'px">' + esc(g) + '</span>';
    }
    if (type.kind === 'rect') {
      return '<span class="sw sw-rect" style="background:' + color + '"></span>';
    }
    if (type.kind === 'line') {
      return '<svg class="sw" width="28" height="12" viewBox="0 0 28 12"><line x1="2" y1="6" x2="26" y2="6" stroke="' +
        color + '" stroke-width="' + Math.min(type.weight || 3, 5) + '" stroke-linecap="round"' +
        (type.dashArray ? ' stroke-dasharray="' + type.dashArray + '"' : '') + '/></svg>';
    }
    return '<span class="sw sw-area" style="border-color:' + color + ';background:' + color + '40' +
      (type.id === 'restricted' ? ';border-style:dashed' : '') + '"></span>';
  }

  function kindHint(type) {
    if (type.kind === 'rect') return type.width + ' x ' + type.length + ' m';
    if (type.kind === 'line') return 'draw line';
    if (type.kind === 'area') return 'draw area';
    return '';
  }

  // ----------------------------------------------------------- library

  function renderLibrary() {
    var filter = $('library-filter').value.trim().toLowerCase();
    var html = '';
    SMC.CATEGORIES.forEach(function (c) {
      var types = SMC.TYPES.filter(function (t) {
        return t.category === c.id && (!filter || t.name.toLowerCase().indexOf(filter) !== -1);
      });
      if (!types.length) return;
      html += '<div class="lib-cat">' + esc(c.name) + '</div>';
      types.forEach(function (t) {
        html += '<button class="lib-item" data-type="' + t.id + '">' + swatch(t) +
          '<span class="lib-name">' + esc(t.name) + '</span><span class="lib-hint">' + kindHint(t) + '</span></button>';
      });
    });
    $('library-list').innerHTML = html || '<p class="muted">No items match.</p>';
    markActiveLibraryItem();
  }

  function markActiveLibraryItem() {
    var btns = document.querySelectorAll('.lib-item');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-type') === placingType);
    }
  }

  // ---------------------------------------------------------- layerbar

  function renderLayerbar() {
    var counts = {};
    state.items.forEach(function (i) {
      var c = TYPES[i.type].category;
      counts[c] = (counts[c] || 0) + 1;
    });
    var html = '<span class="lb-title">Layers</span>';
    SMC.CATEGORIES.forEach(function (c) {
      html += '<label class="check"><input type="checkbox" data-cat="' + c.id + '"' +
        (state.hidden[c.id] ? '' : ' checked') + '> ' + esc(c.name) +
        ' <span class="count">' + (counts[c.id] || 0) + '</span></label>';
    });
    $('layerbar').innerHTML = html;
  }

  // --------------------------------------------------------- inspector

  function renderInspector() {
    var body = $('inspector-body');
    var item = findItem(selectedId);
    if (viewMode) { body.innerHTML = item ? viewItemHtml(item) : viewOverviewHtml(); return; }
    if (!item) { body.innerHTML = overviewHtml(); return; }

    var type = TYPES[item.type];
    var sameKind = SMC.TYPES.filter(function (t) { return t.kind === type.kind; });
    var html = '<div class="insp-head">' + swatch(type, itemColor(item)) + '<div><div class="insp-type">' +
      esc(type.name) + '</div><div class="muted">' + esc(categoryName(type.category)) + '</div></div></div>';

    html += field('Label', '<input id="f-label" value="' + esc(item.label) + '" placeholder="e.g. Registration">');
    html += '<label class="check"><input id="f-showlabel" type="checkbox"' + (item.showLabel !== false ? ' checked' : '') +
      '> Show label on map</label>';

    html += field('Type', '<select id="f-type">' + sameKind.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === item.type ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('') + '</select>');

    if (type.kind === 'rect') {
      html += '<div class="row">' +
        field('Width (m)', '<input id="f-width" type="number" min="0.5" step="0.5" value="' + item.width + '">') +
        field('Length (m)', '<input id="f-length" type="number" min="0.5" step="0.5" value="' + item.length + '">') +
        '</div>';
      html += field('Rotation (°)', '<div class="rot"><input id="f-rot-range" type="range" min="0" max="359" value="' +
        Math.round(item.rotation || 0) + '"><input id="f-rotation" type="number" min="0" max="359" value="' +
        Math.round(item.rotation || 0) + '"></div>');
      html += '<p class="muted small">Drag the shape to move it. Use [ and ] to rotate in 15° steps.</p>';
    }

    html += field('Colour', '<div class="colour"><input id="f-color" type="color" value="' + itemColor(item) +
      '"><button id="f-color-reset" class="link">Reset to default</button></div>');

    if (type.category === 'aid' && type.kind === 'point') html += aidDetailsHtml(item, type);

    html += '<div class="facts">' + factsHtml(item) + '</div>';
    html += courseHtml(item);

    if ((type.kind === 'line' || type.kind === 'area') && item.latlngs.length > MAX_EDITABLE_VERTICES) {
      html += '<p class="muted small">This shape has ' + item.latlngs.length +
        ' points, too many to edit by hand. Edit the GPX and re-import instead.</p>';
    } else if (type.kind === 'line' || type.kind === 'area') {
      html += '<p class="muted small">Drag the white handles to reshape. Right-click a handle to remove it.</p>';
    }

    html += field('Notes', '<textarea id="f-notes" rows="4" placeholder="Supplier, setup time, contact…">' +
      esc(item.notes) + '</textarea>');

    html += '<div class="insp-actions"><button id="f-duplicate">Duplicate</button>' +
      '<button id="f-delete" class="danger">Delete</button></div>';

    body.innerHTML = html;
    bindInspector(item);
  }

  function aidDetailsHtml(item, type) {
    var html = '<div class="row">' +
      field('Lead / contact', '<input id="f-lead" value="' + esc(item.lead || '') + '" placeholder="Name, mobile">') +
      field('Cut-off', '<input id="f-cutoff" value="' + esc(item.cutoff || '') + '" placeholder="e.g. 11:30 am">') +
      '</div>';
    if (type.aidDetails) {
      var have = item.services || [];
      html += '<div class="field"><span>Services</span><div class="services">' + SMC.AID_SERVICES.map(function (sv) {
        return '<label class="check"><input type="checkbox" data-service="' + esc(sv) + '"' +
          (have.indexOf(sv) !== -1 ? ' checked' : '') + '> ' + esc(sv) + '</label>';
      }).join('') + '</div></div>';
    }
    return html;
  }

  // Where this item sits along each course, with the option to show it in the label.
  function courseHtml(item) {
    var kind = TYPES[item.type].kind;
    if (kind !== 'point' && kind !== 'rect') return '';
    var all = SMC.reports.distancesFor(item, state.items);
    if (!all.length) {
      var hasCourse = state.items.some(function (i) { return i.type === 'course-line'; });
      return hasCourse ? '<p class="muted small">Not on a course (more than ' + SMC.ON_COURSE_METRES + ' m away).</p>' : '';
    }
    var html = '<div class="pp-heading">On course</div><div class="facts on-course">' + all.map(function (d) {
      return '<div><span class="muted">' + esc(d.courseName) + '</span><span>' +
        d.kms.map(function (m) { return (m / 1000).toFixed(1); }).join(' / ') + ' km</span></div>';
    }).join('') + '</div>';
    html += '<label class="check"><input id="f-showkm" type="checkbox"' + (item.showKm ? ' checked' : '') +
      '> Show km on the map label</label>';
    if (all.length > 1) {
      var ref = courseDistance(item);
      html += field('Km label uses', '<select id="f-courseref">' + all.map(function (d) {
        return '<option value="' + d.course.id + '"' + (d.course.id === ref.course.id ? ' selected' : '') + '>' +
          esc(d.courseName) + '</option>';
      }).join('') + '</select>');
    }
    return html;
  }

  function field(label, control) {
    return '<label class="field"><span>' + label + '</span>' + control + '</label>';
  }

  function categoryName(id) {
    for (var i = 0; i < SMC.CATEGORIES.length; i++) if (SMC.CATEGORIES[i].id === id) return SMC.CATEGORIES[i].name;
    return id;
  }

  function fmtCoord(p) {
    return p[0].toFixed(5) + ', ' + p[1].toFixed(5);
  }

  function factsHtml(item) {
    var kind = TYPES[item.type].kind;
    var rows = [];
    if (kind === 'point') rows.push(['Location', fmtCoord(item.latlng)]);
    if (kind === 'rect') {
      rows.push(['Footprint', geo.formatArea(item.width * item.length)]);
      rows.push(['Centre', fmtCoord(item.center)]);
    }
    if (kind === 'line') rows.push(['Length', geo.formatLength(geo.lineLength(item.latlngs))]);
    if (kind === 'area') {
      var ring = item.latlngs.concat([item.latlngs[0]]);
      rows.push(['Area', geo.formatArea(geo.polygonArea(item.latlngs))]);
      rows.push(['Perimeter', geo.formatLength(geo.lineLength(ring))]);
      rows.push(['Centre', fmtCoord(geo.centroid(item.latlngs))]);
    }
    return rows.map(function (r) {
      return '<div><span class="muted">' + r[0] + '</span><span>' + r[1] + '</span></div>';
    }).join('');
  }

  function bindInspector(item) {
    var on = function (id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); };

    on('f-label', 'input', function (e) { item.label = e.target.value; rerender(item.id); });
    if (item.type === 'course-line') on('f-label', 'change', refreshKmLabels);
    on('f-label', 'change', commit);
    on('f-showlabel', 'change', function (e) { item.showLabel = e.target.checked; rerender(item.id); commit(); });
    on('f-type', 'change', function (e) {
      var t = TYPES[e.target.value];
      item.type = t.id;
      if (t.kind === 'rect') { item.width = t.width; item.length = t.length; }
      rerender(item.id);
      refreshKmLabels();
      commit();
      renderLayerbar();
      renderInspector();
    });
    on('f-notes', 'change', function (e) { item.notes = e.target.value; commit(); });

    function setNum(key, min) {
      return function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < min) return;
        item[key] = v;
        rerender(item.id);
        var facts = document.querySelector('#inspector .facts');
        if (facts) facts.innerHTML = factsHtml(item);
      };
    }
    on('f-width', 'input', setNum('width', 0.5));
    on('f-length', 'input', setNum('length', 0.5));
    on('f-width', 'change', commit);
    on('f-length', 'change', commit);
    on('f-rot-range', 'input', function (e) {
      $('f-rotation').value = e.target.value;
      setNum('rotation', 0)(e);
    });
    on('f-rotation', 'input', function (e) {
      $('f-rot-range').value = e.target.value;
      setNum('rotation', 0)(e);
    });
    on('f-rot-range', 'change', commit);
    on('f-rotation', 'change', commit);

    on('f-color', 'input', function (e) { item.color = e.target.value; rerender(item.id); });
    on('f-color', 'change', commit);
    on('f-color-reset', 'click', function () {
      delete item.color;
      rerender(item.id);
      commit();
      renderInspector();
    });

    on('f-lead', 'change', function (e) { item.lead = e.target.value.trim(); commit(); });
    on('f-cutoff', 'change', function (e) { item.cutoff = e.target.value.trim(); commit(); });
    var services = document.querySelectorAll('#inspector [data-service]');
    Array.prototype.forEach.call(services, function (cb) {
      cb.addEventListener('change', function () {
        item.services = Array.prototype.filter.call(services, function (c) { return c.checked; })
          .map(function (c) { return c.getAttribute('data-service'); });
        commit();
      });
    });

    on('f-showkm', 'change', function (e) { item.showKm = e.target.checked; rerender(item.id); commit(); });
    on('f-courseref', 'change', function (e) { item.courseRef = e.target.value; rerender(item.id); commit(); });

    on('f-duplicate', 'click', duplicateSelected);
    on('f-delete', 'click', deleteSelected);
  }

  function overviewHtml() {
    var html = '<div class="insp-type">Nothing selected</div>' +
      '<p class="muted small">Pick an item from the library on the left, then click the map to place it. ' +
      'Click anything on the map to edit it.</p>';
    html += '<button id="o-event" class="wide">Edit event details</button>';

    if (!state.items.length) {
      html += '<div class="steps"><div class="pp-heading">Getting started</div><ol>' +
        '<li>Search for your venue at the top.</li>' +
        '<li>Choose imagery. Vicmap and NSW Imagery are sharpest in their states.</li>' +
        '<li>Import your course GPX, or a whole Google My Maps map, from the File menu.</li>' +
        '<li>Lay out marquees, toilets, aid stations and safety points.</li>' +
        '<li>Open Print layout to make the permit map.</li></ol></div>';
      return html;
    }

    html += '<button id="o-fit" class="wide">Zoom to everything</button>';
    html += '<div class="pp-heading" style="margin-top:14px">On this map</div>';
    SMC.CATEGORIES.forEach(function (c) {
      var items = state.items.filter(function (i) { return TYPES[i.type].category === c.id; });
      if (!items.length) return;
      html += '<div class="ov-cat">' + esc(c.name) + '</div>';
      items.forEach(function (i) {
        var t = TYPES[i.type];
        html += '<button class="ov-item" data-id="' + i.id + '">' + swatch(t, itemColor(i)) +
          '<span>' + esc(i.label || t.name) + '</span></button>';
      });
    });
    return html;
  }

  function focusItem(id) {
    var item = findItem(id);
    if (!item) return;
    var cat = TYPES[item.type].category;
    if (state.hidden[cat]) { state.hidden[cat] = false; applyLayerVisibility(); renderLayerbar(); }
    var layer = layers[id];
    if (layer.getBounds) map.fitBounds(layer.getBounds(), { maxZoom: 19, padding: [60, 60] });
    else map.setView(layer.getLatLng(), Math.max(map.getZoom(), 18));
    select(id);
  }

  function fitAll() {
    var b = L.latLngBounds([]);
    Object.keys(layers).forEach(function (id) {
      var l = layers[id];
      b.extend(l.getBounds ? l.getBounds() : l.getLatLng());
    });
    if (b.isValid()) map.fitBounds(b, { maxZoom: 19, padding: [40, 40] });
  }

  // ------------------------------------------------------------ event

  function renderTitle() {
    $('event-title').textContent = state.meta.name || 'Untitled event';
    document.title = (state.meta.name ? state.meta.name + ' · ' : '') + 'Site Map Creator';
  }

  function openEventDialog() {
    var form = $('event-form');
    Object.keys(defaultMeta()).forEach(function (k) {
      if (form.elements[k]) form.elements[k].value = state.meta[k] || '';
    });
    $('event-dialog').showModal();
  }

  function onEventDialogClose() {
    if ($('event-dialog').returnValue !== 'ok') return;
    var form = $('event-form');
    Object.keys(defaultMeta()).forEach(function (k) {
      if (form.elements[k]) state.meta[k] = form.elements[k].value.trim();
    });
    renderTitle();
    commit();
    if (printMode) renderPrintPanel();
  }

  // ------------------------------------------------------------- files

  function buildDocument() {
    var c = map.getCenter();
    return {
      app: 'SiteMapCreator',
      version: 1,
      savedAt: new Date().toISOString(),
      meta: state.meta,
      view: { center: [c.lat, c.lng], zoom: map.getZoom(), basemap: state.view.basemap, labels: state.view.labels },
      hidden: state.hidden,
      items: state.items
    };
  }

  function loadDocument(doc, fit) {
    if (!doc || !Array.isArray(doc.items)) throw new Error('This file is not a Site Map Creator map.');
    var items = doc.items.filter(function (i) { return i && TYPES[i.type]; });
    state.meta = Object.assign(defaultMeta(), doc.meta || {});
    state.items = items;
    state.hidden = doc.hidden || {};
    state.view.labels = !!(doc.view && doc.view.labels);
    setBasemap(doc.view && doc.view.basemap);
    selectedId = null;
    renderAll();
    renderInspector();
    renderTitle();
    if (doc.view && doc.view.center) map.setView(doc.view.center, doc.view.zoom);
    else if (fit) fitAll();
    resetHistory();
  }

  function slug(s) {
    return (s || 'site-map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site-map';
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function saveFile() {
    download(slug(state.meta.name) + '.sitemap.json', JSON.stringify(buildDocument(), null, 2), 'application/json');
    status('Map saved to your downloads.');
    setTimeout(function () { if (!placingType) status(''); }, 2500);
  }

  function openFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        loadDocument(JSON.parse(reader.result), true);
      } catch (err) {
        alert('Could not open that file. ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function newMap() {
    if (state.items.length && !confirm('Start a new map? Anything not saved to a file will be lost.')) return;
    loadDocument({ items: [], meta: defaultMeta(), view: { basemap: state.view.basemap } }, false);
  }

  function exportGeoJSON() {
    var lngLat = function (p) { return [p[1], p[0]]; };
    var features = state.items.map(function (i) {
      var t = TYPES[i.type];
      var g;
      if (t.kind === 'point') g = { type: 'Point', coordinates: lngLat(i.latlng) };
      else if (t.kind === 'line') g = { type: 'LineString', coordinates: i.latlngs.map(lngLat) };
      else {
        var ring = t.kind === 'rect' ? geo.rectCorners(i.center, i.width, i.length, i.rotation) : i.latlngs;
        ring = ring.map(lngLat);
        ring.push(ring[0]);
        g = { type: 'Polygon', coordinates: [ring] };
      }
      var props = { type: t.id, typeName: t.name, category: t.category, label: i.label || '', notes: i.notes || '' };
      if (t.kind === 'rect') { props.width_m = i.width; props.length_m = i.length; props.rotation_deg = i.rotation || 0; }
      if (i.color) props.colour = i.color;
      return { type: 'Feature', geometry: g, properties: props };
    });
    download(slug(state.meta.name) + '.geojson',
      JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2), 'application/geo+json');
  }

  // Douglas-Peucker in local metres, so big GPX files stay light to draw.
  function simplify(points, tolerance) {
    if (points.length < 3) return points;
    var lat0 = points[0][0];
    var mx = 111320 * Math.cos(lat0 * Math.PI / 180), my = 111320;
    var xy = points.map(function (p) { return [p[1] * mx, p[0] * my]; });
    var keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    var stack = [[0, points.length - 1]];
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1];
      var ax = xy[a][0], ay = xy[a][1], bx = xy[b][0], by = xy[b][1];
      var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      var maxD = 0, idx = -1;
      for (var i = a + 1; i < b; i++) {
        var t = len2 ? ((xy[i][0] - ax) * dx + (xy[i][1] - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        var px = ax + t * dx - xy[i][0], py = ay + t * dy - xy[i][1];
        var d = px * px + py * py;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (idx !== -1 && maxD > tolerance * tolerance) {
        keep[idx] = 1;
        stack.push([a, idx], [idx, b]);
      }
    }
    return points.filter(function (_, i) { return keep[i]; });
  }

  function importGpx(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var xml = new DOMParser().parseFromString(reader.result, 'application/xml');
      if (xml.getElementsByTagName('parsererror').length) { alert('That GPX file could not be read.'); return; }
      var baseName = file.name.replace(/\.gpx$/i, '');
      var tracks = [];
      var collect = function (parents, ptTag) {
        Array.prototype.forEach.call(parents, function (el) {
          var nameEl = el.getElementsByTagName('name')[0];
          var pts = Array.prototype.map.call(el.getElementsByTagName(ptTag), function (p) {
            return [parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))];
          }).filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); });
          if (pts.length > 1) tracks.push({ name: nameEl ? nameEl.textContent.trim() : baseName, pts: pts });
        });
      };
      collect(xml.getElementsByTagName('trk'), 'trkpt');
      collect(xml.getElementsByTagName('rte'), 'rtept');
      if (!tracks.length) { alert('No tracks or routes found in that GPX file.'); return; }

      var created = [];
      tracks.forEach(function (t) {
        var item = {
          id: newId(), type: 'course-line', label: t.name || baseName, notes: '', showLabel: true,
          latlngs: simplify(t.pts, 2)
        };
        state.items.push(item);
        addLayer(item);
        created.push(item);
      });
      state.hidden.course = false;
      applyLayerVisibility();
      commit();
      renderLayerbar();
      var b = L.latLngBounds([]);
      created.forEach(function (i) { b.extend(layers[i.id].getBounds()); });
      map.fitBounds(b, { padding: [40, 40] });
      select(created[0].id);
      var km = created.map(function (i) { return geo.formatLength(geo.lineLength(i.latlngs)); }).join(', ');
      status('Imported ' + created.length + ' course line' + (created.length > 1 ? 's' : '') + ' (' + km + ').');
      setTimeout(function () { if (!placingType) status(''); }, 4000);
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------ Google My Maps / KML

  var pendingImport = null;

  function openImportDialog() {
    pendingImport = null;
    $('import-step1').hidden = false;
    $('import-step2').hidden = true;
    $('import-go').hidden = true;
    $('import-error').textContent = '';
    $('import-dialog').showModal();
    $('import-url').focus();
  }

  function importError(err) {
    $('import-error').textContent = err.message || String(err);
  }

  function loadImportText(promise, sourceLabel) {
    $('import-error').textContent = 'Loading…';
    promise.then(function (text) {
      var parsed = SMC.kml.parse(text);
      if (!parsed.folders.length) throw new Error('That map has nothing in it to import.');
      pendingImport = parsed;
      showImportFolders(parsed, sourceLabel);
    }).catch(importError);
  }

  function showImportFolders(parsed, sourceLabel) {
    var total = 0;
    var html = parsed.folders.map(function (f, idx) {
      total += f.features.length;
      var counts = {};
      f.features.forEach(function (ft) { counts[ft.type] = (counts[ft.type] || 0) + 1; });
      var summary = Object.keys(counts).map(function (t) {
        return counts[t] + ' x ' + TYPES[t].name.toLowerCase();
      }).join(', ');
      // Folders marked old are left unticked so superseded courses do not come across.
      var old = /\bold\b|archive|unused/i.test(f.name);
      return '<div class="imp-folder"><label class="check"><input type="checkbox" data-folder="' + idx + '"' +
        (old ? '' : ' checked') + '> <b>' + esc(f.name) + '</b></label>' +
        '<div class="muted small">' + esc(summary) + '</div>' +
        '<label class="check small"><input type="checkbox" data-labels="' + idx + '" checked> Show names on map</label></div>';
    }).join('');
    $('import-summary').textContent = (parsed.name ? '"' + parsed.name + '"' : sourceLabel) + ': ' + total +
      ' items in ' + parsed.folders.length + ' folders. Untick anything you do not want.';
    $('import-folders').innerHTML = html;
    $('import-error').textContent = '';
    $('import-step1').hidden = true;
    $('import-step2').hidden = false;
    $('import-go').hidden = false;
  }

  function runImport() {
    var parsed = pendingImport;
    if (!parsed) return;
    var created = [];
    parsed.folders.forEach(function (f, idx) {
      if (!document.querySelector('[data-folder="' + idx + '"]').checked) return;
      var showLabels = document.querySelector('[data-labels="' + idx + '"]').checked;
      f.features.forEach(function (ft) {
        var t = TYPES[ft.type];
        var item = { id: newId(), type: t.id, label: ft.name || '', notes: ft.notes || '', showLabel: showLabels };
        if (ft.kind === 'point') item.latlng = ft.latlng;
        else item.latlngs = ft.kind === 'line' ? simplify(ft.latlngs, 2) : ft.latlngs;
        // Keep the My Maps colour for lines and areas (it often tells courses apart),
        // and for points we could not match to a symbol.
        if (ft.color && (ft.kind !== 'point' || t.id === 'pin')) item.color = ft.color;
        state.items.push(item);
        addLayer(item);
        created.push(item);
      });
    });
    $('import-dialog').close();
    pendingImport = null;
    if (!created.length) return;
    if (!state.meta.name && parsed.name) { state.meta.name = parsed.name; renderTitle(); }
    created.forEach(function (i) { state.hidden[TYPES[i.type].category] = false; });
    applyLayerVisibility();
    refreshKmLabels();
    commit();
    renderLayerbar();
    renderInspector();
    var b = L.latLngBounds([]);
    created.forEach(function (i) {
      var l = layers[i.id];
      b.extend(l.getBounds ? l.getBounds() : l.getLatLng());
    });
    if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
    status('Imported ' + created.length + ' items. Click any item to check its type and details.');
    setTimeout(function () { if (!placingType) status(''); }, 5000);
  }

  // -------------------------------------------------------------- lists

  var listsTab = 'equipment';

  function openLists() {
    renderLists();
    $('lists-dialog').showModal();
  }

  function renderLists() {
    var tabs = document.querySelectorAll('#lists-dialog .tab');
    Array.prototype.forEach.call(tabs, function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === listsTab);
    });
    if (listsTab === 'equipment') {
      $('lists-hint').textContent = 'Counted from the map. Layers you have switched off are not included.';
      $('lists-body').innerHTML = SMC.reports.equipmentHtml(SMC.reports.equipment(state.items, state.hidden));
    } else {
      $('lists-hint').textContent = 'Aid stations, marshals, safety and course points within ' + SMC.ON_COURSE_METRES +
        ' m of each course, in km order. Loop courses list a point once per pass.';
      $('lists-body').innerHTML = SMC.reports.coursePointsHtml(SMC.reports.coursePoints(state.items));
    }
  }

  function listsTitle() {
    return (state.meta.name || 'Site map') + (listsTab === 'equipment' ? ' equipment list' : ' course points');
  }

  function downloadListCsv() {
    var csv = listsTab === 'equipment'
      ? SMC.reports.equipmentCsv(SMC.reports.equipment(state.items, state.hidden))
      : SMC.reports.coursePointsCsv(SMC.reports.coursePoints(state.items));
    download(slug(listsTitle()) + '.csv', csv, 'text/csv');
  }

  function printList() {
    var sub = [state.meta.venue, state.meta.date ? formatDate(state.meta.date) : '', state.meta.revision]
      .filter(Boolean).join(' · ');
    SMC.reports.printHtml(listsTitle(), sub, $('lists-body').innerHTML);
  }

  // ------------------------------------------------------------ search

  function search(q) {
    if (!q) return;
    status('Searching for ' + q + '…');
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=au&q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.length) { status('No place found for "' + q + '". Try adding the town and state.'); return; }
        var bb = res[0].boundingbox.map(parseFloat);
        map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 17 });
        status(res[0].display_name);
        setTimeout(function () { if (!placingType) status(''); }, 4000);
      })
      .catch(function () { status('Search is unavailable right now. Check your connection.'); });
  }

  // ------------------------------------------------------------- print

  function pagePx() {
    var mm = PAPER_MM[$('paper-size').value].slice();
    if ($('paper-orientation').value === 'portrait') mm.reverse();
    // 96 CSS px per inch; trim a pixel so rounding never spills onto a second page.
    return { w: Math.floor(mm[0] / 25.4 * 96) - 1, h: Math.floor(mm[1] / 25.4 * 96) - 1, mm: mm };
  }

  function layoutPage() {
    var page = $('page');
    var size = pagePx();
    var center = map.getCenter(), zoom = map.getZoom();
    page.className = $('paper-orientation').value + ' ' + $('paper-size').value.toLowerCase();
    page.style.width = size.w + 'px';
    page.style.height = size.h + 'px';
    $('page-size').textContent = '@page { size: ' + $('paper-size').value + ' ' +
      $('paper-orientation').value + '; margin: 0; }';
    fitPreview();
    map.invalidateSize({ pan: false });
    map.setView(center, zoom, { animate: false });
  }

  function fitPreview() {
    var page = $('page');
    var stage = $('stage').getBoundingClientRect();
    var w = parseFloat(page.style.width), h = parseFloat(page.style.height);
    var k = Math.min((stage.width - 40) / w, (stage.height - 40) / h, 1);
    page.style.transform = 'scale(' + k + ')';
    page.style.left = Math.max(20, (stage.width - w * k) / 2) + 'px';
    page.style.top = Math.max(20, (stage.height - h * k) / 2) + 'px';
  }

  function renderPrintPanel() {
    var m = state.meta;
    $('pp-title').textContent = m.name || 'Untitled event';
    var sub = [m.subtitle, m.venue, m.date ? formatDate(m.date) : ''].filter(Boolean);
    $('pp-sub').innerHTML = sub.map(esc).join('<br>');
    $('pp-legend').innerHTML = legendHtml();
    $('pp-notes').textContent = m.notes || '';
    $('pp-notes-wrap').style.display = m.notes ? '' : 'none';
    $('pp-north').innerHTML =
      '<svg viewBox="0 0 40 56" width="34" height="48" aria-label="North"><text x="20" y="12" text-anchor="middle" ' +
      'font-size="12" font-weight="700" font-family="inherit">N</text><path d="M20 16 L32 52 L20 44 L8 52 Z" ' +
      'fill="#fff" stroke="#111" stroke-width="1.5"/><path d="M20 16 L20 44 L8 52 Z" fill="#111"/></svg>';
    var rows = [
      ['Organiser', m.organiser], ['Prepared by', m.preparedBy], ['Contact', m.contact],
      ['Revision', m.revision], ['Printed', formatDate(new Date().toISOString().slice(0, 10))]
    ].filter(function (r) { return r[1]; });
    $('pp-block').innerHTML = rows.map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
    }).join('');
    var attrib = [SMC.BASEMAPS[state.view.basemap].attribution];
    if (state.view.labels) attrib.push((state.view.basemap === 'vic' ? SMC.OVERLAYS.vic : SMC.OVERLAYS.esri).attribution);
    $('pp-attrib').innerHTML = attrib.join('. ') + '. Imagery date may not reflect current site conditions.';
  }

  function formatDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // One legend row per type (and per custom colour), counting what is visible.
  function legendHtml() {
    var rows = {}, order = [];
    state.items.forEach(function (i) {
      var t = TYPES[i.type];
      if (state.hidden[t.category]) return;
      var key = i.type + '|' + (i.color || '');
      if (!rows[key]) {
        rows[key] = { type: t, color: itemColor(i), count: 0, labels: [] };
        order.push(key);
      }
      rows[key].count++;
      if (i.label) rows[key].labels.push(i.label);
    });
    if (!order.length) return '<p class="muted">Nothing on the map yet.</p>';
    order.sort(function (a, b) {
      return SMC.TYPES.indexOf(rows[a].type) - SMC.TYPES.indexOf(rows[b].type);
    });
    return order.map(function (key) {
      var r = rows[key];
      var name = r.type.name;
      // Custom-coloured lines (e.g. one per race distance) are named by their label.
      if (r.color !== r.type.color && r.labels.length === 1) name = r.labels[0];
      else if (r.type.kind === 'line' && r.type.id === 'course-line' && r.count === 1 && r.labels.length) name = r.labels[0];
      return '<div class="lg-row">' + swatch(r.type, r.color) + '<span>' + esc(name) + '</span>' +
        (r.count > 1 && r.type.kind !== 'line' && r.type.kind !== 'area' ? '<span class="lg-count">x ' + r.count + '</span>' : '') +
        '</div>';
    }).join('');
  }

  function enterPrint() {
    cancelPlacing();
    deselect();
    printMode = true;
    document.body.classList.add('print-mode');
    renderAll();
    renderPrintPanel();
    layoutPage();
  }

  function exitPrint() {
    var center = map.getCenter(), zoom = map.getZoom();
    printMode = false;
    document.body.classList.remove('print-mode');
    var page = $('page');
    page.className = '';
    ['width', 'height', 'transform', 'left', 'top'].forEach(function (k) { page.style[k] = ''; });
    renderAll();
    map.invalidateSize({ pan: false });
    map.setView(center, zoom, { animate: false });
  }

  // ------------------------------------------------------- share links

  function openShareDialog() {
    if (!SMC.share.supported()) {
      alert('This browser is too old to make share links. Please use an up-to-date Chrome, Edge, Safari or Firefox.');
      return;
    }
    deselect();
    $('share-link').value = 'Making link…';
    $('share-note').textContent = '';
    $('share-copy').textContent = 'Copy link';
    $('share-dialog').showModal();
    SMC.share.linkFor(buildDocument()).then(function (link) {
      $('share-link').value = link;
      var n = link.length;
      $('share-note').textContent = 'Link length: ' + n.toLocaleString() + ' characters. ' +
        (n > 2000 ? 'Fine for email, Slack, WhatsApp, Teams and Google Docs, but too long for a text message.'
          : 'Short enough to send anywhere, including a text message.');
    }).catch(function () {
      $('share-link').value = '';
      $('share-note').textContent = 'Sorry, the link could not be made.';
    });
  }

  function copyShareLink() {
    var box = $('share-link');
    var done = function () { $('share-copy').textContent = 'Copied'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(box.value).then(done, function () { box.select(); document.execCommand('copy'); done(); });
    } else {
      box.select();
      document.execCommand('copy');
      done();
    }
  }

  function enterViewMode(doc) {
    viewMode = true;
    document.body.classList.add('view-mode');
    $('print-back').textContent = 'Back to map';
    $('print-hint').textContent = 'Frame the map, then click Print / Save as PDF and choose "Save as PDF" as the printer.';
    loadDocument(doc, true);
    // The sender framed the map on their screen; on a phone show everything instead.
    if (window.innerWidth < 900) fitAll();
  }

  function editCopy() {
    if (!confirm('Open an editable copy of this map?\n\nIt replaces the map you were last working on in this ' +
      'browser. If you need that one, open it from a saved map file afterwards.')) return;
    var doc = buildDocument();
    viewMode = false;
    document.body.classList.remove('view-mode');
    $('print-back').textContent = 'Back to editing';
    $('print-hint').textContent = 'Pan and zoom the map to frame it. Layers switched off are left off the print.';
    // `history` is the undo stack in this file, so reach the browser's own explicitly.
    window.history.replaceState(null, '', location.pathname + location.search);
    loadDocument(doc, false);
    autosave();
    status('This is now your own copy. Changes are saved in this browser.');
    setTimeout(function () { if (!placingType) status(''); }, 4000);
  }

  function viewOverviewHtml() {
    var m = state.meta;
    var html = '<div class="insp-type">' + esc(m.name || 'Site map') + '</div>';
    var sub = [m.subtitle, m.venue, m.date ? formatDate(m.date) : ''].filter(Boolean);
    if (sub.length) html += '<p class="muted small">' + sub.map(esc).join('<br>') + '</p>';
    html += '<p class="small">Click anything on the map for details. Use the layers along the bottom to show or hide groups.</p>';
    if (m.contact) html += '<div class="facts"><div><span class="muted">Contact on the day</span><span>' + esc(m.contact) + '</span></div></div>';
    if (m.notes) html += '<div class="pp-heading">Notes</div><p class="small pre">' + esc(m.notes) + '</p>';
    html += '<div class="pp-heading" style="margin-top:14px">Legend</div><div class="view-legend">' + legendHtml() + '</div>';
    return html;
  }

  function viewItemHtml(item) {
    var t = TYPES[item.type];
    var html = '<div class="insp-head">' + swatch(t, itemColor(item)) + '<div><div class="insp-type">' +
      esc(item.label || t.name) + '</div><div class="muted">' + esc(item.label ? t.name : categoryName(t.category)) +
      '</div></div></div>';
    var rows = [];
    if (t.kind === 'rect') rows.push(['Size', item.width + ' x ' + item.length + ' m']);
    if (item.lead) rows.push(['Lead / contact', esc(item.lead)]);
    if (item.cutoff) rows.push(['Cut-off', esc(item.cutoff)]);
    if (item.services && item.services.length) rows.push(['Services', esc(item.services.join(', '))]);
    var facts = rows.map(function (r) {
      return '<div><span class="muted">' + r[0] + '</span><span>' + r[1] + '</span></div>';
    }).join('');
    html += '<div class="facts">' + facts + factsHtml(item) + '</div>';
    if (t.kind === 'point' || t.kind === 'rect') {
      var all = SMC.reports.distancesFor(item, state.items);
      if (all.length) {
        html += '<div class="pp-heading">On course</div><div class="facts on-course">' + all.map(function (d) {
          return '<div><span class="muted">' + esc(d.courseName) + '</span><span>' +
            d.kms.map(function (km) { return (km / 1000).toFixed(1); }).join(' / ') + ' km</span></div>';
        }).join('') + '</div>';
      }
    }
    if (item.notes) html += '<div class="pp-heading">Notes</div><p class="small pre">' + esc(item.notes) + '</p>';
    var p = item.latlng || item.center || (item.latlngs && geo.centroid(item.latlngs));
    if (p && t.kind !== 'line') {
      html += '<a class="btn wide" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
        p[0].toFixed(6) + ',' + p[1].toFixed(6) + '">Open in Google Maps</a>';
    }
    return html;
  }

  // ---------------------------------------------------------- autosave

  function autosave() {
    if (viewMode) return;
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildDocument())); } catch (e) { /* storage unavailable */ }
  }

  function loadAutosave() {
    var raw = null;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { /* storage unavailable */ }
    if (!raw) return false;
    try { loadDocument(JSON.parse(raw), false); return true; } catch (e) { return false; }
  }

  // ------------------------------------------------------------ wiring

  function bindUi() {
    var sel = $('basemap-select');
    Object.keys(SMC.BASEMAPS).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = SMC.BASEMAPS[k].name;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { setBasemap(sel.value); autosave(); });
    $('labels-toggle').addEventListener('change', function (e) { setLabels(e.target.checked); autosave(); });

    $('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      search($('search-input').value.trim());
    });

    $('library-filter').addEventListener('input', renderLibrary);
    $('library-list').addEventListener('click', function (e) {
      var btn = e.target.closest('.lib-item');
      if (!btn) return;
      var t = btn.getAttribute('data-type');
      if (placingType === t) cancelPlacing(); else startPlacing(t);
    });

    $('layerbar').addEventListener('change', function (e) {
      var cat = e.target.getAttribute('data-cat');
      if (!cat) return;
      state.hidden[cat] = !e.target.checked;
      var item = findItem(selectedId);
      if (item && TYPES[item.type].category === cat && state.hidden[cat]) deselect();
      applyLayerVisibility();
      commit();
      if (printMode) renderPrintPanel();
    });

    $('inspector-body').addEventListener('click', function (e) {
      var ov = e.target.closest('.ov-item');
      if (ov) focusItem(ov.getAttribute('data-id'));
      if (e.target.id === 'o-event') openEventDialog();
      if (e.target.id === 'o-fit') fitAll();
    });

    $('event-title').addEventListener('click', function () { if (!viewMode) openEventDialog(); });
    $('event-dialog').addEventListener('close', onEventDialogClose);

    $('undo-btn').addEventListener('click', undo);
    $('redo-btn').addEventListener('click', redo);

    var menu = $('file-menu');
    $('file-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', function () { menu.classList.remove('open'); });
    menu.addEventListener('click', function (e) {
      var action = e.target.getAttribute('data-action');
      menu.classList.remove('open');
      if (action === 'new') newMap();
      if (action === 'open') $('open-input').click();
      if (action === 'save') saveFile();
      if (action === 'gpx') $('gpx-input').click();
      if (action === 'mymaps') openImportDialog();
      if (action === 'geojson') exportGeoJSON();
    });
    $('open-input').addEventListener('change', function (e) {
      if (e.target.files[0]) openFile(e.target.files[0]);
      e.target.value = '';
    });
    $('gpx-input').addEventListener('change', function (e) {
      if (e.target.files[0]) importGpx(e.target.files[0]);
      e.target.value = '';
    });

    $('import-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var url = $('import-url').value.trim();
      loadImportText(SMC.kml.fetchMyMaps(url), 'Google My Maps');
    });
    $('import-file-btn').addEventListener('click', function () { $('kml-input').click(); });
    $('kml-input').addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!$('import-dialog').open) openImportDialog();
      loadImportText(SMC.kml.readFile(f), f.name);
    });
    $('import-cancel').addEventListener('click', function () { $('import-dialog').close(); });
    $('import-go').addEventListener('click', runImport);

    $('lists-btn').addEventListener('click', openLists);
    $('lists-close').addEventListener('click', function () { $('lists-dialog').close(); });
    $('lists-csv').addEventListener('click', downloadListCsv);
    $('lists-print').addEventListener('click', printList);
    document.querySelector('#lists-dialog .tabs').addEventListener('click', function (e) {
      var tab = e.target.getAttribute('data-tab');
      if (tab) { listsTab = tab; renderLists(); }
    });

    $('share-btn').addEventListener('click', openShareDialog);
    $('share-copy').addEventListener('click', copyShareLink);
    $('share-close').addEventListener('click', function () { $('share-dialog').close(); });
    $('share-open').addEventListener('click', function () {
      if ($('share-link').value.indexOf('http') === 0) window.open($('share-link').value, '_blank');
    });
    $('edit-copy-btn').addEventListener('click', editCopy);
    $('pdf-btn').addEventListener('click', enterPrint);
    // Pasting a different share link into this tab should show that map.
    window.addEventListener('hashchange', function () {
      if (SMC.share.tokenFromLocation()) location.reload();
    });

    $('print-btn').addEventListener('click', enterPrint);
    $('print-back').addEventListener('click', exitPrint);
    $('print-go').addEventListener('click', function () { window.print(); });
    $('paper-size').addEventListener('change', layoutPage);
    $('paper-orientation').addEventListener('change', layoutPage);
    window.addEventListener('resize', function () { if (printMode) fitPreview(); });

    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    var mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
    if (typing || printMode || document.querySelector('dialog[open]')) return;
    if (viewMode) { if (e.key === 'Escape') deselect(); return; }

    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (e.key === 'Escape') { if (placingType) cancelPlacing(); else deselect(); return; }
    if (e.key === 'Enter') { finishDrawing(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
    if (e.key === '[') rotateSelected(e.shiftKey ? -5 : -15);
    if (e.key === ']') rotateSelected(e.shiftKey ? 5 : 15);
  }

  // -------------------------------------------------------------- init

  function init() {
    bindUi();
    initMap();
    renderLibrary();
    var token = SMC.share.tokenFromLocation();
    if (token) {
      if (!SMC.share.supported()) {
        alert('This browser is too old to open shared maps. Please use an up-to-date Chrome, Edge, Safari or Firefox.');
      } else {
        // Hold the view-only layout from the start so editing tools never flash up.
        viewMode = true;
        document.body.classList.add('view-mode');
        SMC.share.decode(token).then(enterViewMode).catch(function () {
          viewMode = false;
          document.body.classList.remove('view-mode');
          alert('This share link looks incomplete. Ask for the link to be sent again, and make sure all of it was copied.');
          startEditing();
        });
        return;
      }
    }
    startEditing();
  }

  function startEditing() {
    if (!loadAutosave()) {
      renderAll();
      renderInspector();
      renderTitle();
      resetHistory();
    }
  }

  // Exposed for automated checks and console debugging.
  SMC.app = { state: state, select: select, startPlacing: startPlacing, enterPrint: enterPrint,
    exitPrint: exitPrint, loadDocument: loadDocument, buildDocument: buildDocument,
    getMap: function () { return map; } };

  init();
})();
