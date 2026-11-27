'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { videoSource } from '@/lib/material-video';

export function MaterialVideo({ url, title }: { url?: string; title: string }) {
  const source = videoSource(url ?? '');
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <section
      aria-label="Vídeo de apoio"
      className="space-y-4 border-b border-slate-200 bg-slate-50 p-6"
    >
      <p className="text-sm leading-6 text-slate-600">
        Vídeo de fonte externa. Ao carregar ou abrir a fonte, você acessa o serviço do provedor,
        sujeito às suas regras de privacidade. Não há hospedagem de vídeo na plataforma.
      </p>
      {source ? (
        <>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
          >
            Abrir vídeo (nova aba)
          </a>
          {source.embed && !failed ? (
            <>
              {!active ? (
                <div>
                  <Button variant="secondary" onClick={() => setActive(true)}>
                    Carregar vídeo aqui
                  </Button>
                </div>
              ) : (
                <iframe
                  title={`Vídeo: ${title}`}
                  src={source.embed}
                  allow="fullscreen; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                  onError={() => setFailed(true)}
                  className="aspect-video w-full rounded-lg border border-slate-200"
                />
              )}
            </>
          ) : (
            <p role="status" className="text-sm text-slate-600">
              Incorporação indisponível. Use Abrir vídeo para acessar a fonte.
            </p>
          )}
          <p className="text-xs leading-5 text-slate-500">
            Se o provedor bloquear a reprodução ou exigir acesso, use Abrir vídeo. A plataforma não
            verifica a disponibilidade externa.
          </p>
        </>
      ) : (
        <p role="status" className="text-sm text-slate-600">
          Vídeo sem fonte disponível. Consulte o texto de apoio abaixo ou peça à equipe para
          atualizar o endereço.
        </p>
      )}
    </section>
  );
}
