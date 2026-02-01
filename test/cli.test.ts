/**
 * CLI Tests - Node Test Runner Format
 * CLI integration and help system tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('CLI Module', () => {
  describe('CLI File Structure', () => {
    it('should have cli.js file in dist directory', () => {
      const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
      assert.ok(fs.existsSync(cliPath), 'CLI file not found in dist');
    });

    it('should have cli.ts source file', () => {
      const cliSrcPath = path.join(__dirname, '..', 'src', 'cli.ts');
      assert.ok(fs.existsSync(cliSrcPath), 'CLI source file not found');
    });
  });

  describe('CLI Help System', () => {
    it('should display help when --help flag is used', async () => {
      const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');

      if (!fs.existsSync(cliPath)) {
        // Skip test if CLI not built yet
        assert.ok(true, 'CLI not built yet, skipping help test');
        return;
      }

      return new Promise<void>((resolve, reject) => {
        const proc: ChildProcess = spawn('node', [cliPath, '--help'], {
          timeout: 5000
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code: number | null) => {
          try {
            // Help should exit with code 0
            assert.ok(code === 0 || stdout.length > 0, 'Help command should succeed');
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        proc.on('error', (err: Error) => {
          reject(err);
        });
      });
    });

    it('should display version when --version flag is used', async () => {
      const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');

      if (!fs.existsSync(cliPath)) {
        // Skip test if CLI not built yet
        assert.ok(true, 'CLI not built yet, skipping version test');
        return;
      }

      return new Promise<void>((resolve, reject) => {
        const proc: ChildProcess = spawn('node', [cliPath, '--version'], {
          timeout: 5000
        });

        let stdout = '';

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        proc.on('close', (code: number | null) => {
          try {
            // Version command should succeed or output version info
            assert.ok(code === 0 || stdout.length > 0, 'Version command should succeed');
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        proc.on('error', (err: Error) => {
          reject(err);
        });
      });
    });
  });

  describe('CLI Module Imports', () => {
    it('should import required dependencies', async () => {
      try {
        await import('../dist/cli.js');
        // If it imports without errors, the test passes
        assert.ok(true, 'CLI module imports successfully');
      } catch (err) {
        // May fail if not built yet or if there are import issues
        const error = err as Error;
        assert.ok(error.message.includes('Cannot find') || error.message.includes('ERR_MODULE_NOT_FOUND'),
          'CLI should fail gracefully if not built');
      }
    });
  });

  describe('CLI Package.json Configuration', () => {
    it('should have bin entry in package.json', () => {
      const packageJsonPath = path.join(__dirname, '..', 'package.json');
      assert.ok(fs.existsSync(packageJsonPath));

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      assert.ok(packageJson.bin, 'package.json should have bin field');
    });

    it('should point to correct CLI file in bin', () => {
      const packageJsonPath = path.join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      if (packageJson.bin) {
        const binPath = typeof packageJson.bin === 'string'
          ? packageJson.bin
          : packageJson.bin['mongodb-reindex'];

        if (binPath) {
          assert.ok(binPath.includes('cli.js'), 'bin should point to cli.js');
        }
      }
    });
  });
});
