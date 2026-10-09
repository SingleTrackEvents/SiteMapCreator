/*
 * Cloud maps in Supabase: create an account with the team join code, save
 * and open maps the whole team shares, and short share links (?m=slug).
 * No emails are sent: accounts are confirmed by the join code instead.
 *
 * The URL and publishable key are meant to be public. What people can do
 * is decided by the database rules in supabase/setup.sql.
 */
window.SMC = window.SMC || {};

SMC.cloud = (function () {
  var SUPABASE_URL = 'https://mizwsarhveepdwknupky.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_5aknaLXSWZl87yylnCytvA_N90af4Uy';
  var STAFF_DOMAIN = '@singletrack.com.au';
  var TABLE = 'site_maps';

  var client = null;
  var user = null;
  // True once the database confirms this user has entered the join code.
  var member = false;
  var listeners = [];

  function available() {
    return !!(window.supabase && window.supabase.createClient);
  }

  function init() {
    if (!available()) return;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    client.auth.getSession().then(function (r) { setUser(r.data.session && r.data.session.user); });
    client.auth.onAuthStateChange(function (event, session) {
      setUser(session && session.user);
    });
  }

  function setUser(u) {
    var changed = (u && u.id) !== (user && user.id);
    user = u || null;
    if (!user) { member = false; notify(); return; }
    if (!changed) { notify(); return; }
    member = false;
    notify();
    client.rpc('site_maps_is_staff').then(function (res) {
      member = !res.error && res.data === true;
      notify();
    });
  }

  function notify() {
    listeners.forEach(function (fn) { fn(user, member); });
  }

  function onChange(fn) { listeners.push(fn); }


  function isStaff() {
    return !!(user && member);
  }

  function need() {
    if (!client) throw new Error('Cloud maps are unavailable. Check your internet connection and reload the page.');
  }

  function fail(res) {
    if (res.error) throw new Error(res.error.message || 'Something went wrong talking to the cloud.');
    return res.data;
  }

  function checkEmail(email) {
    email = (email || '').trim().toLowerCase();
    if (email.slice(-STAFF_DOMAIN.length) !== STAFF_DOMAIN) {
      throw new Error('Please use your ' + STAFF_DOMAIN + ' email address.');
    }
    return email;
  }

  function signInWithPassword(email, password) {
    need();
    email = checkEmail(email);
    return client.auth.signInWithPassword({ email: email, password: password }).then(fail);
  }

  // Creates an account. Email confirmation is turned off in Supabase, so
  // this signs the person straight in; the join code then makes them a
  // team member.
  function signUp(email, password) {
    need();
    email = checkEmail(email);
    return client.auth.signUp({ email: email, password: password }).then(fail).then(function (data) {
      if (!data || !data.session) {
        // Either the address already has an account, or Supabase still has
        // "Confirm email" turned on.
        var existing = data && data.user && data.user.identities && data.user.identities.length === 0;
        throw new Error(existing
          ? 'There\'s already an account for this email. Use Sign in instead.'
          : 'Your account was created but needs email confirmation, which is turned on in Supabase. ' +
            'Ask the person who manages Supabase to turn off "Confirm email".');
      }
      return data;
    });
  }

  // Enters the team join code. Resolves true when accepted.
  function joinTeam(code) {
    need();
    if (!user) return Promise.reject(new Error('Please sign in first.'));
    return client.rpc('site_maps_join', { p_code: code }).then(fail).then(function (ok) {
      if (ok) { member = true; notify(); }
      return ok === true;
    });
  }

  function updatePassword(password) {
    need();
    return client.auth.updateUser({ password: password }).then(fail);
  }

  function signOut() {
    need();
    return client.auth.signOut().then(fail);
  }

  function listMaps() {
    need();
    return client.from(TABLE)
      .select('id, slug, name, updated_at, updated_by_email')
      .order('updated_at', { ascending: false })
      .then(fail);
  }

  function loadMap(id) {
    need();
    return client.from(TABLE).select('id, slug, name, data, updated_at').eq('id', id).single().then(fail);
  }

  // Saves a new map, or updates an existing one when id is given.
  function saveMap(doc, id) {
    need();
    var row = { name: (doc.meta && doc.meta.name) || 'Untitled map', data: doc };
    var q = id
      ? client.from(TABLE).update(row).eq('id', id)
      : client.from(TABLE).insert(row);
    return q.select('id, slug, name, updated_at').single().then(fail);
  }

  function remoteInfo(id) {
    need();
    return client.from(TABLE).select('updated_at, updated_by_email').eq('id', id).maybeSingle().then(fail);
  }

  function deleteMap(id) {
    need();
    return client.from(TABLE).delete().eq('id', id).then(fail);
  }

  // Anyone can open a map through its short link.
  function getShared(slug) {
    need();
    return client.rpc('get_shared_map', { p_slug: slug }).then(function (res) {
      if (res.error) throw new Error('This map link could not be opened. Check your internet connection, or ask for a new link.');
      return res.data;
    }).then(function (rows) {
      if (!rows || !rows.length) throw new Error('This map link is not valid any more. Ask for a new link.');
      return rows[0];
    });
  }

  function shortLink(slug) {
    return location.origin + location.pathname + '?m=' + encodeURIComponent(slug);
  }

  function slugFromLocation() {
    var m = /[?&]m=([A-Za-z0-9_-]+)/.exec(location.search);
    return m ? m[1] : null;
  }

  return {
    init: init,
    available: available,
    onChange: onChange,
    signUp: signUp,
    joinTeam: joinTeam,
    updatePassword: updatePassword,
    isSignedIn: function () { return !!user; },
    user: function () { return user; },
    isStaff: isStaff,
    signInWithPassword: signInWithPassword,
    signOut: signOut,
    listMaps: listMaps,
    loadMap: loadMap,
    saveMap: saveMap,
    remoteInfo: remoteInfo,
    deleteMap: deleteMap,
    getShared: getShared,
    shortLink: shortLink,
    slugFromLocation: slugFromLocation
  };
})();
