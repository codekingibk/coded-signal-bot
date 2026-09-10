import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowRight, BarChart3, Check, ChevronDown, Clock3, Copy,
  ExternalLink, KeyRound, LogIn, LogOut, MessageCircle, MoreHorizontal,
  RefreshCw, ShieldCheck, Sparkles, Ticket, TrendingUp, Users, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useSearch } from 'wouter';
import {
  getGetAccessStatusQueryKey, getGetAdminOverviewQueryKey, getGetCurrentSignalQueryKey,
  getGetReferralProgressQueryKey, getGetSignalHistoryQueryKey, getGetStreakQueryKey,
  getGetAdminSessionQueryKey, getListAccessCodesQueryKey, getVerifyPaymentQueryKey, useActivateAccessKey, useAdminLogin,
  useAdminLogout, useChangeAdminPassword, useGenerateGiveawayCodes, useGetAccessStatus,
  useGetAdminOverview, useGetAdminSession, useGetCurrentSignal, useGetPublicConfig,
  useGetReferralProgress, useGetSignalHistory, useGetStreak, useInitializePayment,
  useListAccessCodes, useListPayments, useLogoutAccess, useRevokeAccessCode,
  useUpdatePricing, useValidateAccessKey, useVerifyPayment,
} from '@workspace/api-client-react';
import type { AccessCode, AdminOverview, GeneratedCode, PaymentRecord, SignalRecord } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

const formatMoney = (amount: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const formatTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.max(0, seconds % 60).toString().padStart(2, '0')}`;

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="focus-ring flex items-center gap-3" data-testid="link-brand">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/.18)]">
        <Activity size={18} strokeWidth={2.5} />
      </span>
      {!compact && <span className="font-semibold tracking-[-.04em] text-lg">coded signal<span className="text-primary">.</span></span>}
    </Link>
  );
}

function StatusDot({ label, tone = 'live' }: { label: string; tone?: 'live' | 'muted' | 'bad' }) {
  return <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.14em] text-muted-foreground"><span className={`size-1.5 rounded-full ${tone === 'live' ? 'bg-primary animate-signal-pulse' : tone === 'bad' ? 'bg-destructive' : 'bg-muted-foreground'}`} />{label}</span>;
}

function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:brightness-105',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
    ghost: 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
    danger: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
  };
  return <button className={`focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]} ${className}`} {...props}>{children}</button>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-2 text-xs font-medium text-muted-foreground">{label}<input className="focus-ring min-h-11 rounded-lg border border-input bg-background/80 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary" {...props} /></label>;
}

type BettingPlatform = 'msport' | 'sportybet';

const bettingPlatforms: { value: BettingPlatform; label: string }[] = [
  { value: 'msport', label: 'MSport' },
  { value: 'sportybet', label: 'SportyBet' },
];

function PlatformSelector({ value, onChange }: { value: BettingPlatform; onChange: (value: BettingPlatform) => void }) {
  return <div className="grid gap-2">
    <span className="text-xs font-medium text-muted-foreground">Betting platform</span>
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Betting platform">
      {bettingPlatforms.map((platform) => <button
        key={platform.value}
        type="button"
        onClick={() => onChange(platform.value)}
        aria-pressed={value === platform.value}
        className={`focus-ring min-h-11 rounded-lg border px-3 text-sm font-semibold transition ${value === platform.value ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background/80 text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
        data-testid={`button-platform-${platform.value}`}
      >{platform.label}</button>)}
    </div>
  </div>;
}

