import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Root directory of the project (one level up from dist/ or src/)
 */
export const PROJECT_ROOT = join(__dirname, '..');

/**
 * Path to the runtime directory (e.g. .rebuild_runtime)
 */
export const PATH_TO_RUNTIME_DIR = join(PROJECT_ROOT, DEFAULT_CONFIG.RUNTIME_DIR);

/**
 * Path to package.json
 */
export const PACKAGE_JSON_PATH = join(PROJECT_ROOT, 'package.json');

