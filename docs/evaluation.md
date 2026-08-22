# RAG Evaluation

## Overview

RAG 검색 품질을 감으로 판단하지 않고,
고정된 평가 데이터셋을 기반으로 다음 세 단계를 분리해 측정했다.

1. Semantic-only Retrieval
2. Manual Hybrid Retrieval
3. Actual Agent Hybrid Retrieval

최종 답변에 대해서는 별도로:

- Faithfulness
- Answer Relevance
- Unanswerable Handling

을 평가한다.

## Dataset

총 18개 케이스로 구성했다.

- 검색 개념 질의
- AI Agent 신뢰성/승인 질의
- Queue/복구 질의
- RAG 평가 지표 질의
- 일반 도메인 문서 질의
- Hard Negative
- Unanswerable
- 완전 Negative

## Retrieval Results

| Evaluation | Result |
| --- | ---: |
| Semantic-only Hit Rate@5 | 52.9% |
| Semantic-only MRR@5 | 0.529 |
| Manual Hybrid Hit Rate@5 | 82.4% |
| Manual Hybrid MRR@5 | 0.794 |
| Actual Agent Citation Hit Rate | 94.1% |
| Negative Accuracy | 100% |
| Completion Rate | 100% |

> Semantic/Manual Retrieval의 Hit Rate@5와
> Actual Agent의 Citation Hit Rate는 동일한 metric이 아니다.
> Actual Agent 평가는 Supervisor, Query Expansion,
> Hybrid Retrieval, Context Selection 이후 최종 citation을 기준으로 측정한다.

## Answer Evaluation

Actual Agent 실행 결과를 JSON artifact로 저장한 뒤,
동일한 Agent 호출을 반복하지 않고 저장된 답변과 citation 원문을
LLM Judge에 전달해 답변 품질을 평가했다.

| Metric | Result |
| --- | ---: |
| Faithfulness | 100% (15/15) |
| Answer Relevance | 100% (17/17) |
| Unanswerable Handling | 100% (2/2) |
| End-to-End Case Success | 94.4% (17/18) |

Retrieval에 실패한 케이스는 Answer Judge에서 제외해
검색 실패와 답변 생성 실패를 분리했다.

## Findings

### Hybrid Retrieval improvement

Semantic-only Retrieval 대비
lexical search와 RRF를 결합한 Hybrid Retrieval에서
검색 성공률이 크게 개선됐다.

특히 semantic similarity threshold 아래의 문서도
lexical match가 존재하면 검색 결과로 복구할 수 있었다.

### Query Expansion trade-off

LLM 기반 lexical query expansion은
표현 변형과 기술 용어 검색에 도움이 되었지만,
생성된 검색어가 길어질 경우 PostgreSQL FTS의 AND 조건으로 인해
recall이 낮아지는 비결정적 실패도 확인했다.

최종 평가에서는 `stale-approval` 케이스가 이에 해당했다.

### Grounded failure behavior

검색 근거를 찾지 못한 경우
일반 지식으로 답변을 생성하지 않고
근거 부족 응답으로 종료하도록 RAG Tool 실행 경로를 통제했다.

### Unanswerable handling

관련 문서를 검색했다고 해서
항상 질문에 답할 수 있다고 판단하지 않는다.

관련 문서에는 접근했지만 질문의 구체적인 답이 없는 케이스와,
관련 문서 자체가 없는 Negative 케이스를 구분해 평가했다.

## Evaluation Isolation

평가 재현성을 위해 benchmark 실행에서는
사용자 장기 메모리 검색 및 비동기 메모리 추출을 비활성화했다.

또한 특정 case만 선택 실행할 수 있도록 구성해
LLM API 비용과 반복 실행 비용을 줄였다.

Agent 실행 결과는 JSON으로 저장하고,
Answer Evaluation에서는 해당 결과를 재사용한다.