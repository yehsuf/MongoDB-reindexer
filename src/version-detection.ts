/**
 * MongoDB version detection and option filtering
 * Dynamically determines supported index options based on server version
 */

import { Db } from 'mongodb';
import { getLogger } from './logger';

/**
 * MongoDB version-to-option mapping for dynamic option discovery
 * Options are cumulative - each version includes all previous versions' options
 */
export const VERSIONED_INDEX_OPTIONS: Record<string, readonly string[]> = {
  '3.0': [
    'unique',
    'expireAfterSeconds',
    'sparse',
    'storageEngine',
    'weights',
    'default_language',
    'language_override',
    'textIndexVersion',
    '2dsphereIndexVersion',
    'bits',
    'min',
    'max',
    'bucketSize'
  ],
  '3.2': ['partialFilterExpression'],
  '3.4': ['collation'],
  '4.2': ['wildcardProjection'],
  '4.4': ['hidden'],
  '7.0': ['columnstoreProjection']
} as const;

/**
 * Ordered list of MongoDB versions for iteration
 */
export const MONGODB_VERSIONS = ['3.0', '3.2', '3.4', '4.2', '4.4', '7.0'] as const;

/**
 * Type for supported MongoDB versions
 */
export type MongoDBVersion = typeof MONGODB_VERSIONS[number];

/**
 * Detected MongoDB server version information
 */
export interface ServerVersionInfo {
  /** Full version string (e.g., "6.0.12") */
  fullVersion: string;
  /** Major version number */
  major: number;
  /** Minor version number */
  minor: number;
  /** Normalized version for comparison (e.g., "6.0") */
  normalized: string;
}

/**
 * Detect the MongoDB server version from a database connection
 * @param db - MongoDB Db instance
 * @returns ServerVersionInfo with parsed version data
 */
export async function detectServerVersion(db: Db): Promise<ServerVersionInfo> {
  try {
    const buildInfo = await db.admin().command({ buildInfo: 1 });
    const fullVersion = buildInfo.version || '3.0.0';

    const parts = fullVersion.split('.');
    const major = parseInt(parts[0], 10) || 3;
    const minor = parseInt(parts[1], 10) || 0;

    return {
      fullVersion,
      major,
      minor,
      normalized: `${major}.${minor}`
    };
  } catch (error) {
    // Fallback to conservative version (MongoDB 3.0)
    getLogger().warn('Could not detect MongoDB version, assuming 3.0 compatibility');
    return {
      fullVersion: '3.0.0',
      major: 3,
      minor: 0,
      normalized: '3.0'
    };
  }
}

/**
 * Get all valid index options for a specific MongoDB version
 * @param serverVersion - The detected server version
 * @returns Array of supported option names
 */
export function getValidOptionsForVersion(serverVersion: ServerVersionInfo): string[] {
  const supportedOptions: string[] = [];

  for (const version of MONGODB_VERSIONS) {
    const [vMajor, vMinor] = version.split('.').map(Number);

    // Include options if server version >= option version
    if (
      serverVersion.major > vMajor ||
      (serverVersion.major === vMajor && serverVersion.minor >= vMinor)
    ) {
      supportedOptions.push(...VERSIONED_INDEX_OPTIONS[version]);
    }
  }

  return supportedOptions;
}

/**
 * Filter index options to only those supported by the server
 * @param options - Original index options object
 * @param validOptions - List of valid option names
 * @returns Filtered options object
 */
export function filterIndexOptions(
  options: Record<string, any>,
  validOptions: string[]
): Record<string, any> {
  const filtered: Record<string, any> = {};

  for (const key of Object.keys(options)) {
    if (validOptions.includes(key)) {
      filtered[key] = options[key];
    } else {
      getLogger().debug(`Skipping unsupported option "${key}" for this MongoDB version`);
    }
  }

  return filtered;
}
