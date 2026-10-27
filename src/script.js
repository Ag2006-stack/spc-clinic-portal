'use strict';

const ADMIN_NAME = 'Admin', ADMIN_PASS = '1952';

// Dynamic year & semester generation
function getDynamicSemesters() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const semesters = [];

  years.forEach(yr => {
    semesters.push(
      { label: `1st Sem ${yr}`, start: `${yr}-01-01`, end: `${yr}-05-31` },
      { label: `2nd Sem ${yr}`, start: `${yr}-06-01`, end: `${yr}-12-31` }
    );
  });
  return semesters;
}

const SEMESTERS = getDynamicSemesters();

const TEMPLATES = {
  confirm:   'Appointment Confirmed! Please be at the clinic 5 minutes before your schedule on [Date/Time].',
  cancel:    'Appointment Canceled. Reason: [Reason]. Suggested alternative: [Suggestion]. Please visit the portal to select a new time.',
  clearance: 'Medical Clearance Issued. You are cleared to attend classes/activities. Stay healthy!',
  hdfok:     'Your Health Declaration Form (HDF) Request has been Approved. Please Get Your HDF In The Clinic On [Date/Time].',
  hdfno:     'HDF Request Canceled. Reason: [Reason]. Suggested alternative: [Suggestion]. Please fill out a new form or contact the clinic.',
};

const DB = {
  get(t) { try { return JSON.parse(localStorage.getItem('spc_' + t)) || []; } catch { return []; } },
  set(t, rows) { try { localStorage.setItem('spc_' + t, JSON.stringify(rows)); } catch { toast('Could not save data.', true); } },
};

let session = null;
try { session = JSON.parse(sessionStorage.getItem('spc_session')); } catch {}
const saveSession = () => { try { sessionStorage.setItem('spc_session', JSON.stringify(session)); } catch {} };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg, isError) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 3200);
}

function info(title, body) {
  if ($('#dlg-title')) { $('#dlg-title').textContent = title; $('#dlg-body').textContent = body; $('#dlg').showModal(); }
}

function confirmBox(title, body) {
  return new Promise(res => {
    const d = $('#confirm-dlg'); if (!d) return res(false);
    $('#cd-title').textContent = title; $('#cd-body').textContent = body;
    const done = v => { d.close(); res(v); };
    $('#cd-yes').onclick = () => done(true); $('#cd-no').onclick = () => done(false); d.oncancel = () => res(false);
    d.showModal();
  });
}

