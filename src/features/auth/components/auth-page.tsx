'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/shared/logo';
import { Button, Input, Skeleton } from '@/components/ui';
import { useSession } from '@/providers/app-context';
import { PrivacyNotice } from '@/features/privacy';

type Mode = 'login' | 'register' | 'recover';

function AuthForm({ mode, token }: { mode: Mode; token: string | null }) {
  const { client } = useSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const confirming = mode === 'register' && !!token;
  const resetting = mode === 'recover' && !!token;
  const title = confirming ? 'Confirmar e-mail' : resetting ? 'Definir nova senha' : mode === 'login' ? 'Entrar no AJA Digital' : mode === 'register' ? 'Criar conta' : 'Recuperar acesso';
  const submit = async () => {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      if (confirming) {
        await client.confirmEmail(token!);
        setMessage('E-mail confirmado. Entre na sua conta para continuar.');
      } else if (resetting) {
        setMessage((await client.resetPassword(token!, password)).message);
      } else if (mode === 'login') {
        await client.login(email, password);
        router.replace('/');
      } else if (mode === 'recover') {
        setMessage((await client.requestRecovery(email)).message);
      } else {
        await client.register(name, email, password);
        setMessage('Conta criada. Confira seu e-mail para confirmar a conta e continuar.');
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.');
    } finally { setBusy(false); }
  };
  const requestConfirmation = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { setMessage((await client.requestConfirmation(email)).message); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Não foi possível solicitar a confirmação.'); }
    finally { setBusy(false); }
  };
  return <div className="min-h-dvh bg-white"><main className="flex min-h-dvh flex-col justify-center px-5 py-10 sm:px-8"><div className="mx-auto w-full max-w-md">
    <div className="mb-9"><Logo /></div>
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
    {(confirming || resetting || mode === 'recover') ? <p className="mb-8 mt-3 text-base leading-6 text-slate-500">{confirming ? 'Confirme o endereço vinculado à sua conta.' : resetting ? 'Escolha uma nova senha.' : 'Informe seu e-mail para receber o link de recuperação.'}</p> : <div className="mb-7" />}
    {message ? <div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-6"><CheckCircle2 aria-hidden="true" className="mb-3 size-8 text-emerald-600" /><p className="text-sm leading-6">{message}</p>
      {mode === 'register' && !token && <Button loading={busy} onClick={() => void requestConfirmation()} className="mt-4">Solicitar confirmação de e-mail</Button>}
      <Link href="/login" className="mt-5 block font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Voltar para o login</Link>
    </div> : <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        {mode === 'register' && !token && <Input label="Nome completo" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required minLength={3} maxLength={100} />}
        {!token && <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="voce@exemplo.com" />}
        {(!confirming && mode !== 'recover' || resetting) && <div className="relative"><Input label={resetting ? 'Nova senha' : 'Senha'} type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : 8} maxLength={128} className="pr-12" /><button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={show} className="absolute bottom-0 right-0 flex size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">{show ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}</button></div>}
        {mode === 'login' && <Link href="/recuperar-senha" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Esqueci minha senha</Link>}
        {(resetting || mode === 'register' && !token) && <p className="text-xs leading-5 text-slate-500">Mínimo de 8 caracteres.</p>}
        <Button type="submit" loading={busy} className="w-full">{confirming ? 'Confirmar e-mail' : resetting ? 'Salvar nova senha' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : 'Solicitar recuperação'}</Button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <p className="mt-6 text-center text-sm text-slate-500">{mode === 'login' ? <>Ainda não tem uma conta? <Link href="/cadastro" className="font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Cadastre-se</Link></> : <Link href="/login" className="font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Voltar para o login</Link>}</p>
    <div className="mt-4 flex justify-center"><PrivacyNotice /></div>
  </div></main></div>;
}

function AuthContent({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const token = mode !== 'login' ? params.get('token') : null;
  return <AuthForm key={JSON.stringify([mode, token])} mode={mode} token={token} />;
}

export function AuthPage({ mode }: { mode: Mode }) {
  return <Suspense fallback={<Skeleton />}><AuthContent mode={mode} /></Suspense>;
}
