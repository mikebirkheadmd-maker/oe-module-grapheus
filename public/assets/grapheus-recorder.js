/* Grapheus recorder window: microphone, 5-minute segments, pause, silence auto-stop, 90-minute cap. */
(function () {
  'use strict';
  var root = document.getElementById('rec');
  var API = root.dataset.api, CSRF = root.dataset.csrf;
  var $ = function (id) { return document.getElementById(id); };
  var SEG_MS = 5 * 60 * 1000, WARN = 180, STOP = 300, MAX_MIN = 90;
  var R = null;

  function api(action, body, qs, raw, type) {
    var init = { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF } };
    if (raw) { init.body = raw; init.headers['Content-Type'] = type; } else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body || {}); }
    return fetch(API + '?action=' + action + (qs || ''), init)
      .then(function (r) { return r.json().catch(function () { return { ok: false, status: r.status }; }); }, function () { return { ok: false, offline: true }; });
  }
  function say(t) { $('msg').textContent = t; }
  function clock(s) { s = Math.max(0, Math.floor(s)); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); }
  function mime() { var o = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']; for (var i = 0; i < o.length; i++) if (MediaRecorder.isTypeSupported(o[i])) return o[i]; return ''; }

  // A part that does not get through is tried again for about two minutes, kept, and tried
  // once more at Stop: a short loss of connection must not cost five minutes of the visit.
  var RETRY_WAITS = [2000, 4000, 8000, 15000, 30000, 60000], FINAL_WAITS = [2000, 5000, 10000];
  // 'ok', 'retry' (no connection, a busy server) or 'refused' (it will never be taken).
  function sendOnce(blob, n) {
    return fetch(API + '?action=segment&visit=' + encodeURIComponent(R.id) + '&seq=' + n, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF, 'Content-Type': blob.type }, body: blob })
      .then(function (r) { return r.ok ? 'ok' : (r.status >= 500 || r.status === 408 || r.status === 429 ? 'retry' : 'refused'); }, function () { return 'retry'; });
  }
  function deliver(blob, n, waits, i) {
    i = i || 0;
    return sendOnce(blob, n).then(function (r) {
      if (r !== 'retry' || i >= waits.length) return r;
      return new Promise(function (ok) { setTimeout(ok, waits[i]); }).then(function () { return deliver(blob, n, waits, i + 1); });
    });
  }
  function upload(blob, n) {
    if (!blob.size) return;
    R.uploads = R.uploads.then(function () {
      return deliver(blob, n, R.stopping ? FINAL_WAITS : RETRY_WAITS).then(function (r) {
        if (r === 'refused') R.failures++;
        else if (r === 'retry') { R.waiting.push({ blob: blob, n: n }); if (!R.stopping) say('The connection dropped. This part is saved here and will be sent again.'); }
      });
    });
  }
  // At Stop: one more try for every part still waiting.
  function flushWaiting() {
    return R.waiting.splice(0).reduce(function (p, w) {
      return p.then(function () { return deliver(w.blob, w.n, FINAL_WAITS); }).then(function (r) { if (r !== 'ok') R.failures++; });
    }, Promise.resolve());
  }
  function segment() {
    if (!R || R.stopping || R.pausedAt) return;
    var chunks = [], n = R.seq++, m = mime();
    var rec = new MediaRecorder(R.stream, m ? { mimeType: m, audioBitsPerSecond: 32000 } : undefined);
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () { upload(new Blob(chunks, { type: (rec.mimeType || m || 'audio/webm').split(';')[0] }), n); };
    rec.start(1000);
    R.cur = rec;
    clearTimeout(R.rotate);
    R.rotate = setTimeout(function () { if (R && R.cur === rec && rec.state !== 'inactive') { rec.stop(); segment(); } }, SEG_MS);
  }

  function start() {
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
      return api('start', { mode: root.dataset.mode, patientType: root.dataset.ptype, prepMin: Number(root.dataset.prep) || 0 }).then(function (j) {
        if (!j.ok) { stream.getTracks().forEach(function (t) { t.stop(); }); $('state').textContent = 'Not started'; return say(j.error || 'Could not start.'); }
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
        R = { id: j.id, stream: stream, ctx: ctx, an: an, buf: new Float32Array(1024), seq: 0, uploads: Promise.resolve(), failures: 0, waiting: [], startedAt: Date.now(), pausedMs: 0, pausedAt: 0, silent: 0, lastTick: Date.now(), aliveAt: 0 };
        segment();
        $('pause').disabled = false; $('stop').disabled = false; $('state').textContent = 'Recording';
        R.timer = setInterval(tick, 500);
        window.addEventListener('beforeunload', guard);
      });
    }).catch(function (e) { $('state').textContent = 'Microphone blocked'; say('Allow the microphone for this site in the browser, then reopen the recorder. (' + (e.message || e.name) + ')'); });
  }
  function guard(e) { if (R && !R.stopping) { e.preventDefault(); e.returnValue = ''; } }

  function tick() {
    var now = Date.now(), secs = (now - R.startedAt - R.pausedMs - (R.pausedAt ? now - R.pausedAt : 0)) / 1000;
    $('timer').textContent = clock(secs);
    R.an.getFloatTimeDomainData(R.buf);
    var sum = 0; for (var i = 0; i < R.buf.length; i++) sum += R.buf[i] * R.buf[i];
    var rms = Math.sqrt(sum / R.buf.length);
    $('level').style.width = Math.min(100, Math.round(rms * 600)) + '%';
    // Real elapsed time, not a count of ticks: a window in the background ticks more slowly.
    var dt = Math.min(5, (now - R.lastTick) / 1000); R.lastTick = now;
    if (R.pausedAt) {
      // Still open: keeps a long pause from ending the visit, and the OpenEMR session alive.
      if (now - R.aliveAt > 60000) {
        R.aliveAt = now;
        // Grapheus says when this visit was finished from another screen: stop here too.
        api('alive', { visit: R.id }).then(function (j) { if (j && j.ok && j.recording === false && R && !R.stopping) stop('auto: finished from another screen'); });
      }
      // Paused captures nothing and never stops by itself: after 30 seconds say so, with a soft
      // chime then and once a minute, and in the window title (the window may be behind the chart).
      var pausedFor = Math.floor((now - R.pausedAt) / 1000);
      if (pausedFor >= 30) {
        say('PAUSED for ' + clock(pausedFor) + '. Nothing is being recorded. Press Resume to keep recording.');
        $('msg').classList.add('g-paused-warn');
        document.title = (pausedFor % 2 ? 'PAUSED ' : '!! PAUSED ') + clock(pausedFor);
        if (pausedFor >= (R.chimeAt || 30)) { R.chimeAt = pausedFor + 60; chime(); try { window.focus(); } catch (e) { /* not allowed */ } }
      }
      return;
    }
    // A sleeping audio engine reads as silence; wake it and do not count that as nobody speaking.
    if (R.ctx.state !== 'running') { try { R.ctx.resume(); } catch (e) { /* closed */ } return; }
    R.silent = rms > 0.012 ? 0 : R.silent + dt;
    if (R.silent >= WARN) say('No one has spoken for ' + Math.floor(R.silent / 60) + ' minutes. Recording stops at 5.'); else if (R.silent === 0 && !R.waiting.length) say('Keep this window open. It stops by itself after 5 silent minutes or 90 minutes.');
    if (R.silent >= STOP) stop('auto: 5 minutes of silence');
    if (secs >= MAX_MIN * 60) stop('auto: 90-minute limit');
  }

  var TITLE = document.title;
  function chime() {
    try {
      [0, 0.22].forEach(function (at) {
        var o = R.ctx.createOscillator(), g = R.ctx.createGain();
        o.frequency.value = 660; g.gain.value = 0.06; o.connect(g); g.connect(R.ctx.destination);
        o.start(R.ctx.currentTime + at); o.stop(R.ctx.currentTime + at + 0.14);
      });
    } catch (e) { /* no sound device */ }
  }
  $('pause').onclick = function () {
    if (!R || R.stopping) return;
    $('msg').classList.remove('g-paused-warn'); document.title = TITLE;
    if (!R.pausedAt) { R.pausedAt = Date.now(); R.chimeAt = 0; say('Paused. Nothing is recorded until you press Resume.'); clearTimeout(R.rotate); if (R.cur && R.cur.state !== 'inactive') R.cur.stop(); $('pause').textContent = 'Resume'; $('state').textContent = 'Paused'; $('dot').classList.add('paused'); }
    else { R.pausedMs += Date.now() - R.pausedAt; R.pausedAt = 0; R.silent = 0; segment(); $('pause').textContent = 'Pause'; $('state').textContent = 'Recording'; $('dot').classList.remove('paused'); }
  };
  // Stop on a recording that is paused, or was paused for most of the visit: ask first, with the
  // numbers, because what was not recorded cannot be recovered afterwards.
  $('stop').onclick = function () {
    if (!R || R.stopping) return;
    var now = Date.now(), pausedFor = R.pausedAt ? (now - R.pausedAt) / 1000 : 0, wall = (now - R.startedAt) / 1000;
    var rec = Math.max(0, wall - R.pausedMs / 1000 - pausedFor);
    if ((wall >= 120 && rec < wall * 0.5) || (R.pausedAt && pausedFor >= 10)) {
      if (!confirm((R.pausedAt ? 'The recording is PAUSED.\n\n' : '') + 'Only ' + clock(rec) + ' of this ' + clock(wall) + ' visit was recorded; the rest was paused and cannot be recovered.\n\n' +
        'OK: stop and write the note from the ' + clock(rec) + ' that was recorded.\nCancel: go back' + (R.pausedAt ? ' and press Resume to keep recording.' : '.'))) return;
    }
    stop('stopped');
  };

  function stop(reason) {
    if (!R || R.stopping) return;
    R.stopping = true;
    clearInterval(R.timer); clearTimeout(R.rotate);
    if (R.pausedAt) { R.pausedMs += Date.now() - R.pausedAt; R.pausedAt = 0; }
    $('pause').disabled = true; $('stop').disabled = true; $('state').textContent = 'Saving…';
    $('msg').classList.remove('g-paused-warn'); document.title = TITLE;
    var done = function () {
      R.stream.getTracks().forEach(function (t) { t.stop(); });
      try { R.ctx.close(); } catch (e) { /* closed */ }
      R.uploads.then(flushWaiting).then(function () {
        return api('finish', { visit: R.id, pausedSecs: Math.round(R.pausedMs / 1000), prepMin: Number(root.dataset.prep) || 0, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, reason: reason, patientType: root.dataset.ptype });
      }).then(function (j) {
        window.removeEventListener('beforeunload', guard);
        var written = j.ok && !j.empty;
        $('state').textContent = written ? 'Done' : j.offline ? 'No connection' : j.empty ? 'Nothing recorded' : 'Problem';
        $('dot').classList.add('paused');
        say(written ? 'The draft is being written. It appears where you started this recording. You can close this window.' + (R.failures ? ' ' + R.failures + ' part(s) of the recording did not upload, so the note may be incomplete.' : '')
          : j.offline ? 'No connection while finishing. What was uploaded is safe: Grapheus finishes the draft by itself in about 20 minutes. Look in the Grapheus tab then.'
          : j.empty ? 'Nothing was recorded' + (R.failures ? ': the recording could not be uploaded (' + R.failures + ' part(s)). Check the connection and record again.' : '. Check the microphone and record again.')
          : (j.error || 'Could not finish.'));
        try { if (window.opener) window.opener.postMessage({ type: 'grapheus-finished', visit: written || j.offline ? R.id : null }, location.origin); } catch (e) { /* opener gone */ }
      });
    };
    if (R.cur && R.cur.state !== 'inactive') { R.cur.addEventListener('stop', function () { setTimeout(done, 50); }, { once: true }); R.cur.stop(); } else done();
  }

  start();
})();
