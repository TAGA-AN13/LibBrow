import { app } from '../src/app.js';

// Vercel rewrites every /api/* request to this single function and passes the
// original API path in the `path` query parameter. Restore the path expected
// by the Express router before handing over the request.
export default function handler(req, res) {
  const requestUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const apiPath = requestUrl.searchParams.get('path') || '';
  requestUrl.searchParams.delete('path');

  const query = requestUrl.searchParams.toString();
  req.url = `/${apiPath.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;

  return app(req, res);
}
