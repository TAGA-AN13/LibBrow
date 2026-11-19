import { app } from '../src/app.js';

// Vercel routes API requests through this catch-all function. Exporting the
// Express app lets Vercel handle each request without starting a long-lived
// server with app.listen().
export default app;
