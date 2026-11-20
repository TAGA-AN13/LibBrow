import { app } from '../src/app.js';

// Vercel routes API requests through this catch-all function. Exporting the
// Express app lets Vercel handle each request without starting a long-lived
// server with app.listen().
export default function handler(req, res) {
  // The browser uses /api/* on Vercel; the Express router is mounted at /.
  req.url = req.url.replace(/^\/api(?=\/|$)/, '') || '/';
  return app(req, res);
}
