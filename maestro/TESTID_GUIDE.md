/**
 * maestro/TESTID_GUIDE.md 에 넣을 내용이지만 코드 패치로 바로 적용 가능한 형태로 작성.
 *
 * Maestro는 testID 또는 accessibilityLabel로 요소를 찾습니다.
 * 아래 패치들을 각 파일에 적용하면 flows/02_chat_flow.yaml 이 정확히 동작합니다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. AIStoryChatScreen.tsx — 채팅 입력창 + 전송 버튼
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Before:
 *   <TextInput
 *     value={inputText}
 *     onChangeText={setInputText}
 *     placeholder="메시지를 입력하세요"
 *   />
 *   <TouchableOpacity onPress={handleSend}>
 *     <SendIcon />
 *   </TouchableOpacity>
 *
 * After:
 *   <TextInput
 *     testID="chat-input"
 *     accessibilityLabel="chat-input"
 *     value={inputText}
 *     onChangeText={setInputText}
 *     placeholder="메시지를 입력하세요"
 *   />
 *   <TouchableOpacity
 *     testID="chat-send-button"
 *     accessibilityLabel="chat-send-button"
 *     onPress={handleSend}
 *   >
 *     <SendIcon />
 *   </TouchableOpacity>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. AIStoryChatScreen.tsx — AI 메시지 버블
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Before:
 *   messages.map((msg, idx) => (
 *     <MessageBubble key={msg.id} message={msg} />
 *   ))
 *
 * After:
 *   messages.map((msg, idx) => (
 *     <MessageBubble
 *       key={msg.id}
 *       message={msg}
 *       testID={msg.speaker !== 1 ? `chat-message-ai-${idx}` : `chat-message-user-${idx}`}
 *     />
 *   ))
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 3. ConversationsScreen.tsx — 스토리 목록 아이템
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Before:
 *   <TouchableOpacity onPress={() => navigate(story.id)}>
 *     <StoryCard story={story} />
 *   </TouchableOpacity>
 *
 * After:
 *   <TouchableOpacity
 *     testID={`story-list-item-${index}`}
 *     accessibilityLabel={`story-list-item-${index}`}
 *     onPress={() => navigate(story.id)}
 *   >
 *     <StoryCard story={story} />
 *   </TouchableOpacity>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 4. 챕터 전환 버튼 (AIStoryChatScreen 또는 ChapterTransitionModal)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Before:
 *   <TouchableOpacity onPress={handleNextChapter}>
 *     <Text>다음 챕터</Text>
 *   </TouchableOpacity>
 *
 * After:
 *   <TouchableOpacity
 *     testID="chapter-next-button"
 *     accessibilityLabel="chapter-next-button"
 *     onPress={handleNextChapter}
 *   >
 *     <Text>다음 챕터</Text>
 *   </TouchableOpacity>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTE: testID는 React Native에서 Android의 resource-id,
 *       iOS의 accessibilityIdentifier로 매핑됩니다.
 *       프로덕션 빌드에서도 남아있어도 성능 영향 없습니다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {}; // TypeScript 모듈로 인식되도록
