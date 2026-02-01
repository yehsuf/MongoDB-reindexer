import * as fs from 'fs';
import { FORMAT_CONSTANTS } from './constants';

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
  } catch {
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
  return bytes / FORMAT_CONSTANTS.BYTES_TO_MB_DIVISOR;
}

/**
 * Format time duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < FORMAT_CONSTANTS.SECONDS_IN_MINUTE) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / FORMAT_CONSTANTS.SECONDS_IN_MINUTE);
  const remainingSeconds = seconds % FORMAT_CONSTANTS.SECONDS_IN_MINUTE;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}
