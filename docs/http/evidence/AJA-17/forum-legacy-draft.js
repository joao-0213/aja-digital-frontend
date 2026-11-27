async page => {
  const base = 'http://127.0.0.1:3001';
  const session = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:3002/api/v1/auth/session', { credentials: 'include' });
    const data = await response.json();
    return { status: response.status, userId: data.user?.id };
  });
  if (session.status !== 200 || !session.userId) throw new Error(`authenticated session required: ${JSON.stringify(session)}`);

  const legacyComposeKey = `aja-forum-compose:${session.userId}:new`;
  const legacyReplyKey = `aja-forum-reply:${session.userId}:topic1`;
  const legacyComposeValue = JSON.stringify({ title: 'Legacy forum compose sentinel', body: 'Do not restore this old text.', tags: 'legacy', reference: '', subjectId: 's1' });
  const legacyReplyValue = JSON.stringify({ body: 'Legacy forum reply sentinel' });
  await page.evaluate(({ composeKey, replyKey, composeValue, replyValue }) => {
    sessionStorage.setItem(composeKey, composeValue);
    sessionStorage.setItem(replyKey, replyValue);
  }, { composeKey: legacyComposeKey, replyKey: legacyReplyKey, composeValue: legacyComposeValue, replyValue: legacyReplyValue });

  const openComposer = async () => {
    const response = await page.goto(`${base}/forum`, { waitUntil: 'domcontentloaded' });
    if (response?.status() !== 200) throw new Error(`forum static response: ${response?.status()}`);
    await page.getByRole('heading', { name: 'Fórum de dúvidas' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Nova pergunta' }).click();
    await page.getByRole('dialog', { name: 'Fazer uma pergunta' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    return {
      title: await page.getByLabel('Título da pergunta').inputValue(),
      body: await page.getByLabel('Conte sua dúvida').inputValue(),
      legacyCompose: await page.evaluate(key => sessionStorage.getItem(key), legacyComposeKey),
      currentCompose: await page.evaluate(key => sessionStorage.getItem(key), `aja-http-forum-compose:${session.userId}:new`)
    };
  };

  const firstOpen = await openComposer();
  const currentTitle = 'Current HTTP draft title';
  const currentBody = 'Current HTTP draft body remains recoverable.';
  await page.getByLabel('Título da pergunta').fill(currentTitle);
  await page.getByLabel('Conte sua dúvida').fill(currentBody);
  await page.waitForTimeout(250);
  const savedCurrentCompose = await page.evaluate(key => sessionStorage.getItem(key), `aja-http-forum-compose:${session.userId}:new`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Fórum de dúvidas' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Nova pergunta' }).click();
  await page.getByRole('dialog', { name: 'Fazer uma pergunta' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  const afterReload = {
    title: await page.getByLabel('Título da pergunta').inputValue(),
    body: await page.getByLabel('Conte sua dúvida').inputValue(),
    legacyCompose: await page.evaluate(key => sessionStorage.getItem(key), legacyComposeKey),
    currentCompose: await page.evaluate(key => sessionStorage.getItem(key), `aja-http-forum-compose:${session.userId}:new`)
  };

  const topicResponse = await page.goto(`${base}/forum/topico?id=topic1`, { waitUntil: 'domcontentloaded' });
  if (topicResponse?.status() !== 200) throw new Error(`forum topic static response: ${topicResponse?.status()}`);
  await page.getByLabel('Sua resposta').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  const legacyReply = await page.evaluate(key => sessionStorage.getItem(key), legacyReplyKey);
  const currentReplyKey = `aja-http-forum-reply:${session.userId}:topic1`;
  const topicState = {
    reply: await page.getByLabel('Sua resposta').inputValue(),
    legacyReply,
    currentReply: await page.evaluate(key => sessionStorage.getItem(key), currentReplyKey)
  };
  const currentReplyText = 'Current HTTP reply stays recoverable after reload.';
  await page.getByLabel('Sua resposta').fill(currentReplyText);
  await page.waitForTimeout(250);
  const savedCurrentReply = await page.evaluate(key => sessionStorage.getItem(key), currentReplyKey);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('Sua resposta').waitFor({ state: 'visible' });
  await page.waitForTimeout(1000);
  const currentReplyAfterReload = await page.getByLabel('Sua resposta').inputValue();
  const legacyReplyAfterReload = await page.evaluate(key => sessionStorage.getItem(key), legacyReplyKey);

  const result = {
    result: 'PASS',
    accountId: session.userId,
    legacyComposeKey,
    legacyReplyKey,
    firstOpen,
    savedCurrentCompose,
    afterReload,
    topicState,
    savedCurrentReply,
    currentReplyAfterReload,
    legacyReplyAfterReload,
    legacyComposeUnchanged: firstOpen.legacyCompose === legacyComposeValue && afterReload.legacyCompose === legacyComposeValue,
    legacyReplyUnchanged: legacyReply === legacyReplyValue && legacyReplyAfterReload === legacyReplyValue,
    oldComposeNotRendered: !firstOpen.title.includes('Legacy forum') && !firstOpen.body.includes('Do not restore') && !afterReload.title.includes('Legacy forum') && !afterReload.body.includes('Do not restore'),
    currentComposeRecovered: afterReload.title === currentTitle && afterReload.body === currentBody && (savedCurrentCompose ?? '').includes(currentTitle),
    oldReplyNotRendered: !topicState.reply.includes('Legacy forum reply'),
    currentReplyRecovered: currentReplyAfterReload === currentReplyText && (savedCurrentReply ?? '').includes(currentReplyText)
  };
  if (!result.legacyComposeUnchanged || !result.legacyReplyUnchanged || !result.oldComposeNotRendered || !result.oldReplyNotRendered || !result.currentComposeRecovered || !result.currentReplyRecovered) throw new Error(`legacy forum draft collision or current draft recovery regression: ${JSON.stringify(result)}`);
  return result;
}
