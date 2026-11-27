async page => {
  const browser = page.context().browser();
  const site = 'http://127.0.0.1:3001';
  const api = 'http://127.0.0.1:3203/api/v1';
  const outcomes = [];
  const actors = [];
  const login = async id => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const current = await context.newPage();
    const responses = [];
    current.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/v1/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    });
    await current.goto(`${site}/login`, { waitUntil: 'domcontentloaded' });
    await current.getByLabel('E-mail').fill(`${id}@aja.local.test`);
    await current.getByRole('textbox', { name: 'Senha' }).fill(`AjaLocal-${id}-2031!`);
    await current.getByRole('button', { name: 'Entrar' }).click();
    await current.waitForFunction(() => location.pathname.startsWith('/perfil'), null, { timeout: 15000 });
    const actor = { id, context, page: current, responses };
    actors.push(actor);
    return actor;
  };
  const newActivity = async (teacher, title, description) => {
    await teacher.page.goto(`${site}/questionarios/criar?modulo=m1`, { waitUntil: 'domcontentloaded' });
    await teacher.page.getByRole('heading', { name: 'Criar atividade' }).waitFor({ state: 'visible' });
    await teacher.page.getByLabel('Tipo de atividade').selectOption('work');
    await teacher.page.getByRole('checkbox', { name: 'Permitir nota opcional' }).check();
    await teacher.page.getByLabel('Nota máxima').fill('10');
    await teacher.page.getByLabel('Título').fill(title);
    await teacher.page.getByLabel('Orientações').fill(description);
    await teacher.page.getByRole('button', { name: 'Revisar publicação' }).click();
    await teacher.page.getByRole('dialog').getByText(title).waitFor({ state: 'visible' });
    const createdWait = teacher.page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/assessments' && response.request().method() === 'POST' && response.status() === 201);
    await teacher.page.getByRole('dialog').getByRole('button', { name: 'Publicar atividade' }).click();
    const created = await createdWait;
    const activityId = (await created.json()).id;
    await teacher.page.getByRole('heading', { name: 'Atividades' }).waitFor({ state: 'visible', timeout: 15000 });
    const published = teacher.responses.find(response => response.method === 'POST' && response.path === `/api/v1/assessments/${activityId}/publish` && response.status === 200);
    if (!activityId || !published) throw new Error('new activity UI create/publish real responses not observed');
    return activityId;
  };
  const editActivity = async (actor, activityId, description) => {
    await actor.page.goto(`${site}/questionarios/criar?id=${encodeURIComponent(activityId)}`, { waitUntil: 'domcontentloaded' });
    await waitForEditHeading(actor, `open ${activityId}`);
    await actor.page.getByLabel('Orientações').fill(description);
    await actor.page.getByRole('button', { name: 'Salvar alterações' }).click();
    await actor.page.getByRole('dialog').getByRole('button', { name: 'Confirmar alterações' }).waitFor({ state: 'visible' });
  };
  const waitForEditHeading = async (actor, stage) => {
    try { await actor.page.getByRole('heading', { name: 'Editar atividade publicada' }).waitFor({ state: 'visible', timeout: 12000 }); }
    catch (cause) {
      const diagnostic = await actor.page.evaluate(() => ({ url: location.href, heading: document.querySelector('main h1')?.innerText || '', main: document.querySelector('main')?.innerText.slice(0, 700) || '' }));
      throw new Error(`editor heading failed at ${stage} for ${actor.id}: ${JSON.stringify(diagnostic)}; ${cause.message}`);
    }
  };
  const confirmEdit = async actor => actor.page.getByRole('dialog').getByRole('button', { name: 'Confirmar alterações' }).click();
  const waitResponse = async (actor, path, method, status) => {
    try {
      return await actor.page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === path && response.request().method() === method && response.status() === status;
      }, { timeout: 20000 });
    } catch (cause) { throw new Error(`response not observed for ${actor.id} ${method} ${path} ${status}; observed=${JSON.stringify(actor.responses.slice(-12))}; ${cause.message}`); }
  };

  const teacherA = await login('teacher-a');
  const admin = await login('admin');
  await admin.page.goto(`${site}/disciplinas`, { waitUntil: 'domcontentloaded' });
  await admin.page.getByRole('button', { name: 'Editar Matemática', exact: true }).click();
  await admin.page.getByRole('checkbox', { name: 'Celina Docência' }).check();
  const assignCelina = waitResponse(admin, '/api/v1/subjects/s1', 'PATCH', 200);
  await admin.page.getByRole('button', { name: 'Salvar disciplina' }).click();
  await assignCelina;
  outcomes.push({ scenario: 'setup teacher assignment through admin UI', subjectUpdate: 200, selectedTeacher: 'Celina Docência' });
  const failureTitle = 'AJA-18 422 com retry real';
  await teacherA.page.goto(`${site}/questionarios/criar?modulo=m1`, { waitUntil: 'domcontentloaded' });
  await teacherA.page.getByRole('heading', { name: 'Criar atividade' }).waitFor({ state: 'visible' });
  await teacherA.page.getByLabel('Tipo de atividade').selectOption('work');
  await teacherA.page.getByRole('checkbox', { name: 'Permitir nota opcional' }).check();
  await teacherA.page.getByLabel('Nota máxima').fill('10');
  await teacherA.page.getByLabel('Título').fill(failureTitle);
  await teacherA.page.getByLabel('Orientações').fill('Texto que precisa continuar no editor após erro HTTP.');
  const failTitleOnce = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = JSON.parse(route.request().postData() || '{}');
    body.title = '';
    await route.continue({ postData: JSON.stringify(body) });
  };
  await teacherA.page.route('**/api/v1/assessments', failTitleOnce);
  await teacherA.page.getByRole('button', { name: 'Revisar publicação' }).click();
  const invalidPayloadResponse = teacherA.page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/assessments' && response.request().method() === 'POST' && response.status() === 422);
  await teacherA.page.getByRole('dialog').getByRole('button', { name: 'Publicar atividade' }).click();
  await invalidPayloadResponse;
  const validationAlert = await teacherA.page.locator('main [role="alert"]').last().innerText();
  const titleAfter422 = await teacherA.page.getByLabel('Título').inputValue();
  const instructionsAfter422 = await teacherA.page.getByLabel('Orientações').inputValue();
  if (titleAfter422 !== failureTitle || instructionsAfter422 !== 'Texto que precisa continuar no editor após erro HTTP.') throw new Error('HTTP 422 did not preserve assessment editor fields');
  if (!validationAlert.trim() || !/Confira|título|atividade/i.test(validationAlert)) throw new Error(`HTTP 422 lacked a visible PT-BR field error: ${validationAlert}`);
  await teacherA.page.unroute('**/api/v1/assessments', failTitleOnce);
  await teacherA.page.getByRole('button', { name: 'Revisar publicação' }).click();
  await teacherA.page.getByRole('dialog').getByRole('button', { name: 'Publicar atividade' }).click();
  const createdAfterRetry = await waitResponse(teacherA, '/api/v1/assessments', 'POST', 201);
  const activityId = (await createdAfterRetry.json()).id;
  await teacherA.page.getByRole('heading', { name: 'Atividades' }).waitFor({ state: 'visible', timeout: 15000 });
  if (!activityId || !teacherA.responses.some(response => response.path === `/api/v1/assessments/${activityId}/publish` && response.status === 200)) throw new Error('explicit retry after HTTP 422 did not create and publish one activity');
  outcomes.push({ scenario: 'UI HTTP 422 then explicit retry', realFailure: { method: 'POST', path: '/api/v1/assessments', status: 422 }, visiblePTBR: validationAlert, preservedTitle: titleAfter422, preservedDescription: instructionsAfter422, retry: { create: 201, publish: 200, activityId } });

  const student = await login('student-two');
  await student.page.goto(`${site}/questionarios/responder?id=${activityId}`, { waitUntil: 'domcontentloaded' });
  await student.page.getByRole('heading', { name: failureTitle }).waitFor({ state: 'visible' });
  await student.page.locator('input[type=file]').setInputFiles('C:/Users/joaov/aja-digital-frontend/server/fixtures/proporcoes.pdf');
  await student.page.getByText('proporcoes.pdf', { exact: true }).first().waitFor({ state: 'visible' });
  const abortFilePost = async route => {
    if (route.request().method() === 'POST') await route.abort('connectionaborted');
    else await route.continue();
  };
  await student.page.route('**/api/v1/files', abortFilePost);
  await student.page.getByRole('button', { name: 'Salvar rascunho' }).click();
  const uploadAlert = await student.page.locator('main [role="alert"]').last().innerText();
  await student.page.getByText('proporcoes.pdf', { exact: true }).first().waitFor({ state: 'visible' });
  const hasFalseReceipt = await student.page.getByRole('heading', { name: 'Comprovante de entrega' }).count();
  if (!/Servi|indispon/i.test(uploadAlert) || hasFalseReceipt !== 0) throw new Error(`interrupted upload did not show a network error with local file retained: ${JSON.stringify({ uploadAlert, hasFalseReceipt })}`);
  await student.page.unroute('**/api/v1/files', abortFilePost);
  const uploadRetry = waitResponse(student, '/api/v1/files', 'POST', 201);
  await student.page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await uploadRetry;
  await student.page.getByText('Rascunho salvo', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
  await student.page.getByText('proporcoes.pdf', { exact: true }).first().waitFor({ state: 'visible' });
  outcomes.push({ scenario: 'UI interrupted upload and explicit retry', failure: 'browser route aborted POST /files; no HTTP response', visiblePTBR: uploadAlert, preservedFile: 'proporcoes.pdf visible after abort', noReceipt: true, retry: { fileUpload: 201, draftVisible: true } });

  const teacherB = await login('teacher-b');
  const publishedTitle = 'AJA-18 conflito por editor';
  const conflictActivityId = await newActivity(teacherB, publishedTitle, 'Versão inicial para teste de revisões concorrentes.');
  await editActivity(teacherA, conflictActivityId, 'Primeira gravação válida pelo editor A.');
  const staleTeacher = await login('teacher-a');
  await editActivity(staleTeacher, conflictActivityId, 'Texto local preservado no editor concorrente B.');
  const winnerResponse = waitResponse(teacherA, `/api/v1/assessments/${conflictActivityId}`, 'PATCH', 200);
  await confirmEdit(teacherA);
  await winnerResponse;
  const staleResponse = waitResponse(staleTeacher, `/api/v1/assessments/${conflictActivityId}`, 'PATCH', 409);
  await confirmEdit(staleTeacher);
  await staleResponse;
  const conflictAlert = await staleTeacher.page.locator('main [role="alert"]').last().innerText();
  const preservedConflictText = await staleTeacher.page.getByLabel('Orientações').inputValue();
  if (!/alterad|versão|revisão|conflito/i.test(conflictAlert) || preservedConflictText !== 'Texto local preservado no editor concorrente B.') throw new Error('409 editor did not show PT-BR conflict or preserve local text');
  await teacherA.page.goto(`${site}/questionarios/criar?id=${encodeURIComponent(conflictActivityId)}`, { waitUntil: 'domcontentloaded' });
  await waitForEditHeading(teacherA, 'open winner after 409');
  await teacherA.page.reload({ waitUntil: 'domcontentloaded' });
  await waitForEditHeading(teacherA, 'reload after 409');
  const conflictWinnerPersisted = await teacherA.page.getByLabel('Orientações').inputValue();
  if (conflictWinnerPersisted !== 'Primeira gravação válida pelo editor A.') throw new Error('conflict loser changed the durable server description');
  outcomes.push({ scenario: 'stale editor conflict', winner: 200, stale: 409, visiblePTBR: conflictAlert, localDraftPreserved: preservedConflictText, durableAfterReload: conflictWinnerPersisted });

  const celina = await login('teacher-unassigned');
  await editActivity(celina, conflictActivityId, 'Edição que será negada após revogação de acesso.');
  await admin.page.goto(`${site}/disciplinas`, { waitUntil: 'domcontentloaded' });
  await admin.page.getByRole('button', { name: 'Editar Matemática', exact: true }).click();
  const celinaCheckbox = admin.page.getByRole('checkbox', { name: 'Celina Docência' });
  if (await celinaCheckbox.isChecked()) await celinaCheckbox.uncheck();
  const revokeResponse = waitResponse(admin, '/api/v1/subjects/s1', 'PATCH', 200);
  admin.page.once('dialog', dialog => dialog.accept());
  await admin.page.getByRole('button', { name: 'Salvar disciplina' }).click();
  await revokeResponse;
  const deniedSave = waitResponse(celina, `/api/v1/assessments/${conflictActivityId}`, 'PATCH', 403);
  await confirmEdit(celina);
  await deniedSave;
  const revokedAlert = await celina.page.locator('main [role="alert"]').last().innerText();
  const revokedLocalText = await celina.page.getByLabel('Orientações').inputValue();
  if (!revokedAlert.trim() || revokedLocalText !== 'Edição que será negada após revogação de acesso.') throw new Error('revoked editor lost its local changes or showed no visible error');
  await teacherA.page.reload({ waitUntil: 'domcontentloaded' });
  await waitForEditHeading(teacherA, 'reload after revoked save');
  const revokedDurableText = await teacherA.page.getByLabel('Orientações').inputValue();
  if (revokedDurableText !== 'Primeira gravação válida pelo editor A.') throw new Error('revoked editor content appeared as saved for another teacher');
  outcomes.push({ scenario: 'editor revocation during unsaved edit', revoke: 200, deniedWrite: 403, visiblePTBR: revokedAlert, localDraftPreserved: revokedLocalText, durableAfterReload: revokedDurableText });

  const timeoutText = 'Texto preservado após timeout e retry.';
  await editActivity(teacherB, conflictActivityId, timeoutText);
  let timeoutReached = false;
  const delayThenAbort = async route => {
    await new Promise(resolve => setTimeout(resolve, 16000));
    timeoutReached = true;
    try { await route.abort('timedout'); } catch { /* the HTTP client may have cancelled the browser request at 15 seconds */ }
  };
  await teacherB.page.route(`**/api/v1/assessments/${conflictActivityId}`, delayThenAbort);
  await confirmEdit(teacherB);
  const timeoutAlert = await teacherB.page.locator('main [role="alert"]').last().innerText();
  await teacherB.page.waitForTimeout(1200);
  const preservedTimeoutText = await teacherB.page.getByLabel('Orientações').inputValue();
  if (!timeoutReached || !/demorou para responder|tempo/i.test(timeoutAlert) || preservedTimeoutText !== timeoutText) throw new Error(`product HTTP client timeout did not show a PT-BR message or preserve editor data: ${JSON.stringify({ timeoutReached, timeoutAlert, preservedTimeoutText })}`);
  await teacherA.page.reload({ waitUntil: 'domcontentloaded' });
  await waitForEditHeading(teacherA, 'reload after timeout');
  const timeoutNoFalseSave = await teacherA.page.getByLabel('Orientações').inputValue();
  if (timeoutNoFalseSave !== 'Primeira gravação válida pelo editor A.') throw new Error('timeout resulted in an unconfirmed server write');
  await teacherB.page.unroute(`**/api/v1/assessments/${conflictActivityId}`, delayThenAbort);
  const retryResponse = waitResponse(teacherB, `/api/v1/assessments/${conflictActivityId}`, 'PATCH', 200);
  await teacherB.page.getByRole('button', { name: 'Salvar alterações' }).click();
  await confirmEdit(teacherB);
  await retryResponse;
  const timeoutRetrySaved = await teacherB.page.getByLabel('Orientações').inputValue();
  if (timeoutRetrySaved !== timeoutText) throw new Error('explicit retry after timeout did not update the UI to the real saved value');
  outcomes.push({ scenario: 'product client timeout and explicit retry', timeout: 'no HTTP response; AbortSignal.timeout surfaced in UI', visiblePTBR: timeoutAlert, localDraftPreserved: preservedTimeoutText, noFalseSaveBeforeRetry: timeoutNoFalseSave, retry: 200, savedAfterRetry: timeoutRetrySaved });

  for (const actor of actors) await actor.context.close();
  return { result: 'PASS', site, realAPI: api, activityId: conflictActivityId, outcomes, observedHttp: actors.map((actor, index) => ({ id: `${actor.id}-${index + 1}`, responses: actor.responses })) };
}
