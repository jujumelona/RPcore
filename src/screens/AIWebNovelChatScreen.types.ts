export type WNFormStep = 'form' | 'paste';

export interface WNCharInput {
  name: string;
  age: string;
  gender: string;
  traits: string;
  personality: string;
}

export interface WNUserInput {
  name: string;
  age: string;
  gender: string;
  traits: string;
  description: string;
}

export interface WNFormData {
  title: string;
  genre: string;
  user: WNUserInput;
  charCount: string;
  chars: WNCharInput[];
  wordCount: string;
  tone: string;
  sourceText: string;   // 상황 설명 (채팅 내역 아님)
  extraStyles: string;
  description: string;  // 동반자 AI용 설명 (프롬프트에는 미포함, 저장 시만 사용)

  // ── 시리즈 모드 ──
  isSeries: boolean;
  seriesCount: string;  // 전체 화수 (예: "20")
  currentEpisode: number; // 현재 화수 (예: 1)
  seriesId: string;     // 시리즈 그룹 ID
}

export const DEFAULT_WN_FORM_DATA: WNFormData = {
  title: '',
  genre: '',
  user: { name: '', age: '', gender: '', traits: '', description: '' },
  charCount: '2',
  chars: [
    { name: '', age: '', gender: '', traits: '', personality: '' },
    { name: '', age: '', gender: '', traits: '', personality: '' },
  ],
  wordCount: '3000',
  tone: '',
  sourceText: '',
  extraStyles: '',
  description: '',

  isSeries: false,
  seriesCount: '1',
  currentEpisode: 1,
  seriesId: '' };
