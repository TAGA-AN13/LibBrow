import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api.js';

const initialCustomer = { name: '', email: '', loanDays: '14' };
const prettyDate = (value) => value ? new Date(value).toLocaleDateString() : '—';

export default function PublicCatalog() {
  const cameFromAdmin = new URLSearchParams(window.location.search).get('from') === 'admin';
  const adminPortalUrl = import.meta.env.VITE_ADMIN_PORTAL_URL || `${window.location.protocol}//${window.location.hostname}:5174/`;
  const [activePage, setActivePage] = useState('home');
  const [books, setBooks] = useState([]);
  const [deckIndex, setDeckIndex] = useState(0);
  const [previousDeckIndex, setPreviousDeckIndex] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [customer, setCustomer] = useState(initialCustomer);
  const [requestError, setRequestError] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [newReference, setNewReference] = useState('');
  const [trackReference, setTrackReference] = useState('');
  const [trackedRequest, setTrackedRequest] = useState(null);
  const [trackError, setTrackError] = useState('');
  const [trackBusy, setTrackBusy] = useState(false);
  const [returnBusy, setReturnBusy] = useState(false);
  const [bookRating, setBookRating] = useState(0);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState('');

  useEffect(() => {
    apiRequest('/books')
      .then(setBooks)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const visibleBooks = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return books;
    return books.filter((book) => `${book.title} ${book.author} ${book.isbn} ${(book.categories ?? []).join(' ')}`.toLowerCase().includes(term));
  }, [books, query]);

  const booksWithCovers = useMemo(() => books.filter((book) => book.imageUrl), [books]);

  useEffect(() => {
    if (booksWithCovers.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setPreviousDeckIndex(deckIndex);
      setDeckIndex((deckIndex + 1) % booksWithCovers.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [booksWithCovers.length, deckIndex]);

  useEffect(() => {
    if (previousDeckIndex === null) return undefined;
    const timer = window.setTimeout(() => setPreviousDeckIndex(null), 750);
    return () => window.clearTimeout(timer);
  }, [previousDeckIndex]);

  async function submitRequest(event) {
    event.preventDefault();
    setRequestBusy(true);
    setRequestError('');
    try {
      const result = await apiRequest('/public/requests', {
        method: 'POST',
        body: JSON.stringify({
          name: customer.name,
          email: customer.email,
          book_id: selectedBook.bookId,
          loan_days: Number(customer.loanDays),
        }),
      });
      setNewReference(result.reference);
      setTrackReference(result.reference);
      setTrackedRequest(result);
      setBookRating(result.bookRating ?? 0);
      setSelectedBook(null);
      setCustomer(initialCustomer);
      setActivePage('track');
    } catch (requestError) {
      setRequestError(requestError.message);
    } finally {
      setRequestBusy(false);
    }
  }

  async function trackRequest(event) {
    event.preventDefault();
    setTrackBusy(true);
    setTrackError('');
    setTrackedRequest(null);
    try {
      const result = await apiRequest(`/public/requests/${encodeURIComponent(trackReference.trim())}`);
      setTrackedRequest(result);
      setBookRating(result.bookRating ?? 0);
    } catch (requestError) {
      setTrackError(requestError.message);
    } finally {
      setTrackBusy(false);
    }
  }

  async function sendReturnNotice() {
    setReturnBusy(true);
    setTrackError('');
    try {
      setTrackedRequest(await apiRequest('/public/returns', {
        method: 'POST',
        body: JSON.stringify({ reference: trackedRequest.reference }),
      }));
    } catch (requestError) {
      setTrackError(requestError.message);
    } finally {
      setReturnBusy(false);
    }
  }

  async function submitBookRating(event) {
    event.preventDefault();
    if (!trackedRequest || bookRating < 1 || bookRating > 5) return;
    setRatingBusy(true);
    setRatingError('');
    try {
      const result = await apiRequest('/public/ratings', {
        method: 'POST',
        body: JSON.stringify({ reference: trackedRequest.reference, rating: bookRating }),
      });
      setTrackedRequest(result);
      setBookRating(result.bookRating ?? bookRating);
    } catch (requestError) {
      setRatingError(requestError.message);
    } finally {
      setRatingBusy(false);
    }
  }

  return (
    <div className="borrower-dark flex min-h-screen flex-col bg-[#F2F7FC] text-[#26364A]">
      <header className="border-b border-[#DCE6F0]/80 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <button type="button" onClick={() => setActivePage('home')} className="flex items-center" aria-label="LibBrow home"><img src="/libbrow-horizontal.png" alt="LibBrow — Borrow, Read, Discover" className="h-12 w-auto max-w-[min(240px,60vw)] object-contain" /></button>
          <nav className="flex flex-wrap items-center justify-end gap-2 sm:gap-4" aria-label="Main navigation">{cameFromAdmin && <a className="button-quiet" href={adminPortalUrl}>← Back to admin portal</a>}<button type="button" className={`button-quiet ${activePage === 'collection' ? 'text-[#E2BB61]' : ''}`} onClick={() => setActivePage('collection')}>Browse books</button><button type="button" className="button-primary" onClick={() => setActivePage('track')}>Track a request</button></nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {activePage === 'home' && <section className="public-hero relative flex flex-1 items-center overflow-hidden bg-[#244A70] text-white">
          <div className="absolute -right-24 -top-40 size-[34rem] rounded-full border border-[#315B86]/50" /><div className="absolute -right-12 -top-24 size-[28rem] rounded-full border border-[#315B86]/40" />
          <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div><p className="mb-5 text-xs font-bold uppercase tracking-[0.24em] text-[#E2BB61]">Read well. Return kindly.</p><h1 className="max-w-3xl font-display text-5xl font-medium leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">Good books find their way around.</h1><p className="mt-6 max-w-xl text-base leading-7 text-[#DCE6F0]/75">Browse the collection and request a book online. Once an admin approves your request, collect it from the library in person.</p><button type="button" className="mt-8 inline-flex rounded-xl bg-[#E2BB61] px-5 py-3 text-sm font-bold text-[#26364A] transition hover:bg-[#D4AC4F]" onClick={() => setActivePage('collection')}>Explore the collection</button></div>
            <div className="hidden w-full max-w-md justify-self-end space-y-6 lg:block">
              <div className="relative mx-auto h-[19rem] w-full max-w-sm" aria-label="Featured books in the collection">
                {booksWithCovers.length > 0 ? (
                  <>
                    {[2, 1].map((offset) => {
                      const book = booksWithCovers[(deckIndex + offset) % booksWithCovers.length];
                      return <div key={`standby-${book.bookId}-${offset}`} aria-hidden="true" className={`book-standby book-standby-${offset}`}>
                        <img src={book.imageUrl} alt="" className="size-full object-cover" />
                      </div>;
                    })}
                    {(() => {
                      const book = booksWithCovers[deckIndex % booksWithCovers.length];
                      return <article key={`${book.bookId}-${deckIndex}`} className={`book-slide ${previousDeckIndex === null ? 'book-slide-static' : 'book-slide-in'}`}>
                        <img src={book.imageUrl} alt={`${book.title} cover`} className="size-full object-contain" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#102238]/95 via-[#102238]/65 to-transparent px-5 pb-5 pt-12">
                          <p className="line-clamp-2 font-display text-xl font-semibold leading-tight text-white">{book.title}</p>
                          <p className="mt-1 truncate text-sm text-[#DCE6F0]">{book.author}</p>
                        </div>
                      </article>;
                    })()}
                    {previousDeckIndex !== null && (() => {
                      const book = booksWithCovers[previousDeckIndex % booksWithCovers.length];
                      return <article key={`leaving-${book.bookId}-${previousDeckIndex}`} aria-hidden="true" className="book-slide book-slide-out">
                        <img src={book.imageUrl} alt="" className="size-full object-contain" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#102238]/95 via-[#102238]/65 to-transparent px-5 pb-5 pt-12">
                          <p className="line-clamp-2 font-display text-xl font-semibold leading-tight text-white">{book.title}</p>
                          <p className="mt-1 truncate text-sm text-[#DCE6F0]">{book.author}</p>
                        </div>
                      </article>;
                    })()}
                  </>
                ) : <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-[#7891AA]/50 bg-[#244A70]/30 px-8 text-center text-sm text-[#DCE6F0]/75">Book cover previews will appear here.</div>}
              </div>
              <div className="rounded-3xl border border-[#315B86]/60 bg-[#244A70]/50 p-8"><p className="font-display text-3xl leading-tight text-[#F4E6C3]">“A book is a gift you can open again and again.”</p><p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#DCE6F0]/70">Your next chapter starts here</p></div>
            </div>
          </div>
        </section>}

        {activePage === 'collection' && <section id="collection" className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#315B86]">Find your next read</p><h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Browse the shelves</h1></div><div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center"><label className="w-full sm:max-w-sm"><span className="sr-only">Search books</span><input className="field" type="search" placeholder="Search by title, author, or ISBN" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button type="button" className="button-quiet" onClick={() => setActivePage('home')}>Back to home</button></div></div>
          {error && <p role="alert" className="mb-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          {loading ? <p className="py-12 text-sm text-[#6B7C91]">Opening the shelves…</p> : visibleBooks.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-10 text-center"><p className="font-medium text-[#26364A]">{books.length ? 'No books match that search.' : 'The shelves are waiting for their first books.'}</p><p className="mt-2 text-sm text-[#6B7C91]">Try another title or author.</p></div> : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleBooks.map((book) => (
              <article key={book.bookId} className="flex flex-col rounded-2xl border border-[#DCE6F0]/80 bg-white p-5 shadow-sm shadow-stone-900/[0.03]">
                <div className="relative mb-5 flex aspect-[1.45/1] items-end overflow-hidden rounded-xl bg-gradient-to-br from-[#DCE6F0] via-[#F2F7FC] to-[#FBF5E6] p-5">{book.imageUrl && <><img src={book.imageUrl} alt={`${book.title} cover`} className="absolute inset-0 size-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#17365D]/85 via-[#17365D]/10 to-transparent" /></>}<div className="relative"><span className="mb-3 block h-1 w-10 rounded-full bg-[#E2BB61]" /><h3 className={`line-clamp-3 font-display text-xl font-semibold leading-tight ${book.imageUrl ? 'text-white' : 'text-[#26364A]'}`}>{book.title}</h3></div></div>
                <p className="text-sm text-[#6B7C91]">by <span className="font-medium text-[#26364A]">{book.author}</span></p>
                {book.categories?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{book.categories.map((category) => <span key={category} className="rounded-full bg-[#E8F0F8] px-2.5 py-1 text-[0.68rem] font-medium text-[#315B86]">{category}</span>)}</div>}
                <div className="mt-4 flex flex-1 items-center justify-between gap-3 text-xs"><span className={`font-semibold ${book.availableCopies > 0 ? 'text-[#315B86]' : 'text-[#8796A8]'}`}>{book.availableCopies > 0 ? `${book.availableCopies} available` : 'Currently unavailable'}</span><span className="text-right text-[#8796A8]">ISBN {book.isbn}</span></div>
                <button className="button-secondary mt-5 w-full" disabled={book.availableCopies < 1} onClick={() => { setNewReference(''); setRequestError(''); setSelectedBook(book); }}>{book.availableCopies > 0 ? 'Request this book' : 'Unavailable'}</button>
              </article>
            ))}</div>
          )}
        </section>}

        {activePage === 'track' && <section id="track" className="w-full border-y border-[#DCE6F0] bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
            <div><div className="mb-5 flex items-start justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#315B86]">Your request, at a glance</p><h1 className="font-display text-3xl font-semibold tracking-tight">Track or report a return</h1></div><button type="button" className="button-quiet" onClick={() => setActivePage('home')}>Back to home</button></div><p className="mt-4 max-w-md text-sm leading-6 text-[#6B7C91]">Enter the reference you received after requesting a book. You can check its status or let staff know when you’ve sent a loan back.</p>
              <form className="mt-6 space-y-3" onSubmit={trackRequest}><label className="block text-sm font-medium text-[#26364A]">Request reference<input className="field mt-2 font-mono" value={trackReference} onChange={(event) => setTrackReference(event.target.value)} placeholder="Paste your reference" required /></label><button className="button-primary w-full sm:w-auto" disabled={trackBusy}>{trackBusy ? 'Checking…' : 'Check status'}</button></form>
              {trackError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{trackError}</p>}
            </div>
            <div>
              {newReference && <div className="mb-5 rounded-2xl border border-[#DCE6F0] bg-[#F2F7FC] p-5"><p className="font-semibold text-[#26364A]">Request sent. Save this reference to check status later.</p><p className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm text-[#244A70]">{newReference}</p></div>}
              {trackedRequest ? <article className="rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">{trackedRequest.book.title}</p><h3 className="mt-1 font-display text-2xl font-semibold">Request status</h3><p className="mt-1 text-sm text-[#6B7C91]">by {trackedRequest.book.author}</p></div><span className="rounded-full bg-[#FBF5E6] px-3 py-1.5 text-xs font-semibold text-[#26364A]">{trackedRequest.status}</span></div><dl className="mt-6 grid gap-4 border-t border-[#EAF0F6] pt-5 sm:grid-cols-3"><div><dt className="text-xs text-[#8796A8]">Requested</dt><dd className="mt-1 text-sm font-medium">{prettyDate(trackedRequest.requestDate)}</dd></div><div><dt className="text-xs text-[#8796A8]">Requested loan</dt><dd className="mt-1 text-sm font-medium">{trackedRequest.requestedLoanDays ?? 14} days</dd></div><div><dt className="text-xs text-[#8796A8]">Due date</dt><dd className="mt-1 text-sm font-medium">{prettyDate(trackedRequest.dueDate)}</dd></div></dl>{trackedRequest.status === 'Pending' && <p className="mt-5 rounded-xl bg-[#FBF5E6] px-4 py-3 text-sm text-[#26364A]">Your request is awaiting admin approval. Please wait for confirmation before visiting the library to collect the book.</p>}{trackedRequest.status === 'Approved' && !trackedRequest.returnDate && <p className="mt-5 rounded-xl bg-[#F2F7FC] px-4 py-3 text-sm text-[#315B86]">Approved. Your book is ready for in-store pickup. Please bring your request reference to the library.</p>}{trackedRequest.returnNoticeDate && <p className="mt-5 rounded-xl bg-[#F2F7FC] px-4 py-3 text-sm text-[#315B86]">Return notice sent {prettyDate(trackedRequest.returnNoticeDate)}. Staff will confirm when the loan is checked in.</p>}{trackedRequest.returnDate && <><p className="mt-5 rounded-xl bg-[#F2F7FC] px-4 py-3 text-sm text-[#315B86]">Return confirmed {prettyDate(trackedRequest.returnDate)}.</p><form className="mt-5 rounded-xl border border-[#DCE6F0] bg-[#F7FAFD] p-4" onSubmit={submitBookRating}><fieldset><legend className="text-sm font-semibold text-[#26364A]">{trackedRequest.bookRating ? 'Your book rating' : 'How would you recommend this book?'}</legend><div className="mt-2 flex items-center gap-1" role="group" aria-label="Rate this book from one to five stars">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" className={`rounded-md px-1 text-3xl leading-none transition hover:scale-110 ${bookRating >= star ? 'text-[#C89B3C]' : 'text-[#8796A8]'}`} aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`} aria-pressed={bookRating === star} onClick={() => setBookRating(star)}>{bookRating >= star ? '★' : '☆'}</button>)}</div></fieldset>{ratingError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{ratingError}</p>}<button type="submit" className="button-primary mt-4" disabled={ratingBusy || bookRating < 1}>{ratingBusy ? 'Saving rating…' : trackedRequest.bookRating ? 'Update rating' : 'Submit rating'}</button></form></>}{trackedRequest.status === 'Approved' && !trackedRequest.returnDate && !trackedRequest.returnNoticeDate && <button className="button-secondary mt-5" disabled={returnBusy} onClick={sendReturnNotice}>{returnBusy ? 'Sending…' : 'Send return notice'}</button>}</article> : <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-[#6B7C91]">Your request status will appear here after you enter its reference.</div>}
            </div>
          </div>
        </section>}
      </main>

      <footer className="bg-white"><div className="mx-auto flex max-w-7xl justify-center px-5 py-5 text-center text-sm text-[#6B7C91] sm:px-8">LibBrow 2026. All rights reserved.</div></footer>

      {selectedBook && <div className="fixed inset-0 z-50 grid place-items-center bg-[#17365D]/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBook(null); }}><section role="dialog" aria-modal="true" aria-labelledby="request-title" className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315B86]">Borrow request</p><h2 id="request-title" className="mt-1 font-display text-2xl font-semibold">{selectedBook.title}</h2><p className="mt-1 text-sm text-[#6B7C91]">by {selectedBook.author}</p></div><button className="button-quiet" onClick={() => setSelectedBook(null)} aria-label="Close request form">Close</button></div><p className="mt-4 rounded-xl bg-[#FBF5E6] px-4 py-3 text-sm leading-5 text-[#26364A]">Your request must be approved by library staff before collection. Once approved, pick up the book at the library using your request reference.</p><form className="mt-5 grid gap-4" onSubmit={submitRequest}><label className="text-sm font-medium text-[#26364A]">Full name<input className="field mt-2" autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} maxLength="160" required /></label><label className="text-sm font-medium text-[#26364A]">Email address<input className="field mt-2" autoComplete="email" type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} maxLength="254" required /></label><div className="rounded-xl border border-[#DCE6F0] bg-[#F2F7FC] px-4 py-3 text-sm"><p className="font-semibold text-[#26364A]">Pickup at the library</p><p className="mt-1 text-[#6B7C91]">Wait for admin approval before visiting to collect your book.</p></div><label className="text-sm font-medium text-[#26364A]">Requested loan length (days)<input className="field mt-2" type="number" min="1" max="30" step="1" value={customer.loanDays} onChange={(event) => setCustomer({ ...customer, loanDays: event.target.value })} required /><span className="mt-1 block text-xs font-normal text-[#8796A8]">Choose 1 to 30 days. Default is 14.</span></label>{requestError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{requestError}</p>}<button className="button-primary mt-1 w-full" disabled={requestBusy}>{requestBusy ? 'Sending request…' : 'Send borrowing request'}</button></form></section></div>}
    </div>
  );
}
