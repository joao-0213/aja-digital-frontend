'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Empty } from '@/components/ui';
import type { BankQuestion } from '@/features/questions';
import { useHttpQuery } from '@/hooks/use-http-query';
import { countLabel } from '@/lib/utils';
import { useSession } from '@/providers/app-context';
import type { AssessmentQuestionEntry, AssessmentSnapshot } from '../api';
import { useAssessmentFilesApi } from '../hooks/use-assessments';

function AssessmentQuestionImage({ image }: { image?: { src: string; alt: string } | null }) {
  const { sessionKey } = useSession();
  const match = image?.src.match(/^\/api\/v1\/files\/([^/]+)\/content$/);
  let fileId = '';
  try {
    fileId = match ? decodeURIComponent(match[1]) : '';
  } catch {
    fileId = '';
  }
  const files = useAssessmentFilesApi();
  const query = useHttpQuery(
    { sessionKey, key: ['assessments', 'question-image', fileId] },
    useCallback((signal) => files.download(fileId, 'inline', signal), [files, fileId]),
    !!fileId
  );
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!query.data) {
      setUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);
  if (!image) return null;
  if (!fileId)
    return /^\/questions\/[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/.test(image.src) ? (
      <img src={image.src} alt={image.alt} className="my-4 max-h-72 max-w-full" />
    ) : null;
  if (query.error || !url) return null;
  return <img src={url} alt={image.alt} className="my-4 max-h-72 max-w-full" />;
}

export function AssessmentQuestionList({
  questions,
  snapshots,
  previews,
  structuralLocked,
  uncertain,
  onOpenAuthor,
  onOpenBank,
  onMoveQuestion,
  onRemoveQuestion
}: {
  questions: AssessmentQuestionEntry[];
  snapshots: AssessmentSnapshot[];
  previews: Record<string, BankQuestion>;
  structuralLocked: boolean;
  uncertain: boolean;
  onOpenAuthor: () => void;
  onOpenBank: () => void;
  onMoveQuestion: (index: number, direction: -1 | 1) => void;
  onRemoveQuestion: (index: number) => void;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          {countLabel(questions.length, 'questão selecionada', 'questões selecionadas')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={structuralLocked || uncertain}
            onClick={onOpenAuthor}
          >
            <Plus aria-hidden="true" className="size-4" />
            Questão original
          </Button>
          <Button disabled={structuralLocked || uncertain} onClick={onOpenBank}>
            Buscar no banco
          </Button>
        </div>
      </div>
      <div className="space-y-4">
        {questions.map((entry, index) => {
          const question: AssessmentSnapshot | BankQuestion | undefined =
            entry.source === 'authored'
              ? {
                  id: entry.questionId ?? entry.clientKey,
                  origin: 'author',
                  ...entry.question
                }
              : (snapshots.find((item) => item.id === entry.questionId) ??
                previews[entry.questionId]);
          if (!question)
            return (
              <Card key={entry.source === 'bank' ? entry.questionId : entry.clientKey}>
                <p role="status" className="text-sm text-slate-600">
                  Questão {index + 1}: o conteúdo não está disponível. Remova esta referência e
                  escolha outra questão.
                </p>
                <Button
                  variant="secondary"
                  className="mt-3"
                  disabled={structuralLocked}
                  onClick={() => onRemoveQuestion(index)}
                >
                  Remover questão indisponível
                </Button>
              </Card>
            );
          return (
            <Card key={entry.source === 'bank' ? entry.questionId : entry.clientKey}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge tone="purple">Questão {index + 1}</Badge>
                <Badge>
                  {'origin' in question && question.origin === 'author'
                    ? 'Autoral desta atividade'
                    : 'Acervo'}
                </Badge>
                <Badge>{question.topic}</Badge>
                <div className="ml-auto flex">
                  <Button
                    variant="ghost"
                    disabled={structuralLocked || uncertain || index === 0}
                    aria-label={`Mover questão ${index + 1} para cima`}
                    onClick={() => onMoveQuestion(index, -1)}
                  >
                    <ChevronUp aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={structuralLocked || uncertain || index === questions.length - 1}
                    aria-label={`Mover questão ${index + 1} para baixo`}
                    onClick={() => onMoveQuestion(index, 1)}
                  >
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={structuralLocked || uncertain}
                    aria-label={`Remover questão ${index + 1}`}
                    onClick={() => onRemoveQuestion(index)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="leading-7 [overflow-wrap:anywhere]">{question.statement}</p>
              <AssessmentQuestionImage image={question.image} />
              <ol className="mt-4 space-y-2">
                {question.options.map((option, optionIndex) => (
                  <li
                    key={optionIndex}
                    className={`rounded-lg px-3 py-2 text-sm [overflow-wrap:anywhere] ${'correct' in question && optionIndex === question.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}
                  >
                    {String.fromCharCode(65 + optionIndex)}. {option}
                    {'correct' in question && optionIndex === question.correct && ' ✓'}
                  </li>
                ))}
              </ol>
              {'explanation' in question && (
                <p className="mt-3 text-sm text-slate-500 [overflow-wrap:anywhere]">
                  Explicação do gabarito: {question.explanation}
                </p>
              )}
            </Card>
          );
        })}
      </div>
      {!questions.length && (
        <Empty
          title="Monte seu questionário"
          description="Selecione questões do acervo ou escreva uma questão original."
          action={
            <Button disabled={structuralLocked || uncertain} onClick={onOpenBank}>
              Escolher questões
            </Button>
          }
        />
      )}
    </>
  );
}