function PageHeader({ title, eyebrow, children }: { title: string; eyebrow: string; children?: ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 text-[11px] font-semibold uppercase tracking-[.18em] text-primary">{eyebrow}</div><h1 className="text-3xl font-semibold tracking-[-.055em] sm:text-4xl">{title}</h1></div>{children}</div>;
}

function PublicNav() {
  return <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8"><Brand /><nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex"><a className="hover:text-foreground" href="#how-it-works">How it works</a><a className="hover:text-foreground" href="#faq">FAQ</a><a className="hover:text-foreground" href="#pricing">Access</a></nav><Link href="/admin" className="focus-ring rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground" data-testid="link-admin">Admin console <ArrowRight size={14} className="ml-1 inline" /></Link></header>;
}

function Landing() {
  const [, setLocation] = useLocation();
  const { data: config, isLoading, isError } = useGetPublicConfig();
  const { mutate: initializePayment, isPending: paymentPending, error: paymentError } = useInitializePayment();
  const { mutate: validateKey, isPending: validating } = useValidateAccessKey();
  const { mutate: activateKey, isPending: activating } = useActivateAccessKey();
  const search = useSearch();
  const ref = new URLSearchParams(search).get('reference') ?? '';
  const verification = useVerifyPayment(ref, { query: { enabled: Boolean(ref), queryKey: getVerifyPaymentQueryKey(ref) } });
  const [email, setEmail] = useState('');
  const [referral, setReferral] = useState('');
  const [key, setKey] = useState('');
  const [platform, setPlatform] = useState<BettingPlatform>('msport');
  const [keyMessage, setKeyMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showAccess, setShowAccess] = useState(false);
  const price = config ? (config.promoEnabled ? config.promoPrice : config.standardPrice) : 0;

  const startPayment = (event: React.FormEvent) => {
    event.preventDefault();
    initializePayment({ data: { email, referralCode: referral || null } }, {
      onSuccess: (result) => { window.location.href = result.authorizationUrl; },
    });
  };
  const submitKey = (event: React.FormEvent) => {
    event.preventDefault();
    setKeyMessage(null);
    validateKey({ data: { key: key.trim() } }, {
      onSuccess: (result) => {
        if (!result.valid) { setKeyMessage({ text: `This key is ${result.status.toLowerCase()}.`, good: false }); return; }
        activateKey({ data: { key: key.trim() } }, {
          onSuccess: () => { setLocation(`/dashboard?platform=${platform}`); },
          onError: () => setKeyMessage({ text: 'We could not activate that key. Try again.', good: false }),
        });
      },
      onError: () => setKeyMessage({ text: 'That key could not be validated. Check the characters and try again.', good: false }),
    });
  };

  return <div className="min-h-[100dvh] overflow-hidden bg-background">
    <PublicNav />
    <main>
      {ref && <section className="mx-auto max-w-6xl px-5 pt-6 sm:px-8"><div className={`rounded-xl border p-4 ${verification.isError || (verification.data && !verification.data.verified) ? 'border-destructive/30 bg-destructive/10' : 'border-primary/30 bg-primary/10'}`} data-testid="status-payment-verification">{verification.isLoading ? <span className="text-sm text-muted-foreground">Confirming your payment…</span> : verification.data?.verified ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold">Payment confirmed. Your terminal is ready.</div><div className="text-sm text-muted-foreground">{verification.data.message}</div></div><div className="flex items-center gap-2"><code className="rounded bg-background px-3 py-2 text-sm text-primary">{verification.data.accessKey}</code><Button onClick={() => { if (verification.data?.accessKey) navigator.clipboard?.writeText(verification.data.accessKey); }} data-testid="button-copy-access-key"><Copy size={14} /> Copy</Button></div></div> : <span className="text-sm text-destructive">{verification.data?.message ?? 'Payment verification did not complete.'}</span>}</div></section>}
      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:pb-32 lg:pt-24">
        <div className="terminal-grid pointer-events-none absolute -left-48 -top-24 size-[38rem] rounded-full opacity-25 [mask-image:radial-gradient(circle,black,transparent_68%)]" />
        <div className="relative animate-rise-in"><StatusDot label="Live terminal · mobile first" /><h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[.96] tracking-[-.075em] sm:text-7xl">Read the window.<br /><span className="text-primary">Move with signal.</span></h1><p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">Coded Signal Bot is a paid-access Aviator signal terminal built for fast, clear decisions. No account maze. No noise. Just the next window, when it matters.</p><div className="mt-8 flex flex-wrap items-center gap-3"><a href="#pricing" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:brightness-105" data-testid="link-start-signal">Start your signal window <ArrowRight size={16} /></a><button onClick={() => setShowAccess(true)} className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-lg border border-border px-5 text-sm font-semibold hover:bg-secondary" data-testid="button-open-access">I have an access key <KeyRound size={16} /></button></div><div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> Protected terminal</span><span className="inline-flex items-center gap-2"><Clock3 size={15} className="text-primary" /> {config ? `${Math.round(config.durationSeconds / 3600)} hour access` : 'Live window access'}</span></div></div>
        <div className="relative animate-rise-in [animation-delay:120ms]"><div className="scanline rounded-2xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(0,0,0,.25)] sm:p-6"><div className="mb-7 flex items-center justify-between"><StatusDot label="Terminal preview" /><MoreHorizontal size={18} className="text-muted-foreground" /></div><div className="rounded-xl border border-primary/25 bg-primary/[.06] p-5"><div className="flex items-start justify-between"><div><div className="mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Current signal</div><div className="mt-3 text-6xl font-semibold tracking-[-.08em] text-primary">2.64<span className="ml-1 text-2xl">×</span></div></div><div className="rounded-full border border-primary/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">Ready</div></div><div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs"><div><div className="text-muted-foreground">Window closes</div><div className="mono mt-1 text-foreground">00:18</div></div><div><div className="text-muted-foreground">Next signal</div><div className="mono mt-1 text-foreground">— — —</div></div></div></div><div className="mt-5 space-y-3"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Signal confidence</span><span className="mono text-primary">HIGH / VERIFIED</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full w-[78%] rounded-full bg-primary" /></div><div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>Session protected</span><span>Updates every cycle</span></div></div></div></div>
      </section>

      <section id="pricing" className="border-y border-border bg-card/45"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><div className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">One clean window</div><h2 className="mt-3 text-3xl font-semibold tracking-[-.06em] sm:text-4xl">Access without the account baggage.</h2><p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">Purchase a private access window or redeem a key. Your access is tied to this session and expires cleanly when the window closes.</p></div><div className="rounded-2xl border border-primary/35 bg-background p-5 shadow-[0_18px_50px_rgba(0,0,0,.18)] sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><StatusDot label={config?.promoEnabled ? 'Launch price active' : 'Signal access'} /><div className="mt-4 flex items-end gap-3"><span className="text-5xl font-semibold tracking-[-.08em]">{isLoading ? '—' : formatMoney(price, config?.currency)}</span>{config?.promoEnabled && <span className="mb-2 text-sm text-muted-foreground line-through">{formatMoney(config.standardPrice, config.currency)}</span>}</div><p className="mt-2 text-sm text-muted-foreground">{config ? `${Math.round(config.durationSeconds / 3600)} hours of protected terminal access` : 'Protected terminal access'}</p></div><div className="rounded-lg bg-primary/10 px-3 py-2 text-right text-xs text-primary"><div className="font-semibold">No subscription</div><div className="mt-1 text-primary/70">Pay once · use now</div></div></div><form onSubmit={startPayment} className="mt-7 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Field label="Email for receipt" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-payment-email" /><Field label="Referral code (optional)" placeholder="SIGNAL-..." value={referral} onChange={(e) => setReferral(e.target.value)} data-testid="input-referral-code" /><Button type="submit" disabled={paymentPending || !config} data-testid="button-pay-access">{paymentPending ? 'Opening…' : <>Pay & enter <ArrowRight size={15} /></>}</Button></form>{paymentError && <p className="mt-3 text-sm text-destructive" data-testid="status-payment-error">Payment could not start. Please try again.</p>}{isError && <p className="mt-3 text-sm text-destructive">Pricing is temporarily unavailable. Refresh to retry.</p>}</div></div></section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20 sm:px-8"><div className="max-w-xl"><div className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">The rhythm</div><h2 className="mt-3 text-3xl font-semibold tracking-[-.06em] sm:text-4xl">Three steps. Zero guesswork.</h2></div><div className="mt-10 grid gap-4 md:grid-cols-3">{[['01', 'Purchase or redeem', 'Use Paystack for instant access, or bring a key someone shared with you.'], ['02', 'Watch the window', 'The terminal makes the current and next signal legible at a glance, on any phone.'], ['03', 'Keep your discipline', 'Signals are information, not a promise. Set your limit before you start.']].map(([n, title, text]) => <div key={n} className="rounded-xl border border-border bg-card p-5"><div className="mono text-xs text-primary">{n}</div><h3 className="mt-12 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>)}</div></section>
      <section className="border-y border-border bg-secondary/35"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2"><div><div className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Built for momentum</div><h2 className="mt-3 text-3xl font-semibold tracking-[-.06em]">Referrals and streaks reward consistency, not chasing.</h2></div><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-border bg-card p-5"><Users size={20} className="text-accent" /><h3 className="mt-5 font-semibold">Share a signal path</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Invite people you trust. Your referral progress is visible inside the terminal.</p></div><div className="rounded-xl border border-border bg-card p-5"><TrendingUp size={20} className="text-primary" /><h3 className="mt-5 font-semibold">Build a streak</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Return with intention. Longer streaks can unlock a discount on future access.</p></div></div></div></section>
      <section id="faq" className="mx-auto max-w-3xl px-5 py-20 sm:px-8"><div className="text-center"><div className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Questions, answered</div><h2 className="mt-3 text-3xl font-semibold tracking-[-.06em]">Before you enter the window.</h2></div><div className="mt-10 divide-y divide-border border-y border-border">{['What happens after I pay?', 'Do I need to create an account?', 'What if my access expires?', 'How do referrals work?'].map((q, index) => <div key={q}><button onClick={() => setOpenFaq(openFaq === index ? null : index)} className="focus-ring flex w-full items-center justify-between py-5 text-left text-sm font-semibold" data-testid={`button-faq-${index}`}>{q}<ChevronDown size={16} className={`transition ${openFaq === index ? 'rotate-180 text-primary' : 'text-muted-foreground'}`} /></button>{openFaq === index && <p className="max-w-2xl pb-5 text-sm leading-6 text-muted-foreground">{['Paystack confirms your payment and returns an access key. Use it immediately to activate your private terminal window.', 'No. Coded Signal Bot is deliberately accountless. Your access key is your entry credential.', 'The terminal closes gracefully. You can purchase a new window or redeem another valid key.', 'Your referral code is attached during purchase. Confirmed referrals accumulate in your terminal and may issue a reward.'][index]}</p>}</div>)}</div></section>
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8"><div className="flex flex-col items-start justify-between gap-5 rounded-2xl border border-accent/25 bg-accent/[.06] p-6 sm:flex-row sm:items-center sm:p-8"><div><div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle size={17} className="text-accent" /> Need a hand?</div><p className="mt-2 text-sm text-muted-foreground">Reach the signal desk on WhatsApp for payment or access support.</p></div><a href={config?.whatsappUrl || '#'} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border border-accent/40 px-4 text-sm font-semibold text-accent hover:bg-accent/10" data-testid="link-whatsapp">Open WhatsApp <ExternalLink size={14} /></a></div></section>
      <footer className="border-t border-border px-5 py-8 sm:px-8"><div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Coded Signal Bot</span><span className="max-w-xl leading-5">Responsible use: signals are informational, not financial advice or guaranteed outcomes. Only use funds you can afford to lose.</span></div></footer>
    </main>
    {showAccess && <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-5 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Platform access</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.05em]">Choose a platform to continue.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Select your betting platform and enter the access code shared with you.</p></div><button onClick={() => setShowAccess(false)} className="focus-ring rounded-md p-2 text-muted-foreground hover:bg-secondary" data-testid="button-close-access"><X size={18} /></button></div><form onSubmit={submitKey} className="mt-6 grid gap-4"><PlatformSelector value={platform} onChange={setPlatform} /><Field label={`${platform === 'msport' ? 'MSport' : 'SportyBet'} access code`} required minLength={8} placeholder="CSB-••••-••••" value={key} onChange={(e) => setKey(e.target.value)} data-testid="input-platform-access-code" />{keyMessage && <p className={`text-sm ${keyMessage.good ? 'text-primary' : 'text-destructive'}`} data-testid="status-access-key">{keyMessage.text}</p>}<Button type="submit" disabled={validating || activating || key.length < 8} data-testid="button-activate-access">{validating || activating ? 'Checking…' : `View ${platform === 'msport' ? 'MSport' : 'SportyBet'} signal`} <ArrowRight size={15} /></Button></form><p className="mt-5 text-xs leading-5 text-muted-foreground">Your code is used only to activate the protected signal window for this session.</p></div></div>}
  </div>;
}

function TerminalShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  return <div className="min-h-[100dvh] bg-background"><header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8"><Brand /><div className="flex items-center gap-3"><StatusDot label="Protected" /><Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={onLogout} data-testid="button-logout"><LogOut size={15} /><span className="hidden sm:inline">Leave terminal</span></Button></div></div></header><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main></div>;
}

