/* eslint-disable @typescript-eslint/no-unused-vars */
import { nanoid } from 'nanoid/non-secure';

import type {
  ChatMessage,
  ChoiceOption,
  MessageFilter,
  MessageSearch,
  MessageSearchResult,
  MessageSort,
  MessageValidation,
  MessageValidationError,
  MessageValidationWarning } from '../types/ChatMessageTypes';
import type { EditorEmotions } from '../../../types/StoryContract';

export function createMessage(
  role: ChatMessage['role'],
  content: string,
  options: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: nanoid(),
    role,
    content,
    timestamp: Date.now(),
    bookmarked: false,
    isStreaming: false,
    ...options };
}

export function createUserMessage(
  content: string,
  options: Partial<ChatMessage> = {},
): ChatMessage {
  return createMessage('user', content, options);
}

export function createAIMessage(
  content: string,
  characterId?: string,
  characterName?: string,
  options: Partial<ChatMessage> = {},
): ChatMessage {
  return createMessage('ai', content, {
    characterId,
    characterName,
    ...options });
}

export function createNarratorMessage(
  content: string,
  options: Partial<ChatMessage> = {},
): ChatMessage {
  return createMessage('narrator', content, options);
}

export function validateMessage(message: ChatMessage): MessageValidation {
  const errors: MessageValidationError[] = [];
  const warnings: MessageValidationWarning[] = [];

  if (!message.id?.trim()) {
    errors.push({
      field: 'id',
      message: 'Message id is required.',
      code: 'REQUIRED_ID' });
  }

  if (!message.role) {
    errors.push({
      field: 'role',
      message: 'Message role is required.',
      code: 'REQUIRED_ROLE' });
  }

  if (!message.content?.trim()) {
    errors.push({
      field: 'content',
      message: 'Message content is required.',
      code: 'REQUIRED_CONTENT' });
  }

  if (message.content && message.content.length > 10000) {
    warnings.push({
      field: 'content',
      message: 'Message content is very long (over 10,000 characters).',
      code: 'CONTENT_TOO_LONG' });
  }

  if (message.role === 'ai' && !message.characterId) {
    warnings.push({
      field: 'characterId',
      message: 'AI messages should include a character id.',
      code: 'AI_NO_CHARACTER' });
  }

  if (message.role === 'narrator' && message.characterId) {
    warnings.push({
      field: 'characterId',
      message: 'Narrator messages should not include a character id.',
      code: 'NARRATOR_WITH_CHARACTER' });
  }

  if (!message.timestamp || message.timestamp <= 0) {
    errors.push({
      field: 'timestamp',
      message: 'A valid timestamp is required.',
      code: 'INVALID_TIMESTAMP' });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings };
}

export function filterMessages(messages: ChatMessage[], filter: MessageFilter): ChatMessage[] {
  return messages.filter((message) => {
    if (filter.role && !filter.role.includes(message.role)) {
      return false;
    }

    // [BUG FIX] characterId 필터: message.characterId가 없는 경우도 처리
    // 기존: `filter.characterId && message.characterId && !filter.characterId.includes(message.characterId)`
    //   → message.characterId가 없으면(narrator/user) 필터를 통과해버림
    //   → characterId로 특정 캐릭터만 필터링해도 narrator/user 메시지가 항상 포함됨
    // 수정: filter.characterId가 있을 때 message.characterId가 없으면 제외
    if (filter.characterId) {
      if (!message.characterId || !filter.characterId.includes(message.characterId)) {
        return false;
      }
    }

    if (
      (filter as any).bookmarked !== undefined
      && (message as any).bookmarked !== (filter as any).bookmarked
    ) {
      return false;
    }

    if (filter.hasChoices !== undefined) {
      const hasChoices = Boolean(message.choices?.length);
      if (hasChoices !== filter.hasChoices) {
        return false;
      }
    }

    if (filter.timeRange) {
      const { start, end } = filter.timeRange;
      const timestamp = message.timestamp ?? 0;
      if (timestamp < start || timestamp > end) {
        return false;
      }
    }

    if (
      filter.chapterId
      && message.metadata?.chapterId
      && !filter.chapterId.includes(message.metadata.chapterId)
    ) {
      return false;
    }

    if (filter.turnRange && message.metadata?.turnNumber !== undefined) {
      const { start, end } = filter.turnRange;
      if (message.metadata.turnNumber < start || message.metadata.turnNumber > end) {
        return false;
      }
    }

    return true;
  });
}

export function sortMessages(messages: ChatMessage[], sort: MessageSort): ChatMessage[] {
  const sorted = [...messages];

  sorted.sort((a, b) => {
    let aValue: number | string = '';
    let bValue: number | string = '';

    switch (sort.field) {
      case 'timestamp':
        aValue = a.timestamp ?? 0;
        bValue = b.timestamp ?? 0;
        break;
      case 'turnNumber':
        aValue = a.metadata?.turnNumber ?? 0;
        bValue = b.metadata?.turnNumber ?? 0;
        break;
      case 'characterId':
        aValue = a.characterId ?? '';
        bValue = b.characterId ?? '';
        break;
      default:
        return 0;
    }

    if (aValue < bValue) {
      return sort.order === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sort.order === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return sorted;
}

export function searchMessages(
  messages: ChatMessage[],
  search: MessageSearch,
): MessageSearchResult {
  let filteredMessages = messages;

  if (search.filter) {
    filteredMessages = filterMessages(filteredMessages, search.filter);
  }

  if (search.query.trim()) {
    const query = search.query.toLowerCase();
    filteredMessages = filteredMessages.filter((message) => (
      message.content.toLowerCase().includes(query)
      || message.characterName?.toLowerCase().includes(query)
    ));
  }

  if (search.sort) {
    filteredMessages = sortMessages(filteredMessages, search.sort);
  }

  const totalCount = filteredMessages.length;
  const offset = search.offset ?? 0;
  const limit = search.limit ?? totalCount;
  const paginatedMessages = filteredMessages.slice(offset, offset + limit);

  return {
    messages: paginatedMessages,
    totalCount,
    hasMore: offset + limit < totalCount,
    query: search.query };
}

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export function formatMessageContent(content: string, maxLength = 500): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, maxLength)}...`;
}

export function createChoiceOption(
  label: string,
  targetChapterId?: string,
  options: Partial<ChoiceOption> = {},
): ChoiceOption {
  return {
    id: nanoid(),
    label,
    targetChapterId,
    isEnding: false,
    isSelected: false,
    ...options };
}
