# Local LLM 학습 기록

## 목표

현재 `chat-ai-agent` 프로젝트에 Local LLM을 연결하고 다음 항목을 직접 학습한다.

* Local LLM 실행 구조
* Ollama
* Tool Calling
* Structured Output
* LangChain / LangGraph 연동
* Cloud LLM과 Local LLM 비교
* GGUF / Quantization
* llama.cpp
* vLLM
* Local LLM 운영 방식

---

## 1. 개발 PC 환경

### GPU

```text
NVIDIA GeForce RTX 4060 Ti
VRAM: 8188 MiB
```

### RAM

```text
31.6 GB
```

### CPU

```text
AMD Ryzen 5 7500F 6-Core Processor
```

### NVIDIA 환경

```text
Driver Version: 591.86
CUDA Version: 13.1
```

---

## 2. 첫 Local LLM 선정

첫 실습 모델:

```text
qwen3.5:4b
```

선정 이유:

* RTX 4060 Ti 8GB에서 실행하기 적절한 크기
* Tool Calling 실습 가능
* 작은 모델을 Agent에 적용하는 학습 목적에 적합
* 이후 더 큰 모델과 품질/성능 비교 가능

---

## 3. Ollama

로컬 LLM 실행 도구로 Ollama를 사용한다.

로그인 없이 로컬 모델만 사용한다.

### 모델 다운로드

```powershell
ollama pull qwen3.5:4b
```

### 모델 실행

```powershell
ollama run qwen3.5:4b
```

### 실행 상태 확인

```powershell
ollama ps
```

확인 결과:

```text
NAME          qwen3.5:4b
SIZE          3.1 GB
PROCESSOR     100% GPU
CONTEXT       4096
```

### 현재 상태

* 모델 정상 실행
* RTX 4060 Ti에서 100% GPU 사용
* CPU offload 없음
* Context size: 4096
* Ollama Local API 사용 가능

---

## 4. 다음 실습

### Ollama API Tool Calling

목표:

사용자의 자연어 요청을 Local LLM에 전달하고 모델이 적절한 Tool과 arguments를 생성하는지 확인한다.

예시 요청:

```text
오늘 점심으로 12000원을 썼어. 지출을 기록해줘.
```

기대 Tool:

```text
create_expense
```

기대 arguments:

```json
{
  "amount": 12000,
  "category": "식비",
  "title": "점심"
}
```

이 단계에서는 실제 DB mutation을 수행하지 않는다.

검증 범위:

```text
사용자 요청
→ qwen3.5:4b
→ Tool 선택
→ arguments 생성
```
## 5. Ollama Tool Calling 테스트

실행 파일:

```text
apps/api/scripts/local-llm-tool-call.ts
```

실행:

```powershell
pnpm --filter api local:tool-call
```

사용 모델:

```text
qwen3.5:4b
```

사용자 입력:

```text
오늘 점심으로 12000원을 썼어. 지출을 기록해줘.
```

실행 결과:

```text
{
  role: 'assistant',
  content: '',
  tool_calls: [
    {
      id: 'call_ith5lrc1',
      function: {
        index: 0,
        name: 'create_expense',
        arguments: {
          amount: 12000,
          category: '음식',
          title: '오늘 점심'
        }
      }
    }
  ]
}
```

### 확인 결과

Local LLM이 다음 작업을 정상적으로 수행했다.

```text
자연어 요청 이해
→ create_expense Tool 선택
→ Tool arguments 생성
```

실제 Tool 함수나 DB는 연결하지 않았으므로 데이터 mutation은 발생하지 않았다.

Tool Calling 테스트 성공.

---

## 6. Ollama Structured Output 테스트

실행 파일:

```text
apps/api/scripts/local-llm-structured-output.ts
```

실행:

```powershell
pnpm --filter api local:structured-output
```

사용자 입력:

```text
오늘 점심으로 12000원을 썼어. 지출 정보를 구조화해서 반환해줘.
```

LLM Raw Response:

```json
{
  "amount": 12000,
  "category": "음식",
  "title": "점심"
}
```

Zod Validation 결과:

```text
{
  amount: 12000,
  category: '음식',
  title: '점심'
}
```

### 확인 결과

다음 흐름이 정상 동작했다.

```text
자연어 입력
→ qwen3.5:4b
→ JSON Schema 기반 Structured Output
→ JSON.parse
→ Zod validation
→ TypeScript 객체
```

Structured Output 테스트 성공.

---

## 7. 현재 Local LLM 검증 상태

```text
Ollama 설치              ✅
qwen3.5:4b 다운로드      ✅
RTX 4060 Ti GPU 실행     ✅
100% GPU offload         ✅
Ollama Local API         ✅
Tool Calling             ✅
Tool arguments 생성      ✅
Structured Output        ✅
Zod validation           ✅
```

다음 단계:

```text
@langchain/ollama
→ ChatOllama 직접 호출
→ bindTools() 검증
→ 기존 ToolCallingChatModel 타입 호환 확인
→ LlmModelFactory에 local provider 연결
```
