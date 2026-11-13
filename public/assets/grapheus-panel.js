/* Grapheus tab in an OpenEMR encounter: connect, record, review, apply. */
(function () {
  'use strict';
  var root = document.getElementById('grapheus');
  var API = root.dataset.api, CSRF = root.dataset.csrf;
  var $ = function (id) { return document.getElementById(id); };
  var state = null, current = null, pollT = null;
  var LABELS = { chief_complaint: 'Chief complaint', hpi: 'HPI', ros: 'ROS', medications_mentioned: 'Medications', allergies_mentioned: 'Allergies', history_mentioned: 'History' };

  function api(action, body, qs) {
    var init = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF } };
    if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch(API + '?action=' + action + (qs || ''), init)
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Unexpected response (' + r.status + ')' }; }); })
      .catch(function () { return { ok: false, error: 'Could not reach OpenEMR.' }; });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /** Insert HTML built from escaped values, sanitized again by OpenEMR's DOMPurify. */
  function put(el, html) { el.replaceChildren(window.DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true })); }
  function msg(text, kind) { var m = $('g-msg'); if (!text) { m.className = 'alert d-none'; return; } m.className = 'alert alert-' + (kind || 'info'); m.textContent = text; }
  function show(id) { ['g-connect', 'g-home', 'g-review'].forEach(function (s) { $(s).classList.toggle('d-none', s !== id); }); }
  var none = function (t) { return !t || /^none mentioned\.?$/i.test(String(t).trim()); };

  // ---------------------------------------------------------------- load
  function load() {
    msg('');
    api('state').then(function (j) {
      if (!j.ok) return msg(j.error, 'danger');
      state = j;
      $('g-patient').textContent = j.patientName || '';
      loadQuality();
      if (!j.connected) { $('g-account').textContent = ''; return show('g-connect'); }
      var a = j.account || {};
      $('g-account').textContent = (a.email || '') + (a.plan ? ' · ' + a.plan : '');
      if (a.access && !a.access.ok) msg(a.access.error, 'warning');
      show('g-home');
      $('g-record').disabled = !j.encounter || (a.access && !a.access.ok);
      list();
    });
  }

  // ---------------------------------------------------------------- connect
  $('g-connect-btn').onclick = function () {
    var w = window.open(state.server + '/app#connect-emr=' + encodeURIComponent(location.origin), 'grapheus-connect', 'width=520,height=680');
    if (!w) msg('Allow pop-ups for OpenEMR, then press Connect again.', 'warning');
  };
  window.addEventListener('message', function (e) {
    if (!state || e.origin !== state.server) return;
    var d = e.data || {};
    if (d.type !== 'grapheus-connect' || !d.key) return;
    api('connect', { key: d.key, email: d.email || '' }).then(function (j) { if (!j.ok) return msg(j.error, 'danger'); msg('Grapheus connected.', 'success'); load(); });
  });
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'grapheus-finished') return;
    if (e.data.visit) openVisit(e.data.visit); else load();
  });
  $('g-disconnect').onclick = function () { if (confirm('Disconnect Grapheus for your OpenEMR user?')) api('disconnect', {}).then(load); };

  // ---------------------------------------------------------------- record
  $('g-record').onclick = function () {
    if (!$('g-consent').checked) return msg('Confirm the patient knows the visit is being recorded.', 'warning');
    var url = root.dataset.recorder + '?mode=' + encodeURIComponent($('g-mode').value) + '&ptype=' + encodeURIComponent($('g-ptype').value) + '&prep=' + (parseInt($('g-prep').value, 10) || 0);
    var w = window.open(url, 'grapheus-recorder', 'width=360,height=330');
    if (!w) msg('Allow pop-ups for OpenEMR so the recorder window can open.', 'warning');
    else msg('Recording in the Grapheus window. When you press Stop there, the draft appears here.', 'info');
  };

  // ---------------------------------------------------------------- drafts
  var STATUS = { recording: 'Recording', transcribing: 'Transcribing', drafting: 'Writing', ready: 'Ready', error: 'Problem' };
  function list() {
    api('visits').then(function (j) {
      if (!j.ok) { put($('g-list'), '<li class="list-group-item text-danger small">' + esc(j.error || 'The drafts could not be loaded.') + '</li>'); if (j.code === 'connect') load(); return; }
      var vs = (j.visits || []).sort(function (a, b) { return (b.thisEncounter ? 1 : 0) - (a.thisEncounter ? 1 : 0); });
      put($('g-list'), vs.length ? vs.map(function (v) {
        return '<li class="list-group-item list-group-item-action d-flex" data-id="' + esc(v.id) + '" style="cursor:pointer"><div><b>' + esc(v.label || 'Visit') + '</b>' +
          (v.thisEncounter ? ' <span class="badge badge-info">this encounter</span>' : '') + (v.appliedAt ? ' <span class="badge badge-success">added</span>' : '') +
          '<div class="small text-muted">' + new Date(v.startedAt).toLocaleString() + ' · ' + (v.mode === 'in_person' ? 'in person' : 'telehealth') + (v.faceMin != null ? ' · ' + esc(v.faceMin) + ' min' : '') + '</div></div>' +
          '<span class="ml-auto badge badge-' + (v.status === 'ready' ? 'success' : v.status === 'error' ? 'danger' : 'warning') + ' align-self-center">' + esc(STATUS[v.status] || v.status) + '</span></li>';
      }).join('') : '<li class="list-group-item text-muted small">No drafts in the last 14 days.</li>');
      $('g-list').querySelectorAll('[data-id]').forEach(function (li) { li.onclick = function () { openVisit(li.dataset.id); }; });
    });
  }
  $('g-refresh').onclick = list;
  $('g-back').onclick = function () { clearTimeout(pollT); load(); };

  function openVisit(id) {
    clearTimeout(pollT);
    $('g-apply').disabled = false;
    show('g-review'); msg('');
    current = null;
    ['g-r-body', 'g-r-failed', 'g-gap', 'g-r-tools'].forEach(function (x) { $(x).classList.add('d-none'); });
    $('g-tools-msg').textContent = '';
    var poll = function () {
      api('status', null, '&visit=' + encodeURIComponent(id)).then(function (j) {
        if (!j.ok) { $('g-r-progress').classList.remove('d-none'); $('g-r-progress').textContent = j.error || 'This draft could not be loaded.'; return; }
        var v = current = j.visit;
        $('g-r-title').textContent = (v.label || 'Visit') + ' — ' + new Date(v.startedAt).toLocaleString();
        // Write again and Delete are there for a finished note and for one that failed.
        $('g-r-tools').classList.toggle('d-none', v.status !== 'ready' && v.status !== 'error');
        $('g-redo').classList.toggle('d-none', v.status !== 'ready');
        if (v.status === 'ready') { $('g-r-progress').classList.add('d-none'); $('g-r-failed').classList.add('d-none'); return review(v); }
        $('g-r-body').classList.add('d-none'); $('g-gap').classList.add('d-none');
        $('g-r-progress').classList.remove('d-none');
        $('g-r-progress').className = 'alert ' + (v.status === 'error' ? 'alert-danger' : 'alert-info');
        $('g-r-progress').textContent = v.status === 'error' ? 'No note was written: ' + v.error
          : v.status === 'drafting' ? 'Writing the note, codes and prescriptions… (about a minute)'
          : v.status === 'recording' ? 'Still recording. Press Stop in the recorder window to get the draft.'
          : v.retrying ? 'The note-writing service was busy. Trying again by itself…'
          : 'Transcribing (' + v.transcribed + ' of ' + v.segments + ' parts)…';
        // A note that failed: the way to retry and the transcript are right here.
        var raw = v.status === 'error' ? String(v.transcript || '') : '';
        $('g-r-failed').classList.toggle('d-none', !raw.trim());
        $('g-r-raw').textContent = raw;
        if (v.status !== 'error') pollT = setTimeout(poll, 4000);
      });
    };
    poll();
  }
  function redo(ask) {
    if (!current) return;
    if (ask && !confirm('Write this note again from the same transcript? This draft is replaced. Nothing in the chart changes.')) return;
    var id = current.id;
    $('g-retry').disabled = true; $('g-redo').disabled = true; $('g-tools-msg').textContent = 'Starting…';
    api('redo', { visit: id }).then(function (j) {
      $('g-retry').disabled = false; $('g-redo').disabled = false; $('g-tools-msg').textContent = '';
      if (!j.ok) return msg(j.error || 'Could not start.', 'danger');
      openVisit(id);
    });
  }
  $('g-retry').onclick = function () { redo(false); };   // nothing to replace: no note was written
  $('g-redo').onclick = function () { redo(true); };
  $('g-delete').onclick = function () {
    if (!current || !confirm('Delete this draft and its transcript from Grapheus now? This cannot be undone. Anything already added to the chart stays.')) return;
    api('clear', { visit: current.id }).then(function (j) { if (!j.ok) return msg(j.error || 'Could not delete.', 'danger'); clearTimeout(pollT); load(); });
  };

  // A draft recorded outside this encounter (extension, phone) carries only its label. When
  // the label shares no name with the open chart, the clinician is asked before it is added.
  function nameWords(s) { return String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 3; }); }
  function labelFitsPatient(label, patient) {
    var a = nameWords(label), b = nameWords(patient);
    if (!a.length || !b.length) return true;        // nothing to compare
    return a.some(function (w) { return b.indexOf(w) >= 0; });
  }
  function linkedHere(id) { return ((state && state.links) || []).some(function (l) { return l.visit_id === id; }); }

  // ---------------------------------------------------------------- review
  var TIME = { established: [[40, '99215'], [30, '99214'], [20, '99213'], [10, '99212']], new: [[60, '99205'], [45, '99204'], [30, '99203'], [15, '99202']] };
  function timeCode(total, pt) { var l = TIME[pt === 'new' ? 'new' : 'established']; for (var i = 0; i < l.length; i++) if (total >= l[i][0]) { var x = i === 0 ? Math.floor((total - l[0][0]) / 15) : 0; return l[i][1] + (x ? ' + 99417 ×' + x : ''); } return ''; }

  function review(v) {
    var r = v.result || {}, f = r.fields || {};
    $('g-r-body').classList.remove('d-none');
    // Part of the recording never reached the transcript: say so above the note.
    var gap = r.missingParts && r.missingParts.failed ? r.missingParts : null;
    var mp = v.mostlyPaused, clk = function (s) { return Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0'); };
    $('g-gap').classList.toggle('d-none', !gap && !mp);
    $('g-gap').textContent = mp ? 'This recording was paused for ' + clk(Number(mp.pausedSecs)) + ' of ' + clk(Number(mp.totalSecs)) + '. Only the rest was recorded, so this note covers only that part of the visit. Check it before adding it.' : gap ? 'Part of this recording could not be transcribed (' + Number(gap.failed) + ' of ' + Number(gap.of) + ' parts, about 5 minutes each). The note covers only what was transcribed; the transcript shows where the gap is. Check the note against your memory of the visit before adding it.' : '';
    var fits = linkedHere(v.id) || labelFitsPatient(v.label, state && state.patientName);
    $('g-apply-to').textContent = state && state.patientName ? 'Goes into the open encounter of ' + state.patientName + '.' + (fits ? '' : ' This draft is labelled “' + (v.label || '') + '”: check it is the same patient.') : '';
    $('g-apply-to').className = 'small mt-1 mb-0 ' + (fits ? 'text-muted' : 'text-danger font-weight-bold');
    var s = ['chief_complaint', 'hpi', 'ros', 'medications_mentioned', 'allergies_mentioned', 'history_mentioned']
      .filter(function (k) { return !none(f[k]); }).map(function (k) { return LABELS[k] + ': ' + f[k]; }).join('\n\n');
    $('g-s').value = s;
    $('g-o').value = f.physical_exam || '';
    var tx = v.transcript || '';
    $('g-tx-card').classList.toggle('d-none', !String(tx).trim());
    $('g-tx').textContent = tx;
    var dx = (r.diagnoses || []).map(function (d) { return '- ' + d.description + (d.icd10 ? ' (' + d.icd10 + ')' : ''); }).join('\n');
    $('g-a').value = (f.assessment || '') + (dx ? '\n\nDiagnoses:\n' + dx : '');
    $('g-p').value = (f.plan || '') + (none(f.patient_instructions) ? '' : '\n\nPatient instructions: ' + f.patient_instructions);

    // time
    var face = v.faceMin || 0;
    $('g-t-face').textContent = v.faceMin != null ? face + ' min' : '–';
    $('g-t-prep').value = v.prepMin || ''; $('g-t-doc').value = '';
    var recalc = function () {
      var total = face + (parseInt($('g-t-prep').value, 10) || 0) + (parseInt($('g-t-doc').value, 10) || 0);
      $('g-t-total').textContent = total + ' min';
      var c = timeCode(total, v.patientType);
      put($('g-t-code'), c ? 'Total time supports <b>' + c + '</b> (' + esc(v.patientType) + ' patient), if it beats the MDM level.' : '');
    };
    $('g-t-prep').oninput = recalc; $('g-t-doc').oninput = recalc; recalc();

    put($('g-problems'), (r.diagnoses || []).map(function (d, i) {
      return '<div class="g-row"><input type="checkbox" data-pr="' + i + '"' + (d.icd10 ? ' checked' : '') + '><div>' + esc(d.description) + ' <b>' + esc(d.icd10 || '') + '</b>' +
        (d.icd10_suggested ? ' <span class="g-flag">code looked up — check</span>' : (!d.certain ? ' <span class="g-flag">check</span>' : '')) + '</div></div>';
    }).join('') || '<p class="small text-muted mb-0">None.</p>');
    put($('g-allergies'), (r.allergies || []).map(function (a, i) {
      return '<div class="g-row"><input type="checkbox" data-al="' + i + '" checked><div>' + esc(a.substance) + (a.reaction ? ' — ' + esc(a.reaction) : '') + (a.severity ? ' (' + esc(a.severity) + ')' : '') + (!a.certain ? ' <span class="g-flag">check</span>' : '') + '</div></div>';
    }).join('') || '<p class="small text-muted mb-0">No new allergies reported.</p>');
    put($('g-rx'), (r.prescriptions || []).map(function (x, i) {
      var flag = (x.missing && x.missing.length ? 'Not stated: ' + x.missing.join(', ') + '. ' : '') + (!x.certain ? 'Unclear in the recording. ' : '') + (x.action && x.action !== 'new' ? String(x.action).toUpperCase() + '. ' : '');
      return '<div class="g-row"><input type="checkbox" data-rx="' + i + '"' + (x.action === 'stop' ? '' : ' checked') + '><div class="g-rx-grid">' +
        '<input class="form-control form-control-sm" data-f="drug" value="' + esc(x.drug) + '" title="Drug">' +
        '<input class="form-control form-control-sm" data-f="strength" value="' + esc(x.strength) + '" title="Strength">' +
        '<input class="form-control form-control-sm" data-f="sig" value="' + esc(x.sig) + '" title="Directions">' +
        '<input class="form-control form-control-sm" data-f="quantity" value="' + esc(x.quantity) + '" placeholder="Qty" title="Quantity">' +
        '<input class="form-control form-control-sm" data-f="refills" value="' + esc(x.refills) + '" placeholder="Refills" title="Refills"></div></div>' +
        (flag ? '<div class="g-flag mb-1">' + esc(flag) + (x.rxcui ? '' : 'No RxNorm match. ') + '</div>' : '');
    }).join('') || '<p class="small text-muted mb-0">No prescriptions decided in this visit.</p>');
    $('g-basis').textContent = r.billing_basis || '';
    put($('g-billing'), (r.billing || []).map(function (b, i) {
      return '<div class="g-row"><input type="checkbox" data-bi="' + i + '"' + (b.confidence === 'low' ? '' : ' checked') + '><div><b>' + esc(b.code) + (b.modifiers ? '-' + esc(b.modifiers) : '') + '</b> ' + esc(b.description) +
        ' <span class="badge badge-' + (b.confidence === 'high' ? 'success' : b.confidence === 'low' ? 'danger' : 'warning') + '">' + esc(b.confidence) + '</span>' +
        '<div class="small">' + esc(b.rationale) + '</div><div class="small text-muted">Document: ' + esc(b.documentation_needed) + '</div></div></div>';
    }).join('') || '<p class="small text-muted mb-0">None.</p>');
    paintConsider(v);
    var un = r.unclear || [];
    $('g-unclear-card').classList.toggle('d-none', !un.length);
    put($('g-unclear'), un.map(function (u) { return '<li>' + esc(LABELS[u.field] || String(u.field || '').replace(/_/g, ' ')) + ': heard “' + esc(u.as_heard) + '”' + (u.best_guess ? ' — best guess ' + esc(u.best_guess) : '') + '</li>'; }).join(''));
  }

  // ---------------------------------------------------------------- quality measures
  // Every measure for the open patient, with what is documented. Click one to document it as
  // done (or as not applying). Available whenever a patient is open: before, during or after a visit.
  var measures = [], qOpen = null, qAfter = null;
  function loadQuality() {
    if (!state || !state.pid) { $('g-quality-card').classList.add('d-none'); return; }
    api('quality').then(function (j) { if (j.ok) { measures = j.measures || []; paintQuality(); } });
  }
  function paintQuality() {
    $('g-quality-card').classList.remove('d-none');
    var done = measures.filter(function (m) { return m.docs.length; }), rest = measures.filter(function (m) { return !m.docs.length; });
    function row(m) {
      var d = m.docs[0];
      return '<div class="g-row"><div style="flex:1"><a href="#" data-q="' + esc(m.id) + '"><b>' + esc(m.name) + '</b></a> <span class="small text-muted">' + esc(m.ref) + '</span>' +
        (d ? '<div class="small">' + (d.status === 'excluded' ? 'Does not apply / declined' : 'Done') + ' ' + esc(d.doneOn) + (Object.keys(d.details || {}).length ? ': ' + Object.keys(d.details).map(function (k) { return esc((m.fields || {})[k] || k) + ' ' + esc(d.details[k]); }).join(', ') : '') +
          (d.note ? ' \u2014 ' + esc(d.note) : '') + (d.by ? ' <span class="text-muted">(' + esc(d.by) + ')</span>' : '') + ' <a href="#" class="text-danger" data-qvoid="' + d.id + '">remove</a>' + (m.docs.length > 1 ? ' <span class="text-muted">+' + (m.docs.length - 1) + ' earlier</span>' : '') + '</div>' : '') + '</div></div>';
    }
    put($('g-quality'), (done.length ? '<div class="small font-weight-bold">Documented</div>' + done.map(row).join('') : '') +
      '<details' + (done.length ? '' : ' open') + '><summary class="small font-weight-bold mt-2">All measures (' + rest.length + ' not documented)</summary>' + rest.map(row).join('') + '</details>');
    $('g-quality').querySelectorAll('[data-q]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); openQuality(a.getAttribute('data-q')); }; });
    $('g-quality').querySelectorAll('[data-qvoid]').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        if (!confirm('Remove this documentation entry?')) return;
        api('quality-void', { pid: state.pid, doc: Number(a.getAttribute('data-qvoid')) }).then(function (j) { if (j.ok) { measures = j.measures; paintQuality(); } });
      };
    });
  }
  function openQuality(id, after) {
    var m = measures.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    qOpen = m; qAfter = after || null;
    $('g-quality-card').classList.remove('d-none');
    $('g-q-title').textContent = m.name; $('g-q-ref').textContent = m.ref;
    $('g-q-date').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $('g-q-status').value = 'met'; $('g-q-note').value = ''; $('g-q-msg').textContent = '';
    put($('g-q-fields'), Object.keys(m.fields || {}).map(function (k) {
      return '<label class="small mb-0">' + esc(m.fields[k]) + '</label><input type="text" class="form-control form-control-sm mb-2" data-qf="' + esc(k) + '" maxlength="200">';
    }).join(''));
    $('g-q-form').classList.remove('d-none');
    $('g-q-form').scrollIntoView({ block: 'center' });
  }
  $('g-q-cancel').onclick = function () { $('g-q-form').classList.add('d-none'); qOpen = null; };
  $('g-q-save').onclick = function () {
    if (!qOpen) return;
    var details = {};
    $('g-q-fields').querySelectorAll('[data-qf]').forEach(function (i) { details[i.getAttribute('data-qf')] = i.value; });
    $('g-q-save').disabled = true;
    api('quality-save', { pid: state.pid, measure: qOpen.id, doneOn: $('g-q-date').value, status: $('g-q-status').value, details: details, note: $('g-q-note').value }).then(function (j) {
      $('g-q-save').disabled = false;
      if (!j.ok) { $('g-q-msg').textContent = j.error || 'That did not save.'; return; }
      measures = j.measures; $('g-q-form').classList.add('d-none');
      var after = qAfter; qOpen = null; qAfter = null;
      paintQuality();
      if (after) after();
    });
  };

  // ---------------------------------------------------------------- for you to consider
  // The private checklist (result.consider). "Add task" puts a message on this patient's chart
  // (a New Orders message for a test), assigned to you; it is a task, never an order.
  function paintConsider(v) {
    var c = (v.result || {}).consider, actions = v.considerActions || {}, h = '';
    var COST = { low: 'low cost', moderate: 'moderate cost', high: 'high cost' };
    function badge(word, cls) { return '<span class="badge badge-' + cls + '">' + esc(word) + '</span> '; }
    function row(kind, i, inner) {
      var a = actions[kind + ':' + i] || '';
      return '<div class="g-row"><div style="flex:1"' + (a ? ' class="text-muted"' : '') + '>' + inner + '</div><div>' +
        (a === 'done' ? badge(kind === 'tests' ? 'Added' : kind === 'quality' ? 'Documented' : 'Task added', 'success') :
          kind === 'quality' ? '<button type="button" class="btn btn-sm btn-outline-primary" data-qdoc="' + i + '"' + (a ? ' disabled' : '') + '>Document</button> ' :
          '<button type="button" class="btn btn-sm btn-outline-primary" data-con="' + kind + ':' + i + ':task"' + (a ? ' disabled' : '') + '>' + (kind === 'tests' ? 'Add to lab order' : 'Add task') + '</button> ') +
        (a === 'done' ? '' : '<button type="button" class="btn btn-sm btn-outline-secondary' + (a === 'skip' ? ' active' : '') + '" data-con="' + kind + ':' + i + ':skip">Not needed</button>') + '</div></div>';
    }
    function sec(title, kind, list, inner) {
      if (!list || !list.length) return;
      h += '<div class="small font-weight-bold mt-2">' + esc(title) + '</div>' + list.map(function (x, i) { return row(kind, i, inner(x)); }).join('');
    }
    if (c) {
      sec('Possible missed diagnoses', 'diagnoses', c.diagnoses, function (d) { return '<b>' + esc(d.diagnosis) + '</b>' + (d.icd10 ? ' ' + esc(d.icd10) : '') + '<div class="small">' + esc(d.why) + '</div>' + (d.confirm ? '<div class="small text-muted">To confirm or exclude: ' + esc(d.confirm) + '</div>' : ''); });
      sec('Labs and imaging to consider', 'tests', c.tests, function (t) { return '<b>' + esc(t.test) + '</b> ' + (t.cost ? badge(COST[t.cost], t.cost === 'high' ? 'warning' : t.cost === 'low' ? 'success' : 'secondary') : '') + '<span class="small">' + esc(t.reason) + '</span>' + (t.value ? '<div class="small text-muted">Worth it? ' + esc(t.value) + '</div>' : ''); });
      sec('By condition', 'conditions', c.conditions, function (x) { return '<b>' + esc(x.condition) + '</b><div class="small">Testing: ' + esc(x.testing) + '</div><div class="small">Medication: ' + esc(x.medication) + '</div>'; });
      sec('For your specialty', 'specialty', c.specialty, function (x) { return '<b>' + esc(x.item) + '</b><div class="small">' + esc(x.why) + '</div>'; });
      sec('Quality measures', 'quality', c.quality, function (q) { return badge({ gap: 'Open', met: 'Met', unknown: 'Not documented' }[q.status] || '', q.status === 'gap' ? 'warning' : q.status === 'met' ? 'success' : 'secondary') + '<b>' + esc(q.name) + '</b> <span class="small text-muted">' + esc(q.ref) + '</span><div class="small">' + esc(q.why) + '</div>'; });
      sec('Preventive care (USPSTF)', 'preventive', c.preventive, function (p) { return badge({ due: 'Due', unknown: 'Not documented', done: 'Done' }[p.status] || '', p.status === 'due' ? 'warning' : p.status === 'done' ? 'success' : 'secondary') + '<b>' + esc(p.name) + '</b> <span class="small text-muted">grade ' + esc(p.grade) + '</span><div class="small">' + esc(p.why) + '</div>'; });
    }
    $('g-consider-card').classList.toggle('d-none', !h);
    put($('g-consider'), h);
    $('g-consider').querySelectorAll('[data-qdoc]').forEach(function (b) {
      b.onclick = function () {
        var q = c.quality[Number(b.getAttribute('data-qdoc'))];
        openQuality(q.id, function () {
          api('consider-mark', { visit: v.id, kind: 'quality', index: Number(b.getAttribute('data-qdoc')), action: 'done' }).then(function (j) { if (j.ok) { v.considerActions = j.considerActions || {}; paintConsider(v); } });
        });
      };
    });
    $('g-consider').querySelectorAll('[data-con]').forEach(function (b) {
      b.onclick = function () {
        var p = b.getAttribute('data-con').split(':'), task = p[2] === 'task';
        b.disabled = true;
        $('g-consider-msg').textContent = '';
        api(task ? 'consider-task' : 'consider-mark', { visit: v.id, kind: p[0], index: Number(p[1]), pid: state.pid, action: b.classList.contains('active') ? '' : 'skip' }).then(function (j) {
          if (!j.ok) { b.disabled = false; $('g-consider-msg').textContent = j.error || 'That did not work.'; return; }
          v.considerActions = j.considerActions || {};
          paintConsider(v);
          if (task) $('g-consider-msg').textContent = j.placed === 'order' ? (j.already ? j.name + ' is already on the pending lab order.' : 'Added ' + j.name + ' to the pending lab order in this encounter. Open the order to review and send it.')
            : j.placed === 'archway' ? 'Added. It will already be picked when you open Create Order for this patient.'
            : (p[0] === 'tests' ? 'This OpenEMR has no matching lab order to add it to, so a New Orders message was added to the patient\u2019s messages, assigned to you.' : 'Task added to this patient\u2019s messages, assigned to you.');
        });
      };
    });
  }

  // ---------------------------------------------------------------- apply
  $('g-apply').onclick = function () {
    if (!current) return;
    var r = current.result || {};
    var checked = function (attr) { return Array.prototype.map.call(document.querySelectorAll('[data-' + attr + ']:checked'), function (el) { return Number(el.getAttribute('data-' + attr)); }); };
    var plan = $('g-p').value;
    if ($('g-t-add').checked) {
      var face = current.faceMin || 0, prep = parseInt($('g-t-prep').value, 10) || 0, doc = parseInt($('g-t-doc').value, 10) || 0;
      plan += '\n\nI spent a total of ' + (face + prep + doc) + ' minutes on this patient’s care on the date of the encounter, including ' + face + ' minutes face-to-face' +
        (prep ? ', ' + prep + ' minutes reviewing records before the visit' : '') + (doc ? ' and ' + doc + ' minutes documenting and coordinating care' : '') + '.';
    }
    var rxRows = document.querySelectorAll('#g-rx .g-row');
    var payload = {
      visit: current.id,
      // The patient and encounter this page is showing; the server refuses if OpenEMR has moved on.
      pid: state.pid, encounter: state.encounter,
      soap: $('g-add-note').checked ? { subjective: $('g-s').value, objective: $('g-o').value, assessment: $('g-a').value, plan: plan } : null,
      problems: checked('pr').map(function (i) { var d = r.diagnoses[i]; return { title: d.description, icd10: d.icd10 }; }),
      diagnoses: checked('pr').map(function (i) { return r.diagnoses[i]; }),
      allergies: checked('al').map(function (i) { return r.allergies[i]; }),
      prescriptions: checked('rx').map(function (i) {
        var x = Object.assign({}, r.prescriptions[i]);
        rxRows[i].querySelectorAll('[data-f]').forEach(function (inp) { x[inp.dataset.f] = inp.value; });
        return x;
      }),
      billing: checked('bi').map(function (i) { return r.billing[i]; }),
    };
    var n = payload.prescriptions.length;
    var who = state.patientName || 'the open patient';
    if (!linkedHere(current.id) && !labelFitsPatient(current.label, state.patientName) &&
      !confirm('CHECK THE PATIENT\n\nThis draft is labelled “' + (current.label || '') + '”, but the open chart is ' + who + '.\n\nAdd it to ' + who + '’s encounter anyway?')) return;
    if (!confirm('Add the checked items to ' + who + '’s encounter?' + (n ? '\n\n' + n + ' prescription(s) will be ENTERED, not sent.' : '') + (payload.billing.length ? '\nFee-sheet codes will be entered unbilled.' : ''))) return;
    $('g-apply').disabled = true;
    api('apply', payload).then(function (j) {
      if (!j.ok) { $('g-apply').disabled = false; msg(j.error || 'Nothing was added.', 'danger'); window.scrollTo(0, 0); return; }
      var s = j.summary;
      msg('Added: ' + [s.note ? 'SOAP note' : '', s.problems.length ? s.problems.length + ' problem(s)' : '', s.allergies.length ? s.allergies.length + ' allergy(ies)' : '',
        s.prescriptions.length ? s.prescriptions.length + ' prescription(s), not sent' : '', s.billing.length ? s.billing.length + ' fee-sheet line(s), unbilled' : ''].filter(Boolean).join(', ') +
        (s.skipped.length ? '. Skipped: ' + s.skipped.join('; ') : '') + '. Opening the encounter…', 'success');
      setTimeout(function () { if (top.restoreSession) top.restoreSession(); location.href = root.dataset.encounterUrl; }, 2500);
    });
  };

  load();
})();
