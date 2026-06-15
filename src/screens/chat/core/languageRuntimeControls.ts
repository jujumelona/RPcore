import { languageEnforcer } from '../../../core/i18n/LanguageEnforcer';
import { getCachedLanguageTokenBias } from '../../../core/llama/LanguageTokenBias';
import type { LogitBiasEntry } from '../../../core/llama/LlamaEngine';
import {
  getSupportedLanguage,
  type LanguageCode,
} from '../../../i18n/languages';

// Native completion on some Android GPU paths becomes unstable when runtime
// logit_bias is enabled, even with a very small English-only bias set.
// Keep the helper available for future experiments, but disable it at runtime.
const ENABLE_RUNTIME_LANGUAGE_LOGIT_BIAS = false;

export interface RuntimeLanguageControls {
  targetLanguage: LanguageCode;
  wrappedContext: string;
  logitBias: LogitBiasEntry[];
}

export function buildRuntimeLanguageControls(
  context: string,
  requestedLanguage?: string,
): RuntimeLanguageControls {
  const targetLanguage = getSupportedLanguage(requestedLanguage, 'en');

  return {
    targetLanguage,
    wrappedContext: languageEnforcer.wrapUserMessage(context, targetLanguage),
    logitBias: ENABLE_RUNTIME_LANGUAGE_LOGIT_BIAS
      ? getCachedLanguageTokenBias(targetLanguage)
      : [],
  };
}
