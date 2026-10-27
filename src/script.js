'use strict';

const ADMIN_NAME = 'Admin', ADMIN_PASS = '1952';

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

const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
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

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = err => reject(err);
    reader.readAsDataURL(file);
  });
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
    students.push({ name, id, password: await hash(pass), age: '', gender: '', avatar: '' });
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
if ($('#logout-admin')) $('#logout-admin').onclick = logout;  // STUDENT DASHBOARD LOGIC const currentStudent = () => session ? DB.get('students').find(s => s.id === session.id) : null;  function studentTab(name) { $$('#view-student .tab').forEach(t => t.classList.add('hidden'));
  if ($('#tab-' + name)) $('#tab-' + name).classList.remove('hidden'); $$('#view-student nav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  const me = currentStudent(); if (!me) return;