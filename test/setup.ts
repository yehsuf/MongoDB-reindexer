/**
 * Test Setup - Load environment variables
 * Auto-loads .env.test before tests run
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.test');

// Load .env.test
dotenv.config({ path: envPath });

// Export for verification
export const testConfig = {
  mongodbUri: process.env.MONGODB_TEST_URI,
  database: process.env.MONGODB_TEST_DATABASE,
  isConfigured: !!(process.env.MONGODB_TEST_URI && process.env.MONGODB_TEST_DATABASE)
};
