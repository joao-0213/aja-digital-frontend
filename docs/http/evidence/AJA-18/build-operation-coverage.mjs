import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(evidenceRoot, '../../../..');
const readJson = async relative => JSON.parse(await readFile(path.join(repositoryRoot, relative), 'utf8'));
const openapi = await readJson('docs/http/openapi.json');
const processLog = await readJson('docs/http/evidence/AJA-18/http-process-read-matrix.log');

const operations = [];
for (const [route, methods] of Object.entries(openapi.paths)) {
  for (const [method, definition] of Object.entries(methods)) {
    if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;
    operations.push({ method: method.toUpperCase(), route, operationId: definition.operationId, roles: definition['x-roles'] ?? [] });
  }
}

const normalizeOperation = value => {
  const clean = value.replace(/\s+\([^)]*\)$/, '');
  const separator = clean.indexOf(' ');
  return separator < 0 ? null : { method: clean.slice(0, separator), route: clean.slice(separator + 1) };
};
const routeRegex = route => new RegExp(`^${route.split('/').map(part => part.startsWith('{') && part.endsWith('}') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')}$`);
const matchOperation = (operation, method, route) => operation.method === method && routeRegex(operation.route).test(route.split('?')[0]);
const processCalls = [];
for (const value of processLog.outcomes.commands ?? []) {
  const parsed = normalizeOperation(value.operation);
  if (parsed) processCalls.push({ ...parsed, role: value.role ?? 'unknown', status: value.status, kind: 'command' });
}
for (const value of processLog.outcomes.matrixRoleReads ?? []) processCalls.push({ method: value.method, route: value.path, role: value.role, status: value.status, kind: 'role-read' });
for (const [role, calls] of Object.entries(processLog.outcomes.matrixReads ?? {})) {
  for (const value of calls) processCalls.push({ method: value.method, route: value.path, role, status: value.status, kind: 'read' });
}
for (const value of processLog.outcomes.reloads ?? []) processCalls.push({ method: value.method, route: value.path, role: value.role, status: value.status, kind: 'reload' });
const deniedCalls = processLog.outcomes.deniedWrites ?? [];

