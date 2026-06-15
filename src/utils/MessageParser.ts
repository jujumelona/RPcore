/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/MessageParser.ts
// AI 출력 파싱: "2:안녕 #미소# 반가워 *긴장*"

import { Message, MessagePart, EmotionChange } from '../types/Story';

export class MessageParser {
  /**
   * AI 출력 파싱
   * 
   * 예시:
   * "0:밤이 깊어간다. #달빛이 비친다# 고요하다."
   * "2:안녕하세요 #미소짓는다# 반가워요 *긴장된다*"
   * "@2: e1+3 | e4-2"
   * "@3: e1+1"
   */
  static parse(raw: string, messageId: string): Message {
    // 1. @감정 데이터 추출
    const emotions = this.extractEmotions(raw);
    
    // 2. @감정 제거
    const withoutEmotions = raw.replace(/@\d+:[^@\n]+/g, '').trim();
    
    // 3. 화자 추출
    const speakerMatch = withoutEmotions.match(/^(\d+):/);
    if (!speakerMatch) {
      // ✅ [FIX] 앱 터짐 방지 - 에러 대신 기본값 반환
      console.warn('[MessageParser] Invalid message format: missing speaker', raw);
      return {
        id: messageId,
        speaker: 0,
        content: raw,
        parts: [],
        emotions: [],
        timestamp: Date.now() };
    }
    
    const speaker = parseInt(speakerMatch[1], 10);
    const content = withoutEmotions.substring(speakerMatch[0].length).trim();
    
    // 4. 파싱
    const parts = this.parseContent(content, speaker);
    
    return {
      id: messageId,
      speaker,
      content,
      parts,
      emotions,
      timestamp: Date.now() };
  }
  
  /**
   * 컨텐츠 파싱: #행동# *속마음* 처리
   */
  private static parseContent(content: string, speaker: number): MessagePart[] {
    const parts: MessagePart[] = [];
    let current = '';
    let i = 0;
    
    // 나레이션(0)은 기본 회색
    const isNarrator = speaker === 0;
    
    while (i < content.length) {
      const char = content[i];
      
      // #행동# 처리
      if (char === '#') {
        // 이전 텍스트 저장
        if (current) {
          parts.push({
            type: 'text',
            content: current,
            color: isNarrator ? '#8A8A9E' : '#F0F0F5' });
          current = '';
        }
        
        // #...# 추출
        i++;
        let action = '';
        while (i < content.length && content[i] !== '#') {
          action += content[i];
          i++;
        }
        
        if (action) {
          parts.push({
            type: 'action',
            content: action,
            color: '#8A8A9E' });
        }
        
        i++; // # 건너뛰기
        continue;
      }
      
      // *속마음* 처리
      if (char === '*') {
        // 이전 텍스트 저장
        if (current) {
          parts.push({
            type: 'text',
            content: current,
            color: isNarrator ? '#8A8A9E' : '#F0F0F5' });
          current = '';
        }
        
        // *...* 추출
        i++;
        let thought = '';
        while (i < content.length && content[i] !== '*') {
          thought += content[i];
          i++;
        }
        
        if (thought) {
          parts.push({
            type: 'thought',
            content: `(${thought})`,
            color: '#797990' });
        }
        
        i++; // * 건너뛰기
        continue;
      }
      
      // 일반 텍스트
      current += char;
      i++;
    }
    
    // 마지막 텍스트 저장
    if (current) {
      parts.push({
        type: 'text',
        content: current,
        color: isNarrator ? '#8A8A9E' : '#F0F0F5' });
    }
    
    return parts;
  }
  
  /**
   * 감정 추출: "@2: e1+3 | e4-2"
   */
  private static extractEmotions(raw: string): EmotionChange[] {
    const emotions: EmotionChange[] = [];
    const regex = /@(\d+):\s*([^\n@]+)/g;
    let match;
    
    while ((match = regex.exec(raw)) !== null) {
      const characterId = parseInt(match[1], 10);
      const emotionStr = match[2].trim();
      
      // "e1+3 | e4-2" 파싱
      const changes: Record<string, number> = {};
      const emotionParts = emotionStr.split('|');
      
      for (const part of emotionParts) {
        const trimmed = part.trim();
        const emotionMatch = trimmed.match(/(e\d+)([+-]\d+)/);
        
        if (emotionMatch) {
          const code = emotionMatch[1];
          const value = parseInt(emotionMatch[2], 10);
          changes[code] = value;
        }
      }
      
      emotions.push({
        characterId,
        changes });
    }
    
    return emotions;
  }
  
