import { config } from 'dotenv';

config({ path: '.env.test' });

if (process.env.RUN_DB_INTEGRATION_TESTS !== 'true') {
  throw new Error('Set RUN_DB_INTEGRATION_TESTS=true to explicitly enable database integration tests.');
}
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL in .env.test to a dedicated non-production database.');
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET ??= 'local-test-secret-32-bytes-minimum-change-me';
