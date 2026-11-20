import { lazy, Suspense } from 'react';
const AdminPortal = lazy(() => import('./pages/AdminPortal.jsx'));

export default function App() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center text-sm text-[#6B7C91]">Opening library workspace…</main>}><AdminPortal /></Suspense>;
}
