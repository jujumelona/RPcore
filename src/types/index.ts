// src/types/index.ts
export interface Character {
  id: string;
  name: string;
  age: number;
  personality: string;
  appearance: string;
  imageUrl?: string;
}

export interface Story {
  id: string;
  title: string;
  description: string;
  author: string;
  rating: number;
  thumbnailUrl?: string;
  characters: Character[];
  tags: string[];
}

export interface Message {
  id: string;
  speakerId: string;
  speakerType: 'user' | 'character' | 'narrator';
  content: string;
  timestamp: number;
  emotion?: string;
}

export interface Conversation {
  id: string;
  storyId: string;
  characterId: string;
  messages: Message[];
  lastMessageAt: number;
}

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl?: string;
  level: number;
  exp: number;
}
