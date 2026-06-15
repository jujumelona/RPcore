# 파일 명명 규칙 (File Naming Conventions)

## 1.基本原则 (Basic Principles)

### 1.1 단일 책임 원칙 (Single Responsibility Principle)
- **파일 하나 = 한 가지 기능** (One file = One responsibility)
- **파일당 100줄 이하 권장** (Recommended: Under 100 lines per file)
- 역할이 명확하면 조금 넘어갈 수 있으나, 수백 줄은 절대 금지

### 1.2 명명 규칙 (Naming Rules)
- **PascalCase**: 컴포넌트 파일 (`CharacterDetailScreen.tsx`)
- **camelCase**: 유틸리티 파일 (`apiService.ts`)
- **kebab-case**: 설정 파일 (`.env`, `package.json`)
- **snake_case**: 상수 파일 (`constants.ts`)

## 2.디렉토리 구조 (Directory Structure)

### 2.1 화면 컴포넌트 (Screen Components)
```
src/screens/
├── CharacterDetailScreen.tsx           # 메인 화면 (100줄 미만)
├── character-detail/                  # 하위 컴포넌트 폴더
│   ├── CharacterDetailHeader.tsx      # 헤더 컴포넌트
│   ├── CharacterGallery.tsx          # 갤러리 컴포넌트
│   ├── CharacterBasicInfo.tsx        # 기본 정보 컴포넌트
│   ├── CharacterDetails.tsx          # 상세 정보 컴포넌트
│   ├── CharacterImageModal.tsx       # 이미지 모달 컴포넌트
│   └── StartChatButton.tsx           # 대화 시작 버튼
```

### 2.2 로케일 파일 (Locale Files)
```
src/locales/
├── ko/                                # 한국어
│   ├── chat.json                     # 채팅 관련
│   ├── ui.json                       # UI/메뉴/버튼
│   ├── story.json                    # 스토리 관련
│   └── error.json                    # 에러 메시지
├── en/                                # 영어
│   ├── chat.json
│   ├── ui.json
│   ├── story.json
│   └── error.json
└── [13개국어 동일 구조]                # 15개국어 지원
```

## 3.컴포넌트 명명 규칙 (Component Naming)

### 3.1 화면 컴포넌트 (Screen Components)
- **형식**: `[기능명]Screen.tsx`
- **예시**: `CharacterDetailScreen.tsx`, `HomeScreen.tsx`, `ChatScreen.tsx`

### 3.2 하위 컴포넌트 (Sub-components)
- **형식**: `[부모명][기능명].tsx`
- **예시**: `CharacterDetailHeader.tsx`, `CharacterGallery.tsx`

### 3.3 공통 컴포넌트 (Common Components)
- **위치**: `src/components/`
- **형식**: `[기능명].tsx`
- **예시**: `Button.tsx`, `Modal.tsx`, `Toast.tsx`

## 4.로케일 파일 구조 (Locale File Structure)

### 4.1 계층 구조 (Hierarchical Structure)
```json
{
  "category": {
    "subcategory": {
      "key": "번역 텍스트"
    }
  }
}
```

### 4.2 역할별 분류 (Role-based Classification)
- **chat.json**: 채팅 로직/대사
  - `input`: 입력 관련
  - `actions`: 액션 관련
  - `status`: 상태 관련
  - `dialogue`: 대화 관련

- **ui.json**: 메뉴/버튼
  - `common`: 공통 UI
  - `navigation`: 네비게이션
  - `buttons`: 버튼
  - `menus`: 메뉴
  - `tabs`: 탭

### 4.3 인코딩 (Encoding)
- **모든 로케일 파일 UTF-8 인코딩**
- **BOM 없음 (No BOM)**

## 5.파일 크기 관리 (File Size Management)

### 5.1 모니터링 대상 (Files to Monitor)
- **100줄 초과**: 경고
- **200줄 초과**: 분리 필수
- **300줄 초과**: 즉시 분리

### 5.2 분리 기준 (Splitting Criteria)
1. **기능별 분리**: 다른 기능이 섞여 있으면 분리
2. **복잡도 분리**: 로직이 복잡하면 분리
3. **재사용성 분리**: 재사용 가능하면 분리
4. **테스트 용이성**: 테스트하기 어려우면 분리

## 6.예시 (Examples)

### 6.1 좋은 예시 (Good Examples)
```
✅ CharacterDetailScreen.tsx (95줄)
✅ CharacterDetailHeader.tsx (45줄)
✅ CharacterGallery.tsx (38줄)
✅ ko/chat.json (계층 구조)
✅ en/ui.json (역할별 분류)
```

### 6.2 나쁜 예시 (Bad Examples)
```
❌ CharacterDetailScreen.tsx (364줄)
❌ ChatScreen.tsx (2247줄)
❌ ko/chat.json (평탄 구조)
❌ mixed-functionality.tsx (여러 기능 혼합)
```

## 7.체크리스트 (Checklist)

### 7.1 파일 생성 전 (Before Creating File)
- [ ] 단일 책임을 가지고 있는가?
- [ ] 100줄 이하로 유지할 수 있는가?
- [ ] 명명 규칙을 따르는가?
- [ ] 적절한 위치에 생성하는가?

### 7.2 파일 생성 후 (After Creating File)
- [ ] 파일 크기가 100줄 이하인가?
- [ ] 다른 파일과 중복이 없는가?
- [ ] 테스트가 용이한가?
- [ ] 재사용성이 고려되었는가?

---

**참고**: 이 규칙은 프로젝트의 유지보수성과 개발 효율성을 위해 만들어졌습니다. 모든 개발자가 이 규칙을 따라야 합니다.
