import { canAccessSubject, canManageSubject, isActiveUser, visibleClasses, visibleSubjects } from '../src/lib/access.ts';
import { isAssessmentAssigned } from '../src/lib/enrollment.ts';
import { createCommandService } from './command-service.mjs';

const alive = row => !!row && !row.deletedAt;
const meta = row => ({ id: row.id, revision: row.revision, createdAt: row.createdAt ?? row.updatedAt, updatedAt: row.updatedAt ?? row.createdAt, updatedBy: row.updatedBy ?? row.authorId ?? row.id });
const byRecent = (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.id.localeCompare(b.id);
const byDeadline = (a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '') || a.id.localeCompare(b.id);
const approvedStudent = user => isActiveUser(user) && user.role === 'student' && !!user.emailConfirmedAt;

function localParts(value, timeZone = 'America/Sao_Paulo') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function subjectDTO(state, actor, subject) {
  const classRow = state.classes.find(row => row.id === subject.classId && alive(row));
  const publicationIds = [];
  const modules = state.modules.filter(row => row.subjectId === subject.id && alive(row));
  const moduleIds = new Set(modules.map(row => row.id));
  for (const material of state.materials.filter(row => alive(row) && moduleIds.has(row.moduleId))) publicationIds.push(`material:${material.id}`);
  for (const assessment of state.assessments.filter(row => alive(row) && row.status === 'published' && moduleIds.has(row.moduleId))) publicationIds.push(`assessment:${assessment.id}`);
  for (const notice of state.announcements.filter(row => alive(row) && row.classId === subject.classId && (!row.subjectId || row.subjectId === subject.id))) publicationIds.push(`notice:${notice.id}`);
  const visit = state.visits?.find(row => row.userId === actor.id && row.subjectId === subject.id);
  const seen = new Set(visit?.seenPublicationIds ?? []);
  return {
    ...meta(subject), classId: subject.classId, className: classRow?.name ?? 'Turma indisponível', name: subject.name,
    teacherIds: subject.teacherIds, color: subject.color, icon: subject.icon ?? 'book', description: subject.description,
    teachers: subject.teacherIds.map(id => ({ id, name: state.users.find(user => user.id === id)?.name ?? 'Docente indisponível' })),
    canManageContent: canManageSubject(state, actor, subject.id),
    hasUpdates: publicationIds.some(id => !seen.has(id))
  };
}

function announcementDTO(state, row) {
  const author = state.users.find(user => user.id === row.authorId);
  return { ...meta(row), classId: row.classId, subjectId: row.subjectId ?? null, title: row.title, body: row.body, notify: !!row.notify, occurrence: row.occurrence ?? null, author: { id: row.authorId, name: author?.name ?? 'Equipe AJA' } };
}

function dashboardAssessment(state, row, student) {
  const module = state.modules.find(item => item.id === row.moduleId && alive(item));
  const subject = module && state.subjects.find(item => item.id === module.subjectId && alive(item));
  return {
    ...meta(row), moduleId: row.moduleId, title: row.title, description: row.description, kind: row.kind ?? 'quiz',
    maxGrade: row.maxGrade ?? null, deadline: row.deadline || null, required: row.required !== false, allowLate: !!row.allowLate,
    status: 'published', publishedAt: row.publishedAt ?? row.createdAt, questionCount: row.questionIds?.length ?? row.questions?.length ?? 0,
    ...(student ? { assigned: true } : { subjectName: subject?.name ?? 'Disciplina indisponível' })
  };
}

function topicSummary(state, topic) {
  const subject = state.subjects.find(row => row.id === topic.subjectId && alive(row));
  return { id: topic.id, title: topic.title, subjectName: subject?.name ?? 'Disciplina indisponível', replyCount: (topic.replies ?? []).filter(alive).length, href: `/forum/topico?id=${encodeURIComponent(topic.id)}` };
}

function upcomingItems(state, actor, subjects, modules, now, limit = 3) {
  const today = localParts(now).date;
  const subjectIds = new Set(subjects.map(row => row.id));
  const moduleIds = new Set(modules.map(row => row.id));
  const items = [];
  for (const notice of state.announcements.filter(row => alive(row))) {
    if (!notice.occurrence || !visibleNotice(state, actor, notice, subjectIds)) continue;
    const { date, time = null, allDay = false } = notice.occurrence;
    if (date < today) continue;
    items.push({ id: `announcement:${notice.id}`, title: notice.title, kind: 'event', date, time, allDay, description: notice.body, subjectId: notice.subjectId ?? null, source: 'announcement', sourceId: notice.id, href: `/avisos#aviso-${encodeURIComponent(notice.id)}` });
  }
  for (const assessment of state.assessments.filter(row => alive(row) && row.status === 'published' && moduleIds.has(row.moduleId))) {
    if (actor.role === 'student' && !isAssessmentAssigned(state, assessment, actor.id)) continue;
    if (!assessment.deadline) continue;
    const due = localParts(assessment.deadline);
    const module = state.modules.find(row => row.id === assessment.moduleId);
    if (due.date < today) continue;
    items.push({ id: `assessment:${assessment.id}`, title: assessment.title, kind: 'exam', date: due.date, time: due.time, allDay: false, description: assessment.description, subjectId: module?.subjectId ?? null, source: 'assessment', sourceId: assessment.id, href: `/questionarios/responder?id=${encodeURIComponent(assessment.id)}` });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id)).slice(0, limit);
}

