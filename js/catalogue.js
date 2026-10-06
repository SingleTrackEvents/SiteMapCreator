/*
 * Item catalogue: everything that can be placed on a site map.
 *
 * kind:
 *   point  a symbol at a location (aid station, toilets, first aid)
 *   rect   a to-scale footprint in metres (marquees, stage, containers)
 *   line   a drawn line (course, fencing, emergency access route)
 *   area   a drawn polygon (event village, parking, restricted area)
 *
 * category decides which layer the item sits on.
 */
window.SMC = window.SMC || {};

SMC.CATEGORIES = [
  { id: 'course', name: 'Course' },
  { id: 'village', name: 'Event village' },
  { id: 'aid', name: 'Aid stations and marshals' },
  { id: 'safety', name: 'Safety and emergency' },
  { id: 'access', name: 'Access and parking' },
  { id: 'other', name: 'Other' }
];

SMC.TYPES = [
  // Course
  { id: 'course-line', name: 'Course route', category: 'course', kind: 'line', color: '#ff6a13', weight: 5 },
  { id: 'start-finish', name: 'Start / finish', category: 'course', kind: 'point', color: '#111111', glyph: 'S/F', size: 34 },
  { id: 'start', name: 'Start', category: 'course', kind: 'point', color: '#1a8f3c', glyph: 'S' },
  { id: 'finish', name: 'Finish', category: 'course', kind: 'point', color: '#111111', glyph: 'F' },
  { id: 'arch', name: 'Inflatable arch', category: 'course', kind: 'rect', color: '#ff6a13', width: 8, length: 1.5 },
  { id: 'km-marker', name: 'Km marker', category: 'course', kind: 'point', color: '#ff6a13', glyph: 'KM' },
  { id: 'course-sign', name: 'Course sign', category: 'course', kind: 'point', color: '#e0a400', glyph: 'SG' },
  { id: 'road-crossing', name: 'Road crossing', category: 'course', kind: 'point', color: '#c2185b', glyph: 'RX' },
  { id: 'gate', name: 'Gate', category: 'course', kind: 'point', color: '#6d4c41', glyph: 'GT' },
  { id: 'finish-chute', name: 'Finish chute', category: 'course', kind: 'area', color: '#ff6a13' },

  // Event village
  { id: 'village-zone', name: 'Event village zone', category: 'village', kind: 'area', color: '#f2c94c' },
  { id: 'marquee-3x3', name: 'Marquee 3 x 3', category: 'village', kind: 'rect', color: '#ffffff', width: 3, length: 3 },
  { id: 'marquee-6x3', name: 'Marquee 6 x 3', category: 'village', kind: 'rect', color: '#ffffff', width: 6, length: 3 },
  { id: 'marquee-6x6', name: 'Marquee 6 x 6', category: 'village', kind: 'rect', color: '#ffffff', width: 6, length: 6 },
  { id: 'marquee-10x10', name: 'Marquee 10 x 10', category: 'village', kind: 'rect', color: '#ffffff', width: 10, length: 10 },
  { id: 'stage', name: 'Stage / podium', category: 'village', kind: 'rect', color: '#7b4fd6', width: 6, length: 4 },
  { id: 'food-van', name: 'Food van', category: 'village', kind: 'rect', color: '#2d9cdb', width: 6, length: 2.5 },
  { id: 'container', name: 'Shipping container', category: 'village', kind: 'rect', color: '#8d6e63', width: 6, length: 2.4 },
  { id: 'toilet-block', name: 'Toilet block', category: 'village', kind: 'rect', color: '#00897b', width: 6, length: 1.5 },
  { id: 'registration', name: 'Registration', category: 'village', kind: 'point', color: '#2f6f4f', glyph: 'R' },
  { id: 'bag-drop', name: 'Bag drop', category: 'village', kind: 'point', color: '#5d4037', glyph: 'BD' },
  { id: 'info', name: 'Information', category: 'village', kind: 'point', color: '#1565c0', glyph: 'i' },
  { id: 'toilets', name: 'Toilets', category: 'village', kind: 'point', color: '#00897b', glyph: 'WC' },
  { id: 'water-refill', name: 'Water refill', category: 'village', kind: 'point', color: '#0288d1', glyph: 'W' },
  { id: 'bins', name: 'Bins / waste', category: 'village', kind: 'point', color: '#546e7a', glyph: 'B' },
  { id: 'generator', name: 'Generator', category: 'village', kind: 'point', color: '#f57c00', glyph: 'G' },
  { id: 'pa', name: 'PA / sound', category: 'village', kind: 'point', color: '#7b4fd6', glyph: 'PA' },
  { id: 'fencing', name: 'Fencing', category: 'village', kind: 'line', color: '#37474f', weight: 3, dashArray: '8 5' },
  { id: 'barrier', name: 'Crowd barrier', category: 'village', kind: 'line', color: '#90a4ae', weight: 4 },
  { id: 'bunting', name: 'Bunting / tape', category: 'village', kind: 'line', color: '#fdd835', weight: 2, dashArray: '2 4' },

  // Aid stations and marshals
  { id: 'aid-station', name: 'Aid station', category: 'aid', kind: 'point', color: '#d32f2f', glyph: 'AS', size: 32, aidDetails: true },
  { id: 'water-station', name: 'Water only station', category: 'aid', kind: 'point', color: '#0288d1', glyph: 'WS', aidDetails: true },
  { id: 'timing', name: 'Timing point', category: 'aid', kind: 'point', color: '#f9a825', glyph: 'T' },
  { id: 'marshal', name: 'Marshal point', category: 'aid', kind: 'point', color: '#ef6c00', glyph: 'M' },
  { id: 'crew-access', name: 'Crew access point', category: 'aid', kind: 'point', color: '#6a1b9a', glyph: 'CR' },
  { id: 'cut-off', name: 'Cut-off point', category: 'aid', kind: 'point', color: '#b71c1c', glyph: 'CO' },

  // Safety and emergency
  { id: 'first-aid', name: 'First aid', category: 'safety', kind: 'point', color: '#d50000', glyph: '+', size: 30 },
  { id: 'aed', name: 'Defibrillator (AED)', category: 'safety', kind: 'point', color: '#2e7d32', glyph: 'AED' },
  { id: 'ambulance', name: 'Ambulance standby', category: 'safety', kind: 'point', color: '#d50000', glyph: 'AMB' },
  { id: 'evac-point', name: 'Evacuation assembly point', category: 'safety', kind: 'point', color: '#2e7d32', glyph: 'EV' },
  { id: 'helipad', name: 'Helicopter landing zone', category: 'safety', kind: 'point', color: '#0d47a1', glyph: 'H', size: 32 },
  { id: 'fire-ext', name: 'Fire extinguisher', category: 'safety', kind: 'point', color: '#c62828', glyph: 'FE' },
  { id: 'emergency-route', name: 'Emergency vehicle route', category: 'safety', kind: 'line', color: '#d50000', weight: 4, dashArray: '10 6' },
  { id: 'restricted', name: 'Restricted / no access', category: 'safety', kind: 'area', color: '#d50000' },

  // Access and parking
  { id: 'parking', name: 'Parking', category: 'access', kind: 'area', color: '#1e88e5' },
  { id: 'spectator', name: 'Spectator area', category: 'access', kind: 'area', color: '#43a047' },
  { id: 'vehicle-route', name: 'Vehicle route', category: 'access', kind: 'line', color: '#1e88e5', weight: 4 },
  { id: 'pedestrian-route', name: 'Pedestrian route', category: 'access', kind: 'line', color: '#43a047', weight: 3, dashArray: '6 6' },
  { id: 'road-closure', name: 'Road closure', category: 'access', kind: 'point', color: '#c62828', glyph: 'RC' },
  { id: 'traffic-control', name: 'Traffic controller', category: 'access', kind: 'point', color: '#ef6c00', glyph: 'TC' },
  { id: 'shuttle', name: 'Shuttle / bus stop', category: 'access', kind: 'point', color: '#1e88e5', glyph: 'BUS' },
  { id: 'parking-point', name: 'Parking entry', category: 'access', kind: 'point', color: '#1e88e5', glyph: 'P' },

  // Other: catch-alls, mostly for things brought in from Google My Maps
  { id: 'pin', name: 'Map pin', category: 'other', kind: 'point', color: '#455a64', glyph: '•' },
  { id: 'other-line', name: 'Other line', category: 'other', kind: 'line', color: '#455a64', weight: 3 },
  { id: 'other-area', name: 'Other area', category: 'other', kind: 'area', color: '#455a64' }
];

