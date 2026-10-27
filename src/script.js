import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ukcoeeaqghzagsmumxiu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XeRi9LbzhqjYbu1twH9G_g_nVLGyQHQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_NAME = 'Admin', ADMIN_PASS = '1952';

const TEMPLATES = {
  confirm:   'Appointment Confirmed! Please be at the clinic 5 minutes before your schedule on [Date/Time].',
  cancel:    'Appointment Canceled. Reason: [Reason]. Suggested alternative: [Suggestion]. Please visit the portal to select a new time.',
  clearance: 'Medical Clearance Issued. You are cleared to attend classes/activities. Stay healthy!',
  hdfok:     'Your Health Declaration Form (HDF) Request has been Approved. Please Get Your HDF In The Clinic On [Date/Time].',
  hdfno:     'HDF Request Canceled. Reason: [Reason]. Suggested alternative: [Suggestion]. Please fill out a new form or contact the clinic.',
};

let session = null;
try { session = JSON.parse(sessionStorage.getItem('spc_session')); } catch {}
const saveSession = () => { try { sessionStorage.setItem('spc_session', JSON.stringify(session)); } catch {} };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; 
  t.className = 'show ' + (isError ? 'error' : 'success');
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
  if (!date || !time) return '—';
  const d = new Date(`${date}T${time.length === 5 ? time + ':00' : time}`);
  if (isNaN(d)) return `${date} ${time}`;
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${h}:${pad(d.getMinutes())}${ap}`;
}

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

    const { data: existingId } = await supabase.from('students').select('id').eq('id', id).maybeSingle();
    if (existingId) return toast('Registration Failed: School ID already exists.', true);

    const { data: existingName } = await supabase.from('students').select('name').eq('name', name).maybeSingle();
    if (existingName) return toast('Registration Failed: Full Name is already registered.', true);

    const { error } = await supabase.from('students').insert([{ id, name, password: await hash(pass), age: '', gender: '', avatar: '' }]);
    if (error) return toast('Registration failed: ' + error.message, true);

    toast('Account created! Redirecting to login...', false);
    setTimeout(() => window.location.href = 'index.html', 1500);
  });
}

if ($('#login-form')) {
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const loginInput = $('#login-id').value.trim(), pass = $('#login-pass').value;
    if (!loginInput || !pass) return toast('School ID / Name and Password are required', true);

    if (loginInput === ADMIN_NAME && pass === ADMIN_PASS) {
      session = { role: 'admin' }; saveSession(); window.location.href = 'admin.html'; return;
    }

    let { data: student } = await supabase.from('students').select('*').eq('id', loginInput).maybeSingle();
    if (!student) {
      const { data: studentByName } = await supabase.from('students').select('*').eq('name', loginInput).maybeSingle();
      student = studentByName;
    }

    if (!student) return toast('User not found or Incorrect School ID / Name', true);
    if (student.password !== await hash(pass)) return toast('Incorrect Password', true);

    session = { role: 'student', id: student.id }; saveSession(); window.location.href = 'student.html';
  });
}

const logout = () => { session = null; saveSession(); window.location.href = 'index.html'; };
if ($('#logout-student')) $('#logout-student').onclick = async () => { if (await confirmBox('Log Out', 'Are you sure?')) logout(); };
if ($('#logout-admin')) $('#logout-admin').onclick = logout;

// STUDENT DASHBOARD LOGIC
async function loadStudentProfile() {
  if (!session) return;
  const { data: me } = await supabase.from('students').select('*').eq('id', session.id).single();
  if (!me) return logout();

  if ($('#h-welcome')) $('#h-welcome').textContent = me.name;
  if ($('#h-name')) $('#h-name').textContent = me.name;
  if ($('#h-id')) $('#h-id').textContent = me.id;
  if ($('#h-age')) $('#h-age').textContent = me.age || '—';
  if ($('#h-gender')) $('#h-gender').textContent = me.gender || '—';
  if ($('#h-avatar')) $('#h-avatar').src = me.avatar || 'images/logo.png';
  if ($('#a-id')) { $('#a-id').value = me.id; $('#a-name').value = me.name; }
  if ($('#p-name')) { $('#p-name').value = me.name; $('#p-id').value = me.id; $('#p-age').value = me.age || ''; $('#p-gender').value = me.gender || ''; }
}

async function checkDateAvailability(selectedDate) {
  const noticeBox = $('#date-notice');
  const submitBtn = $('#appt-submit-btn');
  const doctorSelect = $('#a-doctor');
  if (!noticeBox || !selectedDate) return;

  const { data: sched } = await supabase.from('clinic_schedule').select('*').eq('date', selectedDate).maybeSingle();

  if (!sched) {
    noticeBox.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = false;
    if (doctorSelect) doctorSelect.disabled = false;
    return;
  }

  noticeBox.classList.remove('hidden');
  const reasonText = sched.reason ? ` Note: ${sched.reason}` : '';

  if (sched.status === 'closed') {
    noticeBox.innerHTML = `<p style="margin: 0; color: var(--danger);"><b>Clinic Closed on ${selectedDate}.</b> Appointments and requests are disabled for this date.${reasonText}</p>`;
    if (submitBtn) submitBtn.disabled = true;
  } else if (sched.status === 'working_student_only') {
    noticeBox.innerHTML = `<p style="margin: 0; color: var(--warn);"><b>Working Student / Staff Only on ${selectedDate}.</b> Doctors/Nurses are unavailable. ${reasonText}</p>`;
    if (submitBtn) submitBtn.disabled = false;
    if (doctorSelect) {
      doctorSelect.value = 'Working Student / Staff on Duty';
      doctorSelect.disabled = true;
    }
  } else if (sched.status === 'nurse_only') {
    noticeBox.innerHTML = `<p style="margin: 0; color: var(--teal);"><b>Nurse on Duty Only on ${selectedDate}.</b> Doctor is unavailable.${reasonText}</p>`;
    if (submitBtn) submitBtn.disabled = false;
    if (doctorSelect) {
      doctorSelect.value = 'Nurse on Duty (No Doctor)';
      doctorSelect.disabled = true;
    }
  }
}

async function studentTab(name) {
  $$('#view-student .tab').forEach(t => t.classList.add('hidden'));
  if ($('#tab-' + name)) $('#tab-' + name).classList.remove('hidden');
  $$('#view-student nav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  
  if (name === 'home') await loadStudentProfile();
  if (name === 'appointment') {
    await loadStudentProfile();
    const today = new Date().toISOString().split('T')[0];
    if ($('#a-date')) {
      $('#a-date').min = today;
      if ($('#a-date').value) await checkDateAvailability($('#a-date').value);
    }
  }
  if (name === 'notifications') await renderNotifications();
  await updateBadge();
}

if (pageId === 'page-student') {
  $$('#view-student [data-tab]').forEach(b => b.addEventListener('click', () => studentTab(b.dataset.tab)));
  
  if ($('#a-date')) {
    $('#a-date').addEventListener('change', e => checkDateAvailability(e.target.value));
  }

  $$('input[name="a-type"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const isHDF = e.target.value === 'HDF';
      const docGroup = $('#doctor-group');
      if (docGroup) docGroup.classList.toggle('hidden', isHDF);
    });
  });

  if ($('#a-doctor')) {
    $('#a-doctor').addEventListener('change', e => {
      const customGroup = $('#custom-doctor-group');
      if (customGroup) customGroup.classList.toggle('hidden', e.target.value !== 'custom');
    });
  }

  studentTab('home');
}

async function updateBadge() {
  if (!session) return;
  const seen = Number(localStorage.getItem('spc_seen_' + session.id) || 0);
  const { data: msgs } = await supabase.from('messages').select('id').eq('student_id', session.id);
  const count = msgs ? msgs.length - seen : 0;
  const b = $('#notif-badge'); if (b) { b.textContent = count; b.classList.toggle('hidden', count <= 0); }
}

async function renderNotifications() {
  if (!session) return;
  const { data: msgs } = await supabase.from('messages').select('*').eq('student_id', session.id).order('sent_date', { ascending: false });
  $('#notif-list').innerHTML = (msgs && msgs.length)
    ? msgs.map(m => `<div class="note"><time>${esc(m.sent_date)}</time>${esc(m.message_content)}</div>`).join('')
    : '<p class="muted">No new notifications for you.</p>';
  if (msgs) try { localStorage.setItem('spc_seen_' + session.id, msgs.length); } catch {}
}

if ($('#appt-form')) {
  $('#appt-form').addEventListener('submit', async e => {
    e.preventDefault();
    const type = ($('input[name="a-type"]:checked') || {}).value || 'Unspecified';
    
    let doctorVal = 'Clinic Staff (HDF Processing)';
    if (type !== 'HDF') {
      const selectedDoc = $('#a-doctor')?.value;
      if (selectedDoc === 'custom') {
        doctorVal = $('#a-doctor-custom')?.value.trim() || 'Custom Schedule';
      } else {
        doctorVal = selectedDoc || 'Nurse on Duty';
      }
    }

    const row = {
      student_id: $('#a-id').value.trim(),
      student_name: $('#a-name').value.trim(),
      appt_date: $('#a-date').value,
      appt_time: $('#a-time').value,
      doctor: doctorVal,
      reason: $('#a-reason').value.trim(),
      type,
      submission_time: nowStamp(),
    };

    if (!row.student_id || !row.student_name || !row.appt_date || !row.appt_time || !row.reason) {
      return toast('Please fill in all required fields!', true);
    }

    const { error } = await supabase.from('appointments').insert([row]);
    if (error) return toast('Failed to save request: ' + error.message, true);

    e.target.reset(); 
    $('#a-id').value = row.student_id; 
    $('#a-name').value = row.student_name;
    if ($('#custom-doctor-group')) $('#custom-doctor-group').classList.add('hidden');
    if ($('#date-notice')) $('#date-notice').classList.add('hidden');
    toast(`${type} request saved successfully!`, false);
  });
}

if ($('#profile-form')) {
  $('#profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#p-name').value.trim(), id = $('#p-id').value.trim();
    if (!name || !id) return toast('Name and ID are required.', true);

    const { data: old } = await supabase.from('students').select('*').eq('id', session.id).single();
    const newPass = $('#p-pass').value;
    const avatarFile = $('#p-avatar')?.files[0];
    let avatarUrl = old.avatar || '';

    if (avatarFile) {
      try { avatarUrl = await readFileAsDataURL(avatarFile); } catch { return toast('Failed to read image file.', true); }
    }

    const updates = {
      name,
      id,
      age: $('#p-age').value,
      gender: $('#p-gender').value.trim(),
      password: newPass ? await hash(newPass) : old.password,
      avatar: avatarUrl
    };

    const { error } = await supabase.from('students').update(updates).eq('id', session.id);
    if (error) return toast('Update failed: ' + error.message, true);

    session.id = id; saveSession();
    toast('Profile updated successfully!', false); studentTab('home');
  });
}

// ADMIN DASHBOARD LOGIC
function adminTab(name) {
  $$('#view-admin .tab').forEach(t => t.classList.add('hidden'));
  if ($('#atab-' + name)) $('#atab-' + name).classList.remove('hidden');
  $$('#view-admin nav [data-atab]').forEach(b => b.classList.toggle('active', b.dataset.atab === name));
  if (name === 'search') renderSearch();
  if (name === 'schedule') renderScheduleTable();
}

let table = 'appointments', activeArchiveSem = null;

function recordsHtml(rows, withDelete) {
  if (!rows || !rows.length) return '<tr><td class="empty">No records.</td></tr>';
  return `<thead><tr><th>ID</th><th>Name</th><th>Date</th><th>Time</th><th>Doctor/Personnel</th><th>Reason</th><th>Type</th><th>Submitted</th>${withDelete ? '<th></th>' : ''}</tr></thead><tbody>` +
    rows.map(r => `<tr><td>${esc(r.student_id)}</td><td>${esc(r.student_name)}</td><td>${esc(r.appt_date)}</td><td>${esc(r.appt_time)}</td><td>${esc(r.doctor)}</td>
      <td class="reason" data-reason="${r.id}">${esc(r.reason) || '—'}</td><td>${esc(r.type)}</td><td>${esc(r.submission_time)}</td>
      ${withDelete ? `<td><button class="btn" data-del="${r.id}">Delete</button></td>` : ''}</tr>`).join('') + '</tbody>';
}

let shown = [];
async function renderActive() {
  table = 'appointments'; activeArchiveSem = null;
  const { data: rows } = await supabase.from('appointments').select('*').order('appt_date', { ascending: false });
  shown = rows || [];
  if ($('#records-title')) $('#records-title').textContent = `Current records (${shown.length})`;
  if ($('#records-table')) $('#records-table').innerHTML = recordsHtml(shown, true);
  if ($('#archive-delete-bar')) $('#archive-delete-bar').classList.add('hidden');
}

async function renderArchive(s) {
  table = 'appointment_archive'; activeArchiveSem = s;
  const { data: rows } = await supabase.from('appointment_archive').select('*').gte('appt_date', s.start).lte('appt_date', s.end).order('appt_date', { ascending: false });
  shown = rows || [];
  if ($('#records-title')) $('#records-title').textContent = `Archive – ${s.label} (${shown.length})`;
  if ($('#records-table')) $('#records-table').innerHTML = recordsHtml(shown, true);
  if ($('#archive-delete-bar')) $('#archive-delete-bar').classList.remove('hidden');
}

async function renderScheduleTable() {
  const { data: rows } = await supabase.from('clinic_schedule').select('*').order('date', { ascending: true });
  if ($('#sched-table')) {
    $('#sched-table').innerHTML = (rows && rows.length)
      ? '<thead><tr><th>Date</th><th>Status</th><th>Note / Reason</th><th></th></tr></thead><tbody>' +
        rows.map(r => `<tr><td>${esc(r.date)}</td><td><b>${esc(r.status.replace(/_/g, ' ').toUpperCase())}</b></td><td>${esc(r.reason) || '—'}</td><td><button class="btn danger" data-del-sched="${r.date}">Remove Restriction</button></td></tr>`).join('') + '</tbody>'
      : '<tr><td class="empty">No special date restrictions set.</td></tr>';
  }
}

function getSelectedSemester() {
  const choice = $('#sem-choice')?.value || '1';
  const yearStr = $('#sem-year')?.value;
  const year = parseInt(yearStr, 10) || new Date().getFullYear();

  if (choice === '1') {
    return { label: `1st Sem ${year}`, start: `${year}-08-01`, end: `${year}-12-31`, year: year };
  } else {
    return { label: `2nd Sem ${year}`, start: `${year}-01-01`, end: `${year}-07-31`, year: year };
  }
}

if (pageId === 'page-admin') {
  if ($('#sem-year')) $('#sem-year').value = new Date().getFullYear();
  $$('#view-admin [data-atab]').forEach(b => b.addEventListener('click', () => adminTab(b.dataset.atab)));

  if ($('#view-active')) $('#view-active').onclick = renderActive;

  if ($('#btn-view-archive')) {
    $('#btn-view-archive').onclick = async () => {
      const s = getSelectedSemester();
      await renderArchive(s);
    };
  }

  if ($('#sched-save')) {
    $('#sched-save').onclick = async () => {
      const d = $('#sched-date')?.value;
      const status = $('#sched-status')?.value;
      const reason = $('#sched-reason')?.value.trim();

      if (!d) return toast('Please select a date.', true);

      const { error } = await supabase.from('clinic_schedule').upsert([{ date: d, status, reason }]);
      if (error) return toast('Failed to save schedule: ' + error.message, true);

      toast(`Schedule restriction saved for ${d}!`, false);
      $('#sched-date').value = '';
      $('#sched-reason').value = '';
      await renderScheduleTable();
    };
  }

  if ($('#sched-table')) {
    $('#sched-table').addEventListener('click', async e => {
      const del = e.target.closest('[data-del-sched]');
      if (del) {
        const d = del.dataset.delSched;
        if (!await confirmBox('Remove Restriction', `Remove restriction for date ${d}?`)) return;
        await supabase.from('clinic_schedule').delete().eq('date', d);
        toast(`Restriction for ${d} removed.`, false);
        await renderScheduleTable();
      }
    });
  }

  if ($('#btn-do-archive')) {
    $('#btn-do-archive').onclick = async () => {
      const s = getSelectedSemester();
      const currentYear = new Date().getFullYear();

      if (s.year !== currentYear) {
        return toast(`Archiving locked: You can only archive records for the current year (${currentYear}).`, true);
      }

      const { data: move } = await supabase.from('appointments').select('*').gte('appt_date', s.start).lte('appt_date', s.end);
      if (!move || !move.length) return toast(`No active records found to archive for ${s.label}.`, true);

      if (!await confirmBox('Confirm Archive Action', `Archive ${move.length} record(s) for ${s.label}?`)) return;

      const cleanMove = move.map(({ id, ...rest }) => rest);
      const { error: insertErr } = await supabase.from('appointment_archive').insert(cleanMove);
      if (insertErr) return toast('Failed to archive: ' + insertErr.message, true);

      await supabase.from('appointments').delete().gte('appt_date', s.start).lte('appt_date', s.end);
      toast(`${move.length} records archived successfully for ${s.label}!`, false);
      await renderActive();
    };
  }

  if ($('#btn-delete-active')) {
    $('#btn-delete-active').onclick = async () => {
      const s = getSelectedSemester();
      const { data: gone } = await supabase.from('appointments').select('id').gte('appt_date', s.start).lte('appt_date', s.end);
      if (!gone || !gone.length) return toast(`No active records found for ${s.label}.`, true);

      if (!await confirmBox('CONFIRM DELETE', `Permanently delete ${gone.length} active record(s) for ${s.label}?`)) return;

      await supabase.from('appointments').delete().gte('appt_date', s.start).lte('appt_date', s.end);
      toast(`${gone.length} active records deleted for ${s.label}.`, false);
      await renderActive();
    };
  }

  if ($('#delete-archive')) {
    $('#delete-archive').onclick = async () => {
      const s = activeArchiveSem || getSelectedSemester();
      const { data: gone } = await supabase.from('appointment_archive').select('id').gte('appt_date', s.start).lte('appt_date', s.end);
      if (!gone || !gone.length) return toast(`No archive records found for ${s.label}.`, true);

      if (!await confirmBox('CONFIRM DELETE ARCHIVE RECORDS', `Delete ${gone.length} archive record(s) for ${s.label}?`)) return;

      await supabase.from('appointment_archive').delete().gte('appt_date', s.start).lte('appt_date', s.end);
      toast(`${gone.length} archive records deleted for ${s.label}.`, false);
      await renderArchive(s);
    };
  }

  if ($('#records-table')) {
    $('#records-table').addEventListener('click', async e => {
      const rc = e.target.closest('[data-reason]');
      if (rc) {
        const item = shown.find(x => String(x.id) === String(rc.dataset.reason));
        return info('Reason', item ? item.reason : '(no reason given)');
      }

      const del = e.target.closest('[data-del]');
      if (del) {
        const rId = del.dataset.del;
        if (!await confirmBox('Delete record', `Delete selected record?`)) return;
        await supabase.from(table).delete().eq('id', rId);
        table === 'appointments' ? await renderActive() : await renderArchive(activeArchiveSem);
      }
    });
  }

  adminTab('records');
  renderActive();
}

// SEARCH LOGIC
async function renderSearch() {
  const q = $('#search-id')?.value.trim().toLowerCase() || '';
  const { data: rows } = await supabase.from('appointments').select('*').order('appt_date', { ascending: false });
  const filtered = (rows || []).filter(r => !q || r.student_id.toLowerCase().includes(q));

  if ($('#search-table')) {
    $('#search-table').innerHTML = filtered.length
      ? '<thead><tr><th>Type</th><th>ID</th><th>Name</th><th>Date</th><th>Time</th><th>Doctor/Personnel</th><th>Reason</th></tr></thead><tbody>' +
        filtered.map(r => `<tr><td>${esc(r.type)}</td><td>${esc(r.student_id)}</td><td>${esc(r.student_name)}</td><td>${esc(r.appt_date)}</td><td>${esc(r.appt_time)}</td><td>${esc(r.doctor)}</td><td class="reason" data-s="${r.id}">${esc(r.reason) || '—'}</td></tr>`).join('') + '</tbody>'
      : '<tr><td class="empty">No records found.</td></tr>';
    $('#search-table')._rows = filtered;
  }
}

if ($('#search-btn')) $('#search-btn').onclick = renderSearch;
if ($('#search-table')) {
  $('#search-table').addEventListener('click', e => {
    const c = e.target.closest('[data-s]');
    if (c) {
      const item = $('#search-table')._rows?.find(x => String(x.id) === String(c.dataset.s));
      info('Full Reason', item ? item.reason : '(no reason given)');
    }
  });
}

// LOOKUP & MESSAGING LOGIC
let lookedUpStudent = null;
let lookedUpAppt = null;

async function doStudentLookup() {
  const id = $('#m-id')?.value.trim();
  if (!id) return toast('Please enter a Student ID to lookup.', true);

  const { data: student, error: sErr } = await supabase.from('students').select('*').eq('id', id).maybeSingle();
  if (sErr || !student) {
    lookedUpStudent = null;
    lookedUpAppt = null;
    if ($('#m-name')) $('#m-name').textContent = 'Student Not Found';
    if ($('#m-student-id')) $('#m-student-id').textContent = '---';
    if ($('#m-age-gender')) $('#m-age-gender').textContent = '---';
    if ($('#m-type')) $('#m-type').textContent = '---';
    if ($('#m-date')) $('#m-date').textContent = '---';
    if ($('#m-doctor')) $('#m-doctor').textContent = '---';
    if ($('#m-avatar')) $('#m-avatar').src = 'images/logo.png';
    return toast(`Student ID '${id}' not found.`, true);
  }

  lookedUpStudent = student;

  const { data: appts } = await supabase.from('appointments')
    .select('*')
    .eq('student_id', id)
    .order('appt_date', { ascending: false })
    .order('appt_time', { ascending: false })
    .limit(1);

  lookedUpAppt = appts && appts.length ? appts[0] : null;

  if ($('#m-name')) $('#m-name').textContent = student.name;
  if ($('#m-student-id')) $('#m-student-id').textContent = student.id;
  if ($('#m-age-gender')) $('#m-age-gender').textContent = `${student.age || '—'} yrs / ${student.gender || '—'}`;
  if ($('#m-avatar')) $('#m-avatar').src = student.avatar || 'images/logo.png';

  if (lookedUpAppt) {
    if ($('#m-type')) $('#m-type').textContent = lookedUpAppt.type || 'Appointment';
    if ($('#m-date')) $('#m-date').textContent = fmtDateTime(lookedUpAppt.appt_date, lookedUpAppt.appt_time);
    if ($('#m-doctor')) $('#m-doctor').textContent = lookedUpAppt.doctor || 'Nurse / Staff on Duty';
  } else {
    if ($('#m-type')) $('#m-type').textContent = 'No appointment records found';
    if ($('#m-date')) $('#m-date').textContent = '—';
    if ($('#m-doctor')) $('#m-doctor').textContent = '—';
  }

  toast(`Loaded profile for ${student.name}!`, false);
}

if ($('#m-lookup')) $('#m-lookup').onclick = doStudentLookup;
if ($('#m-id')) {
  $('#m-id').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doStudentLookup();
    }
  });
}

$$('input[name="m-tpl"]').forEach(radio => {
  radio.addEventListener('change', e => {
    const isCancel = ['cancel', 'hdfno'].includes(e.target.value);
    if ($('#m-extra')) $('#m-extra').classList.toggle('hidden', !isCancel);
  });
});

if ($('#m-send')) {
  $('#m-send').onclick = async () => {
    const id = $('#m-id')?.value.trim();
    const tplKey = ($('input[name="m-tpl"]:checked') || {}).value;

    if (!id || !tplKey) return toast('Please enter Student ID and select a message template.', true);

    if (!lookedUpStudent || lookedUpStudent.id !== id) {
      await doStudentLookup();
      if (!lookedUpStudent) return;
    }

    let msg = TEMPLATES[tplKey];
    const dateTimeStr = lookedUpAppt ? fmtDateTime(lookedUpAppt.appt_date, lookedUpAppt.appt_time) : 'your scheduled time';
    const reasonInput = $('#m-reason-input')?.value.trim() || 'Schedule conflict / Unforeseen circumstances';
    const suggestInput = $('#m-suggest-input')?.value.trim() || 'Next available clinic schedule';

    msg = msg.replace('[Date/Time]', dateTimeStr)
             .replace('[Reason]', reasonInput)
             .replace('[Suggestion]', suggestInput);

    const { error } = await supabase.from('messages').insert([{ 
      student_id: id, 
      message_content: msg, 
      sent_date: nowStamp() 
    }]);

    if (error) return toast('Failed to send message: ' + error.message, true);

    info('Message Sent', `Notification delivered to ${lookedUpStudent.name}:\n\n"${msg}"`);
    toast(`Message sent to ${lookedUpStudent.name}!`, false);
  };
}