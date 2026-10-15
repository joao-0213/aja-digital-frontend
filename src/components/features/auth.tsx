'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, FlaskConical, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/layout/app-shell';
import { Button, Input, Check } from '@/components/ui';
import { useApp } from '@/components/providers';
import { mockRequest } from '@/mocks/api';
import { uid } from '@/lib/utils';
export function AuthPage({
  mode
}: {
  mode: 'login' | 'register' | 'recover';
}) {
  const {
    db,
    mutate,
    signIn,
    notify
  } = useApp();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(mode === 'login' ? 'fernando@exemplo.com' : '');
  const [password, setPassword] = useState(mode === 'login' ? 'Aja@2026' : '');
  const [show, setShow] = useState(false);
  const [terms, setTerms] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (mode === 'login') try {
      const remembered = localStorage.getItem('aja-demo-email');
      if (remembered) {
        setEmail(remembered);
        setRemember(true);
      }
    } catch {}
  }, [mode]);
  const title = mode === 'login' ? 'Entrar no AJA Digital' : mode === 'register' ? 'Criar conta' : 'Recuperar acesso';
  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      if (mode === 'recover') {
        await mockRequest(() => true);
        setSent(true);
      } else if (mode === 'login') {
        await mockRequest(() => true);
        const person = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
        if (!person || password !== 'Aja@2026') throw new Error('Use um e-mail cadastrado na demonstração e a senha de teste Aja@2026.');
        signIn(person.id, person.role);
        try {
          if (remember) localStorage.setItem('aja-demo-email', email);else localStorage.removeItem('aja-demo-email');
        } catch {}
        router.push('/');
      } else {
        if (!terms) throw new Error('Aceite os termos da demonstração.');
        if (password.length < 8 || !/[0-9]/.test(password) || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[\W_]/.test(password)) throw new Error('Use 8 caracteres, maiúscula, minúscula, número e símbolo.');
        if (db.users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) throw new Error('Este e-mail já está cadastrado.');
        const ok = await mutate(d => {
          d.users.push({
            id: uid('user'),
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role: 'student',
            course: '',
            institution: '',
            quota: 'none',
            bio: ''
          });
        }, 'Cadastro simulado criado. Entre com a senha de teste Aja@2026.');
        if (ok) router.push('/login');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="min-h-dvh bg-white">
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-9">
          <Logo />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mb-8 mt-3 text-base leading-6 text-slate-500">
          {mode === 'login' ? 'Informe seu e-mail e senha para acessar.' : mode === 'register' ? 'Preencha os dados para criar sua conta.' : 'Informe seu e-mail para simular uma solicitação de recuperação.'}
        </p>
        {sent ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-6">
          <CheckCircle2 className="mb-3 size-8 text-emerald-600" />
          <h3 className="font-semibold">Solicitação simulada</h3>
          <p className="mt-2 text-sm leading-6">Em uma aplicação real, um link seria enviado caso o e-mail estivesse cadastrado. Nenhum e-mail foi enviado nesta demonstração.</p>
          <Link href="/login" className="mt-5 inline-block font-semibold text-brand-600">Voltar para o login</Link>
        </div> : <form onSubmit={event => {
          event.preventDefault();
          void submit();
        }} className="space-y-5">
          {mode === 'register' && <Input label="Nome completo" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required minLength={3} maxLength={100} />}
          <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@exemplo.com" />
          {mode !== 'recover' && <div className="relative">
            <Input label="Senha de demonstração" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required className="pr-12" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={show} className="absolute bottom-0 right-0 flex size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>}
          {mode === 'login' && <div className="flex flex-wrap items-center justify-between gap-2">
            <Check label="Lembrar meu e-mail" checked={remember} onChange={setRemember} />
            <Link href="/recuperar-senha" className="text-sm font-medium text-brand-600">Esqueci minha senha</Link>
          </div>}
          {mode === 'register' && <>
            <p className="text-xs leading-5 text-slate-500">Use 8 caracteres, maiúscula, minúscula, número e símbolo. Por segurança, a senha digitada não é armazenada. Após cadastrar, use Aja@2026.</p>
            <Check label="Entendo que esta é uma demonstração local e não usarei dados reais." checked={terms} onChange={setTerms} />
          </>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>}
          <Button type="submit" loading={busy} disabled={mode === 'register' && !terms} className="w-full">
            {mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : 'Simular envio do link'}
          </Button>
        </form>}
        <p className="mt-6 text-center text-sm text-slate-500">
          {mode === 'login' ? <>Ainda não tem uma conta? <Link href="/cadastro" className="font-semibold text-brand-600">Cadastre-se</Link></> : <Link href="/login" className="font-semibold text-brand-600">Voltar para o login</Link>}
        </p>
        <div className="mt-8 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600"><p className="mb-2 flex items-center gap-2 font-semibold text-slate-700"><FlaskConical aria-hidden="true" className="size-4" />Contas de demonstração</p>Aluno: fernando@exemplo.com<br />Professora: mariana@exemplo.com<br />Admin: rafael@exemplo.com<br />Senha de teste: <span className="font-semibold">Aja@2026</span>. Não use dados reais.</div>
        <Link href="/" className="mt-5 block text-center text-sm text-slate-500 underline underline-offset-4">Explorar a demonstração sem login</Link>
      </div>
    </main>
  </div>;
}
