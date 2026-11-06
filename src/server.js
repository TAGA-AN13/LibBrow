import 'dotenv/config';
import { app } from './app.js';
import { prisma } from './db/prisma.js';
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`Book Borrowing API listening on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
