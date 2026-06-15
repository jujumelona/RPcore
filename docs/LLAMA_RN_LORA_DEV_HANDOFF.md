# llama.rn LoRA 개발자 전달 메모

## 목적

`llama.rn`에 있는 LoRA 기능을 Android에서 실제로 안정적으로 쓰기 위한 변경 사항을 정리한다.

이 문서는 "LoRA가 아예 없는가?"가 아니라, "지금 코드로 실제 써도 되는가? 어디를 어떻게 고쳐야 안전한가?"에 대한 전달용 메모다.

## 현재 결론

현재 워크스페이스의 `llama.rn@0.11.5`는 LoRA API가 **겉만 있는 상태는 아님**.
TypeScript -> JSI -> C++ 네이티브 경로가 실제로 연결되어 있다.

즉, Android 기준으로 **기능 자체는 가능**하다.

다만 그대로 쓰면 아래 2가지 문제가 있다.

1. `initLlama({ lora / lora_list })` 경로에서 LoRA가 **중복 로드될 가능성**
2. runtime hot-swap(`applyLoraAdapters`)를 여러 번 하면 **이전 adapter 메모리가 context release 전까지 누적될 가능성**

그래서 "바로 제품 수준으로 사용 가능"은 아니고, **작은 패치 후 사용 권장** 상태로 보는 게 맞다.

## 확인한 근거

### LoRA 노출은 실제로 있음

- TS init params
  - `node_modules/llama.rn/src/types.ts`
  - `lora`, `lora_scaled`, `lora_list` 존재
- TS runtime methods
  - `node_modules/llama.rn/src/index.ts`
  - `applyLoraAdapters()`
  - `removeLoraAdapters()`
  - `getLoadedLoraAdapters()`
- init params -> native parsing
  - `node_modules/llama.rn/cpp/jsi/JSIParams.cpp`
- JSI 함수 등록
  - `node_modules/llama.rn/cpp/jsi/RNLlamaJSI.cpp`
- native adapter 적용/제거
  - `node_modules/llama.rn/cpp/rn-llama.cpp`

### 문제 1. init 시 중복 적용 가능성

`common_init_from_params()` 쪽에서 이미 `params.lora_adapters`를 로드/적용한다.

- `node_modules/llama.rn/cpp/common/common.cpp`
  - `llama_adapter_lora_init(model, la.path.c_str())`
  - `common_set_adapter_lora(lctx, params.lora_adapters)`

그런데 context 생성 직후 JSI에서 다시 아래를 호출한다.

- `node_modules/llama.rn/cpp/jsi/RNLlamaJSI.cpp`
  - `ctx->applyLoraAdapters(ctx->params.lora_adapters)`

즉 init 시점의 LoRA는 현재 코드상 **두 번 로드/적용될 여지**가 있다.

### 문제 2. hot-swap 시 메모리 누적 가능성

runtime apply 구현은 새 adapter를 로드해서 `this->lora`에 넣고 활성화한다.

- `node_modules/llama.rn/cpp/rn-llama.cpp`
  - `la.ptr = llama_adapter_lora_init(model, la.path.c_str())`
  - `this->lora = lora`
  - `common_set_adapter_lora(ctx, lora)`

remove는 활성 목록만 비운다.

- `node_modules/llama.rn/cpp/rn-llama.cpp`
  - `this->lora.clear()`
  - `common_set_adapter_lora(ctx, this->lora)`

문제는 이전 adapter ptr를 명시적으로 정리하는 코드가 없다.
모델 destructor 시점에는 정리되지만, context가 오래 살아있는 동안에는 누적될 가능성이 높다.

## 매우 중요한 점: Android는 기본값이 prebuilt lib 사용

현재 `llama.rn` Android는 기본적으로 prebuilt `librnllama*.so`를 쓴다.

- `node_modules/llama.rn/README.md`
  - Android 기본은 pre-built libraries
- `node_modules/llama.rn/android/build.gradle`
  - `rnllamaBuildFromSource` 기본값은 `false`

즉 `node_modules/llama.rn/cpp/*.cpp`만 수정해도,
프로젝트가 `rnllamaBuildFromSource=true`가 아니면
실제 앱 런타임에 반영되지 않을 수 있다.

## 개발자에게 전달할 변경 요청

### A. 최소 필수 수정

#### 1. init 시 중복 LoRA 적용 제거

파일:

- `node_modules/llama.rn/cpp/jsi/RNLlamaJSI.cpp`

현재:

```cpp
if (!ctx->params.lora_adapters.empty()) {
    int lora_result = ctx->applyLoraAdapters(ctx->params.lora_adapters);
    if (lora_result != 0) {
        delete ctx;
        throw std::runtime_error("Failed to apply lora adapters");
    }
}
```

권장 변경:

- 이 블록을 제거
- 이유:
  - `common_init_from_params()`가 이미 init-time LoRA를 처리하고 있음
  - 중복 로드/중복 메모리 사용 가능성 제거

