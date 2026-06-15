// src/components/messageBubble/components/SegmentedText.tsx
import { Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { s } from '../styles';
import type { ContentPart } from '../../../utils/chatParsers';

interface SegmentRenderProps {
  parts: ContentPart[];
  isUser: boolean;
  fontSize: number;
  isStreaming?: boolean;
}

export function SegmentedText({ parts, isUser, fontSize, isStreaming }: SegmentRenderProps) {
  const lineH = fontSize * 1.6; // 1.65 → 1.6: 살짝 타이트하게

  return (
    <Text>
      {parts.map((part, idx) => {
        const isLastSegment = isStreaming && idx === parts.length - 1;

        switch (part.type) {
          case 'action':
            return (
              <Text key={idx} style={[s.segAction, { fontSize: fontSize * 0.875, lineHeight: lineH * 0.9 }]}>
                {'\n'}{part.text}{'\n'}
              </Text>
            );
          case 'thought':
            return (
              <Text key={idx} style={[s.segThought, { fontSize: fontSize * 0.875, lineHeight: lineH * 0.9 }]}>
                {' ('}
                {part.text}
                {') '}
              </Text>
            );
          default:
            return isLastSegment ? (
              <Animated.Text key={idx} style={[s.segText, isUser && s.segTextUser, { fontSize, lineHeight: lineH }]}>
                {part.text}
              </Animated.Text>
            ) : (
              <Text key={idx} style={[s.segText, isUser && s.segTextUser, { fontSize, lineHeight: lineH }]}>
                {part.text}
              </Text>
            );
        }
      })}
    </Text>
  );
}
