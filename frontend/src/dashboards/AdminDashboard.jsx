import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';

const initialForm = { isbn: '', title: '', author: '', copies: '1', imageUrl: '', categories: [] };
const emptyCheckoutBorrower = { member_id: '', contact_number: '', full_name: '', email: '', society_role: '', status: 'Active' };
const loanDayChoices = [7, 14, 21, 30];
const bookCategories = ['Biography', 'Children’s', 'Education', 'Fantasy', 'Fiction', 'History', 'Horror', 'Music', 'Mystery', 'Nonfiction', 'Other', 'Romance', 'Science Fiction', 'Self-help', 'Young Adult'];
const societyRoles = ['Student', 'Teacher / Faculty', 'School Staff', 'Parent / Guardian', 'Alumni', 'Community Member', 'Other'];
const borrowerStatuses = ['Active', 'Inactive', 'Suspended'];
const adminViews = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'overview', label: 'My library', icon: '⌂', group: 'Book management' },
  { id: 'addbooks', label: 'Add books', icon: '＋', group: 'Book management' },
  { id: 'borrow', label: 'Borrow book', icon: '＋', group: 'Borrower management' },
  { id: 'borrowers', label: 'Borrowers', icon: '♙', group: 'Borrower management' },
  { id: 'unreturned', label: 'Unreturned books', icon: '↔', group: 'Borrower management' },
  { id: 'reports', label: 'Reports', icon: '▥', group: 'Reports & settings' },
  { id: 'settings', label: 'Settings', icon: '⚙', group: 'Reports & settings' },
];