  /**
   * 배치 파싱: 여러 메시지 한번에
   */
  static parseBatch(raw: string): Message[] {
    const messages: Message[] = [];
    const lines = raw.split('\n').filter(line => line.trim());
    
    let currentMessage = '';
    let messageCount = 0;
    
    for (const line of lines) {
      // 새 메시지 시작 (숫자:로 시작)
      if (/^\d+:/.test(line)) {
        // 이전 메시지 저장
        if (currentMessage) {
          try {
            const msg = this.parse(currentMessage, `msg_${messageCount++}`);
            messages.push(msg);
          } catch (e) {
            console.error('Parse error:', e);
          }
          currentMessage = '';
        }
        
        currentMessage = line;
      } else if (/^@\d+:/.test(line)) {
        // [BUG FIX #5] @감정 줄 처리 분기 추가
        // 기존: @로 시작하는 줄을 else 브랜치에서 currentMessage에 이어붙임.
        //   문제1: currentMessage='' 상태(첫 줄이 @감정인 경우)이면 '\n@...'가
        //          currentMessage가 되고, 다음 '2:내용'이 오면 이 currentMessage를
        //          parse() 시도 -> speakerMatch=null -> throw -> 감정 데이터 손실.
        //   문제2: currentMessage가 있으면 올바르게 이어붙어 처리되지만, 
        //          currentMessage='' 상태에서는 dangling @감정 줄이 됨.
        // 수정: @감정 줄은 currentMessage가 있으면 이어붙이고,
        //       없으면 무시(단독 @감정 줄은 파싱할 화자 없음).
        if (currentMessage) {
          currentMessage += '\n' + line;
        }
        // currentMessage가 빈 상태이면 독립 @감정 줄 -> 버림 (화자 없음)
      } else {
        // 계속 이어지는 내용
        // [BUG FIX] currentMessage가 빈 상태에서 '\n' + line이 되면
        // parse()에서 speakerMatch=null -> throw -> 해당 줄 무시됨.
        // 수정: currentMessage가 있을 때만 이어붙임.
        if (currentMessage) {
          currentMessage += '\n' + line;
        }
      }
    }
    
    // 마지막 메시지
    if (currentMessage) {
      try {
        const msg = this.parse(currentMessage, `msg_${messageCount++}`);
        messages.push(msg);
      } catch (e) {
        console.error('Parse error:', e);
      }
    }
    
    return messages;
  }
}

// ===== 토큰 카운터 =====

export class TokenCounter {
  /**
   * 대략적인 토큰 수 계산
   * (정확한 계산은 tokenizer 필요)
   *
   * ✅ [FIX] 숫자·특수문자·이모지 0 처리 버그 수정
   *    기존: 한글과 영어 단어만 계산 — 숫자(123), 특수문자(!@#|+-),
   *          이모지, 비영어 라틴(ñ, ä) 등은 전부 0으로 처리됨.
   *          감정 포맷(@2:e1+10|e4-5) 같은 패턴은 대부분 숫자·특수문자여서
   *          실제 소비 토큰보다 크게 낮게 계산 -> 챕터 전환이 늦게 트리거됨.
   *    수정:
   *      - 숫자 연속(123) -> 단어당 ~0.5 토큰 (BPE 숫자 분할)
   *      - 특수문자 각 1개 -> ~0.5 토큰 (구두점은 대부분 단독 토큰이나 보수적 추정)
   *      - 이모지 각 1개 -> 2 토큰 (유니코드 다중 코드포인트)
   *      - 비영어 라틴 단어 -> 영어와 동일하게 1.3 토큰/단어
   */
  static estimate(text: string): number {
    if (!text) return 0;

    // 한글: 글자 수 × 0.7 (SentencePiece는 보통 2~3 한글 자모를 1 토큰으로 묶음)
    const korean  = text.match(/[가-힣]/g)?.length ?? 0;

    // 영어 + 비영어 라틴 단어: 단어 수 × 1.3
    const words   = text.match(/[a-zA-ZÀ-ÖØ-öø-ÿ]+/g)?.length ?? 0;

    // 숫자 연속 그룹: 그룹 수 × 0.5 (BPE는 긴 숫자를 여러 토큰으로 나눔, 보수적 추정)
    const numbers = text.match(/\d+/g)?.length ?? 0;

    // 특수문자 각각: 개수 × 0.5 (구두점·연산자·파이프 등)
    const special = text.match(/[^\w\s가-힣À-ÖØ-öø-ÿ]/g)?.length ?? 0;

    // 이모지: 개수 × 2 (유니코드 surrogate pair / variation selector 포함)
    const emoji   = text.match(/\p{Emoji}/gu)?.length ?? 0;

    return Math.ceil(
      korean  * 0.7  +
      words   * 1.3  +
      numbers * 0.5  +
      special * 0.3  +
      emoji   * 2.0,
    );
  }

  /**
   * 메시지 배열의 토큰 수
   */
  static countMessages(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimate(msg.content);
    }
    return total;
  }
}
