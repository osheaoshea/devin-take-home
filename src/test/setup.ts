import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.example' });

// `next build` sets this from experimental.authInterrupts; tests run outside the build.
process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = 'true';

// Database-backed tests run against the throwaway database, never a real one.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