export default function AdminDashboard({ session, onLogout }) {
  const [books, setBooks] = useState([]);
  const [borrowers, setBorrowers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [borrowerForm, setBorrowerForm] = useState({ member_id: '', contact_number: '', full_name: '', email: '', society_role: '', status: 'Active' });
  const [showAddBorrower, setShowAddBorrower] = useState(false);
  const [editingBorrower, setEditingBorrower] = useState(null);
  const [loanAction, setLoanAction] = useState(null);
  const [loanActionForm, setLoanActionForm] = useState({ resolution: 'Returned', note: '', loanDays: '14' });
  const [checkout, setCheckout] = useState({ borrowerMode: 'existing', borrowerId: '', bookId: '', loanDays: localStorage.getItem('libbrow-default-loan-days') || '14', newBorrower: emptyCheckoutBorrower });
  const [checkoutStep, setCheckoutStep] = useState('details');
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
  const [logoFailed, setLogoFailed] = useState(false);
  const [bookQuery, setBookQuery] = useState('');
  const [showArchivedBooks, setShowArchivedBooks] = useState(false);
  const [borrowerQuery, setBorrowerQuery] = useState('');
  const [loanQuery, setLoanQuery] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [reportQuery, setReportQuery] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [reportType, setReportType] = useState('all');
  const [reportSort, setReportSort] = useState('newest');
  const [reportPage, setReportPage] = useState(0);
  const [defaultLoanDays, setDefaultLoanDays] = useState(localStorage.getItem('libbrow-default-loan-days') || '14');
  const [adminName, setAdminName] = useState(session.user.name ?? '');
  const [adminContact, setAdminContact] = useState('');
  const [maxConcurrentBooks, setMaxConcurrentBooks] = useState('3');
  const [showAddBook, setShowAddBook] = useState(false);
  const [coverSource, setCoverSource] = useState('upload');
  const [coverPreviewFailed, setCoverPreviewFailed] = useState(false);
  const [copyList, setCopyList] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  const dialogRef = useRef(null);

  const viewDetails = {
    dashboard: { title: 'Overview', description: 'A quick view of your library activity.' },
    overview: { title: 'Book collections', description: 'Browse the titles in your library.' },
    borrowers: { title: 'Borrowers', description: 'Register borrowers and manage your directory.' },
    unreturned: { title: 'Unreturned books', description: 'Review current loans and confirm returned books.' },
    reports: { title: 'Transaction reports', description: 'Review borrowing and return activity.' },
    settings: { title: 'Personal settings', description: 'Manage your workspace preferences.' },
  };
  const filteredBooks = books.filter((book) => {
    const term = bookQuery.trim().toLowerCase();
    const matchesSearch = !term || `${book.title} ${book.author} ${book.isbn} ${(book.categories ?? []).join(' ')}`.toLowerCase().includes(term);
    return matchesSearch;
  });
  const displayedBooks = filteredBooks.filter((book) => Boolean(book.isArchived) === showArchivedBooks);
  const activeBooks = books.filter((book) => !book.isArchived);
  const totalCopies = activeBooks.reduce((sum, book) => sum + book.totalCopies, 0);
  const availableCopies = activeBooks.reduce((sum, book) => sum + book.availableCopies, 0);
  const activeBorrowers = borrowers.filter((borrower) => (borrower.status ?? 'Active') === 'Active');
  const matchingBorrowers = borrowers.filter((borrower) => `${borrower.name} ${borrower.memberId ?? ''} ${borrower.contactNumber ?? ''} ${borrower.email}`.toLowerCase().includes(borrowerQuery.trim().toLowerCase()));
  const todayUtc = new Date(); todayUtc.setUTCHours(0, 0, 0, 0);
  const overdueDays = (dueDate) => Math.max(0, Math.floor((todayUtc.getTime() - new Date(dueDate).setUTCHours(0, 0, 0, 0)) / 86_400_000));
  const dueSoonLoans = activeLoans.filter((loan) => { const days = Math.floor((new Date(loan.dueDate).setUTCHours(0, 0, 0, 0) - todayUtc.getTime()) / 86_400_000); return days >= 0 && days <= 7; });
  const overdueLoans = activeLoans.filter((loan) => overdueDays(loan.dueDate) > 0);
  const matchingLoans = activeLoans.filter((loan) => {
    const term = loanQuery.trim().toLowerCase();
    const label = `${loan.customerName ?? loan.borrowerRecord?.name ?? ''} ${loan.book.title} ${loan.borrowerRecord?.memberId ?? ''}`.toLowerCase();
    return (!term || label.includes(term)) && (!overdueOnly || overdueDays(loan.dueDate) > 0);
  }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const matchingTransactions = transactions.filter((transaction) => {
    const term = reportQuery.trim().toLowerCase();
    const label = `${transaction.customerName ?? transaction.borrowerRecord?.name ?? ''} ${transaction.book.title} ${transaction.borrowerRecord?.memberId ?? ''}`.toLowerCase();
    const date = transaction.requestDate?.slice(0, 10);
    const typeMatches = reportType === 'all' || (reportType === 'returned' && Boolean(transaction.returnDate) && (!transaction.resolution || transaction.resolution === 'Returned')) || (reportType === 'lost-damaged' && ['Lost', 'Damaged'].includes(transaction.resolution)) || (reportType === 'unreturned' && transaction.status === 'Approved' && !transaction.returnDate) || (reportType === 'denied' && transaction.status === 'Denied');
    return (!term || label.includes(term)) && (!reportFrom || date >= reportFrom) && (!reportTo || date <= reportTo) && typeMatches;
  });
  const sortedTransactions = [...matchingTransactions].sort((a, b) => reportSort === 'borrower' ? (a.customerName ?? a.borrowerRecord?.name ?? '').localeCompare(b.customerName ?? b.borrowerRecord?.name ?? '') : reportSort === 'book' ? a.book.title.localeCompare(b.book.title) : reportSort === 'oldest' ? new Date(a.requestDate) - new Date(b.requestDate) : new Date(b.requestDate) - new Date(a.requestDate));
  const reportPageCount = Math.max(1, Math.ceil(sortedTransactions.length / 25));
  const visibleTransactions = sortedTransactions.slice(reportPage * 25, (reportPage + 1) * 25);
  useEffect(() => { setReportPage((page) => Math.min(page, Math.max(0, reportPageCount - 1))); }, [reportPageCount]);
  const checkoutBookOption = books.find((book) => String(book.bookId) === checkout.bookId);
  const checkoutBorrowerOption = checkout.borrowerMode === 'new'
    ? { name: checkout.newBorrower.full_name, memberId: checkout.newBorrower.member_id }
    : borrowers.find((borrower) => String(borrower.borrowerId) === checkout.borrowerId);
  const checkoutDueDate = new Date(); checkoutDueDate.setUTCHours(0, 0, 0, 0); checkoutDueDate.setUTCDate(checkoutDueDate.getUTCDate() + Number(checkout.loanDays || 0));
  const editingBook = editingBookId === null ? null : books.find((book) => String(book.bookId) === editingBookId);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setDataErrors({});
    const [booksSettled, loansSettled, borrowersSettled, transactionsSettled, auditSettled, settingsSettled] = await Promise.allSettled([
      apiRequest('/books?include_archived=true', { token: session.access_token }),
      apiRequest('/admin/requests?status=Approved', { token: session.access_token }),
      apiRequest('/admin/borrowers', { token: session.access_token }),
      apiRequest('/admin/transactions', { token: session.access_token }),
      apiRequest('/admin/audit-events', { token: session.access_token }),
      apiRequest('/admin/library-settings', { token: session.access_token }),
    ]);

    const failures = {};
    const dashboardFailures = [];
    if (booksSettled.status === 'fulfilled') {
      setBooks(booksSettled.value ?? []);
    } else {
      failures.overview = booksSettled.reason.message;
      dashboardFailures.push(booksSettled.reason.message);
    }
    if (loansSettled.status === 'fulfilled') {
      setActiveLoans((loansSettled.value ?? []).filter((request) => !request.returnDate));
    } else {
      failures.unreturned = loansSettled.reason.message;
      dashboardFailures.push(loansSettled.reason.message);
    }
    if (borrowersSettled.status === 'fulfilled') setBorrowers(borrowersSettled.value ?? []);
    else failures.borrowers = borrowersSettled.reason.message;
    if (transactionsSettled.status === 'fulfilled') setTransactions(transactionsSettled.value ?? []);
    else failures.reports = transactionsSettled.reason.message;
    if (auditSettled.status === 'fulfilled') setAuditEvents(auditSettled.value ?? []);
    else failures.reports = [failures.reports, auditSettled.reason.message].filter(Boolean).join(' · ');
    if (settingsSettled.status === 'fulfilled') {
      setAdminName(settingsSettled.value.adminName ?? session.user.name ?? '');
      setAdminContact(settingsSettled.value.adminContact ?? '');
      setDefaultLoanDays(String(settingsSettled.value.defaultLoanDays ?? 14));
      setMaxConcurrentBooks(String(settingsSettled.value.maxConcurrentBooks ?? 3));
    }
    else failures.settings = settingsSettled.reason.message;
    if (dashboardFailures.length) failures.dashboard = dashboardFailures.join(' · ');
    setDataErrors(failures);
    setLoading(false);
  }, [session.access_token, session.user.name]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => { localStorage.setItem('libbrow-default-loan-days', defaultLoanDays); }, [defaultLoanDays]);

  useEffect(() => {
    const modalOpen = showAddBook || showCheckout || showAddBorrower || Boolean(loanAction) || Boolean(copyList);
    if (!modalOpen) return undefined;
    const previousFocus = document.activeElement;
    const panel = dialogRef.current;
    const focusable = () => [...(panel?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    focusable().find((element) => element.matches('input:not([type="file"]), select'))?.focus();
    function handleDialogKeydown(event) {
      if (event.key === 'Escape') {
        if (showAddBook) closeBookForm();
        else if (copyList) setCopyList(null);
        else if (loanAction && !busy) setLoanAction(null);
        else if (showAddBorrower) setShowAddBorrower(false);
        else if (showCheckout && busy !== 'checkout') { setShowCheckout(false); setCheckoutStep('details'); }
        return;
      }
      if (event.key === 'Tab') {
        const items = focusable();
        if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
    }
    window.addEventListener('keydown', handleDialogKeydown);
    return () => { window.removeEventListener('keydown', handleDialogKeydown); previousFocus?.focus?.(); };
  }, [showAddBook, showCheckout, showAddBorrower, Boolean(loanAction), Boolean(copyList), busy]);

  async function registerBorrower(event) {
    event.preventDefault(); setBusy('borrower'); setError('');
    try {
      const borrower = await apiRequest(editingBorrower ? `/admin/borrowers/${editingBorrower.borrowerId}` : '/admin/borrowers', { token: session.access_token, method: editingBorrower ? 'PUT' : 'POST', body: JSON.stringify(borrowerForm) });
      setBorrowers((items) => (editingBorrower ? items.map((item) => item.borrowerId === borrower.borrowerId ? { ...item, ...borrower } : item) : [...items, borrower]).sort((a, b) => a.name.localeCompare(b.name)));
      if (!editingBorrower) setCheckout((current) => ({ ...current, borrowerId: String(borrower.borrowerId) }));
      setBorrowerForm({ member_id: '', contact_number: '', full_name: '', email: '', society_role: '', status: 'Active' }); setShowAddBorrower(false); setNotice(editingBorrower ? 'Borrower details updated.' : 'Borrower registered.'); setEditingBorrower(null); await loadData();
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  async function checkoutBook(event) {
    event.preventDefault(); setBusy('checkout'); setError('');
    try {
      const result = await apiRequest('/admin/checkout', { token: session.access_token, method: 'POST', body: JSON.stringify({ ...(checkout.borrowerMode === 'new' ? { new_borrower: checkout.newBorrower } : { borrower_id: checkout.borrowerId }), book_id: checkout.bookId, loan_days: Number(checkout.loanDays) }) });
      const confirmedDueDate = result.dueDate ? new Date(result.dueDate) : checkoutDueDate;
      setNotice(`Checkout recorded. ${checkoutBorrowerOption?.name ?? 'Borrower'} should return “${checkoutBookOption?.title ?? 'the book'}” by ${confirmedDueDate.toLocaleDateString()}.`);
      setCheckout({ borrowerMode: 'existing', borrowerId: '', bookId: '', loanDays: defaultLoanDays, newBorrower: emptyCheckoutBorrower }); setCheckoutStep('details'); setShowCheckout(false); await loadData();
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  async function saveLibrarySettings() {
    setBusy('settings'); setError('');
    try {
      const saved = await apiRequest('/admin/library-settings', { token: session.access_token, method: 'PUT', body: JSON.stringify({ admin_name: adminName, admin_contact: adminContact, default_loan_days: Number(defaultLoanDays), max_concurrent_books: Number(maxConcurrentBooks) }) });
      setAdminName(saved.adminName);
      setAdminContact(saved.adminContact);
      setDefaultLoanDays(String(saved.defaultLoanDays));
      setMaxConcurrentBooks(String(saved.maxConcurrentBooks));
      setNotice('Admin profile and borrowing settings saved.');
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  async function toggleBookArchive(book) {
    if (!book.isArchived && !window.confirm(`Archive “${book.title}”? It will leave My library, but its borrowing history will remain available.`)) return;
    setBusy(`archive-${book.bookId}`); setError('');
    try {
      await apiRequest(`/books/${book.bookId}/archive`, { token: session.access_token, method: 'PATCH', body: JSON.stringify({ is_archived: !book.isArchived }) });
      setNotice(book.isArchived ? 'Book restored to My library.' : 'Book archived. Its transaction history is preserved.'); await loadData();
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  function editBorrower(borrower) {
    setEditingBorrower(borrower);
    setBorrowerForm({ member_id: borrower.memberId ?? '', contact_number: borrower.contactNumber ?? '', full_name: borrower.name ?? '', email: borrower.email ?? '', society_role: borrower.societyRole ?? '', status: borrower.status ?? 'Active' });
    setShowAddBorrower(true);
  }

  function borrowForBorrower(borrower) {
    setCheckout({ borrowerMode: 'existing', borrowerId: String(borrower.borrowerId), bookId: '', loanDays: defaultLoanDays, newBorrower: emptyCheckoutBorrower });
    setCheckoutStep('details');
    setShowCheckout(true);
  }

  async function deleteBorrower(borrower) {
    if (!window.confirm(`Delete ${borrower.name}? Borrowers with transaction history cannot be deleted; set their status to Inactive to keep their records.`)) return;
    setBusy(`borrower-delete-${borrower.borrowerId}`);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/admin/borrowers/${borrower.borrowerId}`, { token: session.access_token, method: 'DELETE' });
      setNotice(`${borrower.name} was deleted.`);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

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
    if (coverSource === 'url' && form.imageUrl) {
      try {
        const imageUrl = new URL(form.imageUrl);
        if (!['http:', 'https:'].includes(imageUrl.protocol)) throw new Error('unsupported protocol');
      } catch {
        setError('Enter a valid image URL beginning with https:// or http://.');
        return;
      }
    }
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
      setCoverSource('upload');
      setCoverPreviewFailed(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
      setEditingBookId(null);
      setShowAddBook(false);
      setNotice(editing ? 'Book details updated.' : 'Book saved. Entering an existing ISBN adds copies; entering a new ISBN adds a title.');
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
    setCoverSource(book.imageUrl?.startsWith('http://') || book.imageUrl?.startsWith('https://') ? 'url' : 'upload');
    setCoverPreviewFailed(false);
    setEditingBookId(String(book.bookId));
    setShowAddBook(true);
  }

  async function showBookCopies(book) {
    setError('');
    try {
      const copies = await apiRequest(`/books/${book.bookId}/copies`, { token: session.access_token });
      setCopyList({ book, copies });
    } catch (e) { setError(e.message); }
  }

  function exportCopyBarcodes() {
    if (!copyList) return;
    const rows = [['Barcode', 'Book', 'Status'], ...copyList.copies.map((copy) => [copy.barcode, copyList.book.title, copy.status])];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `libbrow-copies-${copyList.book.isbn}.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function closeBookForm() {
    setShowAddBook(false);
    setEditingBookId(null);
    setForm(initialForm);
    setCoverSource('upload');
    setCoverPreviewFailed(false);
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
      setCoverSource('upload');
      setCoverPreviewFailed(false);
      setForm((current) => ({ ...current, imageUrl: String(reader.result) }));
      setError('');
    };
    reader.onerror = () => setError('Could not read that image. Please choose another file.');
    reader.readAsDataURL(file);
  }

  async function markReturned(requestId) {
    setLoanAction({ kind: 'resolution', requestId });
    setLoanActionForm({ resolution: 'Returned', note: '', loanDays: '14' });
  }

  async function submitLoanAction(event) {
    event.preventDefault();
    if (!loanAction) return;
    const { kind, requestId } = loanAction;
    setBusy(requestId);
    setError('');
    setNotice('');
    try {
      if (kind === 'renew') {
        await apiRequest(`/admin/renewals/${requestId}`, { token: session.access_token, method: 'POST', body: JSON.stringify({ loan_days: Number(loanActionForm.loanDays) }) });
        setNotice(`Loan renewed for ${loanActionForm.loanDays} days.`);
      } else {
        await apiRequest(`/admin/returns/${requestId}`, { token: session.access_token, method: 'POST', body: JSON.stringify({ resolution: loanActionForm.resolution, note: loanActionForm.note }) });
        setNotice(loanActionForm.resolution === 'Returned' ? 'Book marked as returned and inventory updated.' : `Book recorded as ${loanActionForm.resolution.toLowerCase()}; available stock was not increased.`);
      }
      setLoanAction(null);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  function openNavigation(viewId) {
    if (viewId === 'addbooks') setShowAddBook(true);
    else if (viewId === 'borrow') { setCheckout((value) => ({ ...value, borrowerMode: 'existing', loanDays: defaultLoanDays })); setCheckoutStep('details'); setShowCheckout(true); }
    else setActiveView(viewId);
  }

  function isNavigationSelected(viewId) {
    if (viewId === 'addbooks') return showAddBook;
    if (viewId === 'borrow') return showCheckout;
    return activeView === viewId;
  }

  function reviewCheckout(event) {
    event.preventDefault();
    if (checkoutStep === 'details') setCheckoutStep('review');
    else checkoutBook(event);
  }

  function exportTransactions() {
    const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['Date', 'Borrower', 'Member ID', 'Book', 'Status', 'Resolution', 'Due date', 'Return date'],
      ...matchingTransactions.map((item) => [item.requestDate?.slice(0, 10), item.customerName ?? item.borrowerRecord?.name, item.borrowerRecord?.memberId, item.book.title, item.returnDate ? 'Closed' : item.status, item.resolution ?? '', item.dueDate?.slice(0, 10), item.returnDate?.slice(0, 10)]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'libbrow-transactions.csv'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="admin-portal min-h-screen bg-[#EEF2F6] md:flex">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[#DCE3E8] bg-white px-3 py-3 transition-[width] md:flex ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <a href="/" className="flex h-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D5DEE8] bg-white px-2 shadow-sm" aria-label="LibBrow home">
          {!logoFailed ? <img src={sidebarCollapsed ? '/libbrow-favicon.png' : '/libbrow-horizontal.png'} alt={sidebarCollapsed ? 'LibBrow' : 'LibBrow — Borrow, Read, Discover'} onError={() => setLogoFailed(true)} className={sidebarCollapsed ? 'size-12 object-contain' : 'h-12 w-full object-contain'} /> : <span className="text-center font-semibold leading-tight text-[#17365D]">{sidebarCollapsed ? 'LB' : <>LibBrow<small className="mt-1 block text-[0.5rem] font-medium tracking-[0.12em] text-[#8B691F]">BORROW · READ · DISCOVER</small></>}</span>}
        </a>
        <div className="mb-2 mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b border-[#DCE6F0] bg-white/90 px-2.5 pb-2 pt-1.5 shadow-sm">
          {!sidebarCollapsed && <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#526A83]">Library workspace</p>}
          <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'} aria-expanded={!sidebarCollapsed} className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/80 bg-white/85 text-[#244A70] shadow-sm hover:bg-white">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        <nav aria-label="Admin navigation" className="grid gap-1.5">
          {adminViews.map((view, index) => {
            const selected = isNavigationSelected(view.id);
            return <div key={view.id} className={view.group && adminViews[index - 1]?.group !== view.group ? 'mt-3 border-t border-[#DCE3E8] pt-3' : ''}>
              {view.group && adminViews[index - 1]?.group !== view.group && !sidebarCollapsed && <p className="mb-1.5 px-2.5 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#8796A8]">{view.group}</p>}
              <button title={sidebarCollapsed ? (view.group ? `${view.group}: ${view.label}` : view.label) : undefined} aria-label={view.label} type="button" onClick={() => openNavigation(view.id)} aria-current={selected ? 'page' : undefined} className={`flex w-full items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} rounded-xl border px-2.5 py-2.5 text-left text-sm transition ${selected ? 'border-[#E7D7AE] border-l-4 border-l-[#C89B3C] bg-[#F4EBD7] font-semibold text-[#17324F]' : 'border-transparent bg-white font-medium text-[#5E7186] hover:border-[#D5DEE8] hover:bg-[#FFFEFA] hover:text-[#17324F]'}`}><span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-lg ${selected ? 'bg-[#E9D9B1] text-[#8B691F]' : 'bg-[#E8EEF5] text-[#315B86]'}`}>{view.icon}</span>{!sidebarCollapsed && <>{view.label}{view.id === 'borrowers' && <span className="ml-auto rounded-full bg-[#FBF5E6] px-2 py-0.5 text-xs font-semibold text-[#26364A]">{borrowers.length}</span>}</>}</button>
            </div>;
          })}
        </nav>
        <div className="mt-auto">
          <div className={`flex items-center gap-2 rounded-xl border border-white/90 bg-white/90 p-2 shadow-sm ${sidebarCollapsed ? 'justify-center' : ''}`}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#E8F0F8] text-sm font-semibold text-[#315B86]">{adminName?.[0]?.toUpperCase() ?? 'L'}</span>{!sidebarCollapsed && <><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#26364A]">{adminName || 'Library Admin'}</p><p className="text-[0.68rem] text-[#6B7C91]">Library admin</p></div><button className="button-quiet shrink-0 !px-2" onClick={onLogout}>Sign out</button></>}</div>
        </div>
      </aside>

      <div className={`min-w-0 flex-1 transition-[margin] ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
      <header className="sticky top-0 z-20 border-b border-[#344B63] bg-[#1E2F43] text-[#F7FAFD] md:hidden">
        <div className="flex min-h-16 items-center gap-3 px-5 sm:px-8">
          <img src="/libbrow-favicon.png" alt="" className="size-9 rounded-lg object-contain" /><span className="font-semibold text-[#F7FAFD]">LibBrow</span>
        </div>
        <nav aria-label="Admin navigation" className="border-t border-[#344B63] px-4 py-2">
          <label className="sr-only" htmlFor="admin-mobile-navigation">Go to section</label>
          <select id="admin-mobile-navigation" className="field !border-[#435B73] !bg-[#24394F] !py-2.5 !text-sm !text-white" value={showAddBook ? 'addbooks' : showCheckout ? 'borrow' : activeView} onChange={(event) => openNavigation(event.target.value)}>
            <option value="dashboard">Dashboard</option>
            <optgroup label="Book management"><option value="overview">My library</option><option value="addbooks">Add books</option></optgroup>
            <optgroup label="Borrower management"><option value="borrow">Borrow book</option><option value="borrowers">Borrowers</option><option value="unreturned">Unreturned books</option></optgroup>
            <optgroup label="Reports & settings"><option value="reports">Reports</option><option value="settings">Settings</option></optgroup>
          </select>
        </nav>
      </header>

      <main className={`mx-auto max-w-[1440px] px-5 sm:px-8 ${activeView === 'dashboard' ? 'py-4 sm:py-5' : 'py-8 sm:py-10'}`}>
        {activeView !== 'dashboard' && <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><h1 className="mb-2 font-display text-3xl font-semibold tracking-tight text-[#17324F]">{activeView === 'dashboard' ? 'Overview' : activeView === 'overview' ? 'My library' : viewDetails[activeView].title}</h1><p className="text-sm text-[#5E7186]">{viewDetails[activeView].description}</p></div>
          {activeView === 'overview' && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="block min-w-48 flex-1 sm:w-64"><span className="sr-only">Search books</span><input className="field" type="search" value={bookQuery} onChange={(event) => setBookQuery(event.target.value)} placeholder="Search books" /></label>
            <div className="flex rounded-xl border border-[#DCE6F0] bg-white p-1"><button type="button" className={`rounded-lg px-3 py-2 text-xs font-semibold ${!showArchivedBooks ? 'bg-[#E8F0F8] text-[#244A70]' : 'text-[#6B7C91]'}`} onClick={() => setShowArchivedBooks(false)}>Active ({activeBooks.length})</button><button type="button" className={`rounded-lg px-3 py-2 text-xs font-semibold ${showArchivedBooks ? 'bg-[#E8F0F8] text-[#244A70]' : 'text-[#6B7C91]'}`} onClick={() => setShowArchivedBooks(true)}>Archived ({books.length - activeBooks.length})</button></div>
            <button className="button-primary shrink-0" type="button" onClick={() => setShowAddBook(true)}>＋ Add books</button>
          </div>}
          {activeView !== 'overview' && <div className="flex items-center gap-3 self-start sm:self-auto">{activeView === 'unreturned' && <span className="rounded-full bg-[#E8F0F8] px-3 py-1.5 text-xs font-semibold text-[#244A70]">{activeLoans.length} books out</span>}{(activeView === 'reports' || activeView === 'unreturned' || activeView === 'dashboard' || activeView === 'borrowers') && <button className="button-quiet admin-refresh !text-[#17324F] hover:!bg-[#E8F0F8]" onClick={loadData}>Refresh</button>}</div>}
        </div>}

        {activeView !== 'dashboard' && (error || dataErrors[activeView]) && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{error || dataErrors[activeView]}</span>{dataErrors[activeView] && <button type="button" className="button-secondary !border-rose-200 !text-rose-800" onClick={loadData}>Retry loading</button>}</div>}
        {notice && <p role="status" className="mb-5 rounded-xl bg-[#F2F7FC] px-4 py-3 text-sm text-[#315B86]">{notice}</p>}

        {activeView === 'dashboard' && <section aria-label="Library summary">
          <div className="dashboard-hero mb-4 relative isolate overflow-hidden rounded-[1.5rem] px-6 py-5 text-white shadow-xl sm:px-8 sm:py-6">
            <div className="relative z-10 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#E0AA7D]">LIBBROW · LIBRARY DESK</p><p className="mt-2 text-sm font-medium text-white/75">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h2 className="mt-1 max-w-xl font-display text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">Your library, ready for the day.</h2><p className="mt-2 max-w-lg text-sm leading-5 text-white/85">Keep the shelves moving. Review what’s due, welcome borrowers, and keep every title in circulation.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="dashboard-hero-primary" onClick={() => openNavigation('borrow')}>＋ Check out a book</button><button type="button" className="dashboard-hero-secondary" onClick={() => { setActiveView('overview'); setShowAddBook(true); }}>Add to the collection <span aria-hidden="true">↗</span></button></div></div>
            <div className="dashboard-book-art" aria-hidden="true"><span className="dashboard-book dashboard-book-a" /><span className="dashboard-book dashboard-book-b" /><span className="dashboard-book dashboard-book-c" /><span className="dashboard-book-orbit" /></div>
          </div>
          <div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#9B5732]">At a glance</p><h2 className="mt-0.5 font-display text-xl font-semibold text-[#182433] sm:text-2xl">Library overview</h2></div><span className="hidden text-xs text-[#64717D] sm:block">Select a card to open its list</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {[{ label: 'Book titles', value: activeBooks.length, note: 'in the collection', target: 'overview', icon: '▤', accent: 'blue' }, { label: 'Total copies', value: totalCopies, note: 'across active titles', target: 'overview', icon: '▥', accent: 'copper' }, { label: 'Available now', value: availableCopies, note: 'ready to borrow', target: 'overview', icon: '✓', accent: 'green' }, { label: 'Borrowers', value: borrowers.length, note: 'in the directory', target: 'borrowers', icon: '♙', accent: 'blue' }, { label: 'Books out', value: activeLoans.length, note: 'currently checked out', target: 'unreturned', icon: '↗', accent: 'copper' }, { label: 'Overdue', value: overdueLoans.length, note: 'need follow-up', target: 'unreturned', icon: '!', accent: overdueLoans.length ? 'red' : 'green' }].map((metric) => <button key={metric.label} type="button" onClick={() => setActiveView(metric.target)} className={`dashboard-stat dashboard-stat-${metric.accent} group rounded-2xl border bg-white p-3 text-left transition hover:-translate-y-1 sm:p-3.5`}><span className="dashboard-stat-icon grid size-8 place-items-center rounded-lg text-sm font-bold">{metric.icon}</span><p className="mt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#64717D]">{metric.label}</p><p className="mt-0.5 font-display text-3xl font-semibold tracking-tight text-[#182433]">{loading ? '—' : metric.value}</p><p className="mt-0.5 text-xs text-[#7B8793]">{metric.note}</p><span className="dashboard-stat-rule mt-2.5 block h-1 w-10 rounded-full transition-all group-hover:w-16" /></button>)}
          </div>
          {(error || dataErrors.dashboard) && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{error || dataErrors.dashboard}</span><button type="button" className="button-secondary !border-rose-200 !text-rose-800" onClick={loadData}>Retry loading</button></div>}
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-[#DCE6F0] bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Collection</p><h2 className="mt-2 font-display text-xl font-semibold text-[#26364A]">Books in your collection</h2></div><button className="button-quiet" onClick={() => setActiveView('overview')}>View books</button></div>{activeBooks.length ? <ul className="mt-4 divide-y divide-[#EAF0F6]">{[...activeBooks].slice(0, 3).map((book) => <li key={book.bookId} className="flex items-center gap-3 py-3">{book.imageUrl ? <img src={book.imageUrl} alt="" className="size-10 rounded-lg object-cover" /> : <span className="grid size-10 place-items-center rounded-lg bg-[#F2F7FC] text-[#315B86]">▤</span>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#26364A]">{book.title}</p><p className="truncate text-xs font-normal text-[#7B8793]">{book.author}</p></div><span className="shrink-0 rounded-full bg-[#F2F5F7] px-2.5 py-1 text-[0.68rem] font-medium text-[#64717D]">{book.availableCopies} available</span></li>)}</ul> : <p className="mt-4 rounded-xl bg-[#F2F7FC] p-4 text-sm text-[#6B7C91]">Your added books will appear here.</p>}</article>
            <article className="rounded-2xl border border-[#DCE6F0] bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Borrower activity</p><h2 className="mt-2 font-display text-xl font-semibold text-[#26364A]">Counter activity</h2></div><button className="button-quiet" onClick={() => openNavigation('borrow')}>Borrow a book</button></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#F2F7FC] p-4"><p className="text-xs text-[#6B7C91]">Unreturned books</p><p className="mt-2 text-2xl font-semibold text-[#244A70]">{loading ? '—' : activeLoans.length}</p></div><div className="rounded-xl bg-[#FBF5E6] p-4"><p className="text-xs text-[#6B7C91]">Transactions</p><p className="mt-2 text-2xl font-semibold text-[#26364A]">{loading ? '—' : transactions.length}</p></div></div><p className="mt-4 text-sm text-[#6B7C91]">Register borrowers, record checkouts, and confirm returns.</p></article>
          </div>
        </section>}

        {activeView === 'overview' && <section aria-label="Books in the library">
          {loading ? <p className="py-10 text-sm text-[#6B7C91]">Loading books…</p> : displayedBooks.length === 0 ? <div className="rounded-2xl border border-dashed border-[#DCE6F0] bg-white p-10 text-center"><p className="font-medium text-[#26364A]">{showArchivedBooks ? 'No archived books.' : books.length ? 'No active books match your search.' : 'No books in the library yet.'}</p><p className="mt-2 text-sm text-[#6B7C91]">{showArchivedBooks ? 'Archived titles will appear here.' : books.length ? 'Try another title, author, or ISBN.' : 'Use Add books to start your collection.'}</p></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{displayedBooks.map((book) => <article key={book.bookId} className="overflow-hidden rounded-xl border border-[#DCE6F0] bg-white shadow-sm shadow-stone-900/[0.03]">
  <div className="flex gap-3 p-4">
    <div className="grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#F2F7FC] text-2xl text-[#315B86]">{book.imageUrl ? <img src={book.imageUrl} alt={book.title + ' cover'} className="size-full object-cover" /> : <span aria-hidden="true">▤</span>}</div>
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2"><h2 className="line-clamp-2 font-display text-base font-semibold leading-snug text-[#26364A]">{book.title}</h2>{book.isArchived && <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-[0.62rem] font-medium text-stone-600">Archived</span>}</div>
      <p className="mt-1 truncate text-xs font-normal text-[#7B8793]">{book.author}</p>
      <div className="mt-2 flex flex-wrap gap-1">{book.categories?.slice(0, 2).map((category) => <span key={category} className="rounded-full bg-[#F2F5F7] px-2 py-0.5 text-[0.62rem] font-normal text-[#64717D]">{category}</span>)}{book.categories?.length > 2 && <span className="rounded-full bg-[#F2F5F7] px-2 py-0.5 text-[0.62rem] font-normal text-[#64717D]" title={book.categories.slice(2).join(', ')}>+{book.categories.length - 2}</span>}</div>
      <span className="mt-2 inline-flex rounded-full bg-[#F2F5F7] px-2.5 py-1 text-[0.65rem] font-medium text-[#64717D]">{book.availableCopies} of {book.totalCopies} available</span>
    </div>
  </div>
  <div className="flex flex-wrap gap-2 border-t border-[#EAF0F6] px-4 py-3"><button className="button-secondary !px-2.5 !py-2 !text-xs" type="button" onClick={() => startEditingBook(book)}>Edit details</button><button className="button-secondary !px-2.5 !py-2 !text-xs" type="button" onClick={() => showBookCopies(book)}>Copy barcodes</button><button className="button-quiet !px-2.5 !py-2 !text-xs" type="button" disabled={Boolean(busy)} onClick={() => toggleBookArchive(book)}>{busy === 'archive-' + book.bookId ? 'Saving…' : book.isArchived ? 'Restore' : 'Archive'}</button></div>
</article>)}</div>}
        </section>}

        {showAddBook && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#0B1726]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBookForm(); }}>
          <form ref={dialogRef} id="book-form" role="dialog" aria-modal="true" aria-labelledby="book-form-title" className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-2xl shadow-black/30 sm:p-8" onSubmit={saveBook}>
            <div className="mb-1 flex items-start justify-between gap-4"><h3 id="book-form-title" className="font-display text-xl font-semibold text-[#26364A]">{editingBookId ? 'Edit book details' : 'Add or restock a title'}</h3><button type="button" className="button-quiet -mt-2 -mr-2 px-3 py-2 text-xl leading-none" aria-label="Close book form" onClick={closeBookForm}>×</button></div>
            <p className="mt-2 text-sm leading-6 text-[#6B7C91]">{editingBookId ? 'Correct the catalog information for this saved title.' : 'Enter a new ISBN to add a title, or an existing ISBN to add copies to that title.'}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-[#26364A]">ISBN-13<input className="field mt-2" value={form.isbn} onChange={(event) => setForm({ ...form, isbn: event.target.value })} placeholder="e.g., 978-0-7432-7356-5" required /></label>
              <label className="text-sm font-medium text-[#26364A]">Title<input className="field mt-2" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g., The Great Gatsby" required /></label>
              <label className="text-sm font-medium text-[#26364A]">Author<input className="field mt-2" value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} placeholder="e.g., F. Scott Fitzgerald" required /></label>
              <label className="text-sm font-medium text-[#26364A]">{editingBookId ? 'Total copies' : 'Copies to add'}<input className="field mt-2" type="number" min={editingBook ? Math.max(1, editingBook.totalCopies - editingBook.availableCopies) : 1} step="1" value={form.copies} onChange={(event) => setForm({ ...form, copies: event.target.value })} placeholder="e.g., 5" required />{editingBook && <span className="mt-1 block text-xs font-normal text-[#6B7C91]">At least {editingBook.totalCopies - editingBook.availableCopies} currently loaned {editingBook.totalCopies - editingBook.availableCopies === 1 ? 'copy' : 'copies'} must remain in the total.</span>}</label>
              <div className="text-sm font-medium text-[#26364A] sm:col-span-2"><span>Book cover <span className="font-normal text-[#7B8793]">(optional)</span></span><div className="mt-2 inline-flex rounded-xl bg-[#F2F5F7] p-1" aria-label="Book cover source">{[['upload', 'Upload image'], ['url', 'Use image URL']].map(([source, label]) => <button key={source} type="button" aria-pressed={coverSource === source} onClick={() => { setCoverSource(source); setCoverPreviewFailed(false); setForm((current) => ({ ...current, imageUrl: '' })); if (coverInputRef.current) coverInputRef.current.value = ''; }} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${coverSource === source ? 'bg-white text-[#26364A] shadow-sm' : 'text-[#64717D] hover:text-[#26364A]'}`}>{label}</button>)}</div>{coverSource === 'upload' ? <><input ref={coverInputRef} className="field mt-2 file:mr-3 file:rounded-lg file:border-0 file:bg-[#E8F0F8] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#315B86]" type="file" accept="image/png,image/jpeg,image/webp" onChange={readCover} /><span className="mt-1 block text-xs font-normal text-[#6B7C91]">PNG, JPEG, or WebP · up to 2 MB</span></> : <><input className="field mt-2" type="url" inputMode="url" autoComplete="url" value={form.imageUrl.startsWith('data:') ? '' : form.imageUrl} onChange={(event) => { setCoverPreviewFailed(false); setForm({ ...form, imageUrl: event.target.value }); }} placeholder="https://example.com/book-cover.jpg" /><span className="mt-1 block text-xs font-normal text-[#6B7C91]">Paste a public image URL (not the web page containing the image). Direct links can use any common image format.</span></>}</div>
              {form.imageUrl && <div className="flex items-center gap-3 rounded-xl border border-[#DCE6F0] bg-[#F2F7FC] p-3 sm:col-span-2"><div className="grid h-20 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-white text-xl text-[#315B86]">{coverPreviewFailed ? <span aria-hidden="true">▤</span> : <img src={form.imageUrl} alt="Book cover preview" className="size-full object-cover" onError={() => setCoverPreviewFailed(true)} />}</div><div className="min-w-0 flex-1">{coverPreviewFailed && <p className="text-xs text-rose-700">This link could not be previewed. Use a direct, public image link; some websites block embedding.</p>}<button className="button-quiet mt-1" type="button" onClick={() => { setForm({ ...form, imageUrl: '' }); setCoverPreviewFailed(false); if (coverInputRef.current) coverInputRef.current.value = ''; }}>Remove cover</button></div></div>}
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium text-[#26364A]">Categories <span className="font-normal text-[#6B7C91]">(select at least one)</span></legend>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[#DCE6F0] bg-[#F2F7FC] p-3 sm:grid-cols-3">
                  {bookCategories.map((category) => <label key={category} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs text-[#26364A]"><input type="checkbox" className="accent-[#315B86]" checked={form.categories.includes(category)} onChange={(event) => setForm({ ...form, categories: event.target.checked ? [...form.categories, category] : form.categories.filter((item) => item !== category) })} />{category}</label>)}
                </div>
              </fieldset>
              <div className="flex gap-3 sm:col-span-2"><button className="button-primary mt-1" disabled={busy === 'book'}>{busy === 'book' ? 'Saving…' : editingBookId ? 'Save changes' : 'Save book'}</button><button className="button-quiet mt-1" type="button" onClick={closeBookForm}>Cancel</button></div>
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2">{error}</p>}
            </div>
          </form>
        </div>}

        {activeView === 'borrowers' && <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-[#6B7C91]">{dataErrors.borrowers ? 'Borrower list unavailable' : `${borrowers.length} registered`}</p></div><div className="flex w-full gap-2 sm:w-auto"><label className="min-w-0 flex-1 sm:w-72"><span className="sr-only">Search borrowers</span><input className="field" type="search" placeholder="Search borrowers, IDs, contact" value={borrowerQuery} onChange={(event) => setBorrowerQuery(event.target.value)} /></label><button type="button" className="button-primary shrink-0" onClick={() => { setEditingBorrower(null); setBorrowerForm({ member_id: '', contact_number: '', full_name: '', email: '', society_role: '', status: 'Active' }); setShowAddBorrower(true); }}>＋ Add borrower</button></div></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {matchingBorrowers.map((borrower) => {
              const borrowerLoans = activeLoans.filter((loan) => String(loan.borrowerRecordId) === String(borrower.borrowerId));
              const hasOverdueLoan = borrowerLoans.some((loan) => overdueDays(loan.dueDate) > 0);
              const statusTone = borrower.status === 'Suspended' ? 'bg-rose-100 text-rose-800' : borrower.status === 'Inactive' ? 'bg-stone-100 text-stone-700' : 'bg-emerald-100 text-emerald-800';
              return <article key={borrower.borrowerId} className={`rounded-xl border border-[#E7DED2] border-l-4 bg-white p-3 shadow-sm ${hasOverdueLoan ? 'border-l-rose-500' : 'border-l-[#D97706]'}`}>
                <div className="flex items-start gap-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FFF1C7] text-base font-bold text-[#B45309]">{borrower.name?.[0]?.toUpperCase() ?? 'B'}</span>
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold text-[#26364A]">{borrower.name}</h2><span className="rounded-md border border-[#E7DED2] bg-[#FAF7F1] px-2 py-0.5 text-[0.68rem] font-normal text-[#75685A]">{borrower.memberId ?? 'No member ID'}</span></div><p className="mt-1 truncate text-xs font-normal text-[#8C7D6B]">{borrower.societyRole ?? 'No role / position listed'}</p></div>
                  <div className="flex shrink-0 gap-1"><button type="button" className="button-quiet !px-2 !py-1.5" aria-label={`Edit ${borrower.name}`} title="Edit borrower" onClick={() => editBorrower(borrower)}>✎</button><button type="button" className="button-quiet !px-2 !py-1.5 !text-rose-700" aria-label={`Delete ${borrower.name}`} title="Delete borrower" disabled={busy === `borrower-delete-${borrower.borrowerId}`} onClick={() => deleteBorrower(borrower)}>{busy === `borrower-delete-${borrower.borrowerId}` ? '…' : '⌫'}</button></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] font-normal text-[#8C7D6B]"><span className="break-all">✉ {borrower.email || 'No email'}</span><span>☎ {borrower.contactNumber || 'No phone number'}</span></div>
                <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-lg bg-[#FAF7F1] p-2">
                  {[['Out', borrower.transactionSummary?.unreturned ?? 0], ['Returned', borrower.transactionSummary?.returned ?? 0], ['Total', borrower.transactionSummary?.totalBorrowed ?? 0]].map(([label, value]) => <div key={label}><p className="text-base font-medium text-[#26364A]">{value}</p><p className="text-[0.6rem] font-normal uppercase tracking-wide text-[#8C7D6B]">{label}</p></div>)}
                  <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${hasOverdueLoan ? 'bg-rose-100 text-rose-800' : statusTone}`}>{hasOverdueLoan ? 'Overdue' : borrower.status ?? 'Active'}</span><p className={`mt-1 text-xs font-medium ${hasOverdueLoan ? 'text-rose-700' : 'text-[#4F7960]'}`}>{hasOverdueLoan ? 'Needs follow-up' : 'Good standing'}</p></div>
                </div>
                <div className="mt-2 border-t border-[#EEE7DE] pt-2">
                  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[#26364A]">Unreturned books ({borrowerLoans.length})</h3><button type="button" className="rounded-full border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={borrower.status !== 'Active'} onClick={() => borrowForBorrower(borrower)}>＋ Borrow book</button></div>
                  {borrowerLoans.length ? <ul className="mt-1.5 space-y-1.5">{borrowerLoans.map((loan) => { const overdue = overdueDays(loan.dueDate) > 0; return <li key={loan.requestId} className={`flex items-center gap-2 rounded-lg p-1.5 ${overdue ? 'bg-rose-50' : 'bg-[#F7FAFD]'}`}><div className="grid h-12 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-[#E8F0F8] text-base text-[#315B86]">{loan.book.imageUrl ? <img src={loan.book.imageUrl} alt={`${loan.book.title} cover`} className="size-full object-cover" /> : <span aria-hidden="true">▤</span>}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#26364A]">{loan.book.title}</p><p className="mt-0.5 truncate text-[0.65rem] font-normal text-[#8C7D6B]">Due {new Date(loan.dueDate).toLocaleDateString()} {overdue && <span className="ml-1 font-semibold text-rose-700">OVERDUE</span>}</p></div><button type="button" className="button-primary shrink-0 !px-2 !py-1.5 !text-[0.65rem]" onClick={() => markReturned(loan.requestId)}>✓ Return</button></li>; })}</ul> : <p className="mt-1.5 text-xs italic font-normal text-[#8C7D6B]">No books are currently borrowed.</p>}
                </div>
              </article>;
            })}
            {!loading && !dataErrors.borrowers && matchingBorrowers.length === 0 && <p className="rounded-2xl border border-dashed border-[#CBD7D0] bg-white p-8 text-center text-sm text-[#6B7C91] lg:col-span-2">{borrowers.length ? 'No borrowers match your search.' : 'No borrowers registered yet. Select Add borrower to create the first record.'}</p>}
          </div>
        </section>}

        {showAddBorrower && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#0B1726]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== 'borrower') setShowAddBorrower(false); }}>
          <form ref={dialogRef} onSubmit={registerBorrower} role="dialog" aria-modal="true" aria-labelledby="borrower-form-title" className="my-auto w-full max-w-2xl rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Borrower management</p><h2 id="borrower-form-title" className="mt-1 font-display text-2xl font-semibold text-[#26364A]">{editingBorrower ? 'Edit borrower' : 'Add borrower'}</h2><p className="mt-1 text-sm text-[#6B7C91]">Enter the borrower’s identification and contact details.</p></div><button type="button" className="button-quiet -mt-2 -mr-2 px-3 py-2 text-xl leading-none" aria-label="Close borrower form" disabled={busy === 'borrower'} onClick={() => { setShowAddBorrower(false); setEditingBorrower(null); }}>×</button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Member ID / Student ID<input className="field mt-2" value={borrowerForm.member_id} onChange={(e) => setBorrowerForm({ ...borrowerForm, member_id: e.target.value })} autoComplete="off" placeholder="e.g., 2026-00123" required /></label>
              <label className="block text-sm font-medium">Contact number<input className="field mt-2" type="tel" autoComplete="tel" value={borrowerForm.contact_number} onChange={(e) => setBorrowerForm({ ...borrowerForm, contact_number: e.target.value })} placeholder="e.g., 0917 123 4567" required /></label>
              <label className="block text-sm font-medium">Full name<input className="field mt-2" autoComplete="name" value={borrowerForm.full_name} onChange={(e) => setBorrowerForm({ ...borrowerForm, full_name: e.target.value })} placeholder="e.g., Alex Santos" required /></label>
              <label className="block text-sm font-medium">Email address<input className="field mt-2" type="email" autoComplete="email" value={borrowerForm.email} onChange={(e) => setBorrowerForm({ ...borrowerForm, email: e.target.value })} placeholder="e.g., alex.santos@example.com" required /></label>
              <label className="block text-sm font-medium sm:col-span-2">Roles / positions<select className="field mt-2" value={borrowerForm.society_role} onChange={(e) => setBorrowerForm({ ...borrowerForm, society_role: e.target.value })} required><option value="">Select a role / position</option>{societyRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
              <label className="block text-sm font-medium sm:col-span-2">Borrower status<select className="field mt-2" value={borrowerForm.status} onChange={(e) => setBorrowerForm({ ...borrowerForm, status: e.target.value })} required>{borrowerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button className="button-quiet" type="button" disabled={busy === 'borrower'} onClick={() => { setShowAddBorrower(false); setEditingBorrower(null); }}>Cancel</button><button className="button-primary" disabled={busy === 'borrower'}>{busy === 'borrower' ? 'Saving…' : editingBorrower ? 'Save changes' : 'Save borrower'}</button></div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          </form>
        </div>}

        {copyList && <div className="fixed inset-0 z-[105] grid place-items-center overflow-y-auto bg-[#0B1726]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCopyList(null); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="copy-list-title" className="my-auto w-full max-w-xl rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Inventory</p><h2 id="copy-list-title" className="mt-1 font-display text-2xl font-semibold text-[#26364A]">{copyList.book.title} copies</h2><p className="mt-1 text-sm text-[#6B7C91]">{copyList.copies.length} tracked copies · ISBN {copyList.book.isbn}</p></div><button type="button" className="button-quiet px-3 py-2 text-xl" onClick={() => setCopyList(null)} aria-label="Close copy list">×</button></div><div className="mt-5 max-h-80 overflow-auto rounded-xl border border-[#DCE6F0]"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-[#F2F7FC] text-xs uppercase tracking-wide text-[#6B7C91]"><tr><th className="px-4 py-3">Barcode</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-[#EAF0F6]">{copyList.copies.map((copy) => <tr key={copy.copyId}><td className="px-4 py-3 font-mono text-xs">{copy.barcode}</td><td className="px-4 py-3">{copy.status}</td></tr>)}</tbody></table></div><div className="mt-5 flex justify-end gap-3"><button type="button" className="button-quiet" onClick={() => setCopyList(null)}>Close</button><button type="button" className="button-primary" onClick={exportCopyBarcodes}>Export barcodes</button></div></section></div>}

        {showCheckout && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#0B1726]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== 'checkout') setShowCheckout(false); }}>
          <form ref={dialogRef} onSubmit={reviewCheckout} role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="my-auto w-full max-w-xl rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Borrower management</p><h2 id="checkout-title" className="mt-1 font-display text-2xl font-semibold text-[#26364A]">Borrow a book</h2><p className="mt-1 text-sm text-[#6B7C91]">Choose a borrower and an available title.</p></div><button type="button" className="button-quiet -mt-2 -mr-2 px-3 py-2 text-xl leading-none" aria-label="Close checkout" disabled={busy === 'checkout'} onClick={() => setShowCheckout(false)}>×</button></div>
            {checkoutStep === 'details' ? <>
              <fieldset className="mt-5">
                <legend className="text-sm font-medium">Borrower</legend>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-[#EAF7FB] p-1.5" aria-label="Borrower type">
                  {[['existing', 'Registered borrower'], ['new', 'New borrower']].map(([mode, label]) => <button key={mode} type="button" aria-pressed={checkout.borrowerMode === mode} onClick={() => setCheckout({ ...checkout, borrowerMode: mode })} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${checkout.borrowerMode === mode ? 'bg-white text-[#0B132B] shadow-sm ring-1 ring-[#5BC0DE]' : 'text-[#3A506B] hover:bg-white/70'}`}>{label}</button>)}
                </div>
              </fieldset>
              {checkout.borrowerMode === 'existing' ? <>
                <label className="mt-4 block text-sm font-medium">Registered borrower<select className="field mt-2" value={checkout.borrowerId} onChange={(e) => setCheckout({ ...checkout, borrowerId: e.target.value })} required><option value="">Choose active borrower</option>{activeBorrowers.map((b) => <option key={b.borrowerId} value={b.borrowerId}>{b.name} · {b.memberId ?? b.email}</option>)}</select></label>
                {!activeBorrowers.length && <p className="mt-2 rounded-lg bg-[#F4D6B0] px-3 py-2 text-sm text-[#0B132B]">No active borrowers yet. Choose New borrower to register one during checkout.</p>}
              </> : <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">Member ID / Student ID<input className="field mt-2" value={checkout.newBorrower.member_id} onChange={(e) => setCheckout({ ...checkout, newBorrower: { ...checkout.newBorrower, member_id: e.target.value } })} autoComplete="off" placeholder="e.g., 2026-00123" required /></label>
                <label className="block text-sm font-medium">Contact number<input className="field mt-2" type="tel" autoComplete="tel" value={checkout.newBorrower.contact_number} onChange={(e) => setCheckout({ ...checkout, newBorrower: { ...checkout.newBorrower, contact_number: e.target.value } })} placeholder="e.g., 0917 123 4567" required /></label>
                <label className="block text-sm font-medium">Full name<input className="field mt-2" autoComplete="name" value={checkout.newBorrower.full_name} onChange={(e) => setCheckout({ ...checkout, newBorrower: { ...checkout.newBorrower, full_name: e.target.value } })} placeholder="e.g., Alex Santos" required /></label>
                <label className="block text-sm font-medium">Email address<input className="field mt-2" type="email" autoComplete="email" value={checkout.newBorrower.email} onChange={(e) => setCheckout({ ...checkout, newBorrower: { ...checkout.newBorrower, email: e.target.value } })} placeholder="e.g., alex.santos@example.com" required /></label>
                <label className="block text-sm font-medium sm:col-span-2">Roles / positions<select className="field mt-2" value={checkout.newBorrower.society_role} onChange={(e) => setCheckout({ ...checkout, newBorrower: { ...checkout.newBorrower, society_role: e.target.value } })} required><option value="">Select a role / position</option>{societyRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                <label className="block text-sm font-medium sm:col-span-2">Borrower status<select className="field mt-2" value={checkout.newBorrower.status} onChange={(e) => setCheckout({ ...checkout, newBorrower: { ...checkout.newBorrower, status: e.target.value } })} required>{borrowerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#6B7C91]">Only Active borrowers can complete checkout. Use Add borrower to register an inactive or suspended borrower.</span></label>
              </div>}
              <label className="mt-4 block text-sm font-medium">Book<select className="field mt-2" value={checkout.bookId} onChange={(e) => setCheckout({ ...checkout, bookId: e.target.value })} required><option value="">Choose available book</option>{activeBooks.filter((b) => b.availableCopies > 0).map((b) => <option key={b.bookId} value={b.bookId}>{b.title} · {b.availableCopies} available</option>)}</select></label>
              {checkoutBookOption && <article className="mt-3 flex items-center gap-4 rounded-xl border border-[#DCE6F0] bg-[#F7FAFD] p-3" aria-live="polite"><div className="grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#E8F0F8] text-2xl text-[#315B86]">{checkoutBookOption.imageUrl ? <img src={checkoutBookOption.imageUrl} alt={`${checkoutBookOption.title} cover`} className="size-full object-cover" /> : <span aria-hidden="true">▤</span>}</div><div className="min-w-0"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#6B7C91]">Selected book</p><h3 className="mt-1 truncate font-semibold text-[#26364A]">{checkoutBookOption.title}</h3><p className="mt-0.5 truncate text-sm text-[#7B8793]">{checkoutBookOption.author}</p><span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#64717D]">{checkoutBookOption.availableCopies} copies available</span></div></article>}
              <fieldset className="mt-4">
                <legend className="text-sm font-medium">Loan period (days)</legend>
                <div className="mt-2 flex flex-wrap gap-2">{loanDayChoices.map((days) => <button key={days} type="button" aria-pressed={Number(checkout.loanDays) === days} onClick={() => setCheckout({ ...checkout, loanDays: String(days) })} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${Number(checkout.loanDays) === days ? 'border-[#D97706] bg-[#F4D6B0] text-[#0B132B]' : 'border-[#DCE6F0] bg-white text-[#3A506B] hover:border-[#5BC0DE]'}`}>{days} days</button>)}</div>
                <label className="mt-3 block text-xs font-medium text-[#3A506B]">Custom period<input className="field mt-1.5" type="number" min="1" max="30" step="1" value={checkout.loanDays} onChange={(e) => setCheckout({ ...checkout, loanDays: e.target.value })} required /></label>
              </fieldset>
              <div className="mt-5 flex justify-end gap-3"><button className="button-quiet" type="button" disabled={busy === 'checkout'} onClick={() => setShowCheckout(false)}>Cancel</button><button className="button-primary" disabled={busy === 'checkout' || (checkout.borrowerMode === 'existing' ? !checkoutBorrowerOption : !checkout.newBorrower.member_id.trim() || !checkout.newBorrower.contact_number.trim() || !checkout.newBorrower.full_name.trim() || !checkout.newBorrower.email.trim() || !checkout.newBorrower.society_role || checkout.newBorrower.status !== 'Active') || !checkoutBookOption}>{'Review checkout'}</button></div>
            </> : <>
              <div className="mt-5 rounded-xl border border-[#DCE6F0] bg-[#F7FAFD] p-5"><p className="text-xs font-bold uppercase tracking-wide text-[#315B86]">Checkout summary</p><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-[#8796A8]">Borrower</dt><dd className="mt-1 font-semibold text-[#26364A]">{checkoutBorrowerOption?.name ?? '—'}</dd><dd className="text-xs text-[#6B7C91]">ID {checkoutBorrowerOption?.memberId ?? '—'}</dd></div><div><dt className="text-xs text-[#8796A8]">Book</dt><dd className="mt-1 font-semibold text-[#26364A]">{checkoutBookOption?.title ?? '—'}</dd><dd className="text-xs text-[#6B7C91]">{checkoutBookOption?.availableCopies ?? 0} copies available before checkout</dd></div><div><dt className="text-xs text-[#8796A8]">Loan period</dt><dd className="mt-1 font-medium">{checkout.loanDays} days</dd></div><div><dt className="text-xs text-[#8796A8]">Due date</dt><dd className="mt-1 font-semibold">{checkoutDueDate.toLocaleDateString()}</dd></div></dl></div>
              {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
              <div className="mt-6 flex justify-end gap-3"><button className="button-quiet" type="button" disabled={busy === 'checkout'} onClick={() => setCheckoutStep('details')}>Back</button><button className="button-primary" disabled={busy === 'checkout'}>{busy === 'checkout' ? 'Processing…' : 'Confirm checkout'}</button></div>
            </>}
          </form>
        </div>}

        {loanAction && <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-[#0B1726]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setLoanAction(null); }}>
          <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="loan-action-title" onSubmit={submitLoanAction} className="my-auto w-full max-w-lg rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-2xl sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Loan management</p>
            <h2 id="loan-action-title" className="mt-1 font-display text-2xl font-semibold text-[#26364A]">{loanAction.kind === 'renew' ? 'Renew this loan' : 'Close this loan'}</h2>
            {loanAction.kind === 'renew' ? <label className="mt-5 block text-sm font-medium">Extend due date by<select className="field mt-2" value={loanActionForm.loanDays} onChange={(e) => setLoanActionForm({ ...loanActionForm, loanDays: e.target.value })}><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option><option value="30">30 days</option></select><span className="mt-1 block text-xs font-normal text-[#6B7C91]">If the current due date has passed, the extension starts today.</span></label> : <>
              <label className="mt-5 block text-sm font-medium">Outcome<select className="field mt-2" value={loanActionForm.resolution} onChange={(e) => setLoanActionForm({ ...loanActionForm, resolution: e.target.value })}><option value="Returned">Returned in good condition</option><option value="Damaged">Returned damaged</option><option value="Lost">Reported lost</option></select></label>
              <label className="mt-4 block text-sm font-medium">Staff note <span className="font-normal text-[#6B7C91]">(optional)</span><textarea className="field mt-2 min-h-24 resize-y" value={loanActionForm.note} onChange={(e) => setLoanActionForm({ ...loanActionForm, note: e.target.value })} placeholder="Add context for this outcome" /></label>
              {loanActionForm.resolution !== 'Returned' && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This copy will be removed from available stock.</p>}
            </>}
            <div className="mt-6 flex justify-end gap-3"><button className="button-quiet" type="button" disabled={Boolean(busy)} onClick={() => setLoanAction(null)}>Cancel</button><button className="button-primary" disabled={Boolean(busy)}>{busy ? 'Saving…' : loanAction.kind === 'renew' ? 'Save renewal' : 'Confirm outcome'}</button></div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          </form>
        </div>}

        {activeView === 'reports' && <section>
          <div className="mb-4 grid gap-3 rounded-2xl border border-[#DCE6F0] bg-white p-4 md:grid-cols-2 xl:grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_0.8fr_auto]">
            <label className="text-xs font-semibold text-[#6B7C91]">Search<input className="field mt-1" type="search" placeholder="Borrower, member ID, or book" value={reportQuery} onChange={(event) => setReportQuery(event.target.value)} /></label>
            <label className="text-xs font-semibold text-[#6B7C91]">From<input className="field mt-1" type="date" value={reportFrom} max={reportTo || undefined} onChange={(event) => setReportFrom(event.target.value)} /></label>
            <label className="text-xs font-semibold text-[#6B7C91]">To<input className="field mt-1" type="date" value={reportTo} min={reportFrom || undefined} onChange={(event) => setReportTo(event.target.value)} /></label>
            <label className="text-xs font-semibold text-[#6B7C91]">Transaction<select className="field mt-1" value={reportType} onChange={(event) => setReportType(event.target.value)}><option value="all">All transactions</option><option value="unreturned">Unreturned</option><option value="returned">Returned in good condition</option><option value="lost-damaged">Lost or damaged</option><option value="denied">Denied</option></select></label>
            <label className="text-xs font-semibold text-[#6B7C91]">Sort by<select className="field mt-1" value={reportSort} onChange={(event) => { setReportSort(event.target.value); setReportPage(0); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="borrower">Borrower A–Z</option><option value="book">Book A–Z</option></select></label>
            <button type="button" className="button-secondary self-end" onClick={exportTransactions} disabled={!matchingTransactions.length}>Export CSV</button>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[{ label: 'Showing', value: matchingTransactions.length }, { label: 'Returned', value: matchingTransactions.filter((item) => item.returnDate && (item.resolution ?? 'Returned') === 'Returned').length }, { label: 'Lost / damaged', value: matchingTransactions.filter((item) => ['Lost', 'Damaged'].includes(item.resolution)).length }, { label: 'Unreturned', value: matchingTransactions.filter((item) => item.status === 'Approved' && !item.returnDate).length }, { label: 'Overdue now', value: matchingTransactions.filter((item) => item.status === 'Approved' && !item.returnDate && overdueDays(item.dueDate) > 0).length }].map((metric) => <article key={metric.label} className="rounded-xl border border-[#DCE6F0] bg-white px-4 py-3"><p className="text-xs text-[#6B7C91]">{metric.label}</p><p className="mt-1 text-xl font-semibold text-[#17324F]">{metric.value}</p></article>)}</div>
          <div className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white"><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-[#F2F7FC] text-xs uppercase tracking-wide text-[#6B7C91]"><tr><th className="px-5 py-4">Date</th><th className="px-5 py-4">Borrower</th><th className="px-5 py-4">Book</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Due / returned</th></tr></thead><tbody className="divide-y divide-stone-100">{visibleTransactions.map((t) => <tr key={t.requestId}><td className="px-5 py-4">{new Date(t.requestDate).toLocaleDateString()}</td><td className="px-5 py-4">{t.customerName ?? t.borrowerRecord?.name ?? '—'}<span className="mt-1 block text-xs text-[#8796A8]">{t.borrowerRecord?.memberId ?? ''}</span></td><td className="px-5 py-4">{t.book.title}</td><td className="px-5 py-4"><StatusBadge status={t.returnDate ? t.resolution ?? 'Returned' : t.status} /></td><td className="px-5 py-4">{t.returnDate ? `${t.resolution ?? 'Returned'} ${new Date(t.returnDate).toLocaleDateString()}` : t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString()}` : '—'}</td></tr>)}{!matchingTransactions.length && <tr><td colSpan="5" className="px-5 py-10 text-center text-[#6B7C91]">No transactions match these filters.</td></tr>}</tbody></table></div><div className="flex items-center justify-between border-t border-[#EAF0F6] px-4 py-3 text-sm text-[#6B7C91]"><span>{matchingTransactions.length ? `${reportPage * 25 + 1}–${Math.min((reportPage + 1) * 25, matchingTransactions.length)} of ${matchingTransactions.length}` : '0 results'}</span><div className="flex gap-2"><button type="button" className="button-secondary !px-3 !py-2 !text-xs" disabled={reportPage === 0} onClick={() => setReportPage((page) => Math.max(0, page - 1))}>Previous</button><button type="button" className="button-secondary !px-3 !py-2 !text-xs" disabled={reportPage >= reportPageCount - 1} onClick={() => setReportPage((page) => Math.min(reportPageCount - 1, page + 1))}>Next</button></div></div></div>
          <details className="mt-5 rounded-2xl border border-[#DCE6F0] bg-white p-5"><summary className="cursor-pointer font-semibold text-[#26364A]">Recent admin activity <span className="ml-1 text-xs font-normal text-[#6B7C91]">({auditEvents.length} events)</span></summary><div className="mt-4 divide-y divide-[#EAF0F6]">{auditEvents.slice(0, 25).map((event) => <div key={event.auditEventId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-medium text-[#26364A]">{event.action}</p><p className="mt-1 text-xs text-[#6B7C91]">{event.borrower?.name ?? event.details?.name ?? '—'}{event.book?.title ? ` · ${event.book.title}` : ''}{event.details?.note ? ` · ${event.details.note}` : ''}</p></div><time className="text-xs text-[#8796A8]">{new Date(event.createdAt).toLocaleString()}</time></div>)}{!auditEvents.length && <p className="py-4 text-sm text-[#6B7C91]">No admin activity recorded yet.</p>}</div></details>
        </section>}

        {activeView === 'settings' && <section className="max-w-3xl rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-sm">
          <h2 className="font-display text-xl font-semibold text-[#26364A]">Admin settings</h2>
          <p className="mt-1 text-sm text-[#6B7C91]">Customize your admin profile and the library’s borrowing rules.</p>
          <div className="mt-6 border-t border-[#EAF0F6] pt-5">
            <h3 className="font-semibold text-[#26364A]">Admin profile</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Admin name<input className="field mt-2" value={adminName} maxLength={160} autoComplete="name" onChange={(event) => setAdminName(event.target.value)} placeholder="Your name" /></label>
              <label className="text-sm font-medium">Contact number<input className="field mt-2" type="tel" value={adminContact} maxLength={60} autoComplete="tel" onChange={(event) => setAdminContact(event.target.value)} placeholder="Your contact number" /></label>
            </div>
          </div>
          <div className="mt-6 border-t border-[#EAF0F6] pt-5">
            <h3 className="font-semibold text-[#26364A]">Borrowing defaults</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Default loan period<select className="field mt-2" value={defaultLoanDays} onChange={(event) => setDefaultLoanDays(event.target.value)}>{loanDayChoices.map((days) => <option key={days} value={days}>{days} days</option>)}</select><span className="mt-1 block text-xs font-normal text-[#8796A8]">Preselected when checking out a book.</span></label>
              <label className="text-sm font-medium">Books a borrower may have at once<select className="field mt-2" value={maxConcurrentBooks} onChange={(event) => setMaxConcurrentBooks(event.target.value)}>{Array.from({ length: 10 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? 'book' : 'books'}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#8796A8]">Checkout is blocked when the borrower reaches this limit.</span></label>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#EAF0F6] pt-5">
            <p className="text-sm text-[#6B7C91]">Your workspace uses the standard LibBrow light theme.</p>
            <button type="button" className="button-primary" disabled={busy === 'settings'} onClick={saveLibrarySettings}>{busy === 'settings' ? 'Saving…' : 'Save settings'}</button>
          </div>
          <button className="button-quiet mt-5" onClick={onLogout}>Sign out</button>
        </section>}

        {activeView === 'unreturned' && <section id="unreturned">
          <div className="mb-4 grid gap-3 sm:grid-cols-3"><article className="rounded-xl border border-[#DCE6F0] bg-white px-4 py-3"><p className="text-xs text-[#6B7C91]">Currently out</p><p className="mt-1 text-xl font-semibold">{activeLoans.length}</p></article><article className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><p className="text-xs text-amber-800">Due in the next 7 days</p><p className="mt-1 text-xl font-semibold text-amber-900">{dueSoonLoans.length}</p></article><article className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><p className="text-xs text-rose-800">Overdue</p><p className="mt-1 text-xl font-semibold text-rose-900">{overdueLoans.length}</p></article></div>
          <div className="mb-4 flex flex-wrap items-center gap-3"><label className="min-w-0 flex-1 sm:max-w-sm"><span className="sr-only">Search unreturned books</span><input className="field" type="search" placeholder="Search borrower, ID, or book" value={loanQuery} onChange={(event) => setLoanQuery(event.target.value)} /></label><button type="button" aria-pressed={overdueOnly} onClick={() => setOverdueOnly(!overdueOnly)} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${overdueOnly ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-[#DCE6F0] bg-white text-[#526A83]'}`}>Overdue only</button><span className="text-sm text-[#6B7C91]">{matchingLoans.length} shown · sorted by due date</span></div>
          <div className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white shadow-sm shadow-stone-900/[0.03]">
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-[#F2F7FC] text-xs uppercase tracking-wide text-[#6B7C91]"><tr><th className="px-5 py-4">Borrower</th><th className="px-5 py-4">Book</th><th className="px-5 py-4">Borrowed</th><th className="px-5 py-4">Due date</th><th className="px-5 py-4">Actions</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {matchingLoans.map((loan) => <tr key={loan.requestId}>
                    <td className="px-5 py-4"><p className="font-semibold text-[#26364A]">{loan.customerName ?? loan.borrowerRecord?.name ?? loan.borrower?.name ?? 'Borrower'}</p><p className="mt-1 text-xs text-[#8796A8]">{loan.customerEmail ?? loan.borrowerRecord?.email ?? loan.borrower?.email}</p>{(overdueDays(loan.dueDate) > 0 || dueSoonLoans.some((item) => item.requestId === loan.requestId)) && (loan.customerEmail ?? loan.borrowerRecord?.email) && <a className="mt-2 inline-flex text-xs font-semibold text-[#3E7168] underline" href={`mailto:${encodeURIComponent(loan.customerEmail ?? loan.borrowerRecord?.email)}?subject=${encodeURIComponent(`Library book due: ${loan.book.title}`)}&body=${encodeURIComponent(`Hello ${loan.customerName ?? loan.borrowerRecord?.name ?? ''}, this is a reminder that “${loan.book.title}” is due ${new Date(loan.dueDate).toLocaleDateString()}. Please contact the library if you need assistance.`)}`}>Prepare email reminder</a>}</td>
                    <td className="px-5 py-4"><p className="font-medium text-[#26364A]">{loan.book.title}</p><p className="mt-1 text-xs text-[#8796A8]">{loan.book.author}</p></td>
                    <td className="px-5 py-4 text-[#6B7C91]">{loan.actualBorrowDate ? new Date(loan.actualBorrowDate).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-4 text-[#6B7C91]"><span>{loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : '—'}</span>{loan.dueDate && overdueDays(loan.dueDate) > 0 && <span className="mt-1 block w-fit rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">Overdue · {overdueDays(loan.dueDate)} {overdueDays(loan.dueDate) === 1 ? 'day' : 'days'}</span>}</td>
                    <td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button type="button" className="button-secondary !px-3 !py-2 !text-xs" disabled={Boolean(busy)} onClick={() => { setLoanAction({ kind: 'renew', requestId: loan.requestId }); setLoanActionForm({ resolution: 'Returned', note: '', loanDays: '14' }); }}>Renew</button><button type="button" className="button-approve" disabled={Boolean(busy)} onClick={() => markReturned(loan.requestId)}>{busy === loan.requestId ? 'Working…' : 'Close loan'}</button></div></td>
                  </tr>)}
                  {!loading && matchingLoans.length === 0 && <tr><td colSpan="5" className="px-5 py-10 text-center text-[#6B7C91]">{activeLoans.length === 0 ? 'There are no books currently on loan.' : overdueOnly ? 'No overdue books match these filters.' : 'No unreturned books match your search.'}</td></tr>}
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
