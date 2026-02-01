/**
 * File Utilities Tests - Node Test Runner Format
 * Migrated from unit-tests.js (lines 320-490)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock utility functions for testing
function bytesToMB(bytes) {
  return bytes / (1024 * 1024);
}

function formatDuration(seconds) {
  const SECONDS_IN_MINUTE = 60;
  if (seconds < SECONDS_IN_MINUTE) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / SECONDS_IN_MINUTE);
  const remainingSeconds = seconds % SECONDS_IN_MINUTE;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch {
    // Return default
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

const testDir = './test/temp_test_files';
const testFile = path.join(testDir, 'test.json');

describe('File Utils Module', () => {
  after(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('ensureDir()', () => {
    it('should create directory if not exists', () => {
      const dir = path.join(testDir, 'subdir');
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });

      ensureDir(dir);
      assert.ok(fs.existsSync(dir));

      fs.rmSync(dir, { recursive: true });
    });

    it('should do nothing if directory exists', () => {
      ensureDir(testDir);
      ensureDir(testDir); // Should not throw
      assert.ok(fs.existsSync(testDir));
    });
  });

  describe('writeJsonFile()', () => {
    it('should write valid JSON', () => {
      ensureDir(testDir);
      const testData = { name: 'test', value: 42 };
      writeJsonFile(testFile, testData);

      assert.ok(fs.existsSync(testFile));
      const content = fs.readFileSync(testFile, 'utf8');
      const parsed = JSON.parse(content);
      assert.deepStrictEqual(parsed, testData);
    });
  });

  describe('readJsonFile()', () => {
    it('should return data when file exists', () => {
      ensureDir(testDir);
      const testData = { key: 'value', number: 123 };
      writeJsonFile(testFile, testData);

      const result = readJsonFile(testFile, {});
      assert.deepStrictEqual(result, testData);
    });

    it('should return default value when file does not exist', () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.json');
      const defaultValue = { default: true };

      const result = readJsonFile(nonExistentFile, defaultValue);
      assert.deepStrictEqual(result, defaultValue);
    });

    it('should return default value on parse error', () => {
      ensureDir(testDir);
      const invalidFile = path.join(testDir, 'invalid.json');
      fs.writeFileSync(invalidFile, 'invalid json {{{', 'utf8');

      const defaultValue = { fallback: true };
      const result = readJsonFile(invalidFile, defaultValue);
      assert.deepStrictEqual(result, defaultValue);

      deleteFile(invalidFile);
    });
  });

  describe('deleteFile()', () => {
    it('should remove file if exists', () => {
      ensureDir(testDir);
      writeJsonFile(testFile, { test: true });
      assert.ok(fs.existsSync(testFile));

      deleteFile(testFile);
      assert.ok(!fs.existsSync(testFile));
    });

    it('should do nothing if file does not exist', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        deleteFile(path.join(testDir, 'nonexistent.json'));
      });
    });
  });

  describe('bytesToMB()', () => {
    it('should convert bytes correctly', () => {
      const mb = bytesToMB(1024 * 1024);
      assert.strictEqual(mb, 1);

      const mb5 = bytesToMB(5 * 1024 * 1024);
      assert.strictEqual(mb5, 5);
    });

    it('should handle 0 bytes', () => {
      const result = bytesToMB(0);
      assert.strictEqual(result, 0);
    });

    it('should handle decimal MB values', () => {
      const bytes = 512 * 1024; // 0.5 MB
      const mb = bytesToMB(bytes);
      assert.strictEqual(mb, 0.5);
    });
  });

  describe('formatDuration()', () => {
    it('should format seconds correctly', () => {
      const result = formatDuration(45.5);
      assert.ok(result.includes('45.50s'));
    });

    it('should format minutes correctly', () => {
      const result = formatDuration(125); // 2m 5s
      assert.ok(result.includes('2m') && result.includes('5s'));
    });

    it('should handle edge case at 60 seconds', () => {
      const result = formatDuration(60);
      assert.ok(result.includes('1m'));
    });
  });
});
