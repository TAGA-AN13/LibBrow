import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import AdminDashboard from '../dashboards/AdminDashboard.jsx';

const SESSION_KEY = 'libbrow-admin-token';

export default function AdminPortal() {
  const [session, setSession] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const accessToken = localStorage.getItem(SESSION_KEY);
    if (!accessToken) {
      setLoading(false);
      return () => { active = false; };
    }

    apiRequest('/admin/me', { token: accessToken })
      .then(({ user }) => { if (active) setSession({ access_token: accessToken, user }); })
      .catch(() => { localStorage.removeItem(SESSION_KEY); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleSignIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest('/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      localStorage.setItem(SESSION_KEY, result.access_token);
      setSession({ access_token: result.access_token, user: result.user });
      setPassword('');
    } catch (signInError) {
      setError(signInError.message);
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setUsername('');
  }

  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-[#3A506B]">Checking admin session…</main>;
  if (session) return <AdminDashboard session={session} onLogout={handleLogout} />;

  return (
    <main className="grid min-h-screen place-items-center p-4 sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] bg-white shadow-[0_24px_80px_rgba(11,19,43,0.18)] lg:min-h-[600px] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative flex min-h-56 flex-col justify-between overflow-hidden bg-[#1C2541] bg-cover bg-center p-6 text-[#F7FAFD] sm:p-10 lg:min-h-[600px] lg:p-12" style={{ backgroundImage: "linear-gradient(90deg, rgba(11, 19, 43, 0.92), rgba(28, 37, 65, 0.76)), url('/library.jpg')" }}>
          <div className="relative py-4">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#5BC0DE]">Library workspace</p>
            <h1 className="max-w-xl font-display text-4xl font-medium leading-tight">Keep the shelves moving.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-[#F7FAFD]/85 sm:text-base sm:leading-7">Manage inventory, register borrowers, record checkouts, and confirm returns.</p>
          </div>
          <p className="text-xs font-medium tracking-wide text-[#F4D6B0]">LIBBROW · LIBRARY DESK</p>
        </section>
        <section className="flex items-center justify-center px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
          <div className="w-full max-w-md">
            <img src="/libbrow-horizontal.png" alt="LibBrow — Borrow, Read, Discover" className="mx-auto mb-10 h-14 w-auto max-w-full object-contain sm:mb-12" />
            <div className="mb-5 grid size-11 place-items-center rounded-xl bg-[#EAF7FB] text-[#1C2541]" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5"><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/><circle cx="12" cy="15" r="1"/></svg>
            </div>
            <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[#3A506B]">Admin portal</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[#0B132B]">Welcome back</h2>
            <p className="mt-3 text-sm leading-6 text-[#3A506B]">Sign in with your library administrator account.</p>
            <form className="admin-auth-form mt-8 space-y-5" onSubmit={handleSignIn}>
              <label className="block text-sm font-medium text-[#0B132B]">Username<input className="field mt-2" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
              <label className="block text-sm font-medium text-[#0B132B]">Password<input className="field mt-2" name="password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
              <button className="admin-signin-button w-full" disabled={busy} type="submit"><span className="admin-signin-button-content"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>{busy ? 'Signing in…' : 'Sign in securely'}<span aria-hidden="true" className="admin-signin-arrow">→</span></span></button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