function Stat({ label, value, detail, tone = 'default' }: { label: string; value: string | number; detail?: string; tone?: 'default' | 'good' | 'bad' }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{label}</div><div className={`mt-3 text-2xl font-semibold tracking-[-.06em] ${tone === 'good' ? 'text-primary' : tone === 'bad' ? 'text-destructive' : ''}`} data-testid={`text-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>{detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}</div>;
}

function Dashboard() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const platformParam = new URLSearchParams(search).get('platform');
  const platform: BettingPlatform = platformParam === 'sportybet' ? 'sportybet' : 'msport';
  const status = useGetAccessStatus();
  const authenticated = Boolean(status.data?.authenticated);
  const logout = useLogoutAccess();
  const signal = useGetCurrentSignal({ query: { enabled: authenticated, queryKey: getGetCurrentSignalQueryKey() } });
  const history = useGetSignalHistory({ query: { enabled: authenticated, queryKey: getGetSignalHistoryQueryKey() } });
  const referral = useGetReferralProgress({ query: { enabled: authenticated, queryKey: getGetReferralProgressQueryKey() } });
  const streak = useGetStreak({ query: { enabled: authenticated, queryKey: getGetStreakQueryKey() } });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const secondsToResult = signal.data?.current ? Math.max(0, Math.round((new Date(signal.data.current.generatedAt).getTime() + signal.data.cycleSeconds * 1000 - now) / 1000)) : 0;
  const signOut = () => logout.mutate(undefined, { onSettled: () => { queryClient.invalidateQueries({ queryKey: getGetAccessStatusQueryKey() }); setLocation('/'); } });
  if (status.isLoading) return <TerminalShell onLogout={signOut}><LoadingBlocks /></TerminalShell>;
  if (status.isError || !authenticated) return <TerminalShell onLogout={signOut}><div className="mx-auto max-w-lg py-16 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-muted-foreground"><KeyRound /></div><h1 className="mt-6 text-3xl font-semibold tracking-[-.06em]">Your window is closed.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Enter a valid access key or purchase a new signal window to continue.</p><Link href="/" className="focus-ring mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground" data-testid="link-return-access">Return to access <ArrowRight size={15} /></Link></div></TerminalShell>;
  return <TerminalShell onLogout={signOut}><PageHeader eyebrow="Protected terminal" title="Signal window"><div className="flex flex-col items-stretch gap-2 sm:items-end"><div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[.06] px-3 py-2 text-xs"><span className="text-muted-foreground">Platform</span><span className="font-semibold text-primary">{platform === 'msport' ? 'MSport' : 'SportyBet'}</span><span className="text-border">·</span><span className="text-muted-foreground">Access</span><span className="mono text-primary">{status.data?.keyPrefix ?? '••••'} · {formatTime(status.data?.remainingSeconds ?? 0)}</span></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Switch platform</span>{bettingPlatforms.map((option) => <button key={option.value} type="button" onClick={() => setLocation(`/dashboard?platform=${option.value}`)} className={`focus-ring rounded-md px-2 py-1 font-semibold ${platform === option.value ? 'bg-primary/10 text-primary' : 'hover:bg-secondary hover:text-foreground'}`} data-testid={`button-dashboard-platform-${option.value}`}>{option.label}</button>)}</div></div></PageHeader>
     <div className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]"><section className="scanline rounded-2xl border border-primary/35 bg-card p-5 shadow-[0_20px_55px_rgba(0,0,0,.2)] sm:p-7"><div className="flex items-start justify-between"><div><StatusDot label={`${platform === 'msport' ? 'MSport' : 'SportyBet'} signal`} /><div className="mt-5 flex items-end gap-2"><span className="text-7xl font-semibold tracking-[-.1em] text-primary sm:text-8xl" data-testid="text-current-multiplier">{signal.isLoading ? '—' : signal.data?.current.multiplier.toFixed(2)}</span><span className="mb-3 text-2xl text-primary">×</span></div></div><div className="rounded-full border border-primary/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">Live</div></div><div className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3"><div><div className="text-xs text-muted-foreground">Window closes</div><div className="mono mt-2 text-lg" data-testid="text-countdown">{formatTime(secondsToResult)}</div></div><div><div className="text-xs text-muted-foreground">Next signal</div><div className="mono mt-2 text-lg text-accent" data-testid="text-next-multiplier">{signal.data?.next ? `${signal.data.next.multiplier.toFixed(2)}×` : '—'}</div></div><div className="hidden sm:block"><div className="text-xs text-muted-foreground">Last sync</div><div className="mono mt-2 text-sm">{signal.data ? formatDate(signal.data.serverTime) : '—'}</div></div></div></section><section className="rounded-2xl border border-border bg-card p-5"><StatusDot label="Access status" tone="live" /><div className="mt-6 text-3xl font-semibold tracking-[-.06em]">{formatTime(status.data?.remainingSeconds ?? 0)}</div><p className="mt-1 text-sm text-muted-foreground">remaining in your paid window</p><div className="mt-7 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, ((status.data?.remainingSeconds ?? 0) / Math.max(1, (status.data?.remainingSeconds ?? 0) + 3600)) * 100)}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{status.data?.source ?? 'access key'}</span><span>expires {formatDate(status.data?.expiresAt)}</span></div></section></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">Signal history</div><h2 className="mt-2 text-xl font-semibold tracking-[-.05em]">Recent windows</h2></div><RefreshCw size={16} className="text-muted-foreground" /></div><div className="mt-5 divide-y divide-border">{history.isLoading ? <LoadingRows count={4} /> : history.isError ? <InlineError onRetry={() => history.refetch()} /> : (history.data ?? []).length === 0 ? <Empty label="No signal history yet." /> : history.data?.slice(0, 6).map((item) => <SignalRow key={item.id} item={item} />)}</div></section><div className="grid gap-4"><ProgressCard title="Referral path" icon={<Users size={17} />} value={referral.data ? `${referral.data.confirmed} / ${referral.data.required}` : '—'} detail={referral.data?.rewardIssued ? 'Reward issued' : 'confirmed referrals'} progress={referral.data ? (referral.data.confirmed / Math.max(referral.data.required, 1)) * 100 : 0} footer={referral.data?.code ? `Your code · ${referral.data.code}` : 'Referral code unavailable'} /><ProgressCard title="Streak" icon={<TrendingUp size={17} />} value={streak.data ? `${streak.data.current} days` : '—'} detail={streak.data ? `${streak.data.discountPercent}% discount unlocked` : 'activity streak'} progress={streak.data ? Math.min(100, streak.data.current * 10) : 0} footer={streak.data ? `Longest · ${streak.data.longest} days` : 'Keep showing up with intention'} /></div></div>
    <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Responsible use.</span> Signals are informational and do not guarantee outcomes. Set a loss limit before entering a window; never chase a result.</div>
  </TerminalShell>;
}

function SignalRow({ item }: { item: SignalRecord }) {
  const positive = item.status.toLowerCase().includes('win') || item.status.toLowerCase().includes('success');
  return <div className="flex items-center justify-between py-3" data-testid={`row-signal-${item.id}`}><div className="flex items-center gap-3"><span className={`grid size-8 place-items-center rounded-lg ${positive ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>{positive ? <Check size={15} /> : <Clock3 size={15} />}</span><div><div className="mono text-sm">{item.multiplier.toFixed(2)}×</div><div className="text-[11px] text-muted-foreground">{formatDate(item.generatedAt)}</div></div></div><span className={`text-xs font-semibold uppercase tracking-wider ${positive ? 'text-primary' : 'text-muted-foreground'}`}>{item.status}</span></div>;
}
function ProgressCard({ title, icon, value, detail, progress, footer }: { title: string; icon: ReactNode; value: string; detail: string; progress: number; footer: string }) {
  return <div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div><div className="mt-6 flex items-end justify-between"><div><div className="text-3xl font-semibold tracking-[-.07em]">{value}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div><Sparkles size={17} className="text-primary" /></div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, progress)}%` }} /></div><div className="mt-3 text-[11px] text-muted-foreground">{footer}</div></div>;
}
function LoadingBlocks() { return <div className="grid animate-pulse gap-4 lg:grid-cols-[1.3fr_.7fr]"><div className="h-72 rounded-2xl bg-secondary" /><div className="h-72 rounded-2xl bg-secondary" /></div>; }
function LoadingRows({ count }: { count: number }) { return <>{Array.from({ length: count }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-secondary/60" />)}</>; }
function Empty({ label }: { label: string }) { return <div className="py-10 text-center text-sm text-muted-foreground">{label}</div>; }
function InlineError({ onRetry }: { onRetry: () => void }) { return <div className="flex items-center justify-between py-8 text-sm text-destructive"><span>Could not load this panel.</span><Button variant="ghost" onClick={onRetry} className="min-h-9 text-xs" data-testid="button-retry-panel">Retry</Button></div>; }

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const login = useAdminLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return <div className="min-h-[100dvh] bg-background"><div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5 py-10"><Brand /><div className="mt-12"><div className="mb-2 text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Restricted console</div><h1 className="text-4xl font-semibold tracking-[-.07em]">Admin access.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This route is for operators only. Customer keys never work here.</p><form onSubmit={(e) => { e.preventDefault(); login.mutate({ data: { email, password } }, { onSuccess }); }} className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-5"><Field label="Operator email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-admin-email" /><Field label="Password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-admin-password" />{login.isError && <p className="text-sm text-destructive" data-testid="status-admin-login-error">Credentials were not accepted.</p>}<Button type="submit" disabled={login.isPending} data-testid="button-admin-login">{login.isPending ? 'Verifying…' : 'Enter console'} <LogIn size={15} /></Button></form></div><Link href="/" className="focus-ring mt-8 text-xs text-muted-foreground hover:text-foreground" data-testid="link-admin-back">← Back to public site</Link></div></div>;
}

function Admin() {
  const session = useGetAdminSession({ query: { retry: false, queryKey: getGetAdminSessionQueryKey() } });
  const qc = useQueryClient();
  const [loggedIn, setLoggedIn] = useState(false);
  const authenticated = Boolean(session.data?.authenticated || loggedIn);
  const onLogin = () => { setLoggedIn(true); qc.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); };
  if (session.isLoading && !loggedIn) return <div className="grid min-h-[100dvh] place-items-center bg-background"><div className="mono text-xs text-muted-foreground">Checking console session…</div></div>;
  if (!authenticated) return <AdminLogin onSuccess={onLogin} />;
  return <AdminConsole session={session.data} />;
}

function AdminConsole({ session }: { session?: { authenticated: boolean; email: string | null; forcePasswordChange: boolean } }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const logout = useAdminLogout();
  const overview = useGetAdminOverview();
  const publicConfig = useGetPublicConfig();
  const codes = useListAccessCodes();
  const payments = useListPayments();
  const pricing = useUpdatePricing();
  const generate = useGenerateGiveawayCodes();
  const revoke = useRevokeAccessCode();
  const password = useChangeAdminPassword();
  const [tab, setTab] = useState<'overview' | 'codes' | 'payments'>('overview');
  const [pricingForm, setPricingForm] = useState({ standardPrice: '', promoPrice: '', currency: 'NGN', promoEnabled: true, durationSeconds: '86400' });
  const [codeForm, setCodeForm] = useState({ quantity: '5', durationSeconds: '86400', maxUses: '1', redeemBefore: '' });
  const [generatedCodes, setGeneratedCodes] = useState<GeneratedCode[]>([]);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [notice, setNotice] = useState('');
  const overviewData = overview.data as AdminOverview | undefined;
  useEffect(() => {
    if (!publicConfig.data) return;
    setPricingForm({
      standardPrice: String(publicConfig.data.standardPrice),
      promoPrice: String(publicConfig.data.promoPrice),
      currency: publicConfig.data.currency,
      promoEnabled: publicConfig.data.promoEnabled,
      durationSeconds: String(publicConfig.data.durationSeconds),
    });
  }, [publicConfig.data]);
  const submitPricing = (e: React.FormEvent) => { e.preventDefault(); pricing.mutate({ data: { standardPrice: Number(pricingForm.standardPrice), promoPrice: Number(pricingForm.promoPrice), currency: pricingForm.currency, promoEnabled: pricingForm.promoEnabled, durationSeconds: Number(pricingForm.durationSeconds) } }, { onSuccess: () => setNotice('Pricing updated.') }); };
  const submitCodes = (e: React.FormEvent) => { e.preventDefault(); generate.mutate({ data: { quantity: Number(codeForm.quantity), durationSeconds: Number(codeForm.durationSeconds), maxUses: Number(codeForm.maxUses), redeemBefore: codeForm.redeemBefore || null } }, { onSuccess: (result) => { setGeneratedCodes(result); setNotice('Giveaway codes generated. Copy them now; full codes are only returned at creation.'); qc.invalidateQueries({ queryKey: getListAccessCodesQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() }); } }); };
  const changePassword = (e: React.FormEvent) => { e.preventDefault(); password.mutate({ data: pwForm }, { onSuccess: () => { setNotice('Password changed.'); setPwForm({ currentPassword: '', newPassword: '' }); } }); };
  const signOut = () => logout.mutate(undefined, { onSettled: () => { qc.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); setLocation('/admin'); } });
  return <div className="min-h-[100dvh] bg-background"><header className="border-b border-border bg-sidebar"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8"><Brand /><div className="flex items-center gap-4"><span className="hidden text-xs text-muted-foreground sm:inline">{session?.email}</span><Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={signOut} data-testid="button-admin-logout"><LogOut size={15} /> Log out</Button></div></div></header><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><PageHeader eyebrow="Operator console" title="Control room"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} className="text-primary" /> Secure session</div></PageHeader>{notice && <div className="mb-5 flex items-center justify-between rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary" data-testid="status-admin-notice">{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}{session?.forcePasswordChange && <form onSubmit={changePassword} className="mb-5 rounded-xl border border-accent/30 bg-accent/[.06] p-5"><div className="font-semibold">Password change required</div><p className="mt-1 text-sm text-muted-foreground">Set a new operator password before continuing.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label="Current password" type="password" required value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} data-testid="input-current-password" /><Field label="New password" type="password" required minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} data-testid="input-new-password" /><Button type="submit" disabled={password.isPending} className="self-end" data-testid="button-change-password">Update password</Button></div></form>}<div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">{[['overview', 'Overview'], ['codes', 'Access codes'], ['payments', 'Payments']].map(([value, label]) => <button key={value} onClick={() => setTab(value as typeof tab)} className={`focus-ring rounded-md px-4 py-2 text-sm font-medium ${tab === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`button-admin-tab-${value}`}>{label}</button>)}</div>{tab === 'overview' && <AdminOverview data={overviewData} isLoading={overview.isLoading} pricingForm={pricingForm} setPricingForm={setPricingForm} submitPricing={submitPricing} pricingPending={pricing.isPending} />}{tab === 'codes' && <CodesPanel codes={codes.data} isLoading={codes.isLoading} form={codeForm} setForm={setCodeForm} onSubmit={submitCodes} pending={generate.isPending} generatedCodes={generatedCodes} onRevoke={(id) => revoke.mutate({ id }, { onSuccess: () => { setNotice('Code revoked.'); qc.invalidateQueries({ queryKey: getListAccessCodesQueryKey() }); } })} />}{tab === 'payments' && <PaymentsPanel payments={payments.data} isLoading={payments.isLoading} />}</main></div>;
}

