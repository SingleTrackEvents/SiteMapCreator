/*
 * Lists generated from the map: the equipment list and the course points
 * list (aid stations, marshals and so on, in km order for each course).
 */
window.SMC = window.SMC || {};

SMC.reports = (function () {
  var geo = SMC.geo;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function courses(items) {
    return items.filter(function (i) { return i.type === 'course-line'; });
  }

  function courseName(c, idx) {
    return c.label || 'Course ' + (idx + 1);
  }

  function itemPoint(item) {
    if (item.latlng) return item.latlng;
    if (item.center) return item.center;
    return null;
  }

  // [{ course, courseName, kms: [metres...] }] for every course this item sits on.
  function distancesFor(item, items) {
    var p = itemPoint(item);
    if (!p || item.type === 'course-line') return [];
    var out = [];
    courses(items).forEach(function (c, idx) {
      var kms = geo.alongCourse(p, c.latlngs, SMC.ON_COURSE_METRES);
      if (kms.length) out.push({ course: c, courseName: courseName(c, idx), kms: kms });
    });
    return out;
  }

  // ------------------------------------------------------- equipment

  function equipment(items, hidden) {
    var rows = {};
    var order = [];
    items.forEach(function (i) {
      var t = SMC.TYPE_BY_ID[i.type];
      if (hidden && hidden[t.category]) return;
      if (t.id === 'course-line' || t.id === 'pin' || t.id === 'other-line' || t.id === 'other-area') return;
      var key = t.id + (t.kind === 'rect' ? '|' + i.width + 'x' + i.length : '');
      if (!rows[key]) {
        rows[key] = { type: t, qty: 0, metres: 0, area: 0, size: t.kind === 'rect' ? i.width + ' x ' + i.length + ' m' : '' };
        order.push(key);
      }
      var r = rows[key];
      r.qty++;
      if (t.kind === 'line') r.metres += geo.lineLength(i.latlngs);
      if (t.kind === 'area') r.area += geo.polygonArea(i.latlngs);
    });
    var cats = SMC.CATEGORIES.map(function (c) {
      var list = order.filter(function (k) { return rows[k].type.category === c.id; }).map(function (k) {
        var r = rows[k];
        var name = r.type.kind === 'rect' && r.size && r.type.name.indexOf(' x ') === -1 ? r.type.name + ' (' + r.size + ')' : r.type.name;
        var qty;
        if (r.type.kind === 'line') qty = Math.round(r.metres) + ' m';
        else if (r.type.kind === 'area') qty = r.qty + (r.qty > 1 ? ' areas, ' : ' area, ') + geo.formatArea(r.area);
        else qty = String(r.qty);
        return { name: name, qty: qty, sort: SMC.TYPES.indexOf(r.type) };
      }).sort(function (a, b) { return a.sort - b.sort; });
      return { name: c.name, rows: list };
    }).filter(function (c) { return c.rows.length; });
    return cats;
  }

  function equipmentHtml(cats) {
    if (!cats.length) return '<p class="muted">Nothing on the map to count yet.</p>';
    return '<table class="report"><thead><tr><th>Item</th><th class="num">Quantity</th></tr></thead>' +
      cats.map(function (c) {
        return '<tbody><tr class="group"><th colspan="2">' + esc(c.name) + '</th></tr>' +
          c.rows.map(function (r) {
            return '<tr><td>' + esc(r.name) + '</td><td class="num">' + esc(r.qty) + '</td></tr>';
          }).join('') + '</tbody>';
      }).join('') + '</table>';
  }

  function equipmentCsv(cats) {
    var lines = [['Category', 'Item', 'Quantity']];
    cats.forEach(function (c) { c.rows.forEach(function (r) { lines.push([c.name, r.name, r.qty]); }); });
    return toCsv(lines);
  }

  // --------------------------------------------------- course points

  var COURSE_POINT_CATEGORIES = { aid: true, safety: true };
  var COURSE_POINT_TYPES = { start: true, finish: true, 'start-finish': true, 'km-marker': true, 'road-crossing': true, gate: true };

  function coursePoints(items) {
    return courses(items).map(function (c, idx) {
      var rows = [];
      items.forEach(function (i) {
        var t = SMC.TYPE_BY_ID[i.type];
        if (t.kind !== 'point') return;
        if (!COURSE_POINT_CATEGORIES[t.category] && !COURSE_POINT_TYPES[t.id]) return;
        geo.alongCourse(i.latlng, c.latlngs, SMC.ON_COURSE_METRES).forEach(function (m) {
          rows.push({
            km: m,
            name: i.label || t.name,
            type: t.name,
            lead: i.lead || '',
            cutoff: i.cutoff || '',
            services: (i.services || []).join(', ')
          });
        });
      });
      rows.sort(function (a, b) { return a.km - b.km; });
      return { name: courseName(c, idx), length: geo.lineLength(c.latlngs), rows: rows };
    });
  }

  function coursePointsHtml(list) {
    if (!list.length) return '<p class="muted">Add or import a course line first. Points within ' +
      SMC.ON_COURSE_METRES + ' m of a course are listed in km order.</p>';
    return list.map(function (c) {
      var body = c.rows.length ? c.rows.map(function (r) {
        return '<tr><td class="num">' + (r.km / 1000).toFixed(1) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.type) +
          '</td><td>' + esc(r.lead) + '</td><td>' + esc(r.cutoff) + '</td><td>' + esc(r.services) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="muted">No points on this course yet.</td></tr>';
      return '<h3>' + esc(c.name) + ' <span class="muted">' + geo.formatLength(c.length) + '</span></h3>' +
        '<table class="report"><thead><tr><th class="num">Km</th><th>Name</th><th>Type</th><th>Lead</th>' +
        '<th>Cut-off</th><th>Services</th></tr></thead><tbody>' + body + '</tbody></table>';
    }).join('');
  }

  function coursePointsCsv(list) {
    var lines = [['Course', 'Km', 'Name', 'Type', 'Lead', 'Cut-off', 'Services']];
    list.forEach(function (c) {
      c.rows.forEach(function (r) {
        lines.push([c.name, (r.km / 1000).toFixed(1), r.name, r.type, r.lead, r.cutoff, r.services]);
      });
    });
    return toCsv(lines);
  }

  // ------------------------------------------------------------ output

  function toCsv(lines) {
    return lines.map(function (l) {
      return l.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');
  }

  function printHtml(title, subtitle, html) {
    var w = window.open('', '_blank');
    if (!w) { alert('Your browser blocked the print window. Allow pop-ups for this site and try again.'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:24px;font-size:12px}' +
      'h1{font-size:20px;margin:0 0 2px}h3{font-size:14px;margin:18px 0 6px}.sub{color:#555;margin-bottom:12px}' +
      'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}' +
      'thead th{background:#eee}tr.group th{background:#f6f5f0}.num{text-align:right;white-space:nowrap}.muted{color:#666;font-weight:400}' +
      '</style></head><body><h1>' + esc(title) + '</h1><div class="sub">' + esc(subtitle) + '</div>' + html +
      '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }

  return {
    distancesFor: distancesFor,
    equipment: equipment,
    equipmentHtml: equipmentHtml,
    equipmentCsv: equipmentCsv,
    coursePoints: coursePoints,
    coursePointsHtml: coursePointsHtml,
    coursePointsCsv: coursePointsCsv,
    printHtml: printHtml
  };
})();
