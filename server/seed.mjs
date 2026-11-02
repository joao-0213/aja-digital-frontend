import fs from 'node:fs';
import { scryptSync, createHash } from 'node:crypto';

const settings = JSON.parse(fs.readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
const fixtureSize = name => fs.statSync(new URL(`./fixtures/${name}`, import.meta.url)).size;

/** Server-only scenarios. This module is never imported by the static frontend. */
export function generateSeed({ baseDate } = {}) {
  baseDate ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDate) || !Number.isFinite(Date.parse(`${baseDate}T12:00:00Z`)) || new Date(`${baseDate}T12:00:00Z`).toISOString().slice(0, 10) !== baseDate) throw new Error('Data-base inválida. Use AAAA-MM-DD.');
  const day = offset => new Date(Date.parse(`${baseDate}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const instant = (offset, time = '12:00:00') => `${day(offset)}T${time}-03:00`;
  const row = data => {
    const feedback = data.feedbackDraft ?? data.feedbackPublished;
    const events = [data.createdAt, data.publishedAt, data.startedAt, data.submittedAt, data.enrolledAt, data.endedAt, feedback?.createdAt].filter(Boolean);
    const updatedAt = events.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? instant(-30);
    return { revision: 1, updatedAt, updatedBy: feedback?.authorId ?? data.authorId ?? data.userId ?? 'admin', ...data };
  };
  const account = (id, name, role, extra = {}) => row({ id, name, email: `${id}@aja.local.test`, role, active: true, emailConfirmedAt: instant(-30), ...extra });
  const users = [
    account('admin', 'Adriana Gestão', 'admin'),
    account('teacher-a', 'Daniela Estudos', 'teacher'),
    account('teacher-b', 'Bruno Ensino', 'teacher'),
    account('teacher-unassigned', 'Celina Docência', 'teacher'),
    account('student', 'Alex Aprendiz', 'student'),
    account('student-two', 'Bia Aprendiz', 'student'),
    account('student-empty', 'Caio Sem Turma', 'student'),
    account('student-pending', 'Dora Pendente', 'student', { emailConfirmedAt: null }),
    account('student-inactive', 'Eva Inativa', 'student', { active: false })
  ];
  const question = (id, origin, statement, correct = 0) => row({ id, origin, subject: 'Matemática', topic: 'Proporção', difficulty: 'easy', institution: 'Acervo AJA', year: Number(baseDate.slice(0, 4)), statement, options: ['2', '4', '8', '16'], correct, explanation: 'Compare as quantidades e aplique a razão indicada.' });
  const bank = [question('q1', 'bank', 'Qual é a razão entre 4 e 2?'), question('q2', 'bank', 'Quanto é o dobro de 2?', 1)];
  bank[1].image = { src: '/api/v1/files/file-question/content', alt: 'Dois grupos com dois pontos cada.' };
  const authored = question('qa1', 'author', 'Uma turma tem 4 grupos de 2 pessoas. Quantas pessoas há?', 2);
  const quiz = (id, status, deadline, extra = {}) => row({ id, kind: 'quiz', moduleId: 'm1', title: `Proporções — ${id}`, description: 'Leia as questões e registre seu raciocínio.', questionIds: ['q1', 'qa1'], questions: structuredClone([bank[0], authored]), deadline, required: true, allowLate: false, status, authorId: 'teacher-a', ...(status === 'published' ? { publishedAt: instant(-7) } : {}), ...extra });
  const work = id => row({ id, kind: 'work', moduleId: 'm1', title: 'Proporções no cotidiano', description: 'Envie uma breve análise com um exemplo de proporção.', questionIds: [], questions: [], deadline: `${day(14)}T23:59:59-03:00`, required: true, maxGrade: 10, allowLate: false, status: 'published', authorId: 'teacher-a', publishedAt: instant(-7) });
  const assessments = [quiz('quiz-open', 'published', `${day(7)}T23:59:59-03:00`), quiz('quiz-closed', 'published', `${day(-1)}T23:59:59-03:00`), quiz('quiz-no-deadline', 'published', ''), quiz('quiz-draft', 'draft', ''), work('work1')];
  const feedback = { comment: 'Bom exemplo. Explique a unidade da razão na próxima versão.', grade: 8, authorId: 'teacher-b', createdAt: instant(-1) };
  const pdfSize = fixtureSize('proporcoes.pdf');
  const imageSize = fixtureSize('grupos.png');
  const file = (id, fixture, mime, authorId, purpose, parentType, parentId) => row({ id, fixture, mime, size: fixtureSize(fixture), name: fixture, authorId, purpose, parentType, parentId, status: 'attached', downloadUrl: `/api/v1/files/${id}/content`, createdAt: instant(-7) });
  const enrollment = (id, studentId, classId, status = 'active') => row({ id, studentId, email: users.find(u => u.id === studentId).email, classId, status, createdAt: instant(-30), createdBy: 'admin', ...(status === 'pending' ? {} : { enrolledAt: instant(-28) }), ...(status === 'ended' ? { endedAt: instant(-14) } : {}), unassignedAssessmentIds: [] });
  return {
    meta: { ...settings.meta, baseDate, timeZone: 'America/Sao_Paulo', initializedAt: instant(0, '00:00:00') },
    users,
    credentials: users.map(u => {
      // Deterministic LOCAL fixture verifiers permit reproducible resets. Never production salts/passwords.
      const salt = createHash('sha256').update(`aja-local-fixture:${u.id}`).digest('hex');
      return { id: `credential-${u.id}`, userId: u.id, algorithm: 'scrypt', salt, hash: scryptSync(`AjaLocal-${u.id}-2031!`, salt, 64).toString('hex') };
    }),
    sessions: [], tokens: [], outbox: [], idempotency: [],
    classes: [row({ id: 'c1', name: 'Turma Horizonte', code: 'HOR-N', year: Number(baseDate.slice(0, 4)), shift: 'Noite', active: true, studentIds: ['student', 'student-two'] }), row({ id: 'c-empty', name: 'Turma Vazia', code: 'VAZ-N', year: Number(baseDate.slice(0, 4)), shift: 'Noite', active: true, studentIds: [] }), row({ id: 'c-closed', name: 'Turma Encerrada', code: 'ENC-N', year: Number(day(-365).slice(0, 4)), shift: 'Noite', active: false, studentIds: [] })],
    enrollments: [enrollment('e1', 'student', 'c1'), enrollment('e2', 'student-two', 'c1'), enrollment('e-pending', 'student-pending', 'c1', 'pending'), { ...enrollment('e-ended', 'student', 'c-closed', 'ended'), createdAt: instant(-90), enrolledAt: instant(-60), endedAt: instant(-40) }],
    subjects: [row({ id: 's1', classId: 'c1', name: 'Matemática', teacherIds: ['teacher-a', 'teacher-b'], color: 'blue', icon: 'calculator', description: 'Razões e proporções.' }), row({ id: 's-empty', classId: 'c-empty', name: 'Matemática — nova turma', teacherIds: ['teacher-a'], color: 'green', icon: 'book', description: 'Contexto sem conteúdo.' }), row({ id: 's-closed', classId: 'c-closed', name: 'Matemática — histórico', teacherIds: ['teacher-a'], color: 'amber', icon: 'book', description: 'Somente consulta autorizada.' })],
    modules: [row({ id: 'm1', subjectId: 's1', title: 'Razões no cotidiano', description: 'Estude, pratique e discuta exemplos.', order: 1 }), row({ id: 'm-closed', subjectId: 's-closed', title: 'Histórico', description: 'Conteúdo da turma encerrada.', order: 1 })],
    materials: [row({ id: 'material-text', moduleId: 'm1', title: 'O que é proporção?', kind: 'lesson', content: 'Uma proporção expressa a igualdade entre duas razões. Compare 4/2 e 8/4: ambas são iguais a 2.', duration: 5, order: 1, authorId: 'teacher-a', createdAt: instant(-7) }), row({ id: 'material-pdf', moduleId: 'm1', title: 'Guia de proporções', kind: 'pdf', content: '', duration: 8, fileName: 'proporcoes.pdf', fileId: 'file-material', localFileId: 'file-material', fileSize: pdfSize, order: 2, authorId: 'teacher-a', createdAt: instant(-7) }), row({ id: 'material-video', moduleId: 'm1', title: 'Vídeo de apoio externo', kind: 'video', content: 'Abra o provedor externo somente se desejar.', videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', duration: 10, order: 3, authorId: 'teacher-b', createdAt: instant(-6) })],
    progress: [row({ id: 'progress-student-text', userId: 'student', materialId: 'material-text', completed: true, lastAccess: instant(-2) }), row({ id: 'progress-student-pdf', userId: 'student', materialId: 'material-pdf', completed: false, lastAccess: instant(-1) })],
    questions: bank,
    assessments,
    attempts: [row({ id: 'attempt-draft', assessmentId: 'quiz-open', userId: 'student', startedAt: instant(-1), answers: { q1: 0 }, questionOrder: ['q1', 'qa1'], questions: structuredClone(assessments[0].questions) }), row({ id: 'attempt-sent', assessmentId: 'quiz-closed', userId: 'student', startedAt: instant(-3), submittedAt: instant(-2), answers: { q1: 0, qa1: 2 }, questionOrder: ['q1', 'qa1'], questions: structuredClone(assessments[1].questions), receipt: 'receipt-quiz-student' })],
    submissions: [row({ id: 'submission-waiting', assessmentId: 'work1', userId: 'student', submittedAt: instant(-2), receipt: 'receipt-work-student', attachments: [{ id: 'file-work', kind: 'file', name: 'proporcoes.pdf', size: pdfSize, mime: 'application/pdf' }], feedbackDraft: { ...feedback, grade: 7, comment: 'Rascunho docente ainda não publicado.' }, feedbackHistory: [] }), row({ id: 'submission-feedback', assessmentId: 'work1', userId: 'student-two', submittedAt: instant(-3), receipt: 'receipt-work-student-two', attachments: [{ id: 'link-two', kind: 'link', name: 'Exemplo de proporção', url: 'https://example.org/proporcoes' }], feedbackPublished: feedback, feedbackHistory: [{ ...feedback }] })],
    files: [file('file-material', 'proporcoes.pdf', 'application/pdf', 'teacher-a', 'material', 'material', 'material-pdf'), file('file-work', 'proporcoes.pdf', 'application/pdf', 'student', 'work', 'submission', 'submission-waiting'), file('file-forum', 'grupos.png', 'image/png', 'student', 'forum', 'topic', 'topic1'), file('file-question', 'grupos.png', 'image/png', 'admin', 'question', 'question', 'q2')],
    topics: [row({ id: 'topic1', classId: 'c1', subjectId: 's1', authorId: 'student', title: 'Como comparar dois grupos?', body: 'No material, por que as razões são iguais?', tags: ['proporção'], createdAt: instant(-3), target: { type: 'material', id: 'material-text' }, attachment: { id: 'file-forum', name: 'grupos.png', mime: 'image/png', size: imageSize }, replies: [row({ id: 'reply1', authorId: 'teacher-a', body: 'Divida cada quantidade pelo mesmo fator e compare as unidades.', createdAt: instant(-2), votes: { student: 1 }, accepted: true })], readBy: ['student', 'teacher-a'] }), row({ id: 'topic-question', classId: 'c1', subjectId: 's1', authorId: 'student-two', title: 'Dúvida na questão do acervo', body: 'Como identificar o dobro?', tags: [], createdAt: instant(-1), target: { type: 'question', id: 'q2' }, replies: [], readBy: ['student-two'] }), row({ id: 'topic-closed', classId: 'c-closed', subjectId: 's-closed', authorId: 'teacher-a', title: 'Registro da turma anterior', body: 'Material de consulta histórica para a equipe.', tags: [], createdAt: instant(-20), replies: [], readBy: ['teacher-a'] })],
    announcements: [row({ id: 'notice1', classId: 'c1', subjectId: 's1', authorId: 'teacher-a', title: 'Encontro de revisão', body: 'Traga suas dúvidas sobre proporções.', createdAt: instant(-2), notify: true, occurrence: { date: day(3), time: '19:00', allDay: false } }), row({ id: 'notice-all-day', classId: 'c1', authorId: 'admin', title: 'Dia de estudo', body: 'Reserve um momento para revisar os materiais.', createdAt: instant(-1), notify: false, occurrence: { date: day(5), allDay: true } })],
    events: [],
    attendance: [row({ id: 'lesson1', subjectId: 's1', date: day(-2), time: '19:00', records: { student: true, 'student-two': false } })],
    visits: [row({ id: 'visit-student-s1', userId: 'student', subjectId: 's1', visitedAt: instant(-4) })],
    audit: [{ id: 'audit-seed', actorId: 'admin', action: 'create', collection: 'classes', targetId: 'c1', createdAt: instant(-30) }]
  };
}