function AdminOverview({ data, isLoading, pricingForm, setPricingForm, submitPricing, pricingPending }: { data?: AdminOverview; isLoading: boolean; pricingForm: { standardPrice: string; promoPrice: string; currency: string; promoEnabled: boolean; durationSeconds: string }; setPricingForm: (value: typeof pricingForm) => void; submitPricing: (e: React.FormEvent) => void; pricingPending: boolean }) {
  return <div className="grid gap-4">{isLoading ? <LoadingBlocks /> : <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Active sessions" value={data?.activeSessions ?? '—'} tone="good" /><Stat label="Active keys" value={data?.activeKeys ?? '—'} tone="good" /><Stat label="Successful payments" value={data?.successfulPayments ?? '—'} detail={`${data?.totalPayments ?? '—'} total`} /><Stat label="Revenue" value={data ? formatMoney(data.revenue) : '—'} /></div><div className="grid gap-4 lg:grid-cols-[1fr_.9fr]"><section className="rounded-xl border border-border bg-card p-5"><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">Recent activity</div><div className="mt-4 divide-y divide-border">{(data?.recentActivity ?? []).length ? data?.recentActivity.map((item, i) => <div className="py-3 text-sm text-muted-foreground" key={`${item}-${i}`} data-testid={`text-activity-${i}`}>{item}</div>) : <Empty label="No recent activity." />}</div></section><form onSubmit={submitPricing} className="rounded-xl border border-border bg-card p-5"><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">Pricing controls</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Standard price" type="number" min="1" required value={pricingForm.standardPrice} onChange={(e) => setPricingForm({ ...pricingForm, standardPrice: e.target.value })} data-testid="input-standard-price" /><Field label="Promo price" type="number" min="1" required value={pricingForm.promoPrice} onChange={(e) => setPricingForm({ ...pricingForm, promoPrice: e.target.value })} data-testid="input-promo-price" /><Field label="Currency" minLength={3} maxLength={3} required value={pricingForm.currency} onChange={(e) => setPricingForm({ ...pricingForm, currency: e.target.value.toUpperCase() })} data-testid="input-currency" /><Field label="Duration (seconds)" type="number" min="3600" required value={pricingForm.durationSeconds} onChange={(e) => setPricingForm({ ...pricingForm, durationSeconds: e.target.value })} data-testid="input-duration" /></div><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={pricingForm.promoEnabled} onChange={(e) => setPricingForm({ ...pricingForm, promoEnabled: e.target.checked })} data-testid="input-promo-enabled" /> Promo pricing enabled</label><Button type="submit" className="mt-5" disabled={pricingPending} data-testid="button-update-pricing">Save pricing</Button></form></div></>}</div>;
}

