import * as fs from 'fs';
import * as path from 'path';
import { FILE_CONSTANTS } from './constants.js';

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
    const configPath = path.join(__dirname, '..', FILE_CONSTANTS.LOCALE_CONFIG_PATH);
    const config: LocaleConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (envLocale && config.supportedLocales.includes(envLocale)) {
      return envLocale;
    }

    return config.defaultLocale;
  } catch {
    return FILE_CONSTANTS.DEFAULT_LOCALE; // Fallback to English
  }
}

/**
 * Current locale (cached)
 */
let currentLocale: string | null = null;

/**
 * Get or initialize current locale
 */
export function getLocale(): string {
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
    if (locale !== FILE_CONSTANTS.DEFAULT_LOCALE) {
      return loadMessages(FILE_CONSTANTS.DEFAULT_LOCALE);
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
  if (value === undefined && locale !== FILE_CONSTANTS.DEFAULT_LOCALE) {
    const fallbackMessages = loadMessages(FILE_CONSTANTS.DEFAULT_LOCALE);
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
