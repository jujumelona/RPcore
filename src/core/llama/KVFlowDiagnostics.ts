export type KVEngineState = 'idle' | 'ready' | 'warming' | 'loading' | 'error' | 'generating';
export type KVRestoreResult = 'ok' | 'miss' | 'error';
export type KVFlowStep =
  | 'fingerprint_layers'
  | 'mount_autosave'
  | 'local_first_chapter_fast_path'
  | 'download_base'
  | 'download_story_base'
  | 'download_first_chapter'
  | 'load_offsets'
  | 'restore_session'
  | 'session_restore_miss'
  | 'skip_session_restore'
  | 'load_general_base'
  | 'prefill_story_base'
  | 'measure_base'
  | 'set_current_chapter_prompt'
  | 'skip_direct_chapter_load'
  | 'attempt_local_chapter_load'
  | 'load_local_chapter_offsets'
  | 'measure_loaded_chapter_offsets_if_needed'
  | 'check_server_chapter_reference'
  | 'load_base_if_needed'
  | 'reuse_loaded_base'
  | 'ensure_base_offsets'
  | 'prefill_chapter_prefix'
  | 'save_chapter'
  | 'measure_chapter_offsets'
  | 'attempt_local_change_chapter_load'
  | 'soft_reset'
  | 'load_base'
  | 'save_rebuilt_chapter';

export interface InitStoryFlowInput {
  shouldResume: boolean;
  hasSessionSnapshot: boolean;
  localFirstChapterAvailable: boolean;
  engineState: KVEngineState;
  sessionRestoreResult: KVRestoreResult;
  storyBaseDownloaded: boolean;
}

export function planInitStoryFlow(input: InitStoryFlowInput): KVFlowStep[] {
  const steps: KVFlowStep[] = ['fingerprint_layers', 'mount_autosave'];

  if (input.shouldResume && input.localFirstChapterAvailable && !input.hasSessionSnapshot) {
    steps.push('local_first_chapter_fast_path');
    return steps;
  }

  steps.push('download_base', 'download_story_base', 'download_first_chapter');

  if (!input.shouldResume) {
    steps.push('skip_session_restore');
  } else if (input.engineState === 'ready' || input.engineState === 'warming') {
    steps.push('load_offsets');
    if (input.sessionRestoreResult === 'ok') {
      steps.push('restore_session');
      return steps;
    }
    steps.push('session_restore_miss');
  }

  steps.push('load_general_base');
  if (input.storyBaseDownloaded) {
    steps.push('prefill_story_base');
  }
  steps.push('measure_base');
  return steps;
}

export interface InitChapterFlowInput {
  resumeMode: boolean;
  localChapterAvailable: boolean;
  phaseAlreadyHasBase: boolean;
}

export function planInitChapterFlow(input: InitChapterFlowInput): KVFlowStep[] {
  const steps: KVFlowStep[] = ['set_current_chapter_prompt'];

  if (!input.resumeMode) {
    steps.push('skip_direct_chapter_load');
  } else {
    steps.push('attempt_local_chapter_load');
    if (input.localChapterAvailable) {
      steps.push('load_local_chapter_offsets', 'measure_loaded_chapter_offsets_if_needed');
      return steps;
    }
  }

  steps.push('check_server_chapter_reference');
  steps.push(input.phaseAlreadyHasBase ? 'reuse_loaded_base' : 'load_base_if_needed');
  steps.push(
    'ensure_base_offsets',
    'prefill_chapter_prefix',
    'save_chapter',
    'measure_chapter_offsets',
  );
  return steps;
}

export interface ChangeChapterFlowInput {
  localChapterAvailable: boolean;
}

export function planChangeChapterFlow(input: ChangeChapterFlowInput): KVFlowStep[] {
  const steps: KVFlowStep[] = ['attempt_local_change_chapter_load'];
  if (input.localChapterAvailable) {
    steps.push('load_local_chapter_offsets', 'measure_loaded_chapter_offsets_if_needed');
    return steps;
  }

  steps.push(
    'soft_reset',
    'load_base',
    'ensure_base_offsets',
    'prefill_chapter_prefix',
    'save_rebuilt_chapter',
    'measure_chapter_offsets',
  );
  return steps;
}

export interface AutoSaveDecisionInput {
  trigger: 'app_state' | 'interval';
  autoSaveSuspended: boolean;
  engineState: KVEngineState;
}

export interface AutoSaveDecision {
  action: 'save' | 'skip';
  reason: 'ok' | 'suspended' | 'generating';
}

export function decideAutoSave(input: AutoSaveDecisionInput): AutoSaveDecision {
  if (input.autoSaveSuspended) {
    return { action: 'skip', reason: 'suspended' };
  }
  if (input.trigger === 'interval' && input.engineState === 'generating') {
    return { action: 'skip', reason: 'generating' };
  }
  return { action: 'save', reason: 'ok' };
}
