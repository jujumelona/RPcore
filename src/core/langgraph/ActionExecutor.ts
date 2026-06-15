// src/core/langgraph/ActionExecutor.ts
// mlcEngine -> inferenceManager 로 교체

import { ActionNode } from './StateGraph';
import { inferenceManager } from '../../native/InferenceManager';
import { contextBuilder } from '../memory/ContextBuilder';

export class ActionExecutor {
  async executeAction(action: ActionNode): Promise<string> {
    try {
      if (__DEV__) console.log(`[Executor] 실행: ${action.type} | 백엔드: ${inferenceManager.getStatus().backend}`);

      switch (action.type) {
        case 'narration':
          return await this.executeNarration(action);
        case 'character':
          return await this.executeCharacter(action);
        case 'state_update':
          this.executeStateUpdate(action);
          return '';
        default:
          return '';
      }
    } catch (error) {
      console.error('[ActionExecutor] executeAction failed:', error);
      return '';
    }
  }

  private async executeNarration(action: ActionNode): Promise<string> {
    try {
      const prompt = `Generate narration: ${action.content || action.guide}`;
      return await inferenceManager.generate(prompt, 200);
    } catch (error) {
      console.error('[ActionExecutor] executeNarration failed:', error);
      return '';
    }
  }

  private async executeCharacter(action: ActionNode): Promise<string> {
    try {
      if (!action.id) return '';
      const prompt = await contextBuilder.buildPrompt(action.id, action.guide || '');
      return await inferenceManager.generate(prompt, 300);
    } catch (error) {
      console.error('[ActionExecutor] executeCharacter failed:', error);
      return '';
    }
  }

  private executeStateUpdate(action: ActionNode) {
    if (__DEV__) console.log('[Executor] State update:', action.stateUpdate);
  }
}

let _actionExecutorInstance: ActionExecutor | null = null;
function getActionExecutorInstance(): ActionExecutor {
  if (!_actionExecutorInstance) _actionExecutorInstance = new ActionExecutor();
  return _actionExecutorInstance;
}
export const actionExecutor = new Proxy({} as ActionExecutor, {
  get(_t, p) { return (getActionExecutorInstance() as unknown as Record<string|symbol, unknown>)[p as string]; },
  set(_t, p, v) { (getActionExecutorInstance() as unknown as Record<string|symbol, unknown>)[p as string] = v; return true; } });