function visibleNotice(state, actor, notice, subjectIds) {
  if (!alive(notice)) return false;
  if (notice.subjectId) return subjectIds.has(notice.subjectId) && canAccessSubject(state, actor, notice.subjectId);
  return visibleClasses(state, actor).some(row => row.id === notice.classId);
}

function buildDashboard(state, actor, now) {
  const subjects = visibleSubjects(state, actor).filter(alive).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const subjectIds = new Set(subjects.map(row => row.id));
  const classes = visibleClasses(state, actor).filter(alive);
  const classIds = new Set(classes.map(row => row.id));
  const modules = state.modules.filter(row => alive(row) && subjectIds.has(row.subjectId));
  const moduleIds = new Set(modules.map(row => row.id));
  const materials = state.materials.filter(row => alive(row) && moduleIds.has(row.moduleId));
  const materialIds = new Set(materials.map(row => row.id));
  const notices = state.announcements.filter(row => visibleNotice(state, actor, row, subjectIds)).sort(byRecent);
  const published = state.assessments.filter(row => alive(row) && row.status === 'published' && moduleIds.has(row.moduleId));
  const pendingEnrollmentCount = state.enrollments.filter(row => alive(row) && row.status === 'pending' && (
    actor.role === 'admin' || actor.role === 'student'
      ? actor.role === 'admin' || row.studentId === actor.id || row.email.toLowerCase() === actor.email.toLowerCase()
      : classIds.has(row.classId) && (!!row.enrolledAt || row.legacy === true)
  )).length;
  const subjectRows = subjects.slice(0, 6).map(row => subjectDTO(state, actor, row));
  const common = {
    role: actor.role,
    subjects: subjectRows,
    pendingEnrollmentCount,
    announcements: notices.slice(0, actor.role === 'student' ? 2 : 1).map(row => announcementDTO(state, row)),
    upcoming: upcomingItems(state, actor, subjects, modules, now),
    topics: state.topics.filter(row => alive(row) && classIds.has(row.classId) && subjectIds.has(row.subjectId)).sort(byRecent).slice(0, 2).map(row => topicSummary(state, row))
  };
  if (actor.role === 'student') {
    const ownProgress = state.progress.filter(row => row.userId === actor.id && materialIds.has(row.materialId)).sort((a, b) => (b.lastAccess ?? '').localeCompare(a.lastAccess ?? ''));
    const latestProgress = ownProgress[0];
    const resumeMaterial = latestProgress && materials.find(row => row.id === latestProgress.materialId);
    const completed = new Set(ownProgress.filter(row => row.completed).map(row => row.materialId));
    const submitted = new Set([
      ...(state.attempts ?? []).filter(row => row.userId === actor.id && row.submittedAt).map(row => row.assessmentId),
      ...(state.submissions ?? []).filter(row => row.userId === actor.id && row.submittedAt).map(row => row.assessmentId)
    ]);
    const pendingAssessments = published.filter(row => row.required !== false && isAssessmentAssigned(state, row, actor.id) && !submitted.has(row.id)).sort(byDeadline);
    return {
      ...common,
      resume: resumeMaterial ? { id: resumeMaterial.id, title: resumeMaterial.title, moduleId: resumeMaterial.moduleId, kind: resumeMaterial.kind } : null,
      assessments: pendingAssessments.slice(0, 3).map(row => dashboardAssessment(state, row, true)),
      pendingAssessmentCount: pendingAssessments.length,
      progress: ownProgress.map(row => ({ ...meta(row), userId: row.userId, materialId: row.materialId, completed: !!row.completed, lastAccess: row.lastAccess })),
      completedMaterials: completed.size,
      totalMaterials: materials.length
    };
  }
  const visibleStudentIds = new Set(classes.flatMap(row => row.studentIds ?? []).filter(id => approvedStudent(state.users.find(user => user.id === id))));
  const pendingFeedbackCount = (state.submissions ?? []).filter(row => row.submittedAt && !row.feedbackPublished && published.some(assessment => assessment.id === row.assessmentId)).length;
  return {
    ...common,
    classes: classes.slice(0, 8).map(row => ({ ...meta(row), name: row.name, code: row.code, year: row.year, shift: row.shift, active: !!row.active, studentCount: (row.studentIds ?? []).filter(id => visibleStudentIds.has(id)).length })),
    assessments: published.sort(byDeadline).slice(0, 3).map(row => dashboardAssessment(state, row, false)),
    studentCount: visibleStudentIds.size,
    pendingFeedbackCount
  };
}

export function createDashboardService(config, auth) {
  const now = config.now ?? (() => new Date().toISOString());
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now });
  const routes = new Map([['/me/dashboard', { GET: service.read({ authorize: () => {}, select: () => true, project: (_value, actor, state) => buildDashboard(state, actor, now()) }) }]]);
  return { resolve: path => routes.has(path) ? { methods: routes.get(path), params: {} } : undefined, routes };
}
