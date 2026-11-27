const base = process.env.AJA_API_BASE ?? 'http://127.0.0.1:3002/api/v1';
const origin = process.env.AJA_FRONTEND_ORIGIN ?? 'http://127.0.0.1:3000';
const password = process.env.AJA_DEMO_PASSWORD;
if (!password) throw new Error('Set AJA_DEMO_PASSWORD to the local demo password.');

async function request(actor, path, { method = 'GET', body, idempotencyKey } = {}) {
  const headers = { Origin: origin };
  if (actor?.cookie) headers.Cookie = actor.cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = response.headers.getSetCookie?.()[0];
  if (actor && setCookie) actor.cookie = setCookie.split(';', 1)[0];
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
  console.log(`${method} ${path} -> ${response.status}`);
  if (response.status >= 400) console.log(`  ${payload?.error?.code ?? 'error'}`);
  return { status: response.status, payload };
}

async function login(email) {
  const actor = {};
  const result = await request(actor, '/auth/login', { method: 'POST', body: { email, password } });
  if (result.status !== 200 || !actor.cookie) throw new Error(`Login failed for ${email}: ${result.status}`);
  return actor;
}

const publicSession = await request(null, '/auth/session');
if (publicSession.status !== 401) throw new Error(`Expected anonymous session 401, got ${publicSession.status}`);

const admin = await login('admin@aja.local.test');
const teacher = await login('professora@aja.local.test');
const student = await login('aluno@aja.local.test');
for (const [actor, label] of [[admin, 'admin'], [teacher, 'teacher'], [student, 'student']]) {
  for (const path of ['/auth/session', '/me', '/me/enrollments', '/subjects']) {
    const response = await request(actor, path);
    if (response.status !== 200) throw new Error(`${label} ${path} returned ${response.status}`);
  }
}
for (const path of ['/questions', '/assessments', '/materials']) {
  const response = await request(student, path);
  if (response.status !== 200) throw new Error(`student ${path} returned ${response.status}`);
}

const denied = await request(student, '/attendance', {
  method: 'POST',
  idempotencyKey: `int05-denied-attendance-${Date.now()}`,
  body: { subjectId: 's1', date: '2026-11-25', time: '09:00', records: {} }
});
if (denied.status !== 403) throw new Error(`Expected student attendance write 403, got ${denied.status}`);

const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const existing = await request(teacher, '/attendance?subjectId=demo-subject');
const occupied = new Set((existing.payload.items ?? []).filter(row => row.date === date).map(row => row.time));
const minutes = Array.from({ length: 24 * 60 }, (_, minute) => minute).find(minute => !occupied.has(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`));
if (minutes === undefined) throw new Error('No free attendance time for the current date.');
const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const eligible = await request(teacher, `/attendance/eligible?subjectId=demo-subject&date=${date}&time=${encodeURIComponent(time)}`);
if (eligible.status !== 200) throw new Error(`Teacher eligibility returned ${eligible.status}`);
const ids = (eligible.payload.items ?? []).map(row => row.studentId ?? row.id).filter(Boolean);
if (!ids.length) throw new Error('No eligible students for the seeded subject.');
const created = await request(teacher, '/attendance', {
  method: 'POST',
  idempotencyKey: `int05-attendance-${Date.now()}`,
  body: { subjectId: 'demo-subject', date, time, records: Object.fromEntries(ids.map(id => [id, true])) }
});
if (created.status !== 201) throw new Error(`Teacher attendance write returned ${created.status}`);
const reloaded = await request(teacher, `/attendance/${created.payload.id}`);
if (reloaded.status !== 200) throw new Error(`Attendance reload returned ${reloaded.status}`);

const fileBytes = new TextEncoder().encode('%PDF-1.4\nINT-05 integration file\n%%EOF\n');
const form = new FormData();
form.set('purpose', 'material');
form.set('parentId', 'demo-module-1');
form.set('file', new Blob([fileBytes], { type: 'application/pdf' }), 'int05.pdf');
const uploadResponse = await fetch(`${base}/files`, {
  method: 'POST',
  headers: { Origin: origin, Cookie: teacher.cookie, 'Idempotency-Key': `int05-file-${Date.now()}` },
  body: form
});
console.log(`POST /files -> ${uploadResponse.status}`);
const uploaded = await uploadResponse.json();
if (uploadResponse.status !== 201) throw new Error(`Teacher file upload returned ${uploadResponse.status}`);
const downloadResponse = await fetch(`${base}/files/${uploaded.id}/content`, { headers: { Origin: origin, Cookie: teacher.cookie } });
console.log(`GET /files/${uploaded.id}/content -> ${downloadResponse.status}`);
if (downloadResponse.status !== 200 || !Buffer.from(await downloadResponse.arrayBuffer()).equals(Buffer.from(fileBytes))) throw new Error('Uploaded file bytes did not round-trip.');

const logout = await request(student, '/auth/logout', { method: 'POST' });
if (logout.status !== 204) throw new Error(`Logout returned ${logout.status}`);
student.cookie = undefined;
const loggedOut = await request(student, '/auth/session');
if (loggedOut.status !== 401) throw new Error(`Expected post-logout 401, got ${loggedOut.status}`);
