import * as readline from 'readline';
import { MongoClient, Db } from 'mongodb';
import * as fs from 'fs';

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
        return match[1].split('.')[0] || 'unknown-cluster';
      }
    }
    
    return 'unknown-cluster';
  } catch (e) {
    return 'unknown-cluster';
  }
}

/**
 * Get replica set name from MongoDB
 */
export async function getReplicaSetName(db: Db): Promise<string> {
  try {
    const hello = await db.admin().command({ hello: 1 });
    if (hello.setName) {
      return hello.setName.replace(/[^a-zA-Z0-9_-]/g, '');
    }
    return 'unknown-cluster';
  } catch (e) {
    return 'unknown-cluster';
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

/**
 * Prompt user for input with validation
 * @param question Question to ask
 * @param validAnswers Valid answer options
 * @returns Tuple of [first character, full word]
 */
export function promptUser(question: string, validAnswers: string[]): Promise<[string, string]> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (): void => {
      rl.question(question, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        const validFirstChars = validAnswers.map(a => a[0]);
        
        if (validAnswers.includes(trimmed)) {
          rl.close();
          resolve([trimmed[0], trimmed]);
          return;
        }
        
        if (validFirstChars.includes(trimmed)) {
          const fullWord = validAnswers.find(a => a.startsWith(trimmed));
          if (fullWord) {
            rl.close();
            resolve([trimmed, fullWord]);
            return;
          }
        }
        
        console.log(`Invalid input. Please enter one of: ${validAnswers.join(', ')}`);
        ask();
      });
    };

    ask();
  });
}

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Read JSON file safely
 */
export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn(`⚠️ Could not read file: ${filePath}. Using default.`);
  }
  return defaultValue;
}

/**
 * Write JSON file
 */
export function writeJsonFile(filePath: string, data: any): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Delete file if exists
 */
export function deleteFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Format bytes to MB
 */
export function bytesToMB(bytes: number): number {
  return bytes / 1024 / 1024;
}

/**
 * Format time duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}
