import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.example' });

// Database-backed tests run against the throwaway database, never a real one.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
