/*
 * Share links: the whole map, compressed into the part of the URL after
 * the #. That part never leaves the browser, so the plan is not stored on
 * any server; it travels inside the link itself.
 */
window.SMC = window.SMC || {};

SMC.share = (function () {
  var PREFIX = '#view=';

  function toBase64Url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
      .then(function (buf) { return new Uint8Array(buf); });
  }

  function supported() {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
  }

  // Coordinates are rounded to 5 decimal places (about 1 m), which keeps
  // links much shorter without moving anything visibly.
  function encode(doc) {
    var json = JSON.stringify(doc, function (k, v) {
      return typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v;
    });
    return pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')).then(toBase64Url);
  }

  function decode(token) {
    return pipe(fromBase64Url(token), new DecompressionStream('deflate-raw')).then(function (bytes) {
      return JSON.parse(new TextDecoder().decode(bytes));
    });
  }

  function linkFor(doc) {
    var base = location.href.split('#')[0].split('?')[0];
    return encode(doc).then(function (token) { return base + PREFIX + token; });
  }

  // The token in the current address, or null when this is not a share link.
  function tokenFromLocation() {
    return location.hash.indexOf(PREFIX) === 0 ? location.hash.slice(PREFIX.length) : null;
  }

  return {
    supported: supported,
    linkFor: linkFor,
    decode: decode,
    tokenFromLocation: tokenFromLocation
  };
})();