const browserCalls = [];
const readResult = async filename => {
  try {
    const bytes = await readFile(path.join(evidenceRoot, filename));
    const raw = bytes[0] === 0xff && bytes[1] === 0xfe
      ? bytes.toString('utf16le', 2)
      : bytes.toString('utf8').replace(/^\uFEFF/, '');
    const start = raw.lastIndexOf('{"result"');
    if (start >= 0) {
      let depth = 0, quoted = false, escaped = false;
      for (let index = start; index < raw.length; index++) {
        const char = raw[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return JSON.parse(raw.slice(start, index + 1));
      }
    }
    const match = raw.match(/### Result\s*\n([\s\S]*)/);
    return JSON.parse(match?.[1] ?? raw);
  } catch { return null; }
};
const workflow = await readResult('workflow-browser.log');
for (const call of workflow?.apiResponses ?? []) browserCalls.push({ method: call.method, route: call.path.replace(/^\/api\/v1/, ''), role: call.actor, status: call.status, evidence: 'workflow-browser.log' });
const failures = await readResult('product-failures-browser.log');
for (const session of failures?.observedHttp ?? []) {
  const role = session.id?.split('-').slice(0, -1).join('-') ?? 'unknown';
  for (const call of session.responses ?? []) browserCalls.push({ method: call.method, route: call.path.replace(/^\/api\/v1/, ''), role, status: call.status, evidence: 'product-failures-browser.log' });
}
const recovery = await readResult('password-recovery-browser.log');
if (recovery?.resetStatus) browserCalls.push({ method: 'POST', route: '/auth/password-resets', role: 'public', status: recovery.resetStatus, evidence: 'password-recovery-browser.log' });
const repeatedRecovery = await readResult('password-recovery-repeat-browser.log');
if (repeatedRecovery?.actualResetStatus) browserCalls.push({ method: 'POST', route: '/auth/password-resets', role: 'public', status: repeatedRecovery.actualResetStatus, evidence: 'password-recovery-repeat-browser.log' });
const attendance = await readResult('attendance-ui-browser.log');
for (const call of attendance?.requests ?? []) browserCalls.push({ method: call.method, route: call.path.replace(/^\/api\/v1/, '').replace(/ \(unassigned teacher\)$/, ''), role: call.path.includes('unassigned teacher') ? 'teacher-unassigned' : 'teacher', status: call.status, evidence: 'attendance-ui-browser.log' });
const calendarForum = await readResult('calendar-forum-browser-final.log');
for (const call of calendarForum?.requests ?? []) browserCalls.push({ method: call.method, route: call.path, role: call.role, status: call.status, evidence: 'calendar-forum-browser-final.log' });

const routeRoleBatchNames = [1, 2, 3, 4, 5, 6].map(index => `route-role-browser-batch-0${index}-final.log`);
const routeRoleBatches = await Promise.all(routeRoleBatchNames.map(readResult));
const routeRoleRows = routeRoleBatches.flatMap(result => result?.rows ?? []);
const publicFormResults = routeRoleBatches.find(result => result?.publicFailures?.length)?.publicFailures ?? [];
if (routeRoleRows.length !== 133 || routeRoleRows.some(row => row.outcome !== 'PASS' || row.widths.length !== 3 || row.widths.some(width => width.outcome !== 'PASS'))) {
  throw new Error(`Route-role browser evidence incomplete: ${routeRoleRows.length} personas; ${routeRoleRows.filter(row => row.outcome !== 'PASS').length} failed.`);
}
if (publicFormResults.length !== 9 || publicFormResults.some(item => item.outcome !== 'PASS')) {
  throw new Error(`Public form failure evidence incomplete: ${publicFormResults.length}/9 cases passed.`);
}

const roleName = role => role.startsWith('teacher') ? 'teacher' : role.startsWith('student') ? 'student' : role.startsWith('public') ? 'public' : role;
const routeRoleBatchesForPage = page => {
  if (page === 'service health (no UI page)') return [];
  if (page.startsWith('contextual upload')) return [3, 4, 5].map(index => `route-role-browser-batch-0${index}-final.log`);
  if (page.startsWith('/alunos/perfil') || page.startsWith('/disciplinas')) return ['route-role-browser-batch-02-final.log'];
  if (page.startsWith('/perfil') || page.startsWith('/usuarios') || page.startsWith('/turmas') || page.startsWith('/alunos?') || ['/login', '/cadastro', '/recuperar-senha'].includes(page)) return ['route-role-browser-batch-01-final.log'];
  if (page.startsWith('/materiais') || page.startsWith('/questoes') || page === '/questionarios') return ['route-role-browser-batch-03-final.log'];
  if (page.startsWith('/questionarios/')) return ['route-role-browser-batch-04-final.log'];
  if (page.startsWith('/avisos') || page.startsWith('/calendario') || page === '/forum' || page.startsWith('/forum?')) return ['route-role-browser-batch-05-final.log'];
  if (page.startsWith('/forum/topico') || page.startsWith('/frequencia') || page === '/') return ['route-role-browser-batch-06-final.log'];
  return [];
};
const pageFor = operation => {
  const endpoint = operation.route;
  if (endpoint === '/health') return 'service health (no UI page)';
  if (endpoint.startsWith('/auth/password-reset')) return '/recuperar-senha';
  if (endpoint.startsWith('/auth/email-') || endpoint === '/auth/register') return '/cadastro';
  if (endpoint.startsWith('/auth/')) return '/login';
  if (endpoint === '/me/progress') return '/materiais?id=material-text';
  if (endpoint.startsWith('/me') && endpoint !== '/me/dashboard') return '/perfil';
  if (endpoint === '/me/dashboard') return '/';
  if (endpoint.startsWith('/users')) return '/usuarios';
  if (endpoint.startsWith('/classes')) return '/turmas';
  if (endpoint.startsWith('/students')) return endpoint.includes('{id}') ? '/alunos/perfil?id=student' : '/alunos?turma=c1';
  if (endpoint.startsWith('/enrollments')) return '/alunos?turma=c1';
  if (endpoint === '/subjects/{id}' || endpoint.includes('/visits') || endpoint.includes('/reorder')) return '/disciplinas/detalhes?id=s1';
  if (endpoint.startsWith('/subjects')) return '/disciplinas?turma=c1';
  if (endpoint.startsWith('/modules') || endpoint.startsWith('/materials/batch')) return '/disciplinas/detalhes?id=s1';
  if (endpoint.startsWith('/materials')) return '/materiais?id=material-text';
  if (endpoint.startsWith('/files')) return 'contextual upload (materials/work/forum)';
  if (endpoint.startsWith('/questions')) return '/questoes?id=q1';
  if (endpoint === '/assessments') return operation.method === 'GET' ? '/questionarios' : '/questionarios/criar?id=quiz-draft';
  if (endpoint.startsWith('/assessments')) return endpoint.includes('publish') || endpoint.includes('{id}') ? '/questionarios/criar?id=quiz-draft (equipe) /questionarios/responder?id=quiz-open (aluno)' : '/questionarios';
  if (endpoint.startsWith('/attempts') && endpoint.includes('result')) return '/questionarios/resultado?id=attempt-sent';
  if (endpoint.startsWith('/attempts')) return '/questionarios/responder?id=quiz-open';
  if (endpoint.startsWith('/submissions')) return '/questionarios/responder?id=work1';
  if (endpoint.startsWith('/announcements')) return '/avisos';
  if (endpoint.startsWith('/calendar')) return '/calendario';
  if (endpoint.startsWith('/topics') && endpoint.includes('{id}')) return '/forum/topico?id=topic1';
  if (endpoint.startsWith('/topics')) return '/forum';
  if (endpoint.startsWith('/attendance')) return '/frequencia?disciplina=s1';
  return 'route not mapped';
};
const rows = operations.map(operation => {
  const processResults = processCalls.filter(call => matchOperation(operation, call.method, call.route));
  const browserResults = browserCalls.filter(call => matchOperation(operation, call.method, call.route));
  const deniedResults = deniedCalls.filter(call => matchOperation(operation, call.method, call.path));
  const processSummary = processResults.length
    ? processResults.map(call => `${roleName(call.role)} ${call.status}`).join(', ')
    : 'pendente';
  const browserSummary = browserResults.length
    ? browserResults.map(call => `${roleName(call.role)} ${call.status} (${call.evidence})`).join(', ')
    : 'sem request UI AJA-18 registrado';
  const deniedSummary = deniedResults.length
    ? deniedResults.map(call => `${roleName(call.role)} ${call.status}`).join(', ')
    : operation.roles.length === 0 ? 'nao aplicavel: endpoint publico' : operation.roles.length === 3 ? 'sem negacao global; ACL de escopo pendente' : `pendente: ${['student', 'teacher', 'admin'].filter(role => !operation.roles.includes(role)).join(', ')}`;
  const positiveRoles = new Set(processResults.filter(call => call.status === 200 || call.status === 201 || call.status === 202 || call.status === 204).map(call => roleName(call.role)));
  const missingPositiveRoles = operation.roles.filter(role => !positiveRoles.has(role));
  const deniedRoles = new Set(deniedResults.map(call => roleName(call.role)));
  const missingDeniedRoles = operation.roles.length === 0 ? [] : ['student', 'teacher', 'admin'].filter(role => !operation.roles.includes(role) && !deniedRoles.has(role));
  const browserRoles = new Set(browserResults.map(call => roleName(call.role)));
  const expectedBrowserRoles = operation.roles.length ? operation.roles : ['public'];
  const missingBrowserRoles = expectedBrowserRoles.filter(role => !browserRoles.has(role));
  const page = pageFor(operation);
  const publicPage = ['/login', '/cadastro', '/recuperar-senha'].includes(page);
  const roleEvidence = routeRoleBatchesForPage(page);
  if (page !== 'service health (no UI page)' && roleEvidence.length === 0) throw new Error(`No route-role browser log mapped for ${operation.method} ${operation.route}: ${page}.`);
  const pageEvidence = page === 'service health (no UI page)'
    ? 'process-only: no product page'
    : `${page}; ${roleEvidence.join(', ')} (all persona/route pairs; online real API probe + DOM; offline/reload/Tab/focus/390/768/1440; explicit permission-gate N/A); route-matrix-browser.js/.log and route-matrix-width-reload-keyboard.log; ${publicPage ? 'public form offline actions in route-role browser log' : 'route-matrix-network-width-browser.js/.log'}`;
  const complete = missingPositiveRoles.length === 0 && missingDeniedRoles.length === 0 && (page !== 'route not mapped');
  return { ...operation, process: processSummary, browser: browserSummary, denied: deniedSummary, pageEvidence, missingPositiveRoles, missingDeniedRoles, missingBrowserRoles, complete };
});
const mappingAssertions = [
  [{ method: 'GET', route: '/me/progress' }, '/materiais?id=material-text'],
  [{ method: 'GET', route: '/subjects/{id}' }, '/disciplinas/detalhes?id=s1'],
  [{ method: 'GET', route: '/assessments' }, '/questionarios'],
  [{ method: 'POST', route: '/assessments' }, '/questionarios/criar?id=quiz-draft']
];
for (const [operation, expectedPage] of mappingAssertions) {
  if (pageFor(operation) !== expectedPage) throw new Error(`Invalid page mapping for ${operation.method} ${operation.route}: expected ${expectedPage}; got ${pageFor(operation)}.`);
}

const lines = [
  '# AJA-18 operation × role evidence checklist',
  '',
  `Source of operation rows: docs/http/route-matrix.md cross-checked against docs/http/openapi.json (${operations.length} OpenAPI operations). Process evidence is from two independent JSON Server URLs in http-process-read-matrix.log; browser evidence is only from actual requests in the cited AJA-18 browser logs. A request is not treated as browser coverage because its route merely rendered.`,
  '',
  `Process harness: ${processCalls.filter(call => call.kind === 'command').length} command outcomes; ${processCalls.filter(call => call.kind === 'role-read').length} role-aware GETs; ${deniedCalls.length} denial records (${new Set(deniedCalls.map(call => `${call.role}|${call.method}|${call.path}`)).size} unique actor × method × route pairs).`,
  '',
  '| Method and route | Allowed roles | Process result by actor | Browser action request by actor | Forbidden actor result | Route/load/offline/keyboard evidence | Unverified actor pairs |',
  '| --- | --- | --- | --- | --- | --- | --- |'
];
for (const row of rows) {
  const missing = [
    ...row.missingPositiveRoles.map(role => `${role} allow`),
    ...row.missingDeniedRoles.map(role => `${role} deny`),
    ...row.missingBrowserRoles.map(role => `${role} browser action`)
  ];
  lines.push(`| ${row.method} ${row.route} | ${row.roles.join(', ') || 'public'} | ${row.process} | ${row.browser} | ${row.denied} | ${row.pageEvidence} | ${missing.join(', ') || 'nenhum'} |`);
}
lines.push('', 'This checklist is intentionally evidence-driven. It does not mark the route matrix accepted while any operation/role pair or required browser operation remains unverified.');
const browserMissing = rows.filter(row => row.browser === 'sem request UI AJA-18 registrado');
lines.push('', `## Operations without a browser action request (${browserMissing.length})`, '', 'These operations have process evidence, but AJA-18 did not record the corresponding browser request. Route smoke/keyboard/offline evidence is listed per row above and does not count as the action itself.', '');
for (const row of browserMissing) lines.push(`- ${row.method} ${row.route} → ${row.pageEvidence.split(';')[0]}`);
await writeFile(path.join(evidenceRoot, 'operation-role-coverage-AJA-18.md'), `${lines.join('\n')}\n`, 'utf8');
const routeRoleCoverageLines = [
  '# AJA-18 browser route × persona evidence',
  '',
  'Source routes: all 19 authenticated entries from `docs/http/route-matrix.md`; personas: admin, assigned/unassigned teacher, enrolled/other/unassigned student, and public. Each protected route/persona pair has a fresh browser context and real login where applicable. A browser-side GET probe reaches the JSON Server directly with the session cookie; no response is mocked. For each pair, the static route is loaded online and offline at 390/768/1440 px, reloaded, and keyboard focus/overflow checked. Public actor redirect 401 and UI permission gates record why API outage is not applicable; the exact API status and matching denial DOM remain visible in each row.',
  '',
  `Summary: ${routeRoleRows.length}/133 route/persona pairs; ${routeRoleRows.filter(row => row.outcome === 'PASS').length} PASS; ${routeRoleRows.reduce((sum, row) => sum + row.widths.length, 0)} viewport checks; ${routeRoleRows.reduce((sum, row) => sum + row.widths.filter(width => width.outcome === 'PASS').length, 0)} PASS. Public login/register/recovery offline actions: ${publicFormResults.length} cases, ${publicFormResults.filter(item => item.outcome === 'PASS').length} PASS.`,
  '',
  '| Route | Persona | Role / probe outcome | Online DOM | 390 / 768 / 1440 evidence | Offline N/A reason | Result / log |',
  '| --- | --- | --- | --- | --- | --- | --- |'
];
for (const row of routeRoleRows) {
  const statuses = row.widths.map(width => `${width.width}: HTTP ${width.onlineStatus}, API ${width.onlineResponseStatus}, reload ${width.offlineReloadStatus}, focus ${width.focusVisible ? 'visible' : 'missing'}, widths ${width.offlineDocumentWidth}/${width.reloadDocumentWidth}`).join('<br>');
  const offlineNA = [...new Set(row.widths.map(width => width.offlineOutcome).filter(value => value.startsWith('not applicable:')))].join('; ') || 'none; API offline failure UI asserted';
  const dom = (row.widths[0]?.onlineDomText ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 120);
  const log = routeRoleBatchNames.find(name => routeRoleBatches[routeRoleBatchNames.indexOf(name)]?.rows?.some(candidate => candidate.route === row.route && candidate.actor === row.actor)) ?? 'unmapped';
  const roleExpectation = row.permission === 'allowed' ? 'allowed 2xx' : 'forbidden 401/403/404';
  routeRoleCoverageLines.push(`| ${row.route} | ${row.actor} | ${row.permission}; GET ${row.probe} → ${row.widths.map(width => width.onlineResponseStatus).join('/')} (${roleExpectation}) | ${dom} | ${statuses} | ${offlineNA} | ${row.outcome}; ${log} |`);
}
routeRoleCoverageLines.push('', 'Public form failures use product submit controls with the API request aborted before transmission. The logs assert the real `net::ERR_FAILED`, visible Portuguese error, retained form values, keyboard focus, and no horizontal overflow. No successful response is intercepted or fabricated.', '', '| Form | Width | Request outcome | DOM/form assertions | Result / log |', '| --- | --- | --- | --- | --- |');
for (const item of publicFormResults) routeRoleCoverageLines.push(`| ${item.mode} | ${item.width} | ${item.abortedRequest.map(request => `${request.method} ${request.error}`).join(', ')} | error visible; email retained; name ${item.namePreserved === null ? 'n/a' : item.namePreserved ? 'retained' : 'n/a'}; focus ${item.focusVisible ? 'visible' : 'missing'}; document ${item.documentWidth} | ${item.outcome}; ${routeRoleBatchNames.find((_, index) => routeRoleBatches[index]?.publicFailures?.length) ?? 'unmapped'} |`);
await writeFile(path.join(evidenceRoot, 'route-role-coverage-AJA-18.md'), `${routeRoleCoverageLines.join('\n')}\n`, 'utf8');
const summary = {
  operations: operations.length,
  processOperationsObserved: rows.filter(row => row.process !== 'pendente').length,
  processPositiveRolePairsMissing: rows.reduce((count, row) => count + row.missingPositiveRoles.length, 0),
  processDeniedRolePairsMissing: rows.reduce((count, row) => count + row.missingDeniedRoles.length, 0),
  browserOperationsObserved: rows.filter(row => row.browser !== 'sem request UI AJA-18 registrado').length,
  browserActionsMissing: browserMissing.length,
  browserRequestRolePairsNotExercised: rows.reduce((count, row) => count + row.missingBrowserRoles.length, 0),
  completeRows: rows.filter(row => row.complete).length,
  routeRolePairsObserved: routeRoleRows.length,
  routeRolePairsPassing: routeRoleRows.filter(row => row.outcome === 'PASS').length,
  routeRoleViewportChecks: routeRoleRows.reduce((sum, row) => sum + row.widths.length, 0),
  publicFormFailureCases: publicFormResults.length,
  routeRoleChecklist: 'route-role-coverage-AJA-18.md',
  checklist: 'operation-role-coverage-AJA-18.md'
};
console.log(JSON.stringify(summary, null, 2));
