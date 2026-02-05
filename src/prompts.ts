import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { t, getLocale } from './i18n.js';
import { FILE_CONSTANTS } from './constants.js';
import { getLogger } from './logger.js';
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // Fallback to English if locale file doesn't exist
    if (!fs.existsSync(helpPath) && locale !== FILE_CONSTANTS.DEFAULT_LOCALE) {
      helpPath = path.join(__dirname, '..', 'locales', FILE_CONSTANTS.DEFAULT_LOCALE, 'prompts', `${helpFileId}.json`);
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
  } catch (e) {
    getLogger().warn('errors.could_not_read_file', { file: helpFileId } ,e as Error);
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
      getLogger().info(`\n${t('common.available_options')}`);
      if (helpText && helpText.length > 0) {
        helpText.forEach(option => {
          const shortcut = option.value[0];
          getLogger().info(`  ${option.value} (${shortcut}) - ${option.description}`);
          if (option.details) {
            getLogger().info(`    ${option.details}`);
          }
        });
      } else {
        validAnswers.forEach(answer => {
          getLogger().info(`  ${answer} (${answer[0]})`);
        });
      }
      getLogger().info(`  ${t('common.help_command')}\n`);
    };

    const ask = (): void => {
      rl.question(question, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        const validFirstChars = validAnswers.map(a => a[0]);

        // Check for help request
        if (trimmed === 'help' || trimmed === 'h' || trimmed === '?') {
          showHelp();
          setImmediate(() => ask());
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

        getLogger().info(t('common.invalid_input', { options: validAnswers.join(', ') }));
        getLogger().info(t('common.help_trigger'));
        setImmediate(() => ask());
      });
    };

    ask();
  });
}
