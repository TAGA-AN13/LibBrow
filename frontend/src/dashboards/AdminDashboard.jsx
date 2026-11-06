import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';

const initialForm = { isbn: '', title: '', author: '', copies: '1', imageUrl: '', categories: [] };
const bookCategories = ['Biography', 'Children’s', 'Education', 'Fantasy', 'Fiction', 'History', 'Horror', 'Music', 'Mystery', 'Nonfiction', 'Other', 'Romance', 'Science Fiction', 'Self-help', 'Young Adult'];
const adminViews = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'overview', label: 'My library', icon: '⌂' },
  { id: 'inventory', label: 'Inventory', icon: '▤' },
  { id: 'loans', label: 'Active loans', icon: '↔' },
  { id: 'requests', label: 'Borrow requests', icon: '⌁' },
];

export default function AdminDashboard({ session, onLogout }) {
  const [books, setBooks] = useState([]);
  const [requests, setRequests] = useState([]);
  const [deniedRequests, setDeniedRequests] = useState([]);
  const [activeLoans, setActiveLoans] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataErrors, setDataErrors] = useState({});
  const [notice, setNotice] = useState('');
  const coverInputRef = useRef(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [bookQuery, setBookQuery] = useState('');
  const [selectedInventoryCategories, setSelectedInventoryCategories] = useState([]);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showAddBook, setShowAddBook] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);

  const viewDetails = {
    dashboard: { title: 'Overview', description: 'A quick view of your library activity.' },
    overview: { title: 'Book collections', description: 'Browse the titles in your library.' },
    inventory: { title: 'Inventory management', description: 'Add or restock books and review current stock.' },
    requests: { title: 'Incoming request queue', description: 'Review and decide on incoming requests.' },
    loans: { title: 'Active loans', description: 'Track books currently borrowed.' },
  };
  const filteredBooks = books.filter((book) => {
    const term = bookQuery.trim().toLowerCase();
    const matchesSearch = !term || `${book.title} ${book.author} ${book.isbn} ${(book.categories ?? []).join(' ')}`.toLowerCase().includes(term);
    const matchesCategory = activeView !== 'inventory' || selectedInventoryCategories.length === 0 || selectedInventoryCategories.some((category) => book.categories?.includes(category));
    return matchesSearch && matchesCategory;
  });
  const totalCopies = books.reduce((sum, book) => sum + book.totalCopies, 0);
  const availableCopies = books.reduce((sum, book) => sum + book.availableCopies, 0);
  const editingBook = editingBookId === null ? null : books.find((book) => String(book.bookId) === editingBookId);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setDataErrors({});
    const [booksSettled, queueSettled, loansSettled, deniedSettled] = await Promise.allSettled([
      apiRequest('/books', { token: session.access_token }),
      apiRequest('/admin/requests?status=Pending', { token: session.access_token }),
      apiRequest('/admin/requests?status=Approved', { token: session.access_token }),
      apiRequest('/admin/requests?status=Denied', { token: session.access_token }),
    ]);

    const failures = {};
    const dashboardFailures = [];
    if (booksSettled.status === 'fulfilled') {
      setBooks(booksSettled.value ?? []);
    } else {
      failures.overview = failures.inventory = booksSettled.reason.message;
      dashboardFailures.push(booksSettled.reason.message);
    }
    if (queueSettled.status === 'fulfilled') setRequests(queueSettled.value ?? []);
    else {
      failures.requests = queueSettled.reason.message;
      dashboardFailures.push(queueSettled.reason.message);
    }
    if (loansSettled.status === 'fulfilled') {
      setActiveLoans((loansSettled.value ?? []).filter((request) => !request.returnDate));
    } else {
      failures.loans = loansSettled.reason.message;
      dashboardFailures.push(loansSettled.reason.message);
    }
    if (deniedSettled.status === 'fulfilled') setDeniedRequests(deniedSettled.value ?? []);
    else dashboardFailures.push(deniedSettled.reason.message);
    if (dashboardFailures.length) failures.dashboard = dashboardFailures.join(' · ');
    setDataErrors(failures);
    setLoading(false);
  }, [session.access_token]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!showAddBook) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') closeBookForm();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showAddBook]);

  async function saveBook(event) {
    event.preventDefault();
    if (!form.categories.length) {
      setError('Select at least one book category.');
      return;
    }
    setBusy('book');
    setError('');
    setNotice('');
    try {
      const editing = editingBookId !== null;
      await apiRequest(editing ? `/books/${editingBookId}` : '/books', {
        token: session.access_token,
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ isbn: form.isbn, title: form.title, author: form.author, ...(editing ? { total_copies: Number(form.copies) } : { copies: Number(form.copies) }), image_url: form.imageUrl || null, categories: form.categories }),
      });
      setForm(initialForm);
      if (coverInputRef.current) coverInputRef.current.value = '';
      setEditingBookId(null);
      setShowAddBook(false);
      setNotice(editing ? 'Book details updated.' : 'Inventory saved.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  function startEditingBook(book) {
    setError('');
    setNotice('');
    setForm({ isbn: book.isbn, title: book.title, author: book.author, copies: String(book.totalCopies), imageUrl: book.imageUrl ?? '', categories: book.categories ?? [] });
    setEditingBookId(String(book.bookId));
    setShowAddBook(true);
  }

  function closeBookForm() {
    setShowAddBook(false);
    setEditingBookId(null);
    setForm(initialForm);
    if (coverInputRef.current) coverInputRef.current.value = '';
  }

  function readCover(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPEG, or WebP book cover.');
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Book cover images must be 2 MB or smaller.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, imageUrl: String(reader.result) }));
      setError('');
    };
    reader.onerror = () => setError('Could not read that image. Please choose another file.');
    reader.readAsDataURL(file);
  }

  async function decide(requestId, action) {
    setBusy(requestId);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/admin/requests/${requestId}`, {
        token: session.access_token,
        method: 'PUT',
        body: JSON.stringify({ action }),
      });
      setNotice(action === 'Approve' ? 'Request approved.' : 'Request denied.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  async function markReturned(requestId) {
    setBusy(requestId);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/admin/returns/${requestId}`, {
        token: session.access_token,
        method: 'POST',
      });
      setNotice('Book marked as returned and inventory updated.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b from-[#B9C7D5] via-[#CDD7E1] to-[#E5EBF1] md:flex ${darkMode ? 'admin-dark' : ''}`}>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[#DCE3E8] bg-[#F7F5EF] px-3 py-3 transition-[width] md:flex ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <a href={`${window.location.protocol}//${window.location.hostname}:5173/?from=admin`} className="flex h-16 items-center justify-center overflow-hidden rounded-xl border border-[#D5DEE8] bg-cover bg-center px-2 shadow-sm" style={{ backgroundImage: "linear-gradient(rgba(23, 50, 79, 0.20), rgba(23, 50, 79, 0.34)), url('/library.jpg')" }} aria-label="LibBrow home">
          <img src={sidebarCollapsed ? '/libbrow-favicon.png' : '/libbrow-horizontal.png'} alt={sidebarCollapsed ? 'LibBrow' : 'LibBrow — Borrow, Read, Discover'} className={sidebarCollapsed ? 'size-12 object-contain' : 'h-12 w-auto max-w-full object-contain'} />
        </a>
        <div className="mb-2 mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b border-[#DCE6F0] bg-white/90 px-2.5 pb-2 pt-1.5 shadow-sm">
          {!sidebarCollapsed && <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#526A83]">Library workspace</p>}
          <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'} aria-expanded={!sidebarCollapsed} className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/80 bg-white/85 text-[#244A70] shadow-sm hover:bg-white">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        <nav aria-label="Admin navigation" className="grid gap-1.5">
          {adminViews.map((view) => <button key={view.id} title={sidebarCollapsed ? view.label : undefined} aria-label={view.label} type="button" onClick={() => setActiveView(view.id)} aria-current={activeView === view.id ? 'page' : undefined} className={`flex w-full items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} rounded-xl border px-2.5 py-2.5 text-left text-sm transition ${activeView === view.id ? 'border-[#E7D7AE] border-l-4 border-l-[#C89B3C] bg-[#F4EBD7] font-semibold text-[#17324F]' : 'border-transparent bg-white font-medium text-[#5E7186] hover:border-[#D5DEE8] hover:bg-[#FFFEFA] hover:text-[#17324F]'}`}><span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-lg ${activeView === view.id ? 'bg-[#E9D9B1] text-[#8B691F]' : 'bg-[#E8EEF5] text-[#315B86]'}`}>{view.icon}</span>{!sidebarCollapsed && <>{view.label}{view.id === 'requests' && <span className="ml-auto rounded-full bg-[#FBF5E6] px-2 py-0.5 text-xs font-semibold text-[#26364A]">{requests.length}</span>}</>}</button>)}
        </nav>
        <div className="mt-auto">
          <button type="button" aria-pressed={darkMode} onClick={() => setDarkMode(!darkMode)} title={sidebarCollapsed ? (darkMode ? 'Switch to light mode' : 'Switch to dark mode') : undefined} className={`mb-2 flex w-full items-center rounded-xl border border-[#D5DEE8] bg-white px-2.5 py-2.5 text-sm font-semibold text-[#244A70] shadow-sm transition hover:border-[#C89B3C] hover:bg-[#FFFEFA] hover:text-[#8B691F] ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'}`}><span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#F4EBD7] text-[#8B691F]">{darkMode ? '☼' : '◐'}</span>{!sidebarCollapsed && <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>}</button>
          <a href={`${window.location.protocol}//${window.location.hostname}:5173/?from=admin`} title={sidebarCollapsed ? 'Public website' : undefined} aria-label="Public website" className={`mb-2 flex items-center rounded-xl border border-[#D5DEE8] bg-white px-2.5 py-2.5 text-sm font-semibold text-[#244A70] shadow-sm transition hover:border-[#C89B3C] hover:bg-[#FFFEFA] hover:text-[#8B691F] ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'}`}><span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#F4EBD7] text-[#8B691F]">↗</span>{!sidebarCollapsed && <span>Public website</span>}</a>
          <div className={`flex items-center gap-2 rounded-xl border border-white/90 bg-white/90 p-2 shadow-sm ${sidebarCollapsed ? 'justify-center' : ''}`}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#E8F0F8] text-sm font-semibold text-[#315B86]">{session.user.name?.[0]?.toUpperCase() ?? 'L'}</span>{!sidebarCollapsed && <><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#26364A]">{session.user.name}</p><p className="text-[0.68rem] text-[#6B7C91]">Library admin</p></div><button className="button-quiet shrink-0 !px-2" onClick={onLogout}>Sign out</button></>}</div>
        </div>
      </aside>

      <div className={`min-w-0 flex-1 transition-[margin] ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
      <header className="sticky top-0 z-20 border-b border-[#344B63] bg-[#1E2F43] text-[#F7FAFD] md:hidden">
        <div className="flex min-h-16 items-center gap-3 px-5 sm:px-8">
          <img src="/libbrow-favicon.png" alt="" className="size-9 rounded-lg object-contain" /><span className="font-semibold text-[#F7FAFD]">LibBrow</span><button type="button" aria-pressed={darkMode} onClick={() => setDarkMode(!darkMode)} className="button-quiet ml-auto !text-[#F7FAFD] hover:!bg-white/10 hover:!text-[#E2BB61]">{darkMode ? '☼ Light mode' : '◐ Dark mode'}</button>
        </div>
        <nav aria-label="Admin navigation" className="flex gap-2 overflow-x-auto border-t border-[#344B63] px-4 py-2">
          {adminViews.map((view) => <button key={view.id} type="button" onClick={() => setActiveView(view.id)} aria-current={activeView === view.id ? 'page' : undefined} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs transition ${activeView === view.id ? 'border-[#E7D7AE] bg-[#F4EBD7] font-semibold text-[#17324F]' : 'border-transparent text-[#B8C6D6]'}`}>{view.label}</button>)}
        </nav>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>{['dashboard', 'overview', 'inventory', 'requests', 'loans'].includes(activeView) && <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight text-[#17324F]">{activeView === 'dashboard' ? 'Overview' : activeView === 'overview' ? 'Book collections' : activeView === 'inventory' ? 'Collection care' : viewDetails[activeView].title}</h1>}<p className="text-sm text-[#5E7186]">{viewDetails[activeView].description}</p></div>
          {(activeView === 'overview' || activeView === 'inventory') && <div className="flex w-full items-center gap-2 sm:w-auto">
            {activeView === 'inventory' && <div className="relative shrink-0">
              <button type="button" className="button-secondary" aria-expanded={showCategoryFilter} onClick={() => setShowCategoryFilter(!showCategoryFilter)}>Categories{selectedInventoryCategories.length > 0 ? ` (${selectedInventoryCategories.length})` : ''} <span aria-hidden="true">⌄</span></button>
              {showCategoryFilter && <div className="absolute right-0 z-20 mt-2 max-h-72 w-64 overflow-y-auto rounded-xl border border-[#DCE6F0] bg-white p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-[#26364A]">Filter by category</p><button type="button" className="text-xs font-medium text-[#315B86] hover:underline" onClick={() => setSelectedInventoryCategories([])}>Clear</button></div>
                <div className="grid gap-1">{bookCategories.map((category) => <label key={category} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#26364A] hover:bg-[#F2F7FC]"><input type="checkbox" className="accent-[#315B86]" checked={selectedInventoryCategories.includes(category)} onChange={(event) => setSelectedInventoryCategories(event.target.checked ? [...selectedInventoryCategories, category] : selectedInventoryCategories.filter((item) => item !== category))} />{category}</label>)}</div>
              </div>}
            </div>}
            <label className="block w-full sm:w-96"><span className="sr-only">Search books</span><input className="field" type="search" value={bookQuery} onChange={(event) => setBookQuery(event.target.value)} placeholder="Search by title, author, ISBN, or category" /></label>
            <button className="button-quiet admin-refresh shrink-0 !text-[#17324F] hover:!bg-[#E8F0F8]" onClick={loadData}>Refresh</button>
          </div>}
          {activeView !== 'overview' && activeView !== 'inventory' && <div className="flex items-center gap-3 self-start sm:self-auto">{activeView === 'requests' && <span className="rounded-full bg-[#FBF5E6] px-3 py-1.5 text-xs font-semibold text-[#26364A]">{requests.length} pending</span>}{activeView === 'loans' && <span className="rounded-full bg-[#E8F0F8] px-3 py-1.5 text-xs font-semibold text-[#244A70]">{activeLoans.length} books out</span>}<button className="button-quiet admin-refresh !text-[#17324F] hover:!bg-[#E8F0F8]" onClick={loadData}>Refresh</button></div>}
        </div>

        {(error || dataErrors[activeView]) && <p role="alert" className="mb-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error || dataErrors[activeView]}</p>}
        {notice && <p role="status" className="mb-5 rounded-xl bg-[#F2F7FC] px-4 py-3 text-sm text-[#315B86]">{notice}</p>}

        {activeView === 'dashboard' && <section aria-label="Library summary">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[{ label: 'Book titles', value: books.length, note: 'in your collection' }, { label: 'Total copies', value: totalCopies, note: 'across all titles' }, { label: 'Available copies', value: availableCopies, note: 'ready to borrow' }, { label: 'Pending requests', value: requests.length, note: 'waiting for review' }, { label: 'Denied requests', value: deniedRequests.length, note: 'not approved' }].map((metric) => <article key={metric.label} className="rounded-2xl border border-[#DCE6F0] border-t-2 border-t-[#D9C080] bg-white p-5 shadow-sm shadow-[#17324F]/[0.05]"><p className="text-sm font-medium text-[#5E7186]">{metric.label}</p><p className="mt-3 font-display text-4xl font-semibold tracking-tight text-[#17324F]">{loading ? '—' : metric.value}</p><p className="mt-1 text-xs text-[#8796A8]">{metric.note}</p></article>)}
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-[#DCE6F0] bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Collection</p><h2 className="mt-2 font-display text-xl font-semibold text-[#26364A]">Books in your collection</h2></div><button className="button-quiet" onClick={() => setActiveView('overview')}>View books</button></div>{books.length ? <ul className="mt-4 divide-y divide-[#EAF0F6]">{[...books].slice(0, 3).map((book) => <li key={book.bookId} className="flex items-center gap-3 py-3">{book.imageUrl ? <img src={book.imageUrl} alt="" className="size-10 rounded-lg object-cover" /> : <span className="grid size-10 place-items-center rounded-lg bg-[#F2F7FC] text-[#315B86]">▤</span>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[#26364A]">{book.title}</p><p className="truncate text-xs text-[#6B7C91]">{book.author}</p></div><span className="text-xs text-[#6B7C91]">{book.availableCopies} available</span></li>)}</ul> : <p className="mt-4 rounded-xl bg-[#F2F7FC] p-4 text-sm text-[#6B7C91]">Books you add to inventory will appear here.</p>}</article>
            <article className="rounded-2xl border border-[#DCE6F0] bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Loans and requests</p><h2 className="mt-2 font-display text-xl font-semibold text-[#26364A]">Borrowing activity</h2></div><button className="button-quiet" onClick={() => setActiveView('requests')}>Review requests</button></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#F2F7FC] p-4"><p className="text-xs text-[#6B7C91]">Active loans</p><p className="mt-2 text-2xl font-semibold text-[#244A70]">{loading ? '—' : activeLoans.length}</p></div><div className="rounded-xl bg-[#FBF5E6] p-4"><p className="text-xs text-[#6B7C91]">Awaiting approval</p><p className="mt-2 text-2xl font-semibold text-[#26364A]">{loading ? '—' : requests.length}</p></div></div><p className="mt-4 text-sm text-[#6B7C91]">Review new requests and confirm returned books from their menu sections.</p></article>
          </div>
          <article className="mt-5 rounded-2xl border border-[#DCE6F0] bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Request history</p><h2 className="mt-2 font-display text-xl font-semibold text-[#26364A]">Denied requests</h2></div><span className="rounded-full bg-[#FBF5E6] px-3 py-1.5 text-xs font-semibold text-[#26364A]">{deniedRequests.length}</span></div>{deniedRequests.length ? <div className="mt-4 divide-y divide-[#EAF0F6]">{[...deniedRequests].sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate)).slice(0, 5).map((request) => <div key={request.requestId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-[#26364A]">{request.book.title}</p><p className="mt-1 text-xs text-[#6B7C91]">{request.customerName ?? request.borrowerRecord?.name ?? request.borrower?.name ?? 'Customer'}</p></div><p className="text-xs text-[#8796A8]">{new Date(request.requestDate).toLocaleDateString()}</p></div>)}</div> : <p className="mt-4 rounded-xl bg-[#F2F7FC] p-4 text-sm text-[#6B7C91]">No denied requests.</p>}</article>
        </section>}

        {activeView === 'overview' && <section aria-label="Books in the library">
          {loading ? <p className="py-10 text-sm text-[#6B7C91]">Loading books…</p> : filteredBooks.length === 0 ? <div className="rounded-2xl border border-dashed border-[#DCE6F0] bg-white p-10 text-center"><p className="font-medium text-[#26364A]">{books.length ? 'No books match your search.' : 'No books in the library yet.'}</p><p className="mt-2 text-sm text-[#6B7C91]">{books.length ? 'Try a different title, author, ISBN, or category.' : 'Add titles from the Inventory section.'}</p></div> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{filteredBooks.map((book) => <article key={book.bookId} className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white shadow-sm shadow-stone-900/[0.03]"><div className="relative grid aspect-[1.65/1] place-items-center overflow-hidden bg-gradient-to-br from-[#DCE6F0] via-[#F2F7FC] to-[#FBF5E6]">{book.imageUrl ? <img src={book.imageUrl} alt={`${book.title} cover`} className="size-full object-cover" /> : <span aria-hidden="true" className="text-4xl text-[#315B86]/60">▤</span>}</div><div className="p-5"><h2 className="font-display text-xl font-semibold text-[#26364A]">{book.title}</h2><p className="mt-1 text-sm text-[#6B7C91]">{book.author}</p><div className="mt-3 flex flex-wrap gap-1.5">{book.categories?.map((category) => <span key={category} className="rounded-full bg-[#E8F0F8] px-2.5 py-1 text-[0.68rem] font-medium text-[#315B86]">{category}</span>)}</div><p className="mt-4 text-xs font-medium text-[#6B7C91]">{book.availableCopies} of {book.totalCopies} copies available</p></div></article>)}</div>}
        </section>}

        {activeView === 'inventory' && <section id="inventory" className="mb-12">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div><h2 className="font-display text-2xl font-semibold text-[#17324F]">Current stock</h2><p className="mt-1 text-sm text-[#5E7186]">{books.length} titles · {books.reduce((sum, book) => sum + book.totalCopies, 0)} copies</p></div>
            <button className="button-primary self-start sm:self-auto" type="button" onClick={() => showAddBook ? closeBookForm() : setShowAddBook(true)}>{showAddBook ? 'Close form' : '＋ Add books'}</button>
          </div>
          {showAddBook && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#0B1726]/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBookForm(); }}>
          <form id="book-form" role="dialog" aria-modal="true" aria-labelledby="book-form-title" className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-2xl shadow-black/30 sm:p-8" onSubmit={saveBook}>
            <div className="mb-1 flex items-start justify-between gap-4"><h3 id="book-form-title" className="font-display text-xl font-semibold text-[#26364A]">{editingBookId ? 'Edit book details' : 'Add or restock a title'}</h3><button type="button" className="button-quiet -mt-2 -mr-2 px-3 py-2 text-xl leading-none" aria-label="Close book form" onClick={closeBookForm}>×</button></div>
            <p className="mt-2 text-sm leading-6 text-[#6B7C91]">{editingBookId ? 'Correct the catalog information for this saved title.' : 'Use an existing ISBN to add copies to a title already in the catalog.'}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-[#26364A]">ISBN-13<input className="field mt-2" value={form.isbn} onChange={(event) => setForm({ ...form, isbn: event.target.value })} placeholder="978..." required /></label>
              <label className="text-sm font-medium text-[#26364A]">Title<input className="field mt-2" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
              <label className="text-sm font-medium text-[#26364A]">Author<input className="field mt-2" value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} required /></label>
              <label className="text-sm font-medium text-[#26364A]">{editingBookId ? 'Total copies' : 'Copies to add'}<input className="field mt-2" type="number" min={editingBook ? Math.max(1, editingBook.totalCopies - editingBook.availableCopies) : 1} step="1" value={form.copies} onChange={(event) => setForm({ ...form, copies: event.target.value })} required />{editingBook && <span className="mt-1 block text-xs font-normal text-[#6B7C91]">At least {editingBook.totalCopies - editingBook.availableCopies} currently loaned {editingBook.totalCopies - editingBook.availableCopies === 1 ? 'copy' : 'copies'} must remain in the total.</span>}</label>
              <label className="text-sm font-medium text-[#26364A] sm:col-span-2">Book cover<input ref={coverInputRef} className="field mt-2 file:mr-3 file:rounded-lg file:border-0 file:bg-[#E8F0F8] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#315B86]" type="file" accept="image/png,image/jpeg,image/webp" onChange={readCover} /><span className="mt-1 block text-xs font-normal text-[#6B7C91]">PNG, JPEG, or WebP · up to 2 MB</span></label>
              {form.imageUrl && <div className="flex items-center gap-3 rounded-xl border border-[#DCE6F0] bg-[#F2F7FC] p-3 sm:col-span-2"><img src={form.imageUrl} alt="Book cover preview" className="h-20 w-14 rounded-md bg-white object-cover shadow-sm" /><button className="button-quiet" type="button" onClick={() => { setForm({ ...form, imageUrl: '' }); if (coverInputRef.current) coverInputRef.current.value = ''; }}>Remove cover</button></div>}
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium text-[#26364A]">Categories <span className="font-normal text-[#6B7C91]">(select at least one)</span></legend>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[#DCE6F0] bg-[#F2F7FC] p-3 sm:grid-cols-3">
                  {bookCategories.map((category) => <label key={category} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs text-[#26364A]"><input type="checkbox" className="accent-[#315B86]" checked={form.categories.includes(category)} onChange={(event) => setForm({ ...form, categories: event.target.checked ? [...form.categories, category] : form.categories.filter((item) => item !== category) })} />{category}</label>)}
                </div>
              </fieldset>
              <div className="flex gap-3 sm:col-span-2"><button className="button-primary mt-1" disabled={busy === 'book'}>{busy === 'book' ? 'Saving…' : editingBookId ? 'Save changes' : 'Save book'}</button><button className="button-quiet mt-1" type="button" onClick={closeBookForm}>Cancel</button></div>
            </div>
          </form>
          </div>}
          <div className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white shadow-sm shadow-stone-900/[0.03]">
            <div className="overflow-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-[#F2F7FC] text-xs uppercase tracking-wide text-[#6B7C91]"><tr><th className="px-5 py-3">Title</th><th className="px-5 py-3">Categories</th><th className="px-5 py-3">Available</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Actions</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredBooks.map((book) => <tr key={book.bookId}><td className="px-5 py-4"><div className="flex items-center gap-3">{book.imageUrl ? <img src={book.imageUrl} alt="" className="size-12 rounded-lg object-cover" /> : <span className="grid size-12 place-items-center rounded-lg bg-[#F2F7FC] text-[#315B86]">▤</span>}<div><p className="font-medium text-[#26364A]">{book.title}</p><p className="mt-1 text-xs text-[#8796A8]">{book.author}</p></div></div></td><td className="px-5 py-4"><div className="flex max-w-56 flex-wrap gap-1">{book.categories?.map((category) => <span key={category} className="rounded-full bg-[#E8F0F8] px-2 py-1 text-[0.65rem] font-medium text-[#315B86]">{category}</span>)}</div></td><td className="px-5 py-4 font-semibold text-[#315B86]">{book.availableCopies}</td><td className="px-5 py-4 text-[#6B7C91]">{book.totalCopies}</td><td className="px-5 py-4"><button className="button-secondary px-3 py-2 text-xs" type="button" onClick={() => startEditingBook(book)}>Edit</button></td></tr>)}
                  {!loading && filteredBooks.length === 0 && <tr><td colSpan="5" className="px-5 py-8 text-center text-[#6B7C91]">{books.length ? 'No books match your search.' : 'No titles in inventory yet.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>}

        {activeView === 'requests' && <section id="requests">
          <div className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white shadow-sm shadow-stone-900/[0.03]">
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-[#F2F7FC] text-xs uppercase tracking-wide text-[#6B7C91]"><tr><th className="px-5 py-4">Borrower</th><th className="px-5 py-4">Requested book</th><th className="px-5 py-4">Request date</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Decision</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {requests.map((request) => <tr key={request.requestId}>
                    <td className="px-5 py-4"><p className="font-semibold text-[#26364A]">{request.customerName ?? request.borrowerRecord?.name ?? request.borrower?.name ?? 'Customer'}</p><p className="mt-1 text-xs text-[#6B7C91]">{request.customerEmail ?? request.borrowerRecord?.email ?? request.borrower?.email}</p><p className="mt-1 max-w-56 text-xs text-[#8796A8]">In-store pickup after approval</p></td>
                    <td className="px-5 py-4"><p className="font-medium text-[#26364A]">{request.book.title}</p><p className="mt-1 text-xs text-[#8796A8]">{request.book.author}</p><p className="mt-1 text-xs font-medium text-[#315B86]">{request.requestedLoanDays ?? 14} day loan requested</p></td>
                    <td className="px-5 py-4 text-[#6B7C91]">{new Date(request.requestDate).toLocaleDateString()}</td>
                    <td className="px-5 py-4"><StatusBadge status={request.status} /></td>
                    <td className="px-5 py-4"><div className="flex gap-2"><button className="button-approve" disabled={Boolean(busy)} onClick={() => decide(request.requestId, 'Approve')}>{busy === request.requestId ? 'Working…' : 'Approve'}</button><button className="button-deny" disabled={Boolean(busy)} onClick={() => decide(request.requestId, 'Deny')}>Deny</button></div></td>
                  </tr>)}
                  {!loading && requests.length === 0 && <tr><td colSpan="5" className="px-5 py-10 text-center"><p className="font-medium text-[#26364A]">The queue is clear.</p><p className="mt-1 text-sm text-[#8796A8]">New borrower requests will appear here.</p></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>}

        {activeView === 'loans' && <section id="loans">
          <div className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white shadow-sm shadow-stone-900/[0.03]">
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-[#F2F7FC] text-xs uppercase tracking-wide text-[#6B7C91]"><tr><th className="px-5 py-4">Borrower</th><th className="px-5 py-4">Book</th><th className="px-5 py-4">Borrowed</th><th className="px-5 py-4">Due date</th><th className="px-5 py-4">Return</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {activeLoans.map((loan) => <tr key={loan.requestId}>
                    <td className="px-5 py-4"><p className="font-semibold text-[#26364A]">{loan.customerName ?? loan.borrowerRecord?.name ?? loan.borrower?.name ?? 'Customer'}</p><p className="mt-1 text-xs text-[#8796A8]">{loan.customerEmail ?? loan.borrowerRecord?.email ?? loan.borrower?.email}</p>{loan.returnNoticeDate && <p className="mt-1 text-xs font-semibold text-[#315B86]">Customer reported return</p>}</td>
                    <td className="px-5 py-4"><p className="font-medium text-[#26364A]">{loan.book.title}</p><p className="mt-1 text-xs text-[#8796A8]">{loan.book.author}</p></td>
                    <td className="px-5 py-4 text-[#6B7C91]">{loan.actualBorrowDate ? new Date(loan.actualBorrowDate).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-4 text-[#6B7C91]">{loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-4"><button className="button-approve" disabled={Boolean(busy)} onClick={() => markReturned(loan.requestId)}>{busy === loan.requestId ? 'Working…' : 'Confirm return'}</button></td>
                  </tr>)}
                  {!loading && activeLoans.length === 0 && <tr><td colSpan="5" className="px-5 py-10 text-center text-[#6B7C91]">There are no books currently on loan.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>}
      </main>
      </div>
    </div>
  );
}
