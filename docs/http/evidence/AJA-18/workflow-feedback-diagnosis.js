async page => {
  const browser = page.context().browser();
  const context = await browser.newContext();
  const current = await context.newPage();
  await current.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  await current.getByLabel('E-mail').fill('teacher-unassigned@aja.local.test');
  await current.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-unassigned-2031!');
  await current.getByRole('button', { name: 'Entrar' }).click();
  await current.waitForFunction(() => document.querySelector('main h1')?.innerText !== 'Entrar no AJA Digital');
  const result = await current.evaluate(async () => {
    const base = 'http://127.0.0.1:3203/api/v1';
    const listResponse = await fetch(`${base}/assessments?subjectId=s1&page=1&pageSize=100`, { credentials: 'include' });
    const list = await listResponse.json();
    const assessment = list.items?.find(item => item.title === 'AJA-18 — atividade de retorno');
    if (!assessment) return { listStatus: listResponse.status, listTitles: list.items?.map(item => item.title) };
    const submissionsResponse = await fetch(`${base}/submissions?assessmentId=${assessment.id}`, { credentials: 'include' });
    const submissions = await submissionsResponse.json();
    const item = submissions.items?.[0];
    if (!item) return { listStatus: listResponse.status, assessmentId: assessment.id, submissionsStatus: submissionsResponse.status, items: submissions.items };
    const detailResponse = await fetch(`${base}/submissions/${item.id}`, { credentials: 'include' });
    const detail = await detailResponse.json();
    return {
      listStatus: listResponse.status,
      assessment: { id: assessment.id, title: assessment.title, kind: assessment.kind, status: assessment.status, maxGrade: assessment.maxGrade },
      submissionsStatus: submissionsResponse.status,
      itemSummary: { id: item.id, revision: item.revision, submittedAt: item.submittedAt, userId: item.userId, feedbackDraft: item.feedbackDraft, feedbackPublished: item.feedbackPublished },
      detailStatus: detailResponse.status,
      detail: { id: detail.id, revision: detail.revision, submittedAt: detail.submittedAt, userId: detail.userId, feedbackDraft: detail.feedbackDraft, feedbackPublished: detail.feedbackPublished }
    };
  });
  await context.close();
  return result;
}
