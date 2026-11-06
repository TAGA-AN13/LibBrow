import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { supabaseAuth } from '../lib/supabaseAuth.js';
import AdminDashboard from '../dashboards/AdminDashboard.jsx';

export default function AdminPortal() {
  const [session, setSession] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [setupSignIn, setSetupSignIn] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginEmailReady, setLoginEmailReady] = useState(false);
  const [loginPasswordReady, setLoginPasswordReady] = useState(false);
  const [bootstrapKey, setBootstrapKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function verifyStaffSession(nextSession) {
    const result = await apiRequest('/admin/me', { token: nextSession.access_token });
    setSession(nextSession);
    setAdmin(result.user);
  }

  async function completeFirstAdmin(nextSession) {
    const result = await apiRequest('/admin/bootstrap', {
      token: nextSession.access_token,
      method: 'POST',
      body: JSON.stringify({ name, bootstrap_key: bootstrapKey }),
    });
    setSession(nextSession);
    setAdmin(result.user);
    setBootstrapAvailable(false);
    setBootstrapKey('');
    setError('');
    setMessage('First administrator account created. Setup is now closed.');
  }

  useEffect(() => {
    let active = true;
    const authSubscription = supabaseAuth?.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'TOKEN_REFRESHED' && nextSession) setSession(nextSession);
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setAdmin(null);
      }
    }).data.subscription;

    async function restoreSession() {
      if (!supabaseAuth) {
        setLoading(false);
        setError('Staff sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.');
        return;
      }
      try {
        const launchSignIn = new URLSearchParams(window.location.search).get('launcher') === '1';
        if (launchSignIn) {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('launcher');
          window.history.replaceState({}, '', cleanUrl);
          const { error: signOutError } = await supabaseAuth.auth.signOut();
          if (signOutError) throw signOutError;
        }
        const [status, sessionResult] = await Promise.all([
          apiRequest('/admin/bootstrap-status'),
          supabaseAuth.auth.getSession(),
        ]);
        if (!active) return;
        setBootstrapAvailable(status.available);
        setBootstrapConfigured(status.configured);
        if (sessionResult.error) setError(sessionResult.error.message);
        if (sessionResult.data.session) {
          setSession(sessionResult.data.session);
          if (!status.available) {
            try { await verifyStaffSession(sessionResult.data.session); }
            catch (verifyError) {
              await supabaseAuth.auth.signOut();
              if (active) setError(verifyError.message);
            }
          }
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    restoreSession();
    return () => { active = false; authSubscription?.unsubscribe(); };
  }, []);

  async function handleSignIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const { data, error: signInError } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    try {
      if (bootstrapAvailable) await completeFirstAdmin(data.session);
      else await verifyStaffSession(data.session);
    } catch (requestError) {
      setSession(data.session);
      setError(requestError.message);
    } finally { setBusy(false); }
  }

  async function handleSignUp(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const { data, error: signUpError } = await supabaseAuth.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }
    if (data.session) {
      try { await completeFirstAdmin(data.session); }
      catch (requestError) {
        setSession(data.session);
        setError(requestError.message);
      }
    } else {
      setSetupSignIn(true);
      setMessage('Check your email to confirm the Supabase account, then sign in here with the same details and setup key to finish creating the administrator.');
    }
    setBusy(false);
  }

  async function handleCompleteSetup(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { await completeFirstAdmin(session); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function handleLogout() {
    await supabaseAuth?.auth.signOut();
    setSession(null);
    setAdmin(null);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F2F7FC] text-sm text-[#6B7C91]">Checking staff setup…</main>;
  if (session && admin) return <AdminDashboard session={{ access_token: session.access_token, user: admin }} onLogout={handleLogout} />;

  const firstRun = bootstrapAvailable;
  const signedInForSetup = firstRun && Boolean(session);

  return (
    <main className="grid min-h-screen place-items-center bg-[#F2F7FC] p-4 sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] bg-white shadow-[0_24px_80px_rgba(25,45,70,0.14)] lg:min-h-[600px] lg:grid-cols-[0.9fr_1.1fr]">
      <section className="relative flex min-h-56 flex-col justify-between overflow-hidden bg-[#244A70] bg-cover bg-center p-6 text-[#F2F7FC] sm:p-10 lg:min-h-[600px] lg:p-12" style={{ backgroundImage: "linear-gradient(90deg, rgba(8, 30, 60, 0.84), rgba(8, 30, 60, 0.62)), url('/library.jpg')" }}>
        <div className="relative py-4"><p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#E2BB61]">Staff workspace</p><h1 className="max-w-xl font-display text-4xl font-medium leading-tight">Keep the shelves moving.</h1><p className="mt-5 max-w-md text-sm leading-6 text-[#DCE6F0]/85 sm:text-base sm:leading-7">Review customer requests, manage inventory, and confirm returned loans.</p></div>
        <a href={`${window.location.protocol}//${window.location.hostname}:5173/?from=admin`} className="relative mt-8 w-fit text-sm text-[#DCE6F0]/80 hover:text-[#E2BB61]">Open the customer website ↗</a>
      </section>
      <section className="flex items-center justify-center px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
        <div className="w-full max-w-md">
          <img src="/libbrow-horizontal.png" alt="LibBrow — Borrow, Read, Discover" className="mx-auto mb-10 h-14 w-auto max-w-full object-contain sm:mb-12" />
          <div className="mb-5 grid size-11 place-items-center rounded-xl bg-[#F2F7FC] text-[#315B86]" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5"><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/><circle cx="12" cy="15" r="1"/></svg></div>
          <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[#315B86]">Admin portal</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-[#26364A]">{firstRun ? 'Create the first admin' : 'Welcome back'}</h2>
          <p className="mt-3 text-sm leading-6 text-[#6B7C91]">{firstRun ? 'Set up your own Supabase Auth account. This one-time setup closes after the first administrator is created.' : 'Sign in to manage your library.'}</p>

          {firstRun && !bootstrapConfigured && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">First-admin setup is locked until the API owner sets a strong ADMIN_BOOTSTRAP_KEY in the root .env.</p>}
          {signedInForSetup ? (
            <form className="mt-8 space-y-5" onSubmit={handleCompleteSetup}>
              <p className="rounded-xl bg-[#F2F7FC] px-4 py-3 text-sm text-[#315B86]">Signed in as {session.user.email}. Finish setup to grant this account the single Admin role.</p>
              <label className="block text-sm font-medium text-[#26364A]">Admin name<input className="field mt-2" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength="160" required /></label>
              <label className="block text-sm font-medium text-[#26364A]">One-time setup key<input className="field mt-2" type="password" autoComplete="off" value={bootstrapKey} onChange={(event) => setBootstrapKey(event.target.value)} required /></label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
              <button className="button-primary w-full" disabled={busy || !bootstrapConfigured}>{busy ? 'Creating admin…' : 'Create the first admin'}</button>
              <button className="button-quiet w-full" type="button" onClick={handleLogout}>Sign out</button>
            </form>
          ) : firstRun ? (
            <form className="admin-auth-form mt-8 space-y-5" onSubmit={setupSignIn ? handleSignIn : handleSignUp}>
              {!setupSignIn && <label className="block text-sm font-medium text-[#26364A]">Admin name<input className="field mt-2" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength="160" required /></label>}
              <label className="block text-sm font-medium text-[#26364A]">Email address<input className="field mt-2" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label className="block text-sm font-medium text-[#26364A]">Password<input className="field mt-2" autoComplete={setupSignIn ? 'current-password' : 'new-password'} type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" required /></label>
              <label className="block text-sm font-medium text-[#26364A]">One-time setup key<input className="field mt-2" type="password" autoComplete="off" value={bootstrapKey} onChange={(event) => setBootstrapKey(event.target.value)} required /><span className="mt-1 block text-xs font-normal text-[#8796A8]">The API owner configures this key in the root .env.</span></label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
              {message && <p role="status" className="rounded-xl bg-[#F2F7FC] px-4 py-3 text-sm text-[#315B86]">{message}</p>}
              <button className={`${setupSignIn ? 'admin-signin-button' : 'button-primary'} w-full`} disabled={busy || !bootstrapConfigured}>{setupSignIn ? <span className="admin-signin-button-content"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>{busy ? 'Working…' : 'Sign in and finish setup'}<span aria-hidden="true" className="admin-signin-arrow">→</span></span> : busy ? 'Working…' : 'Create Supabase account'}</button>
              <button className="button-quiet w-full" type="button" onClick={() => { setSetupSignIn(!setupSignIn); setError(''); setMessage(''); }}>{setupSignIn ? 'Need to create the Supabase account?' : 'Already created or confirmed your account?'}</button>
            </form>
          ) : (
            <form className="admin-auth-form mt-8 space-y-5" onSubmit={handleSignIn}>
              <label className="block text-sm font-medium text-[#26364A]">Email address<input className="field mt-2" name="username" autoComplete="username" readOnly={!loginEmailReady} onFocus={() => setLoginEmailReady(true)} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label className="block text-sm font-medium text-[#26364A]">Password<input className="field mt-2" name="password" autoComplete="current-password" readOnly={!loginPasswordReady} onFocus={() => setLoginPasswordReady(true)} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
              <button className="admin-signin-button w-full" disabled={busy || !supabaseAuth} type="submit"><span className="admin-signin-button-content"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>{busy ? 'Signing in…' : 'Sign in securely'}<span aria-hidden="true" className="admin-signin-arrow">→</span></span></button>
            </form>
          )}
        </div>
      </section>
      </div>
    </main>
  );
}
