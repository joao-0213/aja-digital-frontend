import type { User } from '@/models';

type TeachingUser = Pick<User, 'id' | 'name' | 'role' | 'active' | 'deletedAt'>;

export interface TeachingTeamOption {
  id: string;
  name: string;
  selected: boolean;
  available: boolean;
  reason?: string;
}

/** Preserve unavailable local selections so an administrator can explicitly remove them. */
export function teachingTeamOptions(
  users: readonly TeachingUser[],
  selectedIds: readonly string[]
): TeachingTeamOption[] {
  const available: TeachingTeamOption[] = users
    .filter((user) => user.role === 'teacher' && user.active !== false && !user.deletedAt)
    .map((user) => ({
      id: user.id,
      name: user.name,
      selected: selectedIds.includes(user.id),
      available: true
    }));
  const byId = new Map(users.map((user) => [user.id, user]));
  const availableIds = new Set(available.map((option) => option.id));
  const unavailable = [...new Set(selectedIds)]
    .filter((id) => !availableIds.has(id))
    .map((id) => {
      const user = byId.get(id);
      return {
        id,
        name: user?.name.trim() || `Docente não localizado (${id})`,
        selected: true,
        available: false,
        reason: !user
          ? 'Cadastro não localizado'
          : user.deletedAt
            ? 'Conta excluída'
            : user.role !== 'teacher'
              ? 'Cargo alterado'
              : 'Conta inativa'
      };
    });
  return [...available, ...unavailable];
}
