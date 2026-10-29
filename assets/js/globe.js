// Interactive 3D satellite globe for the hero, ported from the app's SatelliteGlobeScreen /
// GlobeRendering: same orthographic projection, gestures (drag to rotate, pinch to zoom, tap a
// satellite for its details) and drawing rules. The sky is the app's demo-mode sky
// (DemoGpsSource), refreshed once a second like a GNSS snapshot. Plain canvas 2D, no library.
(function () {
  'use strict';

  var canvas = document.querySelector('canvas[data-globe]');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var stage = canvas.parentNode;
  var tooltip = stage.querySelector('[data-sat-tooltip]');
  var elAzLabel = canvas.getAttribute('data-elaz-label') || 'el. {el}° · az. {az}°';

  var EARTH_RADIUS_KM = 6371;
  var CN0_FULL_SCALE_DBHZ = 45;
  var TAP_RADIUS = 28;
  var DEG_PER_PX = 0.5;
  var MIN_ZOOM = 0.5;
  var MAX_ZOOM = 8;
  var OBSERVER = { lat: 45.02, lon: 6.41, alt: 2384 };

  var COLORS = {
    shading: '94,143,126',
    line: '243,235,221',
    land: '168,219,152',
    observer: '#F26A1B',
    selection: '#F3EBDD'
  };

  // Nominal orbital radius per constellation, as in SatelliteGeometry.nominalOrbitRadiusKm.
  var CONSTELLATIONS = {
    GPS: { order: 0, name: 'GPS', color: '#5C9CE6', shellKm: 26560 },
    GLONASS: { order: 1, name: 'GLONASS', color: '#E06666', shellKm: 25510 },
    GALILEO: { order: 2, name: 'Galileo', color: '#3EC9C0', shellKm: 29600 },
    BEIDOU: { order: 3, name: 'BeiDou', color: '#F0954B', shellKm: 27900 }
  };

  function toRad(deg) { return deg * Math.PI / 180; }

  // Deterministic PRNG (mulberry32) so the sky looks the same on every visit.
  function seededRandom(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Same recipe as the app's demo sky; svids stay inside each constellation's real range.
  var seeds = (function () {
    var random = seededRandom(20260801);
    var list = [];
    [['GPS', 10, 2], ['GALILEO', 8, 3], ['GLONASS', 7, 1], ['BEIDOU', 6, 5]].forEach(function (c) {
      for (var i = 0; i < c[1]; i++) {
        list.push({
          constellation: c[0],
          svid: c[2] + i * 3 + Math.floor(random() * 3),
          azimuthBase: random() * 360,
          // Biased towards the upper sky via sqrt, like the app.
          elevationBase: 6 + Math.sqrt(random()) * 76,
          cn0Base: 25 + random() * 21,
          phase: random() * Math.PI * 2
        });
      }
    });
    return list;
  })();

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Spherical Earth, ECEF in km (x towards lon 0, z towards the north pole).
  function geodeticToEcef(lat, lon, altMeters) {
    var la = toRad(lat), lo = toRad(lon), r = EARTH_RADIUS_KM + altMeters / 1000;
    return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
  }

  // Satellite placed where the observer's line of sight meets the constellation's shell
  // (ray/sphere intersection), as in SatelliteGeometry.satelliteEcef.
  function satelliteEcef(azimuth, elevation, shellKm) {
    var o = geodeticToEcef(OBSERVER.lat, OBSERVER.lon, OBSERVER.alt);
    var az = toRad(azimuth), el = toRad(elevation);
    var east = Math.cos(el) * Math.sin(az);
    var north = Math.cos(el) * Math.cos(az);
    var up = Math.sin(el);
    var lat = toRad(OBSERVER.lat), lon = toRad(OBSERVER.lon);
    var dx = -Math.sin(lon) * east - Math.sin(lat) * Math.cos(lon) * north + Math.cos(lat) * Math.cos(lon) * up;
    var dy = Math.cos(lon) * east - Math.sin(lat) * Math.sin(lon) * north + Math.cos(lat) * Math.sin(lon) * up;
    var dz = Math.cos(lat) * north + Math.sin(lat) * up;
    var b = o[0] * dx + o[1] * dy + o[2] * dz;
    var c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - shellKm * shellKm;
    var disc = b * b - c;
    if (disc < 0) return null;
    var t = -b + Math.sqrt(disc);
    if (t <= 0) return null;
    return [o[0] + t * dx, o[1] + t * dy, o[2] + t * dz];
  }

  // One GNSS snapshot: only satellites used in the fix are displayed, as in the app.
  function snapshot(seconds) {
    var sats = [];
    seeds.forEach(function (s) {
      var az = ((s.azimuthBase + seconds * 0.02 + 4 * Math.sin(seconds / 90 + s.phase)) % 360 + 360) % 360;
      var el = clamp(s.elevationBase + 3 * Math.sin(seconds / 70 + s.phase), 3, 88);
      var cn0 = clamp(s.cn0Base + 2.5 * Math.sin(seconds / 13 + s.phase), 18, 51);
      if (el < 12 || cn0 < 30) return;
      var c = CONSTELLATIONS[s.constellation];
      var position = satelliteEcef(az, el, c.shellKm);
      if (!position) return;
      sats.push({
        key: s.constellation + ':' + s.svid,
        constellation: c,
        svid: s.svid,
        azimuth: az,
        elevation: el,
        cn0: cn0,
        position: position
      });
    });
    return sats.sort(function (a, b) {
      return a.constellation.order - b.constellation.order || a.svid - b.svid;
    });
  }

  // Graticule: parallels every 30° between ±60°, meridians every 30°, sampled every 10°.
  var graticule = [];
  var lat, lon, line;
  for (lat = -60; lat <= 60; lat += 30) {
    line = [];
    for (lon = 0; lon <= 360; lon += 10) line.push(geodeticToEcef(lat, lon, 0));
    graticule.push(line);
  }
  for (lon = 0; lon < 360; lon += 30) {
    line = [];
    for (lat = -90; lat <= 90; lat += 10) line.push(geodeticToEcef(lat, lon, 0));
    graticule.push(line);
  }

  var land = [];
  var landUrl = canvas.getAttribute('data-land');
  if (landUrl && window.fetch) {
    // Natural Earth 1:110m landmasses, the same file the app ships: one ring per line,
    // "lat,lon;lat,lon;…".
    fetch(landUrl)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (txt) {
        land = txt.split('\n').filter(function (l) { return l.trim(); }).map(function (ring) {
          return ring.split(';').map(function (p) {
            var parts = p.split(',');
            return geodeticToEcef(parseFloat(parts[0]), parseFloat(parts[1]), 0);
          });
        });
        requestDraw();
      })
      .catch(function () {});
  }

  var observerEcef = geodeticToEcef(OBSERVER.lat, OBSERVER.lon, 0);

  // Camera: yaw/pitch are the longitude/latitude facing the viewer, so the observer starts
  // centered. Opens zoomed in like the app's onboarding tour (ONBOARDING_GLOBE_ZOOM), so the
  // Earth reads in the hero instead of the full-shell fit.
  var yawDeg = OBSERVER.lon;
  var pitchDeg = OBSERVER.lat;
  var zoom = 2.5;
  var selectedKey = null;
  var satellites = [];
  var lastProjection = null;

  // Orthographic projection (GlobeProjection): yaw about the polar axis, then pitch about the
  // screen-horizontal axis. Screen units are CSS pixels.
  function makeProjection(width, height, maxRadiusEarthRadii) {
    var cx = width / 2, cy = height / 2;
    var scale = Math.min(width, height) / 2 * 0.94 / maxRadiusEarthRadii * zoom;
    var cosYaw = Math.cos(toRad(yawDeg)), sinYaw = Math.sin(toRad(yawDeg));
    var cosPitch = Math.cos(toRad(pitchDeg)), sinPitch = Math.sin(toRad(pitchDeg));
    return {
      cx: cx,
      cy: cy,
      radius: scale,
      project: function (p) {
        var x = p[0] / EARTH_RADIUS_KM, y = p[1] / EARTH_RADIUS_KM, z = p[2] / EARTH_RADIUS_KM;
        var x1 = x * cosYaw + y * sinYaw;
        var right = -x * sinYaw + y * cosYaw;
        var depth = x1 * cosPitch + z * sinPitch;
        var up = -x1 * sinPitch + z * cosPitch;
        var r2 = right * right + up * up;
        return {
          x: cx + right * scale,
          y: cy - up * scale,
          depth: depth,
          // Hidden by the globe exactly when on the back side and inside the unit disk.
          occluded: depth < 0 && r2 < 1
        };
      }
    };
  }

  function drawGlobe(proj) {
    var R = proj.radius;
    var shade = ctx.createRadialGradient(proj.cx - R * 0.35, proj.cy - R * 0.35, 0, proj.cx - R * 0.35, proj.cy - R * 0.35, R * 1.8);
    shade.addColorStop(0, 'rgba(' + COLORS.shading + ',0.45)');
    shade.addColorStop(1, 'rgba(' + COLORS.shading + ',0.08)');
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.arc(proj.cx, proj.cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(' + COLORS.line + ',0.55)';
    ctx.beginPath(); ctx.arc(proj.cx, proj.cy, R, 0, Math.PI * 2); ctx.stroke();

    // Front segments visible, back ones very faint as a depth cue, limb-crossing ones skipped.
    var front = new Path2D(), back = new Path2D();
    graticule.forEach(function (polyline) {
      var prev = proj.project(polyline[0]);
      for (var i = 1; i < polyline.length; i++) {
        var cur = proj.project(polyline[i]);
        var path = prev.depth >= 0 && cur.depth >= 0 ? front : (prev.depth < 0 && cur.depth < 0 ? back : null);
        if (path) { path.moveTo(prev.x, prev.y); path.lineTo(cur.x, cur.y); }
        prev = cur;
      }
    });
    ctx.strokeStyle = 'rgba(' + COLORS.line + ',0.07)';
    ctx.stroke(back);
    ctx.strokeStyle = 'rgba(' + COLORS.line + ',0.30)';
    ctx.stroke(front);
  }

  // Screen position where segment a–b crosses the depth = 0 plane (exact: the projection is linear).
  function limbCrossing(a, b) {
    var t = a.depth / (a.depth - b.depth);
    return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
  }

  function drawLand(proj) {
    var fill = new Path2D(), coast = new Path2D();
    land.forEach(function (ring) {
      var projected = ring.map(proj.project);
      // Sutherland–Hodgman clip of the ring against the front half-space.
      var clipped = [];
      var prev = projected[projected.length - 1];
      projected.forEach(function (cur) {
        if (cur.depth >= 0) {
          if (prev.depth < 0) clipped.push(limbCrossing(prev, cur));
          clipped.push([cur.x, cur.y]);
        } else if (prev.depth >= 0) {
          clipped.push(limbCrossing(prev, cur));
        }
        prev = cur;
      });
      if (clipped.length >= 3) {
        fill.moveTo(clipped[0][0], clipped[0][1]);
        for (var i = 1; i < clipped.length; i++) fill.lineTo(clipped[i][0], clipped[i][1]);
        fill.closePath();
      }
      for (var j = 1; j < projected.length; j++) {
        if (projected[j - 1].depth >= 0 && projected[j].depth >= 0) {
          coast.moveTo(projected[j - 1].x, projected[j - 1].y);
          coast.lineTo(projected[j].x, projected[j].y);
        }
      }
    });
    ctx.fillStyle = 'rgba(' + COLORS.land + ',0.16)';
    ctx.fill(fill);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(' + COLORS.land + ',0.50)';
    ctx.stroke(coast);
  }

  function drawSatellites(proj) {
    var observer = proj.project(observerEcef);
    satellites.forEach(function (sat) {
      var p = proj.project(sat.position);
      if (p.occluded) return;
      var fraction = clamp(sat.cn0 / CN0_FULL_SCALE_DBHZ, 0, 1);
      // Strong signals are bigger and more opaque; the far side of the globe is attenuated.
      var alpha = 0.45 + 0.55 * fraction;
      if (p.depth < 0) alpha *= 0.5;
      var radius = 2.5 + 3.5 * fraction;
      var color = sat.constellation.color;

      if (observer.depth >= 0) {
        ctx.globalAlpha = alpha * 0.35;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(observer.x, observer.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (sat.key === selectedKey) {
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, radius + 5, 0, Math.PI * 2); ctx.stroke();
      }
    });
  }

  function drawObserver(proj) {
    var p = proj.project(observerEcef);
    if (p.depth < 0) return;
    ctx.fillStyle = COLORS.observer;
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = COLORS.observer;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function selectedSatellite() {
    for (var i = 0; i < satellites.length; i++) {
      if (satellites[i].key === selectedKey) return satellites[i];
    }
    return null;
  }

  // Info bubble next to the selected satellite: its top-left corner 12 px right of and above it,
  // flipped to the left when it would overflow the globe's frame.
  function updateTooltip(proj, width, height) {
    if (!tooltip) return;
    var sat = selectedSatellite();
    var p = sat && proj.project(sat.position);
    if (!sat || p.occluded) {
      tooltip.hidden = true;
      return;
    }
    var title = tooltip.querySelector('strong');
    var lines = tooltip.querySelectorAll('span');
    title.textContent = sat.constellation.name + ' ' + (sat.svid < 10 ? '0' : '') + sat.svid;
    title.style.color = sat.constellation.color;
    lines[0].textContent = elAzLabel
      .replace('{el}', Math.round(sat.elevation))
      .replace('{az}', Math.round(sat.azimuth));
    lines[1].textContent = Math.round(sat.cn0) + ' dB-Hz';
    tooltip.hidden = false;
    var left = p.x + 12;
    var top = p.y - 12;
    if (left + tooltip.offsetWidth > width) left = p.x - 12 - tooltip.offsetWidth;
    tooltip.style.left = clamp(left, 0, Math.max(0, width - tooltip.offsetWidth)) + 'px';
    tooltip.style.top = clamp(top, 0, Math.max(0, height - tooltip.offsetHeight)) + 'px';
  }

  function draw() {
    var width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Fit the view to the farthest displayed shell (at least 2 Earth radii).
    var farthest = 0;
    satellites.forEach(function (s) {
      var p = s.position;
      farthest = Math.max(farthest, Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]));
    });
    var proj = makeProjection(width, height, Math.max(farthest / EARTH_RADIUS_KM, 2) * 1.08);
    lastProjection = proj;

    drawGlobe(proj);
    drawLand(proj);
    drawSatellites(proj);
    drawObserver(proj);
    updateTooltip(proj, width, height);
  }

  var raf = 0;
  function requestDraw() {
    if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); });
  }

  // Nearest visible satellite within the tap radius, or nothing (which clears the selection).
  function tap(x, y) {
    if (!lastProjection) return;
    var best = null, bestDistance = Infinity;
    satellites.forEach(function (sat) {
      var p = lastProjection.project(sat.position);
      if (p.occluded) return;
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDistance) { best = sat; bestDistance = d; }
    });
    selectedKey = best && bestDistance <= TAP_RADIUS ? best.key : null;
    requestDraw();
  }

  // ---------- Gestures: drag to rotate, pinch (or ctrl + wheel) to zoom, tap to select ----------

  var pointers = {};
  var pointerCount = 0;
  var gesture = null;

  function localPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pinchDistance() {
    var ids = Object.keys(pointers);
    var a = pointers[ids[0]], b = pointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = localPoint(e);
    pointerCount++;
    if (pointerCount === 1) {
      gesture = { startX: pointers[e.pointerId].x, startY: pointers[e.pointerId].y, moved: false };
    } else if (pointerCount === 2) {
      gesture = { moved: true, pinchStart: pinchDistance(), zoomStart: zoom };
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    var prev = pointers[e.pointerId];
    if (!prev || !gesture) return;
    var cur = localPoint(e);
    pointers[e.pointerId] = cur;
    if (pointerCount === 1) {
      yawDeg = ((yawDeg - (cur.x - prev.x) * DEG_PER_PX) % 360 + 360) % 360;
      pitchDeg = clamp(pitchDeg + (cur.y - prev.y) * DEG_PER_PX, -89, 89);
      if (Math.hypot(cur.x - gesture.startX, cur.y - gesture.startY) > 8) gesture.moved = true;
    } else if (pointerCount === 2 && gesture.pinchStart) {
      zoom = clamp(gesture.zoomStart * pinchDistance() / gesture.pinchStart, MIN_ZOOM, MAX_ZOOM);
    }
    requestDraw();
  });

  function endPointer(e, isTap) {
    if (!pointers[e.pointerId]) return;
    if (isTap && pointerCount === 1 && gesture && !gesture.moved) {
      var p = localPoint(e);
      tap(p.x, p.y);
    }
    delete pointers[e.pointerId];
    pointerCount--;
    if (pointerCount === 0) gesture = null;
  }
  canvas.addEventListener('pointerup', function (e) { endPointer(e, true); });
  canvas.addEventListener('pointercancel', function (e) { endPointer(e, false); });

  // Trackpad pinch arrives as ctrl + wheel; a plain wheel keeps scrolling the page.
  canvas.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom = clamp(zoom * Math.exp(-e.deltaY * 0.01), MIN_ZOOM, MAX_ZOOM);
    requestDraw();
  }, { passive: false });

  canvas.addEventListener('keydown', function (e) {
    switch (e.key) {
      case 'ArrowLeft': yawDeg = (yawDeg + 355) % 360; break;
      case 'ArrowRight': yawDeg = (yawDeg + 5) % 360; break;
      case 'ArrowUp': pitchDeg = clamp(pitchDeg - 5, -89, 89); break;
      case 'ArrowDown': pitchDeg = clamp(pitchDeg + 5, -89, 89); break;
      case '+': case '=': zoom = clamp(zoom * 1.2, MIN_ZOOM, MAX_ZOOM); break;
      case '-': zoom = clamp(zoom / 1.2, MIN_ZOOM, MAX_ZOOM); break;
      case 'Escape': selectedKey = null; break;
      default: return;
    }
    e.preventDefault();
    requestDraw();
  });

  // ---------- Snapshots: once a second while visible; frozen with reduced motion ----------

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var frozenAt = Date.now() / 1000;
  var onScreen = true;

  function refresh() {
    satellites = snapshot(reduce ? frozenAt : Date.now() / 1000);
    requestDraw();
  }

  setInterval(function () {
    if (!reduce && onScreen && !document.hidden) refresh();
  }, 1000);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
    }).observe(canvas);
  }
  window.addEventListener('resize', requestDraw);

  refresh();
})();
