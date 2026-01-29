import { MongoClient, Db } from 'mongodb';
import { MONGO_CONSTANTS } from './constants';

/**
 * Get cluster name from MongoDB connection
 */
export function getClusterName(client: MongoClient): string {
  try {
    // Try to extract from connection string
    const uri = (client as any).s?.url || '';
    if (uri) {
      const match = uri.match(/mongodb\+srv:\/\/(?:[^@]+@)?([^/?]+)/);
      if (match && match[1]) {
        return match[1].split('.')[0] || MONGO_CONSTANTS.UNKNOWN_CLUSTER;
      }
    }

    return MONGO_CONSTANTS.UNKNOWN_CLUSTER;
  } catch {
    return MONGO_CONSTANTS.UNKNOWN_CLUSTER;
  }
}

/**
 * Get replica set name from MongoDB
 */
export async function getReplicaSetName(db: Db): Promise<string> {
  try {
    const hello = await db.admin().command(MONGO_CONSTANTS.HELLO_COMMAND);
    if (hello.setName) {
      return hello.setName.replace(/[^a-zA-Z0-9_-]/g, '');
    }
    return MONGO_CONSTANTS.UNKNOWN_CLUSTER;
  } catch {
    return MONGO_CONSTANTS.UNKNOWN_CLUSTER;
  }
}

/**
 * Check if a name matches any pattern in ignore list
 * Supports wildcard patterns (ending with *)
 */
export function isIgnored(name: string, ignoreList: string[]): boolean {
  for (const pattern of ignoreList) {
    if (pattern.endsWith('*')) {
      if (name.startsWith(pattern.slice(0, -1))) {
        return true;
      }
    } else if (name === pattern) {
      return true;
    }
  }
  return false;
}