// Services an aid station can offer (shown as checkboxes).
SMC.AID_SERVICES = ['Water', 'Electrolyte', 'Food', 'Hot food', 'Medical', 'Drop bags', 'Crew access', 'Toilets'];

// Course points within this distance of a course line get a km distance.
SMC.ON_COURSE_METRES = 100;

SMC.TYPE_BY_ID = {};
SMC.TYPES.forEach(function (t) { SMC.TYPE_BY_ID[t.id] = t; });

SMC.BASEMAPS = {
  vic: {
    name: 'Vicmap Aerial (VIC)',
    url: 'https://base.maps.vic.gov.au/wmts/AERIAL_WM_256/EPSG:3857:256/{z}/{x}/{y}.png',
    maxNativeZoom: 20,
    attribution: 'Imagery &copy; State of Victoria (Vicmap)'
  },
  nsw: {
    name: 'NSW Imagery (NSW)',
    url: 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    attribution: 'Imagery &copy; Spatial Services NSW'
  },
  esri: {
    name: 'Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    // Regional Australia often has no Esri imagery past zoom 18.
    maxNativeZoom: 18,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
  },
  osm: {
    name: 'Street map (OpenStreetMap)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }
};

SMC.OVERLAYS = {
  vic: {
    url: 'https://base.maps.vic.gov.au/wmts/CARTO_OVERLAY_WM_256/EPSG:3857:256/{z}/{x}/{y}.png',
    maxNativeZoom: 20,
    attribution: 'Labels &copy; State of Victoria (Vicmap)'
  },
  esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    attribution: 'Labels &copy; Esri'
  }
};