async function hash(s) {
  if (!(window.crypto && crypto.subtle)) return 'plain:' + s;
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

const pad = n => String(n).padStart(2, '0');
const nowStamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

function fmtDateTime(date, time) {
  const d = new Date(`${date}T${time.length === 5 ? time + ':00' : time}`);
  if (isNaN(d)) return `${date} ${time}`;
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${h}:${pad(d.getMinutes())}${ap}`;
}

const inRange = (date, s, e) => date >= s && date <= e;
const byNewest = (a, b) => (b.appt_date + b.appt_time).localeCompare(a.appt_date + a.appt_time);

const pageId = document.body.id;

function checkAuth() {
  if (pageId === 'page-login' || pageId === 'page-signup') {
    if (session?.role === 'admin') window.location.href = 'admin.html';
    if (session?.role === 'student') window.location.href = 'student.html';
  } else if (pageId === 'page-student') {
    if (!session || session.role !== 'student') window.location.href = 'index.html';
  } else if (pageId === 'page-admin') {
    if (!session || session.role !== 'admin') window.location.href = 'index.html';
  }
}
checkAuth();

// AUTHENTICATION
if ($('#signup-form')) {
  $('#signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#su-name').value.trim(), id = $('#su-id').value.trim(), pass = $('#su-pass').value;
    if (!name || !id || !pass) return toast('All fields are required.', true);
    const students = DB.get('students');
    if (students.some(s => s.id === id)) return toast('Registration Failed: School ID already exists.', true);
    students.push({ name, id, password: await hash(pass), age: '', gender: '' });
    DB.set('students', students);
    toast('Account created! Redirecting to login...');
    setTimeout(() => window.location.href = 'index.html', 1500);
  });
}

if ($('#login-form')) {
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#login-name').value.trim(), pass = $('#login-pass').value;
    if (!name || !pass) return toast('Full Name and Password are required', true);
    if (name === ADMIN_NAME && pass === ADMIN_PASS) {
      session = { role: 'admin' }; saveSession(); window.location.href = 'admin.html'; return;
    }
    const s = DB.get('students').find(x => x.name === name);
    if (!s) return toast('User not found or Incorrect Name', true);
    if (s.password !== await hash(pass)) return toast('Incorrect Password', true);
    session = { role: 'student', id: s.id }; saveSession(); window.location.href = 'student.html';
  });
}

const logout = () => { session = null; saveSession(); window.location.href = 'index.html'; };
if ($('#logout-student')) $('#logout-student').onclick = async () => { if (await confirmBox('Log Out', 'Are you sure?')) logout(); };
if ($('#logout-admin')) $('#logout-admin').onclick = logout;

// STUDENT DASHBOARD LOGIC
const currentStudent = () => session ? DB.get('students').find(s => s.id === session.id) : null;

function studentTab(name) {
  $$('#view-student .tab').forEach(t => t.classList.add('hidden'));
  if ($('#tab-' + name)) $('#tab-' + name).classList.remove('hidden');
  $$('#view-student nav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  const me = currentStudent(); if (!me) return;
  if (name === 'home') {
    $('#h-welcome').textContent = me.name; $('#h-name').textContent = me.name; $('#h-id').textContent = me.id;
    $('#h-age').textContent = me.age || '—'; $('#h-gender').textContent = me.gender || '—';
  }
  if (name === 'appointment') { $('#a-id').value = me.id; $('#a-name').value = me.name; }
  if (name === 'profile') {
    $('#p-name').value = me.name; $('#p-id').value = me.id; $('#p-age').value = me.age; $('#p-gender').value = me.gender; $('#p-pass').value = '';
  }
  if (name === 'notifications') renderNotifications();
  updateBadge();
}

if (pageId === 'page-student') {
  $$('#view-student [data-tab]').forEach(b => b.addEventListener('click', () => studentTab(b.dataset.tab)));
  studentTab('home');
}

function updateBadge() {
  if (!session) return;
  const seen = Number(localStorage.getItem('spc_seen_' + session.id) || 0);
  const n = DB.get('messages').filter(m => m.student_id === session.id).length - seen;
  const b = $('#notif-badge'); if (b) { b.textContent = n; b.classList.toggle('hidden', n <= 0); }
}

function renderNotifications() {
  if (!session) return;
  const msgs = DB.get('messages').filter(m => m.student_id === session.id).sort((a, b) => b.sent_date.localeCompare(a.sent_date));
  $('#notif-list').innerHTML = msgs.length
    ? msgs.map(m => `<div class="note"><time>${esc(m.sent_date)}</time>${esc(m.message_content)}</div>`).join('')
    : '<p class="muted">No new notifications for you.</p>';
  try { localStorage.setItem('spc_seen_' + session.id, msgs.length); } catch {}
}

if ($('#appt-form')) {
  $('#appt-form').addEventListener('submit', e => {
    e.preventDefault();
    const type = ($('input[name="a-type"]:checked') || {}).value || 'Unspecified';
    const row = {
      student_id: $('#a-id').value.trim(), student_name: $('#a-name').value.trim(),
      appt_date: $('#a-date').value, appt_time: $('#a-time').value,
      doctor: $('#a-doctor').value.trim(), reason: $('#a-reason').value.trim(), type, submission_time: nowStamp(),
    };
    if (!row.student_id || !row.student_name || !row.appt_date || !row.appt_time) return toast('Please fill in required fields!', true);
    const rows = DB.get('appointments'); rows.push(row); DB.set('appointments', rows);
    e.target.reset(); $('#a-id').value = row.student_id; $('#a-name').value = row.student_name;
    toast('Appointment request saved successfully!');
  });
}

if ($('#profile-form')) {
  $('#profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const students = DB.get('students'), i = students.findIndex(s => s.id === session.id);
    const name = $('#p-name').value.trim(), id = $('#p-id').value.trim();
    if (!name || !id) return toast('Name and ID are required.', true);
    const old = students[i], newPass = $('#p-pass').value;
    students[i] = { ...old, name, id, age: $('#p-age').value, gender: $('#p-gender').value.trim(), password: newPass ? await hash(newPass) : old.password };
    DB.set('students', students);
    session.id = id; saveSession();
    toast('Profile updated successfully!'); studentTab('home');
  });
}

// ADMIN DASHBOARD LOGIC & DYNAMIC SEMESTERS
function adminTab(name) {
  $$('#view-admin .tab').forEach(t => t.classList.add('hidden'));
  if ($('#atab-' + name)) $('#atab-' + name).classList.remove('hidden');
  $$('#view-admin nav [data-atab]').forEach(b => b.classList.toggle('active', b.dataset.atab === name));
  if (name === 'search') renderSearch();
}

let table = 'appointments', archiveSem = null;

function recordsHtml(rows, withDelete) {
  if (!rows || !rows.length) return '<tr><td class="empty">No records.</td></tr>';
  return `<thead><tr><th>ID</th><th>Name</th><th>Date</th><th>Time</th><th>Doctor</th><th>Reason</th><th>Type</th><th>Submitted</th>${withDelete ? '<th></th>' : ''}</tr></thead><tbody>` +
    rows.map((r, i) => `<tr><td>${esc(r.student_id)}</td><td>${esc(r.student_name)}</td><td>${esc(r.appt_date)}</td><td>${esc(r.appt_time)}</td><td>${esc(r.doctor)}</td>
      <td class="reason" data-reason="${i}">${esc(r.reason) || '—'}</td><td>${esc(r.type)}</td><td>${esc(r.submission_time)}</td>
      ${withDelete ? `<td><button class="btn" data-del="${i}">Delete</button></td>` : ''}</tr>`).join('') + '</tbody>';
}

let shown = [];
function renderRecords(rows, title) {
  shown = rows.slice().sort(byNewest);
  if ($('#records-title')) $('#records-title').textContent = title + ` (${shown.length})`;
  if ($('#records-table')) $('#records-table').innerHTML = recordsHtml(shown, true);
  if ($('#archive-delete-bar')) $('#archive-delete-bar').classList.toggle('hidden', table !== 'appointment_archive');
}

function renderActive() { table = 'appointments'; archiveSem = null; renderRecords(DB.get('appointments'), 'Current records'); }

function renderArchive(i) {
  table = 'appointment_archive'; archiveSem = i; const s = SEMESTERS[i];
  renderRecords(DB.get('appointment_archive').filter(r => inRange(r.appt_date, s.start, s.end)), 'Archive – ' + s.label);
}

function initSemesterDropdown() {
  const select = $('#semester-select');
  if (!select) return;
  select.innerHTML = SEMESTERS.map((sem, index) => `<option value="${index}">${sem.label}</option>`).join('');
}

if (pageId === 'page-admin') {
  initSemesterDropdown();
  $$('#view-admin [data-atab]').forEach(b => b.addEventListener('click', () => adminTab(b.dataset.atab)));

  if ($('#view-active')) $('#view-active').onclick = renderActive;

  if ($('#btn-view-archive')) {
    $('#btn-view-archive').onclick = () => {
      const idx = +$('#semester-select').value;
      renderArchive(idx);
    };
  }

  if ($('#btn-do-archive')) {
    $('#btn-do-archive').onclick = async () => {
      const idx = +$('#semester-select').value;
      const s = SEMESTERS[idx];
      const rows = DB.get('appointments');
      const move = rows.filter(r => inRange(r.appt_date, s.start, s.end));
      if (!move.length) return toast(`No active records found to archive for ${s.label}.`, true);
      if (!await confirmBox('Confirm Archive Action', `Archive ${move.length} record(s) for ${s.label}?`)) return;
      DB.set('appointment_archive', DB.get('appointment_archive').concat(move));
      DB.set('appointments', rows.filter(r => !inRange(r.appt_date, s.start, s.end)));
      toast(`${move.length} records archived for ${s.label}.`);
      renderActive();
    };
  }

  if ($('#btn-delete-active')) {
    $('#btn-delete-active').onclick = async () => {
      const idx = +$('#semester-select').value;
      const s = SEMESTERS[idx];
      const rows = DB.get('appointments');
      const gone = rows.filter(r => inRange(r.appt_date, s.start, s.end));
      if (!gone.length) return toast(`No active records found for ${s.label}.`, true);
      if (!await confirmBox('CONFIRM DELETE', `Permanently delete ${gone.length} active record(s) for ${s.label}?`)) return;
      DB.set('appointments', rows.filter(r => !inRange(r.appt_date, s.start, s.end)));
      toast(`${gone.length} active records deleted for ${s.label}.`);
      renderActive();
    };
  }

  if ($('#delete-archive')) {
    $('#delete-archive').onclick = async () => {
      const s = SEMESTERS[archiveSem], rows = DB.get('appointment_archive');
      const gone = rows.filter(r => inRange(r.appt_date, s.start, s.end));
      if (!gone.length) return toast(`No archive records found for ${s.label}.`, true);
      if (!await confirmBox('CONFIRM DELETE ARCHIVE RECORDS', `Delete ${gone.length} archive record(s) for ${s.label}?`)) return;
      DB.set('appointment_archive', rows.filter(r => !inRange(r.appt_date, s.start, s.end)));
      toast(`${gone.length} archive records deleted.`);
      renderArchive(archiveSem);
    };
  }

  if ($('#records-table')) {
    $('#records-table').addEventListener('click', async e => {
      const rc = e.target.closest('[data-reason]');
      if (rc) return info('Reason', shown[+rc.dataset.reason].reason || '(no reason given)');
      const del = e.target.closest('[data-del]');
      if (del) {
        const r = shown[+del.dataset.del];
        if (!await confirmBox('Delete record', `Delete record for ${r.student_name}?`)) return;
        const rows = DB.get(table), k = rows.findIndex(x => JSON.stringify(x) === JSON.stringify(r));
        if (k >= 0) { rows.splice(k, 1); DB.set(table, rows); }
        table === 'appointments' ? renderActive() : renderArchive(archiveSem);
      }
    });
  }

  adminTab('records');
  renderActive();
}

// SEARCH & MESSAGING LOGIC
function renderSearch() {
  const q = $('#search-id')?.value.trim().toLowerCase() || '';
  const rows = DB.get('appointments').filter(r => !q || r.student_id.toLowerCase().includes(q)).sort(byNewest);
  if ($('#search-table')) {
    $('#search-table').innerHTML = rows.length
      ? '<thead><tr><th>Type</th><th>ID</th><th>Name</th><th>Date</th><th>Time</th><th>Doctor</th><th>Reason</th></tr></thead><tbody>' +
        rows.map((r, i) => `<tr><td>${esc(r.type)}</td><td>${esc(r.student_id)}</td><td>${esc(r.student_name)}</td><td>${esc(r.appt_date)}</td><td>${esc(r.appt_time)}</td><td>${esc(r.doctor)}</td><td class="reason" data-s="${i}">${esc(r.reason) || '—'}</td></tr>`).join('') + '</tbody>'
      : '<tr><td class="empty">No records found.</td></tr>';
    $('#search-table')._rows = rows;
  }
}
if ($('#search-btn')) $('#search-btn').onclick = renderSearch;

if ($('#m-send')) {
  $('#m-send').onclick = () => {
    const id = $('#m-id').value.trim(), tpl = ($('input[name="m-tpl"]:checked') || {}).value;
    if (!id || !tpl) return toast('Please fill in student ID and choose a template.', true);
    const s = DB.get('students').find(x => x.id === id);
    if (!s) return toast(`Student ID '${id}' not found.`, true);
    let msg = TEMPLATES[tpl];
    const msgs = DB.get('messages'); msgs.push({ student_id: id, message_content: msg, sent_date: nowStamp() }); DB.set('messages', msgs);
    info('Message sent', `Sent to ${s.name}\n\n${msg}`);
  };
}