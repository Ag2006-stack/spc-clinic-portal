'use strict';
/* SPC Clinic Portal – JavaScript version of the Java/Swing "SDF" project.
   Data lives in the browser's localStorage (replaces MySQL "Java_Medical"). */

const ADMIN_NAME = 'Admin',
  ADMIN_PASS = '1952'; // same hardcoded admin as the Java app
const SEMESTERS = [
  { label: '1st Semester 2025', start: '2025-01-01', end: '2025-05-31' },
  { label: '2nd Semester 2025', start: '2025-06-01', end: '2025-12-31' },
];
const TEMPLATES = {
  confirm:
    'Appointment Confirmed! Please be at the clinic 5 minutes before your schedule on [Date/Time].',
  cancel:
    'Appointment Canceled. Reason: [Reason]. Suggested alternative: [Suggestion]. Please visit the portal to select a new time.',
  clearance:
    'Medical Clearance Issued. You are cleared to attend classes/activities. Stay healthy!',
  hdfok:
    'Your Health Declaration Form (HDF) Request has been Approved. Please Get Your HDF In The Clinic On [Date/Time].',
  hdfno:
    'HDF Request Canceled. Reason: [Reason]. Suggested alternative: [Suggestion]. Please fill out a new form or contact the clinic.',
};

/* ---------- storage (tables) ---------- */
const DB = {
  get(t) {
    try {
      return JSON.parse(localStorage.getItem('spc_' + t)) || [];
    } catch {
      return [];
    }
  },
  set(t, rows) {
    try {
      localStorage.setItem('spc_' + t, JSON.stringify(rows));
    } catch {
      toast('Could not save data (browser storage blocked).', true);
    }
  },
};
let session = null; // {role:'student', id} or {role:'admin'}
try {
  session = JSON.parse(sessionStorage.getItem('spc_session'));
} catch {}
const saveSession = () => {
  try {
    sessionStorage.setItem('spc_session', JSON.stringify(session));
  } catch {}
};

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
let toastTimer;
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 3200);
}
function info(title, body) {
  $('#dlg-title').textContent = title;
  $('#dlg-body').textContent = body;
  $('#dlg').showModal();
}
function confirmBox(title, body) {
  return new Promise((res) => {
    const d = $('#confirm-dlg');
    $('#cd-title').textContent = title;
    $('#cd-body').textContent = body;
    const done = (v) => {
      d.close();
      res(v);
    };
    $('#cd-yes').onclick = () => done(true);
    $('#cd-no').onclick = () => done(false);
    d.oncancel = () => res(false);
    d.showModal();
  });
}
async function hash(s) {
  if (!(window.crypto && crypto.subtle)) return 'plain:' + s;
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
const pad = (n) => String(n).padStart(2, '0');
const nowStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
function fmtDateTime(date, time) {
  // MM/dd/yyyy h:mma, like the Java formatDateTime
  const d = new Date(`${date}T${time.length === 5 ? time + ':00' : time}`);
  if (isNaN(d)) return `${date} ${time}`;
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${pad(d.getMonth() + 1)}/${pad(
    d.getDate()
  )}/${d.getFullYear()} ${h}:${pad(d.getMinutes())}${ap}`;
}
const inRange = (date, s, e) => date >= s && date <= e;
const byNewest = (a, b) =>
  (b.appt_date + b.appt_time).localeCompare(a.appt_date + a.appt_time);

/* ---------- navigation ---------- */
function show(view) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
}
$$('[data-go]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    show(a.dataset.go);
  })
);

function enter() {
  if (!session) return show('login');
  if (session.role === 'admin') {
    show('admin');
    adminTab('records');
    renderActive();
  } else {
    const me = currentStudent();
    if (!me) {
      session = null;
      saveSession();
      return show('login');
    }
    show('student');
    studentTab('home');
  }
}

/* ---------- sign up / login ---------- */
$('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#su-name').value.trim(),
    id = $('#su-id').value.trim(),
    pass = $('#su-pass').value;
  if (!name || !id || !pass) return toast('All fields are required.', true);
  const students = DB.get('students');
  if (students.some((s) => s.id === id))
    return toast('Registration Failed: School ID already exists.', true);
  students.push({ name, id, password: await hash(pass), age: '', gender: '' });
  DB.set('students', students);
  e.target.reset();
  toast('New account created! You can now log in.');
  show('login');
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#login-name').value.trim(),
    pass = $('#login-pass').value;
  if (!name || !pass) return toast('Full Name and Password are required', true);
  if (name === ADMIN_NAME && pass === ADMIN_PASS) {
    session = { role: 'admin' };
    saveSession();
    $('#login-form').reset();
    return enter();
  }
  const s = DB.get('students').find((x) => x.name === name);
  if (!s) return toast('User not found or Incorrect Name', true);
  if (s.password !== (await hash(pass))) {
    $('#login-pass').value = '';
    return toast('Incorrect Password', true);
  }
  session = { role: 'student', id: s.id };
  saveSession();
  $('#login-form').reset();
  enter();
});

function logout() {
  session = null;
  saveSession();
  show('login');
}
$('#logout-student').onclick = async () => {
  if (await confirmBox('Log Out', 'Are you sure you want to log out?'))
    logout();
};
$('#logout-admin').onclick = logout;

/* ---------- student ---------- */
const currentStudent = () =>
  DB.get('students').find((s) => s.id === session.id);

function studentTab(name) {
  $$('#view-student .tab').forEach((t) => t.classList.add('hidden'));
  $('#tab-' + name).classList.remove('hidden');
  $$('#view-student nav [data-tab]').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  const me = currentStudent();
  if (name === 'home') {
    $('#h-welcome').textContent = me.name;
    $('#h-name').textContent = me.name;
    $('#h-id').textContent = me.id;
    $('#h-age').textContent = me.age || '—';
    $('#h-gender').textContent = me.gender || '—';
  }
  if (name === 'appointment') {
    $('#a-id').value = me.id;
    $('#a-name').value = me.name;
  }
  if (name === 'profile') {
    $('#p-name').value = me.name;
    $('#p-id').value = me.id;
    $('#p-age').value = me.age;
    $('#p-gender').value = me.gender;
    $('#p-pass').value = '';
    $('#p-pass').placeholder = 'Enter a new password to change it';
    $('#p-pass').required = false;
  }
  if (name === 'notifications') renderNotifications();
  updateBadge();
}
$$('#view-student [data-tab]').forEach((b) =>
  b.addEventListener('click', () => studentTab(b.dataset.tab))
);

function updateBadge() {
  const seen = Number(localStorage.getItem('spc_seen_' + session.id) || 0);
  const n =
    DB.get('messages').filter((m) => m.student_id === session.id).length - seen;
  const b = $('#notif-badge');
  b.textContent = n;
  b.classList.toggle('hidden', n <= 0);
}
function renderNotifications() {
  const msgs = DB.get('messages')
    .filter((m) => m.student_id === session.id)
    .sort((a, b) => b.sent_date.localeCompare(a.sent_date));
  $('#notif-list').innerHTML = msgs.length
    ? msgs
        .map(
          (m) =>
            `<div class="note"><time>${esc(m.sent_date)}</time>${esc(
              m.message_content
            )}</div>`
        )
        .join('')
    : '<p class="muted">No new notifications for you.</p>';
  try {
    localStorage.setItem('spc_seen_' + session.id, msgs.length);
  } catch {}
}

$('#appt-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const type = ($('input[name="a-type"]:checked') || {}).value || 'Unspecified';
  const row = {
    student_id: $('#a-id').value.trim(),
    student_name: $('#a-name').value.trim(),
    appt_date: $('#a-date').value,
    appt_time: $('#a-time').value,
    doctor: $('#a-doctor').value.trim(),
    reason: $('#a-reason').value.trim(),
    type,
    submission_time: nowStamp(),
  };
  if (!row.student_id || !row.student_name || !row.appt_date || !row.appt_time)
    return toast('Please fill in all fields!', true);
  const rows = DB.get('appointments');
  rows.push(row);
  DB.set('appointments', rows);
  e.target.reset();
  $('#a-id').value = row.student_id;
  $('#a-name').value = row.student_name;
  toast('Appointment request saved successfully!');
});

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const students = DB.get('students'),
    i = students.findIndex((s) => s.id === session.id);
  const name = $('#p-name').value.trim(),
    id = $('#p-id').value.trim();
  if (!name || !id) return toast('Name and ID are required.', true);
  if (id !== session.id && students.some((s) => s.id === id))
    return toast('That School ID is already taken.', true);
  const old = students[i],
    newPass = $('#p-pass').value;
  students[i] = {
    ...old,
    name,
    id,
    age: $('#p-age').value,
    gender: $('#p-gender').value.trim(),
    password: newPass ? await hash(newPass) : old.password,
  };
  DB.set('students', students);
  if (id !== old.id) {
    // keep the student's messages attached to the new ID
    DB.set(
      'messages',
      DB.get('messages').map((m) =>
        m.student_id === old.id ? { ...m, student_id: id } : m
      )
    );
    try {
      localStorage.setItem(
        'spc_seen_' + id,
        localStorage.getItem('spc_seen_' + old.id) || 0
      );
    } catch {}
  }
  session.id = id;
  saveSession();
  toast('Profile updated successfully!');
  studentTab('home');
});

/* ---------- admin ---------- */
function adminTab(name) {
  $$('#view-admin .tab').forEach((t) => t.classList.add('hidden'));
  $('#atab-' + name).classList.remove('hidden');
  $$('#view-admin nav [data-atab]').forEach((b) =>
    b.classList.toggle('active', b.dataset.atab === name)
  );
  if (name === 'search') renderSearch();
}
$$('#view-admin [data-atab]').forEach((b) =>
  b.addEventListener('click', () => adminTab(b.dataset.atab))
);

let table = 'appointments',
  archiveSem = null; // current records view
function recordsHtml(rows, withDelete) {
  if (!rows.length) return '<tr><td class="empty">No records.</td></tr>';
  return (
    `<thead><tr><th>ID</th><th>Name</th><th>Date</th><th>Time</th><th>Doctor</th><th>Reason</th><th>Type</th><th>Submitted</th>${
      withDelete ? '<th></th>' : ''
    }</tr></thead><tbody>` +
    rows
      .map(
        (r, i) => `<tr><td>${esc(r.student_id)}</td><td>${esc(
          r.student_name
        )}</td><td>${esc(r.appt_date)}</td><td>${esc(
          r.appt_time
        )}</td><td>${esc(r.doctor)}</td>
      <td class="reason" data-reason="${i}">${
          esc(r.reason) || '—'
        }</td><td>${esc(r.type)}</td><td>${esc(r.submission_time)}</td>
      ${
        withDelete
          ? `<td><button class="btn" data-del="${i}">Delete</button></td>`
          : ''
      }</tr>`
      )
      .join('') +
    '</tbody>'
  );
}
let shown = [];
function renderRecords(rows, title) {
  shown = rows.slice().sort(byNewest);
  $('#records-title').textContent = title + ` (${shown.length})`;
  $('#records-table').innerHTML = recordsHtml(shown, true);
  $('#archive-delete-bar').classList.toggle(
    'hidden',
    table !== 'appointment_archive'
  );
}
function renderActive() {
  table = 'appointments';
  archiveSem = null;
  renderRecords(DB.get('appointments'), 'Current records');
}
function renderArchive(i) {
  table = 'appointment_archive';
  archiveSem = i;
  const s = SEMESTERS[i];
  renderRecords(
    DB.get('appointment_archive').filter((r) =>
      inRange(r.appt_date, s.start, s.end)
    ),
    'Archive – ' + s.label
  );
}
$('#view-active').onclick = renderActive;
$$('[data-archive-view]').forEach(
  (b) => (b.onclick = () => renderArchive(+b.dataset.archiveView))
);

$('#records-table').addEventListener('click', async (e) => {
  const rc = e.target.closest('[data-reason]');
  if (rc)
    return info(
      'Reason',
      shown[+rc.dataset.reason].reason || '(no reason given)'
    );
  const del = e.target.closest('[data-del]');
  if (del) {
    const r = shown[+del.dataset.del];
    if (
      !(await confirmBox(
        'Delete record',
        `Delete the record for ${r.student_name} (${r.student_id}) on ${r.appt_date}?`
      ))
    )
      return;
    const rows = DB.get(table),
      k = rows.findIndex((x) => JSON.stringify(x) === JSON.stringify(r));
    if (k >= 0) {
      rows.splice(k, 1);
      DB.set(table, rows);
    }
    table === 'appointments' ? renderActive() : renderArchive(archiveSem);
  }
});

$$('[data-archive-do]').forEach(
  (b) =>
    (b.onclick = async () => {
      const s = SEMESTERS[+b.dataset.archiveDo],
        rows = DB.get('appointments');
      const move = rows.filter((r) => inRange(r.appt_date, s.start, s.end));
      if (!move.length)
        return toast(
          `No active records found to archive for ${s.label}.`,
          true
        );
      if (
        !(await confirmBox(
          'Confirm Archive Action',
          `Archive all CURRENT records for ${s.label}?\n\nThis moves ${move.length} record(s) from active records to the archive.`
        ))
      )
        return;
      DB.set('appointment_archive', DB.get('appointment_archive').concat(move));
      DB.set(
        'appointments',
        rows.filter((r) => !inRange(r.appt_date, s.start, s.end))
      );
      toast(`${move.length} records archived for ${s.label}.`);
      renderActive();
    })
);
$$('[data-delete-active]').forEach(
  (b) =>
    (b.onclick = async () => {
      const s = SEMESTERS[+b.dataset.deleteActive],
        rows = DB.get('appointments');
      const gone = rows.filter((r) => inRange(r.appt_date, s.start, s.end));
      if (!gone.length)
        return toast(`No active records found for ${s.label}.`, true);
      if (
        !(await confirmBox(
          'CONFIRM DELETE ACTIVE RECORDS',
          `Permanently delete ${gone.length} active record(s) for ${s.label}? This cannot be undone.`
        ))
      )
        return;
      DB.set(
        'appointments',
        rows.filter((r) => !inRange(r.appt_date, s.start, s.end))
      );
      toast(`${gone.length} active records deleted for ${s.label}.`);
      renderActive();
    })
);
$('#delete-archive').onclick = async () => {
  const s = SEMESTERS[archiveSem],
    rows = DB.get('appointment_archive');
  const gone = rows.filter((r) => inRange(r.appt_date, s.start, s.end));
  if (!gone.length)
    return toast(`No archive records found for ${s.label}.`, true);
  if (
    !(await confirmBox(
      'CONFIRM DELETE ARCHIVE RECORDS',
      `Permanently delete ${gone.length} archive record(s) for ${s.label}? This cannot be undone.`
    ))
  )
    return;
  DB.set(
    'appointment_archive',
    rows.filter((r) => !inRange(r.appt_date, s.start, s.end))
  );
  toast(`${gone.length} archive records deleted.`);
  renderArchive(archiveSem);
};

/* search tab */
function renderSearch() {
  const q = $('#search-id').value.trim().toLowerCase();
  const rows = DB.get('appointments')
    .filter((r) => !q || r.student_id.toLowerCase().includes(q))
    .sort(byNewest);
  $('#search-table').innerHTML = rows.length
    ? '<thead><tr><th>Type</th><th>ID</th><th>Name</th><th>Date</th><th>Time</th><th>Doctor</th><th>Reason</th></tr></thead><tbody>' +
      rows
        .map(
          (r, i) =>
            `<tr><td>${esc(r.type)}</td><td>${esc(r.student_id)}</td><td>${esc(
              r.student_name
            )}</td><td>${esc(r.appt_date)}</td><td>${esc(
              r.appt_time
            )}</td><td>${esc(r.doctor)}</td><td class="reason" data-s="${i}">${
              esc(r.reason) || '—'
            }</td></tr>`
        )
        .join('') +
      '</tbody>'
    : '<tr><td class="empty">No records found.</td></tr>';
  $('#search-table')._rows = rows;
}
$('#search-btn').onclick = renderSearch;
$('#search-id').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') renderSearch();
});
$('#search-table').addEventListener('click', (e) => {
  const c = e.target.closest('[data-s]');
  if (c)
    info(
      'Full Reason',
      $('#search-table')._rows[+c.dataset.s].reason || '(no reason given)'
    );
});

/* message sender */
function latestFor(id, kind) {
  // kind: 'any' | 'HDF' | 'APPT'
  return DB.get('appointments')
    .filter(
      (r) =>
        r.student_id === id &&
        (kind === 'any' ||
          (kind === 'HDF' ? r.type === 'HDF' : r.type !== 'HDF'))
    )
    .sort(byNewest)[0];
}
function resetLookup() {
  $('#m-name').textContent =
    $('#m-type').textContent =
    $('#m-date').textContent =
      '---';
}
$('#m-lookup').onclick = () => {
  const id = $('#m-id').value.trim();
  if (!id) return toast('Please enter a Student ID to lookup.', true);
  resetLookup();
  const s = DB.get('students').find((x) => x.id === id);
  if (!s) return toast(`Student ID '${id}' not found.`, true);
  $('#m-name').textContent = s.name;
  const r = latestFor(id, 'any');
  $('#m-type').textContent = r ? r.type : 'NONE FOUND';
  $('#m-date').textContent = r
    ? fmtDateTime(r.appt_date, r.appt_time)
    : 'NONE FOUND';
};
const tplChoice = () => ($('input[name="m-tpl"]:checked') || {}).value;
$$('input[name="m-tpl"]').forEach((r) =>
  r.addEventListener('change', () =>
    $('#m-extra').classList.toggle(
      'hidden',
      !['cancel', 'hdfno'].includes(tplChoice())
    )
  )
);
$('#m-send').onclick = () => {
  const id = $('#m-id').value.trim(),
    tpl = tplChoice();
  if (!id) return toast('Please enter the Student ID.', true);
  if (!tpl) return toast('Please select a message template option.', true);
  const s = DB.get('students').find((x) => x.id === id);
  if (!s) return toast(`Student ID '${id}' not found.`, true);
  let msg = TEMPLATES[tpl];
  if (tpl === 'cancel' || tpl === 'hdfno') {
    const reason = $('#m-reason').value.trim(),
      sug = $('#m-suggest').value.trim();
    if (!reason) return toast('Cancellation requires a typed Reason.', true);
    msg = msg
      .replace('[Reason]', reason)
      .replace('[Suggestion]', sug || 'N/A (check portal for available slots)');
  } else if (tpl === 'confirm' || tpl === 'hdfok') {
    const r = latestFor(id, tpl === 'hdfok' ? 'HDF' : 'APPT');
    if (!r)
      return toast(
        tpl === 'hdfok'
          ? 'No recent HDF request record found for this student.'
          : 'No recent appointment found for this ID.',
        true
      );
    msg = msg.replace('[Date/Time]', fmtDateTime(r.appt_date, r.appt_time));
  }
  const msgs = DB.get('messages');
  msgs.push({ student_id: id, message_content: msg, sent_date: nowStamp() });
  DB.set('messages', msgs);
  info('Message saved', `Recipient: ${s.name}\n\n${msg}`);
  $('#m-id').value = $('#m-reason').value = $('#m-suggest').value = '';
  $$('input[name="m-tpl"]').forEach((r) => (r.checked = false));
  $('#m-extra').classList.add('hidden');
  resetLookup();
};

enter();
