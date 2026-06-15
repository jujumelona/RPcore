// src/core/langgraph/StateGraph.ts
import type { EditorTrigger, EditorEmotions, ChoiceOption } from '../../types/StoryContract';

export interface ActionNode {
  type: 'narration' | 'character' | 'state_update';
  id?: string;
  content?: string;
  emotion?: string;
  guide?: string;
  stateUpdate?: any;
}

export interface ConversationState {
  currentLocation: string;
  activeCharacters: string[];
  actionQueue: ActionNode[];
  waitingForResponse: boolean;
}

export class StateGraph {
  private state: ConversationState = {
    currentLocation: '',
    activeCharacters: [],
    actionQueue: [],
    waitingForResponse: false };

  getState(): ConversationState {
    return { ...this.state };
  }

  setState(newState: Partial<ConversationState>) {
    this.state = { ...this.state, ...newState };
  }

  pushAction(action: ActionNode) {
    this.state.actionQueue.push(action);
  }

  popAction(): ActionNode | null {
    return this.state.actionQueue.shift() || null;
  }

  clearQueue() {
    this.state.actionQueue = [];
  }

  isQueueEmpty(): boolean {
    return this.state.actionQueue.length === 0;
  }
  // 선택지 분기 조건 평가 (감정/턴수 기반)
  evaluateBranchConditions(
    branches: Array<{ conditions?: EditorTrigger[]; options?: ChoiceOption[] }>,
    emotions: Record<number, EditorEmotions>,
    turnCount: number,
  ): { branchIndex: number; options: ChoiceOption[] } | null {
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      const conditions = branch?.conditions ?? [];
      const allPass = conditions.every(cond => {
        if (!cond) return true;
        if (cond.type === 'conversation') {
          return typeof cond.convCount === 'number' ? turnCount >= cond.convCount : true;
        }
        if (cond.type === 'emotion') {
          const charId = cond.emotionChar;
          const code = cond.emotionCode as keyof EditorEmotions | undefined;
          if (typeof charId !== 'number' || !code) return false;
          const value = emotions?.[charId]?.[code] ?? 0;
          const threshold = cond.emotionValue ?? 0;
          if (cond.emotionDir === 'above') return value >= threshold;
          if (cond.emotionDir === 'below') return value <= threshold;
          if (cond.emotionDir === 'reach') return Math.abs(value - threshold) <= 2;
          return false;
        }
        // cache or unknown -> 현재는 무시
        return true;
      });
      if (allPass) {
        return { branchIndex: i, options: branch?.options ?? [] };
      }
    }
    return null;
  }
}

let _stateGraphInstance: StateGraph | null = null;
function getStateGraphInstance(): StateGraph {
  if (!_stateGraphInstance) _stateGraphInstance = new StateGraph();
  return _stateGraphInstance;
}
export const stateGraph = new Proxy({} as StateGraph, {
  get(_t, p) { return (getStateGraphInstance() as unknown as Record<string|symbol, unknown>)[p as string]; },
  set(_t, p, v) { (getStateGraphInstance() as unknown as Record<string|symbol, unknown>)[p as string] = v; return true; } });