function CodesPanel({ codes, isLoading, form, setForm, onSubmit, pending, generatedCodes, onRevoke }: { codes?: AccessCode[]; isLoading: boolean; form: { quantity: string; durationSeconds: string; maxUses: string; redeemBefore: string }; setForm: (value: typeof form) => void; onSubmit: (e: React.FormEvent) => void; pending: boolean; generatedCodes: GeneratedCode[]; onRevoke: (id: number) => void }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copyCode = async (code: string) => {
    await navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode((current) => current === code ? null : current), 1800);
  };
  return <div className="grid gap-4 lg:grid-cols-[.75fr_1.25fr]"><form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-5"><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">Generate batch</div><p className="mt-2 text-sm text-muted-foreground">Create giveaway access codes for trusted distribution.</p><div className="mt-5 grid gap-3"><Field label="Quantity" type="number" min="1" max="500" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="input-code-quantity" /><Field label="Duration (seconds)" type="number" min="3600" required value={form.durationSeconds} onChange={(e) => setForm({ ...form, durationSeconds: e.target.value })} data-testid="input-code-duration" /><Field label="Max uses per code" type="number" min="1" required value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} data-testid="input-code-max-uses" /><Field label="Redeem before (optional)" type="datetime-local" value={form.redeemBefore} onChange={(e) => setForm({ ...form, redeemBefore: e.target.value })} data-testid="input-code-redeem-before" /></div><Button className="mt-5 w-full" type="submit" disabled={pending} data-testid="button-generate-codes">{pending ? 'Generating…' : 'Generate codes'} <Ticket size={15} /></Button>{generatedCodes.length > 0 && <section className="mt-5 rounded-lg border border-primary/25 bg-primary/[.06] p-4" data-testid="generated-codes-result"><div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">New codes</div><p className="mt-1 text-xs text-muted-foreground">Copy these now. Full codes are not shown again in the inventory.</p></div><span className="mono text-xs text-primary">{generatedCodes.length} created</span></div><div className="mt-4 grid gap-2">{generatedCodes.map((generated) => <div key={generated.id} className="flex items-center gap-2 rounded-md border border-border bg-background/70 p-2"><code className="mono min-w-0 flex-1 truncate text-sm text-primary">{generated.code}</code><Button type="button" variant="secondary" className="min-h-8 shrink-0 px-2 text-xs" onClick={() => copyCode(generated.code)} data-testid={`button-copy-generated-code-${generated.id}`}><Copy size={14} />{copiedCode === generated.code ? 'Copied' : 'Copy'}</Button></div>)}</div></section>}</form><section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">Code inventory</div><h2 className="mt-2 text-xl font-semibold tracking-[-.05em]">Giveaway access</h2></div><span className="mono text-xs text-muted-foreground">{codes?.length ?? 0} records</span></div><div className="mt-5 overflow-x-auto">{isLoading ? <LoadingRows count={4} /> : !codes?.length ? <Empty label="No access codes generated yet." /> : <table className="w-full min-w-[560px] text-left text-xs"><thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="pb-3">Code</th><th className="pb-3">Uses</th><th className="pb-3">Status</th><th className="pb-3">Created</th><th className="pb-3" /></tr></thead><tbody className="divide-y divide-border">{codes.map((code) => <tr key={code.id} data-testid={`row-code-${code.id}`}><td className="py-3 mono text-primary">{code.prefix}••••</td><td className="py-3">{code.uses}/{code.maxUses}</td><td className="py-3 uppercase text-muted-foreground">{code.status}</td><td className="py-3 text-muted-foreground">{formatDate(code.createdAt)}</td><td className="py-3 text-right">{code.status.toLowerCase() !== 'revoked' && <Button variant="danger" className="min-h-8 px-2 text-xs" onClick={() => onRevoke(code.id)} data-testid={`button-revoke-code-${code.id}`}>Revoke</Button>}</td></tr>)}</tbody></table>}</div></section></div>;
}

