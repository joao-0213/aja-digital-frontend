export interface Assessment {
  id: string;
  publishedAt?: string;
  moduleId: string;
  title: string;
  description: string;
  questionIds: string[];
  deadline: string;
  attempts: number;
  shuffle: boolean;
  status: 'draft' | 'published';
}

export interface Attempt {
  id: string;
  assessmentId: string;
  userId: string;
  startedAt: string;
  submittedAt?: string;
  answers: Record<string, number>;
  questionOrder: string[];
}
