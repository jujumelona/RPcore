import { View, Text } from 'react-native';
import { s } from '../styles';
import type { ContentPart } from '../../../utils/chatParsers';
interface NarratorSegmentProps {
  parts: ContentPart[];
  fontSize: number;
  isScene?: boolean;
}
export function NarratorSegmentedText({ parts, fontSize, isScene }: NarratorSegmentProps) {
  return (
    <View style={s.narratorContainer}>
      <View style={s.narratorWrap}>
        {isScene ? (
          <View style={s.narratorSceneWrap}>
            <View style={s.narratorDivider} />
            <View style={s.narratorDivider} />
          </View>
        ) : null}
        <Text>
          {parts.map((part, idx) =>
            part.type === 'action' ? (
              <Text key={idx} style={[s.narratorActionSeg, { fontSize: fontSize * 0.85 }]}>
                {part.text}
              </Text>
            ) : (
              <Text key={idx} style={[s.narratorText, { fontSize: fontSize * 0.875 }]}>
                {part.text}
              </Text>
            ),
          )}
        </Text>
      </View>
    </View>
  );
}