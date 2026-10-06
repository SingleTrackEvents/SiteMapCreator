/*
 * Small geometry helpers. Distances are good to well under a metre at
 * event-site scale, which is all a site map needs.
 */
window.SMC = window.SMC || {};

SMC.geo = (function () {
  var M_PER_DEG_LAT = 111320;

  function metresPerDegLng(lat) {
    return M_PER_DEG_LAT * Math.cos(lat * Math.PI / 180);
  }

  // Offset a [lat, lng] by dx metres east and dy metres north.
  function offset(center, dx, dy) {
    return [
      center[0] + dy / M_PER_DEG_LAT,
      center[1] + dx / metresPerDegLng(center[0])
    ];
  }

  // Corners of a width x length rectangle centred on center, rotated
  // clockwise by rotation degrees. Width runs east-west before rotation.
  function rectCorners(center, width, length, rotation) {
    var a = (rotation || 0) * Math.PI / 180;
    var cos = Math.cos(a), sin = Math.sin(a);
    var hw = width / 2, hl = length / 2;
    return [[-hw, hl], [hw, hl], [hw, -hl], [-hw, -hl]].map(function (p) {
      // Clockwise rotation in a north-up east-right frame.
      var x = p[0] * cos + p[1] * sin;
      var y = -p[0] * sin + p[1] * cos;
      return offset(center, x, y);
    });
  }

  function distance(a, b) {
    var lat = (a[0] + b[0]) / 2;
    var dx = (b[1] - a[1]) * metresPerDegLng(lat);
    var dy = (b[0] - a[0]) * M_PER_DEG_LAT;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lineLength(latlngs) {
    var total = 0;
    for (var i = 1; i < latlngs.length; i++) total += distance(latlngs[i - 1], latlngs[i]);
    return total;
  }

  function polygonArea(latlngs) {
    if (latlngs.length < 3) return 0;
    var lat0 = latlngs[0][0], lng0 = latlngs[0][1];
    var mx = metresPerDegLng(lat0);
    var pts = latlngs.map(function (p) {
      return [(p[1] - lng0) * mx, (p[0] - lat0) * M_PER_DEG_LAT];
    });
    var sum = 0;
    for (var i = 0; i < pts.length; i++) {
      var j = (i + 1) % pts.length;
      sum += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    return Math.abs(sum) / 2;
  }

  function centroid(latlngs) {
    var lat = 0, lng = 0;
    latlngs.forEach(function (p) { lat += p[0]; lng += p[1]; });
    return [lat / latlngs.length, lng / latlngs.length];
  }

  // Where a point sits along a course line. Returns the distance from the
  // start (metres) for each pass within `threshold` metres of the line, so
  // a loop course run twice gives two values.
  function alongCourse(point, latlngs, threshold) {
    if (latlngs.length < 2) return [];
    var lat0 = point[0];
    var mx = metresPerDegLng(lat0), my = M_PER_DEG_LAT;
    var px = point[1] * mx, py = point[0] * my;
    var hits = [];
    var run = 0;
    for (var i = 1; i < latlngs.length; i++) {
      var ax = latlngs[i - 1][1] * mx, ay = latlngs[i - 1][0] * my;
      var bx = latlngs[i][1] * mx, by = latlngs[i][0] * my;
      var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
      var t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      var ex = ax + t * dx - px, ey = ay + t * dy - py;
      var d = Math.sqrt(ex * ex + ey * ey);
      if (d <= threshold) hits.push({ along: run + t * len, d: d });
      run += len;
    }
    // Group hits into separate passes (more than 300 m apart along the line)
    // and keep the closest hit in each.
    var passes = [];
    hits.forEach(function (h) {
      var last = passes[passes.length - 1];
      if (last && h.along - last.end < 300) {
        last.end = h.along;
        if (h.d < last.best.d) last.best = h;
      } else {
        passes.push({ end: h.along, best: h });
      }
    });
    return passes.map(function (p) { return p.best.along; });
  }

  function formatKm(m) {
    return (m / 1000).toFixed(1) + ' km';
  }

  function formatLength(m) {
    return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
  }

  function formatArea(m2) {
    return m2 >= 10000 ? (m2 / 10000).toFixed(2) + ' ha' : Math.round(m2).toLocaleString() + ' m²';
  }

  return {
    offset: offset,
    rectCorners: rectCorners,
    distance: distance,
    lineLength: lineLength,
    polygonArea: polygonArea,
    centroid: centroid,
    alongCourse: alongCourse,
    formatKm: formatKm,
    formatLength: formatLength,
    formatArea: formatArea
  };
})();
