/** Pure rules, independent from React, transport and browser storage. */
export function gradeAttempt(questionIds: readonly string[], answers: Readonly<Record<string, number>>, questions: readonly {
  id: string;
  correct: number;
}[]) {
  const byId = new Map(questions.map(q => [q.id, q]));
  const total = questionIds.length;
  const correct = questionIds.filter(id => answers[id] !== undefined && byId.has(id) && answers[id] === byId.get(id)!.correct).length;
  const answered = questionIds.filter(id => Number.isInteger(answers[id]) && answers[id] >= 0).length;
  return {
    total,
    correct,
    answered,
    blank: total - answered,
    percentage: total ? Math.round(correct / total * 100) : 0
  };
}
export function validateClassCode(code: string, classes: readonly {
  id: string;
  code: string;
}[], editingId?: string) {
  if (!/^[a-z0-9-]{1,20}$/i.test(code.trim())) return 'Use de 1 a 20 letras, números ou hífens.';
  if (classes.some(c => c.id !== editingId && c.code.toLowerCase() === code.trim().toLowerCase())) return 'Já existe uma turma com este código.';
  return null;
}
export function canChangeRole(user: {
  id: string;
  role: string;
}, nextRole: string, users: readonly {
  id: string;
  role: string;
}[]) {
  return !(user.role === 'admin' && nextRole !== 'admin' && users.filter(u => u.role === 'admin').length <= 1);
}
export function validateUpload(file: {
  type: string;
  size: number;
}, types: readonly string[], maxBytes: number) {
  return types.includes(file.type) && file.size > 0 && file.size <= maxBytes;
}
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  if (from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
