/*
 * Cloud maps in Supabase: sign in with a SingleTrack email, save and open
 * maps the whole team shares, and short share links (?m=slug).
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
  var listeners = [];
  var recoveryListeners = [];

  function available() {
    return !!(window.supabase && window.supabase.createClient);
  }

  function init() {
    if (!available()) return;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      // Implicit flow: the emailed sign-in link works even when opened in a
      // different browser from the one that asked for it.
      auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true }
    });
    client.auth.getSession().then(function (r) { setUser(r.data.session && r.data.session.user); });
    client.auth.onAuthStateChange(function (event, session) {
      setUser(session && session.user);
      // Arrived from a "reset your password" email: ask for a new one.
      if (event === 'PASSWORD_RECOVERY') recoveryListeners.forEach(function (fn) { fn(); });
    });
  }

  function setUser(u) {
    user = u || null;
    listeners.forEach(function (fn) { fn(user); });
  }

  function onChange(fn) { listeners.push(fn); }
  function onPasswordRecovery(fn) { recoveryListeners.push(fn); }

  function backHere() {
    return location.origin + location.pathname;
  }

  function isStaff(u) {
    u = u || user;
    return !!(u && u.email && u.email.toLowerCase().slice(-STAFF_DOMAIN.length) === STAFF_DOMAIN);
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

  function sendSignInLink(email) {
    need();
    email = checkEmail(email);
    return client.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: backHere() }
    }).then(fail);
  }

  // Creates an account. Supabase emails a confirmation link, which proves the
  // person owns the address before they can see any maps.
  function signUp(email, password) {
    need();
    email = checkEmail(email);
    return client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: backHere() } })
      .then(fail)
      .then(function (data) {
        // Supabase hides whether an address is already registered: an
        // existing account comes back with no identities.
        var existing = data && data.user && data.user.identities && data.user.identities.length === 0;
        return { existing: existing, confirmed: !!(data && data.session) };
      });
  }

  function sendPasswordReset(email) {
    need();
    email = checkEmail(email);
    return client.auth.resetPasswordForEmail(email, { redirectTo: backHere() }).then(fail);
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
    onPasswordRecovery: onPasswordRecovery,
    signUp: signUp,
    sendPasswordReset: sendPasswordReset,
    updatePassword: updatePassword,
    user: function () { return user; },
    isStaff: isStaff,
    signInWithPassword: signInWithPassword,
    sendSignInLink: sendSignInLink,
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
