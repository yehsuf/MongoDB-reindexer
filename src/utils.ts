import * as readline from 'readline';
import { MongoClient, Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Locale configuration interface
 */
interface LocaleConfig {
  defaultLocale: string;
  supportedLocales: string[];
  fallbackLocale: string;
}

/**
 * Get current locale from environment or default
 */
function getCurrentLocale(): string {
  const envLocale = process.env.LOCALE || process.env.LANG?.split('.')[0]?.split('_')[0];
  
  try {
    const configPath = path.join(__dirname, '..', 'locales', 'config.json');
    const config: LocaleConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (envLocale && config.supportedLocales.includes(envLocale)) {
      return envLocale;
    }
    
    return config.defaultLocale;
  } catch {
    return 'en'; // Fallback to English
  }
}

/**
 * Current locale (cached)
 */
let currentLocale: string | null = null;

/**
 * Get or initialize current locale
 */
function getLocale(): string {
  if (!currentLocale) {
    currentLocale = getCurrentLocale();
  }
  return currentLocale;
}

/**
 * Messages cache
 */
let messagesCache: Record<string, any> = {};

/**
 * Load messages for current locale
 */
function loadMessages(locale: string): Record<string, any> {
  if (messagesCache[locale]) {
    return messagesCache[locale];
  }
  
  try {
    const messagesPath = path.join(__dirname, '..', 'locales', locale, 'messages.json');
    if (fs.existsSync(messagesPath)) {
      messagesCache[locale] = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
      return messagesCache[locale];
    }
  } catch {
    // Fallback to English if locale not found
    if (locale !== 'en') {
      return loadMessages('en');
    }
  }
  
  return {};
}

/**
 * Translate a message key with optional parameters
 * @param key Message key (e.g., 'common.help_trigger')
 * @param params Optional parameters to replace in message
 * @returns Translated message
 */
export function t(key: string, params?: Record<string, any>): string {
  const locale = getLocale();
  const messages = loadMessages(locale);
  
  // Navigate through nested keys
  const keys = key.split('.');
  let value: any = messages;
  
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      value = undefined;
      break;
    }
  }
  
  // If not found, try fallback locale
  if (value === undefined && locale !== 'en') {
    const fallbackMessages = loadMessages('en');
    value = fallbackMessages;
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        value = key; // Return key if not found
        break;
      }
    }
  }
  
  // Return key if translation not found
  if (typeof value !== 'string') {
    return key;
  }
  
  // Replace parameters
  if (params) {
    let result = value;
    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
    }
    return result;
  }
  
  return value;
}

/**
 * Set locale programmatically
 * @param locale Locale code (e.g., 'en', 'es')
 */
export function setLocale(locale: string): void {
  currentLocale = locale;
}

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
  } catch {
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
  } catch {
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
 * Help text for a prompt option
 */
export interface PromptOption {
  /** The option value (e.g., 'yes', 'no') */
  value: string;
  /** Short description of what this option does */
  description: string;
  /** Optional detailed explanation */
  details?: string;
}

/**
 * Help file structure
 */
export interface HelpFile {
  /** Unique identifier */
  id: string;
  /** The question text */
  question: string;
  /** Available options */
  options: Array<{
    value: string;
    shortcut: string;
    description: string;
    details?: string;
  }>;
  /** Optional context information */
  context?: string;
}

/**
 * Load help file from JSON (locale-aware)
 */
function loadHelpFile(helpFileId: string): PromptOption[] | null {
  const locale = getLocale();
  
  try {
    // Try locale-specific path first
    let helpPath = path.join(__dirname, '..', 'locales', locale, 'prompts', `${helpFileId}.json`);
    
    // Fallback to old help/ directory for backward compatibility
    if (!fs.existsSync(helpPath)) {
      helpPath = path.join(__dirname, '..', 'help', 'prompts', `${helpFileId}.json`);
    }
    
    // Fallback to English if locale file doesn't exist
    if (!fs.existsSync(helpPath) && locale !== 'en') {
      helpPath = path.join(__dirname, '..', 'locales', 'en', 'prompts', `${helpFileId}.json`);
    }
    
    if (fs.existsSync(helpPath)) {
      const content = fs.readFileSync(helpPath, 'utf8');
      const helpFile: HelpFile = JSON.parse(content);
      return helpFile.options.map(opt => ({
        value: opt.value,
        description: opt.description,
        details: opt.details
      }));
    }
  } catch {
    console.warn(t('errors.could_not_read_file', { file: helpFileId }));
  }
  return null;
}

/**
 * Prompt user for input with validation and help support
 * @param question Question to ask
 * @param validAnswers Valid answer options
 * @param helpFileIdOrOptions Help file ID (string) or inline help options (array)
 * @returns Tuple of [first character, full word]
 */
export function promptUser(
  question: string, 
  validAnswers: string[],
  helpFileIdOrOptions?: string | PromptOption[]
): Promise<[string, string]> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Load help text
    let helpText: PromptOption[] | null = null;
    if (typeof helpFileIdOrOptions === 'string') {
      helpText = loadHelpFile(helpFileIdOrOptions);
    } else if (Array.isArray(helpFileIdOrOptions)) {
      helpText = helpFileIdOrOptions;
    }

    const showHelp = (): void => {
      console.log(`\n${t('common.available_options')}`);
      if (helpText && helpText.length > 0) {
        helpText.forEach(option => {
          const shortcut = option.value[0];
          console.log(`  ${option.value} (${shortcut}) - ${option.description}`);
          if (option.details) {
            console.log(`    ${option.details}`);
          }
        });
      } else {
        validAnswers.forEach(answer => {
          console.log(`  ${answer} (${answer[0]})`);
        });
      }
      console.log(`  ${t('common.help_command')}\n`);
    };

    const ask = (): void => {
      rl.question(question, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        const validFirstChars = validAnswers.map(a => a[0]);
        
        // Check for help request
        if (trimmed === 'help' || trimmed === 'h' || trimmed === '?') {
          showHelp();
          ask();
          return;
        }
        
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
        
        console.log(t('common.invalid_input', { options: validAnswers.join(', ') }));
        console.log(t('common.help_trigger'));
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