function PaymentsPanel({ payments, isLoading }: { payments?: PaymentRecord[]; isLoading: boolean }) {
  return <section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">Transaction ledger</div><h2 className="mt-2 text-xl font-semibold tracking-[-.05em]">Payments</h2></div><BarChart3 size={18} className="text-muted-foreground" /></div><div className="mt-5 overflow-x-auto">{isLoading ? <LoadingRows count={5} /> : !payments?.length ? <Empty label="No payments recorded yet." /> : <table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="pb-3">Reference</th><th className="pb-3">Customer</th><th className="pb-3">Amount</th><th className="pb-3">Status</th><th className="pb-3">Created</th></tr></thead><tbody className="divide-y divide-border">{payments.map((payment) => <tr key={payment.id} data-testid={`row-payment-${payment.id}`}><td className="py-3 mono text-accent">{payment.reference}</td><td className="py-3">{payment.customerEmail ?? '—'}</td><td className="py-3">{formatMoney(payment.amount, payment.currency)}</td><td className="py-3 uppercase text-muted-foreground">{payment.status}</td><td className="py-3 text-muted-foreground">{formatDate(payment.createdAt)}</td></tr>)}</tbody></table>}</div></section>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function Router() { return <RoutedErrorBoundary><Switch><Route path="/" component={Landing} /><Route path="/dashboard" component={Dashboard} /><Route path="/admin" component={Admin} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;