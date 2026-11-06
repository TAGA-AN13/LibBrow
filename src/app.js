import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api.js';
import { ServiceError } from './services/borrow-request-service.js';

export const app = express();

app.use(express.json({ limit: '4mb' }));
const allowedOrigins = [
  ...(process.env.WEB_ORIGIN ?? 'http://localhost:5173,http://localhost:5174')
    .split(',').map((origin) => origin.trim()),
  'http://localhost:5173',
  'http://localhost:5174',
];
app.use(cors({ origin: allowedOrigins }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/', apiRouter);

app.use((err, _req, res, _next) => {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'A record with one of these unique values already exists' });
  }
  if (err?.code === 'P2003') {
    return res.status(409).json({ error: 'The request references a record that does not exist' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'The requested record was not found' });
  }
  if (err?.code === 'P2034') {
    return res.status(409).json({ error: 'Concurrent update conflict; please retry the request' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
