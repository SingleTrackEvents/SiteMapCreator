/*
 * First-run guided tour. Highlights each part of the screen in turn with a
 * short explanation. Runs once per browser (remembered in localStorage) and
 * can be replayed from the ? button.
 */
window.SMC = window.SMC || {};

SMC.tour = (function () {
  var SEEN_KEY = { edit: 'smc.tour.edit.v1', view: 'smc.tour.view.v1' };

  var EDIT_STEPS = [
    { title: 'Welcome to Site Map Creator',
      body: 'Plan event villages, aid stations and safety layouts on real satellite imagery, then print a clean map for ' +
        'council and permits. This quick tour shows you around. It takes about a minute.' },
    { target: '#search-form', title: 'Find your venue',
      body: 'Type a place, for example "Pioneer Park Bright", and press Enter. The map jumps straight there.' },
    { target: '#basemap-select', title: 'Choose your imagery',
      body: 'Vicmap Aerial is the sharpest in Victoria and NSW Imagery in NSW. Esri covers everywhere else. Tick Roads to ' +
        'show road names over the top.' },
    { target: '#library', title: 'Add things to the map',
      body: 'Pick an item, then click the map to place it. Marquees, vans and toilet blocks are drawn to real size. ' +
        'Hold Shift to place several. For lines and areas, click each point and press Enter to finish.' },
    { target: '#stage', title: 'Move and edit',
      body: 'Click anything on the map to select it. Drag to move it, and drag the white handles to reshape lines and ' +
        'areas. Use [ and ] to rotate a marquee, and Delete to remove what you have selected.' },
    { target: '#inspector', title: 'Details panel',
      body: 'Give each item a label, notes and a colour. Aid stations get a lead, cut-off and services. You will also ' +
        'see how far along each course a point sits.' },
    { target: '#layerbar', title: 'Layers',
      body: 'Switch groups on and off. Anything you switch off is also left off the print, so one map can make both a ' +
        'council version and a volunteer version.' },
    { target: '#file-btn', title: 'File menu',
      body: 'Start a new map, import a course GPX or a whole Google My Maps map, and save or open map files.' },
    { target: '#cloud-btn', title: 'Cloud maps',
      body: 'Save maps to the SingleTrack cloud so the whole team can open them, and get short share links. ' +
        'No more passing files around. You just need to sign in.' },
    { target: '#cloud-btn', title: 'How to sign in',
      body: 'First time:\n' +
        '1. Click Cloud, then "Sign in or create an account".\n' +
        '2. Click "New here? Create an account".\n' +
        '3. Enter your SingleTrack email, choose a password (at least 8 characters) and type the team join code. ' +
        'Ask the ops team if you don\'t have it.\n\n' +
        'Next time, just enter your email and password and click Sign in. You stay signed in on this computer.',
      action: { label: 'Sign in now', hook: 'signIn' } },
    { target: '#lists-btn', title: 'Lists',
      body: 'An equipment count (marquees, toilets, metres of fencing) and every aid station and marshal in km order for ' +
        'each course. Print them or download a spreadsheet.' },
    { target: '#share-btn', title: 'Share',
      body: 'Get a view-only link for volunteers, crew and suppliers. When you are signed in it is a short link that ' +
        'always shows your latest save.' },
    { target: '#print-btn', title: 'Print layout',
      body: 'Choose A3 or A4, frame the map, and save it as a PDF with a legend, north arrow, scale bar and title block.' },
    { target: '#help-btn', title: 'That\'s it',
      body: 'Your work saves in this browser as you go. Click ? any time to see this tour again. Happy planning!' }
  ];

  var VIEW_STEPS = [
    { title: 'View-only site map',
      body: 'Someone has shared this map with you. You can look around and check details, but you can\'t change it.' },
    { target: '#stage', title: 'Explore the map',
      body: 'Drag to move and scroll or pinch to zoom. Click any item for its details, like leads, cut-offs and how far ' +
        'along the course it is. Points have an Open in Google Maps button for directions.' },
    { target: '#layerbar', title: 'Layers',
      body: 'Switch groups on and off to see just what you need.' },
    { target: '#lists-btn', title: 'Lists',
      body: 'See the equipment list and every aid station and marshal in km order.' },
    { target: '#pdf-btn', title: 'Download PDF',
      body: 'Opens a print layout. Frame the map, click Print / Save as PDF and choose "Save as PDF".' },
    { target: '#help-btn', title: 'Need this again?',
      body: 'Click ? any time to replay this tour.' }
  ];

  var steps = [];
  var index = 0;
  var els = null;
  var onKeyBound = null;
  var hooks = {};

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function build() {
    var root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML =
      '<div class="tour-shade"></div>' +
      '<div class="tour-spot"></div>' +
      '<div class="tour-card" role="dialog" aria-live="polite">' +
      '  <div class="tour-count"></div>' +
      '  <h3 class="tour-title"></h3>' +
      '  <p class="tour-body"></p>' +
      '  <div class="tour-actions">' +
      '    <button type="button" class="link tour-skip">Skip tour</button>' +
      '    <span class="spacer"></span>' +
      '    <button type="button" class="tour-action"></button>' +
      '    <button type="button" class="tour-back">Back</button>' +
      '    <button type="button" class="primary tour-next">Next</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(root);
    els = {
      root: root,
      shade: root.querySelector('.tour-shade'),
      spot: root.querySelector('.tour-spot'),
      card: root.querySelector('.tour-card'),
      count: root.querySelector('.tour-count'),
      title: root.querySelector('.tour-title'),
      body: root.querySelector('.tour-body'),
      back: root.querySelector('.tour-back'),
      next: root.querySelector('.tour-next'),
      action: root.querySelector('.tour-action')
    };
    els.action.addEventListener('click', function () {
      var a = steps[index].action;
      var fn = a && hooks[a.hook];
      end();
      if (fn) fn();
    });
    root.querySelector('.tour-skip').addEventListener('click', end);
    els.back.addEventListener('click', function () { go(index - 1, -1); });
    els.next.addEventListener('click', function () { go(index + 1, 1); });
    els.shade.addEventListener('click', function () { /* clicks outside do nothing */ });
  }

  // hooks: functions the app lends the tour, e.g. { signIn: fn } for the
  // "Sign in now" button.
  function start(mode, force, appHooks) {
    if (els) return;
    hooks = appHooks || {};
    if (!force && seen(mode)) return;
    steps = mode === 'view' ? VIEW_STEPS : EDIT_STEPS;
    markSeen(mode);
    build();
    onKeyBound = onKey;
    document.addEventListener('keydown', onKeyBound, true);
    window.addEventListener('resize', place);
    go(0, 1);
  }

  // Shows step i, skipping steps whose target isn't on screen (e.g. on a phone).
  function go(i, dir) {
    while (i >= 0 && i < steps.length && steps[i].target && !visible(document.querySelector(steps[i].target))) i += dir;
    if (i < 0) i = 0;
    if (i >= steps.length) { end(); return; }
    index = i;
    var s = steps[i];
    els.count.textContent = (i + 1) + ' of ' + steps.length;
    els.title.textContent = s.title;
    els.body.textContent = s.body;
    els.back.hidden = i === 0;
    els.action.hidden = !(s.action && hooks[s.action.hook]);
    if (s.action) els.action.textContent = s.action.label;
    els.next.textContent = i === steps.length - 1 ? 'Done' : i === 0 ? 'Show me around' : 'Next';
    place();
    els.next.focus();
  }

  function place() {
    if (!els) return;
    var s = steps[index];
    var target = s.target && document.querySelector(s.target);
    var card = els.card;
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8, gap = 14;
    if (!target) {
      els.spot.style.display = 'none';
      els.shade.style.display = 'block';
      card.style.left = Math.max(16, (vw - card.offsetWidth) / 2) + 'px';
      card.style.top = Math.max(16, (vh - card.offsetHeight) / 2) + 'px';
      return;
    }
    var r = target.getBoundingClientRect();
    els.shade.style.display = 'none';
    els.spot.style.display = 'block';
    els.spot.style.left = (r.left - pad) + 'px';
    els.spot.style.top = (r.top - pad) + 'px';
    els.spot.style.width = (r.width + pad * 2) + 'px';
    els.spot.style.height = (r.height + pad * 2) + 'px';

    var cw = card.offsetWidth, ch = card.offsetHeight;
    // Below or above slide sideways to stay on screen, so small buttons near
    // the edge still get their card right underneath.
    var slide = Math.min(Math.max(8, r.left), vw - cw - 8);
    var spots = [
      { left: slide, top: r.bottom + pad + gap },                  // below
      { left: r.right + pad + gap, top: r.top },                   // right
      { left: r.left - pad - gap - cw, top: r.top },               // left
      { left: slide, top: r.top - pad - gap - ch }                 // above
    ];
    var fits = function (p) { return p.left >= 8 && p.top >= 8 && p.left + cw <= vw - 8 && p.top + ch <= vh - 8; };
    var pick = null;
    for (var k = 0; k < spots.length; k++) if (fits(spots[k])) { pick = spots[k]; break; }
    if (!pick) {
      // Big targets (the map, the panels): float the card inside them.
      pick = { left: r.left + (r.width - cw) / 2, top: r.top + Math.min(40, Math.max(8, (r.height - ch) / 2)) };
    }
    card.style.left = Math.min(Math.max(8, pick.left), vw - cw - 8) + 'px';
    card.style.top = Math.min(Math.max(8, pick.top), vh - ch - 8) + 'px';
  }

  function onKey(e) {
    if (!els) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(index + 1, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(index - 1, -1); }
    else e.stopPropagation(); // keep app shortcuts (Delete, Ctrl+Z) quiet while the tour is open
  }

  function end() {
    if (!els) return;
    document.removeEventListener('keydown', onKeyBound, true);
    window.removeEventListener('resize', place);
    els.root.remove();
    els = null;
  }

  function seen(mode) {
    try { return localStorage.getItem(SEEN_KEY[mode]) === '1'; } catch (e) { return false; }
  }

  function markSeen(mode) {
    try { localStorage.setItem(SEEN_KEY[mode], '1'); } catch (e) { /* storage unavailable */ }
  }

  return {
    start: start,
    end: end,
    isOpen: function () { return !!els; }
  };
})();
