/**
 * src/types/navigation.patch.ts
 * AppNavigator에 CharacterList 화면 추가를 위한 타입 패치
 *
 * 사용법:
 *   기존 navigation.ts의 RootStackParamList에 아래 항목 추가:
 *
 *   CharacterList: {
 *     storyId?: string;
 *     storyTitle?: string;
 *     initialGenre?: string;
 *   } | undefined;
 *
 * AppNavigator.tsx에 추가할 코드:
 *
 *   import { CharacterListScreen } from '../screens/characters';
 *
 *   // Stack.Navigator 내부에 추가:
 *   <Stack.Screen
 *     name="CharacterList"
 *     component={CharacterListScreen}
 *     options={{ headerShown: false, animation: 'slide_from_right' }}
 *   />
 */

export type CharacterListParams = {
  storyId?: string;
  storyTitle?: string;
  initialGenre?: string;
};
