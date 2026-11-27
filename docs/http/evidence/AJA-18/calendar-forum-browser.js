async page => {
  const base = 'http://127.0.0.1:3001';
  const requests = [];
  const login = async (target, email, password) => {
    await target.goto(`${base}/login`);
    await target.getByLabel('E-mail').fill(email);
    await target.getByRole('textbox', { name: /Senha/ }).fill(password);
    await target.getByRole('button', { name: 'Entrar' }).click();
    await target.waitForFunction(() => location.pathname.startsWith('/perfil'), null, { timeout: 10000 }).catch(async () => {
      const mainText = await target.locator('main').innerText().catch(() => '');
      throw new Error(`Login did not reach profile for ${email}; url=${target.url()}; ${mainText.slice(0, 180)}`);
    });
  };
  const browser = page.context().browser();

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  teacher.on('response', response => {
    if (new URL(response.url()).pathname === '/api/v1/announcements' && response.request().method() === 'POST') requests.push({ role: 'teacher', method: 'POST', path: '/announcements', status: response.status() });
  });
  await login(teacher, 'teacher-b@aja.local.test', 'AjaLocal-teacher-b-2031!');
  await teacher.goto(`${base}/avisos`);
  await teacher.getByRole('button', { name: 'Publicar aviso' }).first().click();
  await teacher.getByLabel('Turma', { exact: true }).last().selectOption('c1');
  await teacher.locator('select:visible').last().selectOption('s1');
  const suffix = Date.now();
  const eventTitle = `AJA-18 evento de calendario ${suffix}`;
  await teacher.getByLabel('Título', { exact: true }).fill(eventTitle);
  await teacher.getByLabel('Mensagem', { exact: true }).fill('Evento criado pela interface para conferir destino no calendário.');
  await teacher.getByLabel('Adicionar ao calendário').check();
  const eventDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 4 * 86400000));
  await teacher.getByLabel('Data do acontecimento').fill(eventDate);
  await teacher.getByLabel('Horário do acontecimento').fill('19:30');
  const notify = teacher.getByLabel('Solicitar notificação local para os alunos');
  if (await notify.isChecked()) await notify.uncheck();
  await teacher.getByRole('button', { name: 'Publicar aviso' }).last().click();
  await teacher.getByText(eventTitle, { exact: true }).first().waitFor();
  const announcementResponse = requests.find(item => item.method === 'POST' && item.role === 'teacher');
  if (announcementResponse?.status !== 201) throw new Error(`Teacher announcement UI expected POST 201; observed ${JSON.stringify(requests)}.`);
  await teacher.reload();
  await teacher.getByText(eventTitle, { exact: true }).first().waitFor();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  student.on('response', response => {
    if (new URL(response.url()).pathname === '/api/v1/calendar') requests.push({ role: 'student', method: 'GET', path: '/calendar', status: response.status() });
  });
  await login(student, 'student@aja.local.test', 'AjaLocal-student-2031!');
  await student.goto(`${base}/calendario`);
  await student.getByText(eventTitle, { exact: true }).first().waitFor();
  await student.getByRole('button', { name: new RegExp(eventTitle) }).last().click();
  const eventDom = await student.locator('main').innerText();
  if (!eventDom.includes(eventTitle) || !eventDom.includes('19:30')) throw new Error('Student calendar DOM did not show the created event and scheduled time.');
  const targetUrl = student.url();
  const eventLinks = await student.locator('main a').evaluateAll(links => links.map(link => ({ text: link.innerText, href: link.getAttribute('href') })));

  const topicTitle = `AJA-18 pergunta de foro ${suffix}`;
  const topicBody = 'Pergunta registrada na interface e confirmada depois da recarga.';
  const studentForumContext = await browser.newContext();
  const studentForum = await studentForumContext.newPage();
  studentForum.on('response', response => {
    if (new URL(response.url()).pathname === '/api/v1/topics' && response.request().method() === 'POST') requests.push({ role: 'student', method: 'POST', path: '/topics', status: response.status() });
  });
  await login(studentForum, 'student@aja.local.test', 'AjaLocal-student-2031!');
  await studentForum.goto(`${base}/forum`);
  if (!(await studentForum.getByLabel('Título da pergunta').isVisible())) await studentForum.getByRole('button', { name: 'Nova pergunta' }).click();
  await studentForum.locator('select:visible').last().selectOption('s1');
  await studentForum.getByLabel('Título da pergunta').fill(topicTitle);
  await studentForum.getByLabel('Conte sua dúvida').fill(topicBody);
  await studentForum.getByRole('button', { name: 'Publicar pergunta' }).click();
  await studentForum.getByRole('link', { name: new RegExp(topicTitle) }).waitFor();
  const topicLink = await studentForum.getByRole('link', { name: new RegExp(topicTitle) }).getAttribute('href');
  const topicId = new URL(topicLink, base).searchParams.get('id');
  await studentForum.reload();
  await studentForum.getByRole('link', { name: new RegExp(topicTitle) }).waitFor();

  const teacherForumContext = await browser.newContext();
  const teacherForum = await teacherForumContext.newPage();
  teacherForum.on('response', response => {
    if (new URL(response.url()).pathname.match(/^\/api\/v1\/topics\/[^/]+\/replies$/) && response.request().method() === 'POST') requests.push({ role: 'teacher', method: 'POST', path: '/topics/{id}/replies', status: response.status() });
  });
  await login(teacherForum, 'teacher-b@aja.local.test', 'AjaLocal-teacher-b-2031!');
  await teacherForum.goto(`${base}/forum/topico?id=${topicId}`);
  await teacherForum.getByRole('heading', { name: topicTitle }).waitFor();
  const replyBody = `Resposta docente AJA-18 ${suffix}`;
  await teacherForum.getByLabel('Sua resposta').fill(replyBody);
  await teacherForum.getByRole('button', { name: 'Publicar resposta' }).click();
  await teacherForum.getByText(replyBody, { exact: true }).waitFor();
  await teacherForum.reload();
  await teacherForum.getByRole('heading', { name: topicTitle }).waitFor();
  await teacherForum.getByText(topicBody, { exact: true }).waitFor();
  await teacherForum.getByText(replyBody, { exact: true }).waitFor();
  const forumDom = await teacherForum.locator('main').innerText();
  if (!forumDom.includes('Alex Aprendiz') || !forumDom.includes('Bruno Ensino')) throw new Error('Reloaded forum DOM did not show student author and assigned teacher reply.');
  const topicResponse = requests.find(item => item.role === 'student' && item.path === '/topics');
  const replyResponse = requests.find(item => item.role === 'teacher' && item.path === '/topics/{id}/replies');
  if (topicResponse?.status !== 201 || replyResponse?.status !== 201) throw new Error(`Forum UI expected POST 201 for topic/reply; observed ${JSON.stringify(requests)}.`);
  const result = { result: 'PASS', site: base, event: { role: 'teacher creates; student opens calendar', title: eventTitle, date: eventDate, targetUrl, eventLinks }, forum: { author: 'student', replier: 'assigned teacher', topicId, topicTitle, replyBody, reloadConfirmed: true }, requests };
  await teacherContext.close();
  await studentContext.close();
  await studentForumContext.close();
  await teacherForumContext.close();
  return result;
}
