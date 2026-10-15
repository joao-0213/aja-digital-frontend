import { type User } from '@/models';

export const quotaLabels: Record<User['quota'], string> = {
  none: 'Ampla concorrência',
  public_school: 'Escola pública',
  income: 'Renda',
  racial: 'Cota racial',
  disability: 'Pessoa com deficiência'
};
