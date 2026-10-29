// Interactive 3D globe for the hero: GNSS satellites orbiting the Earth, linked to the
// user's position when above their horizon. Plain canvas 2D, no library.
(function () {
  'use strict';

  var canvas = document.querySelector('canvas[data-globe]');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var D = Math.PI / 180;
  var TAU = Math.PI * 2;
  var USER_LAT = 45.02;
  var USER_LON = 6.41;

  // Unit vector on the sphere; y points north, z faces the viewer at lon 0.
  function unit(la, lo) {
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  }

  var land = [];
  var landUrl = canvas.getAttribute('data-land');
  if (landUrl && window.fetch) {
    // Natural Earth 1:110m landmasses, the same file the app ships: one polygon per line,
    // "lat,lon;lat,lon;…".
    fetch(landUrl)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (txt) {
        land = txt.split('\n').filter(function (l) { return l.trim(); }).map(function (line) {
          var minLo = 999;
          var maxLo = -999;
          var pts = line.split(';').map(function (p) {
            var parts = p.split(',');
            var la = parseFloat(parts[0]);
            var lo = parseFloat(parts[1]);
            if (lo < minLo) minLo = lo;
            if (lo > maxLo) maxLo = lo;
            return unit(la * D, lo * D);
          });
          // Polygons wrapping the whole globe (Antarctica) can't be filled with the limb trick.
          return { pts: pts, fill: maxLo - minLo < 300 };
        });
        requestFrame();
      })
      .catch(function () {});
  }

  var graticule = [];
  var la, lo, pts;
  for (lo = -180; lo < 180; lo += 30) {
    pts = [];
    for (la = -90; la <= 90; la += 4) pts.push(unit(la * D, lo * D));
    graticule.push(pts);
  }
  for (la = -60; la <= 60; la += 30) {
    pts = [];
    for (lo = -180; lo <= 180; lo += 4) pts.push(unit(la * D, lo * D));
    graticule.push(pts);
  }

  // Stylised orbits: real inclinations per constellation, radii compressed to fit the frame.
  var constellations = [
    { c: '#5C9CE6', n: 8, inc: 55, r: 1.62, off: 0 },    // GPS
    { c: '#E06666', n: 6, inc: 64.8, r: 1.55, off: 20 }, // GLONASS
    { c: '#3EC9C0', n: 7, inc: 56, r: 1.76, off: 40 },   // Galileo
    { c: '#F0954B', n: 6, inc: 55, r: 1.69, off: 65 },   // BeiDou
    { c: '#9B7BE0', n: 3, inc: 41, r: 1.88, off: 135 }   // QZSS
  ];
  var sats = [];
  constellations.forEach(function (k) {
    for (var i = 0; i < k.n; i++) {
      sats.push({
        c: k.c,
        inc: k.inc * D,
        raan: (k.off + i * 360 / k.n) * D,
        ph: (i * 97 + k.off * 3) * D,
        r: k.r,
        w: 0.11 / Math.pow(k.r, 1.5)
      });
    }
  });

  function satWorld(s, u) {
    var x = Math.sin(u);
    var y = Math.cos(u) * Math.sin(s.inc);
    var z = Math.cos(u) * Math.cos(s.inc);
    var cr = Math.cos(s.raan);
    var sr = Math.sin(s.raan);
    return [(x * cr + z * sr) * s.r, y * s.r, (-x * sr + z * cr) * s.r];
  }

  var yawOff = 0;
  var pitchOff = 0;
  var drag = null;

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, yaw: yawOff, pitch: pitchOff };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    yawOff = drag.yaw + (e.clientX - drag.x) * 0.008;
    pitchOff = Math.max(-0.9, Math.min(0.9, drag.pitch + (e.clientY - drag.y) * 0.006));
    requestFrame();
  });
  function endDrag() { drag = null; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function draw(t) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    // Sways around the user's longitude instead of spinning, so their sky stays in view.
    var yaw = -USER_LON * D + 0.8 * Math.sin(t * 0.1) + yawOff;
    var pitch = 32 * D + pitchOff;
    var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    function rot(v) {
      var x1 = v[0] * cyw + v[2] * syw;
      var z1 = -v[0] * syw + v[2] * cyw;
      return [x1, v[1] * cp - z1 * sp, v[1] * sp + z1 * cp];
    }

    var S = Math.min(W, H), R = S * 0.25, cx = W / 2, cy = H / 2, k = S / 600;
    function X(p) { return cx + p[0] * R; }
    function Y(p) { return cy - p[1] * R; }

    function strokeVisible(list) {
      ctx.beginPath();
      var on = false;
      for (var i = 0; i < list.length; i++) {
        var p = rot(list[i]);
        if (p[2] > 0) {
          if (on) ctx.lineTo(X(p), Y(p)); else ctx.moveTo(X(p), Y(p));
          on = true;
        } else {
          on = false;
        }
      }
      ctx.stroke();
    }

    ctx.clearRect(0, 0, W, H);

    var user = unit(USER_LAT * D, USER_LON * D);
    var up = rot(user);
    var placed = sats.map(function (s) {
      var u = s.ph + s.w * t;
      var w = satWorld(s, u);
      // Above the user's local horizon: (sat - user) · user > 0, with user a unit vector.
      var vis = w[0] * user[0] + w[1] * user[1] + w[2] * user[2] > 1.02;
      var trail = [];
      for (var i = 1; i <= 10; i++) trail.push(rot(satWorld(s, u - i * 0.035)));
      return { s: s, p: rot(w), vis: vis, trail: trail };
    });

    function drawSat(o, a) {
      ctx.strokeStyle = o.s.c;
      ctx.lineWidth = 1.5 * k;
      ctx.globalAlpha = a * 0.35;
      ctx.beginPath();
      ctx.moveTo(X(o.p), Y(o.p));
      o.trail.forEach(function (q) { ctx.lineTo(X(q), Y(q)); });
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.fillStyle = o.s.c;
      ctx.beginPath(); ctx.arc(X(o.p), Y(o.p), 5 * k, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * 0.3;
      ctx.beginPath(); ctx.arc(X(o.p), Y(o.p), 11 * k, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    placed.forEach(function (o) { if (o.p[2] < 0) drawSat(o, 0.5); });

    var halo = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.3);
    halo.addColorStop(0, 'rgba(168,219,152,0.18)');
    halo.addColorStop(1, 'rgba(168,219,152,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#082A21';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    ctx.lineWidth = Math.max(1, k);
    ctx.strokeStyle = 'rgba(243,235,221,0.12)';
    graticule.forEach(strokeVisible);

    // Hidden vertices are pushed onto the limb so partially visible landmasses close cleanly.
    ctx.fillStyle = 'rgba(243,235,221,0.13)';
    land.forEach(function (poly) {
      if (!poly.fill) return;
      var any = false;
      ctx.beginPath();
      poly.pts.forEach(function (v, i) {
        var p = rot(v);
        var x = p[0], y = p[1];
        if (p[2] > 0) {
          any = true;
        } else {
          var m = Math.hypot(x, y) || 1;
          x /= m;
          y /= m;
        }
        if (i) ctx.lineTo(cx + x * R, cy - y * R); else ctx.moveTo(cx + x * R, cy - y * R);
      });
      if (any) ctx.fill();
    });
    ctx.strokeStyle = 'rgba(243,235,221,0.55)';
    ctx.lineWidth = Math.max(1, 1.1 * k);
    land.forEach(function (poly) { strokeVisible(poly.pts); });

    ctx.strokeStyle = 'rgba(243,235,221,0.3)';
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    if (up[2] > 0) {
      ctx.lineWidth = 1.2 * k;
      ctx.globalAlpha = 0.55;
      placed.forEach(function (o) {
        if (!o.vis) return;
        ctx.strokeStyle = o.s.c;
        ctx.beginPath(); ctx.moveTo(X(up), Y(up)); ctx.lineTo(X(o.p), Y(o.p)); ctx.stroke();
      });
      var ph = (t % 2) / 2;
      ctx.globalAlpha = 1 - ph;
      ctx.strokeStyle = '#F26A1B';
      ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.arc(X(up), Y(up), (6 + 18 * ph) * k, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#F26A1B';
      ctx.beginPath(); ctx.arc(X(up), Y(up), 6 * k, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#F3EBDD';
      ctx.stroke();
    }

    placed.forEach(function (o) { if (o.p[2] >= 0) drawSat(o, 1); });
  }

  // Only animates while the globe is on screen and the tab is visible; with reduced motion
  // it stays still and only redraws when dragged or resized.
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var onScreen = true;
  var raf = 0;
  var clock = 0;
  var last = 0;

  function frame(now) {
    raf = 0;
    if (!reduce) {
      if (last) clock += Math.min(now - last, 100) / 1000;
      last = now;
    }
    draw(clock);
    if (!reduce && onScreen && !document.hidden) requestFrame();
    else last = 0;
  }

  function requestFrame() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      if (onScreen) requestFrame();
    }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) requestFrame();
  });
  window.addEventListener('resize', requestFrame);

  requestFrame();
})();