대안:

- `lora_init_without_apply = true`를 명시하고 JSI 쪽 apply만 남기는 방식도 가능
- 하지만 현재 구조상 **JSI 재적용 제거**가 더 단순하고 안전함

#### 2. runtime replace/remove 시 이전 adapter 정리 로직 추가

파일:

- `node_modules/llama.rn/cpp/rn-llama.h`
- `node_modules/llama.rn/cpp/rn-llama.cpp`

필요한 작업:

- 기존 `this->lora`에 들어 있던 adapter ptr들을 안전하게 해제하는 helper 추가
- 새 adapter 적용 전, 이전 adapter를 context에서 분리한 뒤 free
- remove 시에도 동일하게 free
- destructor에서도 안전하게 cleanup

권장 흐름:

1. `common_set_adapter_lora(ctx, empty_list)`로 context에서 adapter detach
2. 기존 `this->lora` 순회
3. `model->loras`에서 ptr 제거
4. `delete la.ptr`
5. `this->lora.clear()`

주의:

- model destructor도 lora를 정리하므로, 직접 delete할 경우 **반드시** `model->loras`에서도 제거해야 double free를 피할 수 있음

### B. Android에서 실제 반영되게 하는 방법

둘 중 하나를 선택해야 한다.

#### 옵션 1. 빠른 로컬 검증용

- `android/gradle.properties`에 아래 추가

```properties
rnllamaBuildFromSource=true
```

- 그 후 Android rebuild

의미:

- `llama.rn` core를 source build 하게 만들어서
  `cpp/rn-llama.cpp`, `cpp/jsi/RNLlamaJSI.cpp` 수정이 실제 앱에 반영되게 함

장점:

- 가장 빨리 검증 가능

단점:

- 빌드 시간 증가
- 팀/CI 환경에서 native build 안정화 필요

#### 옵션 2. 장기적으로 깔끔한 방식

- `llama.rn`를 fork해서 패치
- Android prebuilt `.so`까지 다시 생성
- 내부 패키지 또는 고정 버전으로 배포

장점:

- 팀 전체 동일 바이너리 사용 가능

단점:

- 패키지 유지보수 비용 증가

## 앱 레이어 권장 사용 방식

패치 전 임시 운영 방식:

- `initLlama()`에는 LoRA를 넣지 말고
- context 생성 후 `applyLoraAdapters()` 1회 적용
- adapter를 자주 갈아끼워야 하면 context를 새로 만드는 쪽 권장

이유:

- init 경로 중복 로드 회피
- 장시간 hot-swap 누적 메모리 위험 완화

## 검증 시나리오

Android만 보면 됨. iOS는 이번 범위에서 제외 가능.

### 1. 기본 동작 확인

- base model만 로드
- 짧은 프롬프트 1회 실행

### 2. LoRA 적용 확인

- 같은 프롬프트로 `applyLoraAdapters([{ path, scaled: 1.0 }])`
- 출력 스타일/응답이 달라지는지 확인
- `getLoadedLoraAdapters()` 결과 확인

### 3. 제거 확인

- `removeLoraAdapters()`
- 다시 같은 프롬프트 실행
- 출력이 base model 쪽으로 돌아오는지 확인

### 4. swap 확인

- adapter A 적용
- adapter B 적용
- adapter 제거
- 각 단계에서 크래시/메모리 급증 여부 확인

### 5. busy 상태 보호 확인

- completion 진행 중 `applyLoraAdapters()` 호출
- native에서 `Context is busy`로 막히는지 확인

## 추천 우선순위

1. `RNLlamaJSI.cpp`에서 init-time 재적용 제거
2. `rn-llama.cpp`에 old adapter cleanup 추가
3. Android에서 `rnllamaBuildFromSource=true`로 먼저 로컬 검증
4. 문제 없으면 fork/package 반영 여부 결정

## 이 저장소에서 이미 해둔 것

앱 타입 레이어에는 LoRA 관련 타입을 추가해둠:

- `src/types/llama.types.ts`
  - `LlamaLoraAdapter`
  - `applyLoraAdapters()`
  - `removeLoraAdapters()`
  - `getLoadedLoraAdapters()`
  - `lora`, `lora_scaled`, `lora_list`

이건 앱 코드에서 `any` 없이 LoRA API를 잡기 위한 보조 작업이고,
실제 네이티브 안정성 패치는 아직 개발자 쪽 native 수정이 필요함.

## 마지막 한 줄 요약

`llama.rn`의 Android LoRA는 "없는 기능"이 아니라 **이미 연결돼 있는 기능**이다.
하지만 제품 수준으로 쓰려면:

- init-time 중복 적용 제거
- runtime swap 시 old adapter cleanup 추가
- 그리고 Android에서 prebuilt 대신 source build 또는 patched package 반영

이 3가지를 개발자가 처리해야 한다.
