import { lazy, Suspense } from 'react';
import PublicCatalog from './pages/PublicCatalog.jsx';
const AdminPortal = lazy(() => import('./pages/AdminPortal.jsx'));

export default function App() {
  if (import.meta.env.MODE === 'admin') {
    return <Suspense fallback={<main className="grid min-h-screen place-items-center text-sm text-[#6B7C91]">Opening staff portal…</main>}><AdminPortal /></Suspense>;
  }
  return <PublicCatalog />;
}
