# Chat AI Agent

<p align="center">
  <strong>NestJS · React · LangGraph 기반 개인 관리 AI Agent</strong>
</p>

<p align="center">
자연어 지출·일정 관리, Supervisor 기반 도메인 분리, 사용자 승인,
장기 메모리, Hybrid RAG, Python MCP 분석을 구현한 풀스택 AI Agent 서비스입니다.
</p>

<p align="center">
  <a href="https://www.woohyuk.dev"><strong>Live Demo</strong></a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-1C3C3C?style=flat-square" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img alt="Redis" src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img alt="AWS" src="https://img.shields.io/badge/AWS-232F3E?style=flat-square&logo=amazonaws&logoColor=white" />
  <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white" />
</p>

---

## 프로젝트 소개

`Chat AI Agent`는 단순 질의응답 챗봇이 아니라, 대화 문맥을 바탕으로 실제 Tool을 실행하는
개인 관리 AI Agent입니다.

Supervisor가 요청을 지출, 일정, 장기 메모리, RAG, 일반 대화 도메인으로 분리하고,
여러 도메인이 포함된 요청은 독립적인 작업으로 나누어 각 Agent에 전달합니다.

사용자는 자연어로 지출과 일정을 등록·조회·수정·삭제할 수 있습니다.
수정·삭제처럼 중요한 데이터 변경은 LangGraph의 `interrupt/resume`으로 승인을 받은 뒤 실행하며,
중복 승인과 서버 재시작에도 안전하게 이어지도록 상태를 PostgreSQL과 Redis에 관리합니다.

업로드한 문서는 `pgvector` 벡터 검색과 PostgreSQL Full Text Search를
RRF로 결합한 하이브리드 검색으로 조회하고 답변에 출처를 함께 표시합니다.
사용자 선호·목표·제약은 장기 메모리로 추출해 이후 대화에 활용합니다.

Python MCP Server를 별도 분석 서비스로 구성하고 NestJS/LangGraph Agent와 연결했습니다.
Agent는 기존 TypeScript Tool과 Python MCP Tool을 함께 선택할 수 있으며, 현재는 지출 데이터를
전달해 IQR 기반 금액 이상치 후보를 분석합니다.

---

## 핵심 기능

### AI 채팅

- Socket.IO 기반 실시간 스트리밍 응답
- 채팅방 생성·수정·삭제 및 메시지 페이지네이션
- 응답 생성 중지, 실패 처리, 재연결 후 채팅방 자동 재입장
- 대화 요약과 최근 메시지를 결합한 문맥 관리

### Supervisor 기반 도메인 분리

- Supervisor가 사용자 요청을 `expense`, `schedule`, `memory`, `rag`, `general` 도메인으로 분류
- 하나의 요청에 여러 도메인 작업이 포함되면 독립적인 assignment로 분리
- 각 Domain Agent에는 현재 담당 작업만 전달하여 이전 요청의 재실행 방지
- 수정·삭제 후보가 여러 개인 경우 임의로 하나를 선택하지 않도록 Graph 레벨에서 차단
- 사용자가 선택한 후보 ID와 다중 대상 의도를 구조화된 상태로 관리

### 지출 관리 Agent

- 자연어 기반 지출 등록·목록·요약·검색·수정·삭제
- 수정·삭제 대상 탐색 후 사용자 승인 요청
- 승인 버튼과 채팅 입력을 통한 `approve / cancel / revise`
- 승인 전 데이터가 바뀌었는지 `version`으로 검증
- `operationKey`와 작업 이력으로 Tool 재실행 및 중복 반영 방지

### 일정 관리 Agent

- 자연어 기반 일정 등록·목록·검색·수정·삭제
- 오늘·내일 등 상대 날짜는 Asia/Seoul 현재 시각을 기준으로 해석
- 제목·장소·날짜·시각 조건으로 수정·삭제 대상 검색
- 검색 후보가 여러 개인 경우 임의로 하나를 선택하지 않고 사용자 선택을 반영
- 수정·삭제는 사용자 승인 후 실행하고 `version`으로 오래된 승인 방지
- 일정 생성은 `operationKey`를 이용해 동일 요청의 중복 생성 방지

### 승인과 장애 복구

- LangGraph `interrupt/resume`
- PostgreSQL Checkpointer를 이용한 실행 상태 저장
- `AgentPendingApproval`을 이용한 서버 재시작 후 승인 카드 복구
- Redis Lock을 이용한 승인 중복 처리 방지
- 처리 완료 후 대기 승인 상태 정리

### RAG

- TXT·PDF 문서 업로드
- BullMQ 기반 비동기 문서 처리
- OpenAI Embedding + PostgreSQL `pgvector` 벡터 검색
- PostgreSQL Full Text Search를 이용한 키워드 검색
- Vector Rank와 Keyword Rank를 RRF(Reciprocal Rank Fusion)로 결합한 하이브리드 검색
- HNSW cosine index 및 `iterative_scan` 적용
- 유사도 임계값과 문서별 청크 수 제한을 이용한 검색 결과 정제
- 답변에 문서명·청크 출처 표시
- 컨테이너 재생성 후에도 유지되는 RAG 파일 볼륨

### 사용자 장기 메모리

- 대화에서 선호·프로필·목표·제약 자동 추출
- 사용자별 메모리 검색·조회·삭제
- Embedding 기반 관련 메모리 검색
- BullMQ 재시도와 DB 상태 기반 Job 복구

### Python MCP 분석

- Python MCP Server를 별도 서비스로 구성
- `@langchain/mcp-adapters`를 통해 LangGraph Agent와 MCP 연결
- 기존 NestJS Tool과 Python MCP Tool을 하나의 Agent Tool 집합으로 통합
- `analyze_expense_anomalies` Tool에서 IQR 기반 지출 금액 이상치 후보 분석
- Pydantic을 이용한 MCP Tool 입력 검증
- MCP 서버 연결 실패 시 기존 Agent 기능과 장애 격리
- MCP Tool timeout 및 실행 오류 처리
- Python 서버 재기동 후 다음 요청에서 MCP 연결 복구

### 인증과 운영

- Access Token + Refresh Token 인증
- HTTP와 Socket.IO 인증 연동
- Docker Compose 기반 운영
- AWS EC2·RDS 배포
- GitHub Actions·GHCR 기반 자동 배포
- Cloudflare DNS·Let’s Encrypt HTTPS

### Observability

- LangSmith 기반 Agent 실행 추적
- Agent 실행 유형과 사용자·대화·Agent thread를 trace metadata로 기록
- Supervisor와 Domain Agent의 LLM 실행을 별도 run으로 추적
- Action Tool은 read / mutation 유형을 tag와 metadata로 구분
- RAG 답변 생성, 대화 요약, 사용자 메모리 추출 등 백그라운드 AI 작업도 별도 trace로 기록
- LLM·Tool 호출의 latency, token usage, error 확인
- `/api/health`에서 PostgreSQL 연결 상태 확인

---

## 핵심 설계

### 1. 승인 기반 수정·삭제

```mermaid
sequenceDiagram
    participant U as User
    participant W as React / Socket.IO
    participant A as NestJS API
    participant G as LangGraph
    participant DB as PostgreSQL

    U->>W: 지출·일정 수정/삭제 요청
    W->>A: send_message
    A->>G: Agent 실행
    G->>DB: 대상 조회
    G-->>A: interrupt(승인 요청)
    A->>DB: Pending Approval 저장
    A-->>W: 승인 카드 전송
    U->>W: approve / cancel / revise
    W->>A: 승인 응답
    A->>G: Command(resume)
    G->>DB: version 조건부 수정/삭제
    G-->>A: Tool 결과
    A-->>W: 최종 응답
```

지출과 일정의 수정·삭제는 Tool 내부에서 `interrupt`를 발생시켜
사용자의 최종 승인을 받은 뒤 실행합니다.

승인 대기 중 다른 요청이 같은 데이터를 변경하면 `expectedVersion`과 현재 `version`이 달라져
이전 승인을 거부합니다. 이를 통해 오래된 승인 카드가 최신 데이터를 수정하거나 삭제하지
못하도록 했습니다.

### 2. 중복 실행 및 동시성 제어

중요한 데이터 변경은 하나의 장치에만 의존하지 않고 여러 계층에서 보호합니다.

```txt
Tool Call
├─ 지출·일정 생성: operationKey 기반 멱등성
├─ 수정·삭제: 동일 Mutation Tool Call 중복 실행 차단
├─ 승인 응답: approvalId + originUserMessageId 검증
├─ 채팅방 단위 중복 처리 방지
├─ 승인 처리: Redis Lock
└─ 지출·일정 version 기반 낙관적 동시성 제어
```

지출과 일정 생성은 Tool Call에서 만든 `operationKey`와
`(userId, operationKey)` Unique 제약을 이용해 동일 요청이 다시 실행되어도
같은 데이터가 중복 생성되지 않도록 했습니다.

수정·삭제 Tool은 현재 Agent 실행에서 이미 수행한 Mutation signature를 기록하여
동일한 Tool Call이 반복 실행되는 것을 차단합니다.

승인 버튼은 현재 대기 중인 `approvalId`와 원본 사용자 메시지를 함께 검증하며,
동일 채팅방에서 승인 처리가 동시에 실행되지 않도록 Redis Lock을 사용합니다.

또한 지출과 일정의 수정·삭제는 승인 시점의 `expectedVersion`과
현재 데이터의 `version`을 비교하여, 승인 대기 중 데이터가 변경된 경우
오래된 승인을 실행하지 않습니다.

### 3. BullMQ 작업 복구

RAG 문서 처리와 사용자 메모리 추출은 Redis Queue 상태만 신뢰하지 않고,
PostgreSQL에도 처리 상태를 함께 저장합니다.

```txt
RAG
PENDING
→ PROCESSING
→ READY

사용자 메모리 추출
PENDING
→ PROCESSING
→ COMPLETED
```

서버 시작 시와 실행 중 주기적으로 DB 상태와 BullMQ Job 상태를 비교합니다.

BullMQ의 `WAITING`, `DELAYED`, `ACTIVE`, `FAILED`, `NOT_FOUND` 상태와
DB의 `PENDING`, `PROCESSING` 상태를 함께 확인하여,
중단된 작업을 다시 등록하거나 상태를 복구하고 최종 실패 작업은 `FAILED`로 기록합니다.

복구 작업 자체도 Redis Lock으로 보호하여 여러 서버 인스턴스가
동시에 같은 작업을 복구하지 않도록 구성했습니다.

### 4. RAG 출처 제공

```txt
문서 업로드
→ 텍스트 추출
→ 청크 분할
→ Embedding 생성
→ pgvector 저장
→ 질문 Embedding 생성
→ pgvector cosine 벡터 후보 검색
→ PostgreSQL Full Text Search 키워드 후보 검색
→ RRF로 두 검색 순위 결합
→ 유사도·문서별 청크 수 기준 결과 정제
→ 답변 생성
→ 검색 청크를 출처로 저장·표시
```

벡터 검색은 의미적으로 유사한 청크를 찾고,
PostgreSQL Full Text Search는 질문의 키워드가 포함된 청크를 찾습니다.

두 검색 결과는 RRF(Reciprocal Rank Fusion)로 결합하며,
최종 결과에서는 관련성이 낮은 벡터 검색 결과를 제외하고
특정 문서의 청크가 과도하게 편중되지 않도록 결과를 정제합니다.

문서 내용은 시스템 명령이 아니라 검색 데이터로 전달하며,
답변 근거를 확인할 수 있도록 인용 정보를 함께 반환합니다.

### 5. 사용자 장기 메모리

사용자 메시지에서 이후 대화에도 재사용할 가치가 있는 정보를 비동기로 추출해
사용자별 장기 메모리로 저장합니다.

```txt
사용자 메시지 저장
→ BullMQ 메모리 추출 Job 등록
→ 기존 관련 메모리 검색
→ LLM Structured Output으로 메모리 후보 추출
→ confidence 기준 필터링
→ memoryKey 기준 UPSERT / ARCHIVE
→ Embedding 저장
→ 이후 대화에서 관련 메모리 검색
```

장기 메모리는 다음 네 가지 유형으로 구분합니다.

- `PROFILE`: 비교적 오래 유지되는 사용자 정보
- `PREFERENCE`: 반복적으로 적용할 사용자 선호
- `GOAL`: 여러 대화에 걸쳐 이어지는 목표
- `CONSTRAINT`: 이후 응답에서 계속 지켜야 할 제약

같은 의미의 정보는 `memoryKey`를 기준으로 갱신하며,
Embedding과 pgvector cosine 검색을 이용해 현재 대화와 관련된 활성 메모리만 조회합니다.

사용자가 메모리 삭제를 요청하면 후보를 먼저 검색해 대상을 식별하고,
`delete_user_memory`의 승인 흐름을 거쳐 삭제합니다.

삭제된 메모리는 즉시 다시 추출되지 않도록 삭제 시점과 출처 메시지 시점을 비교하며,
실제 삭제 시에는 내용과 Embedding을 제거하고 `DELETED` 상태와 삭제 시각만 유지합니다.

### 6. Python MCP 분석 서비스

지출 조회와 사용자 데이터 접근은 기존 NestJS Agent Tool이 담당하고, 통계 분석은 별도의
Python MCP Server가 담당하도록 역할을 분리했습니다.

```mermaid
sequenceDiagram
    participant U as User
    participant A as LangGraph Agent
    participant T as NestJS Expense Tool
    participant M as Python MCP Server

    U->>A: 지출 이상치 분석 요청
    A->>T: get_expense_list
    T-->>A: 사용자 지출 데이터
    A->>M: analyze_expense_anomalies
    M->>M: IQR 기반 분석
    M-->>A: 이상치 후보
    A-->>U: 분석 결과 설명
```
---

## 아키텍처

```mermaid
flowchart LR
    USER[Browser] --> CF[Cloudflare]
    CF --> WEB[Nginx + React]

    WEB -->|/api| API[NestJS API]
    WEB -->|/socket.io| API

    API --> SUPERVISOR[LangGraph Supervisor]

    SUPERVISOR --> EXPENSE[Expense Agent]
    SUPERVISOR --> SCHEDULE[Schedule Agent]
    SUPERVISOR --> MEMORY[Memory Agent]
    SUPERVISOR --> RAG[RAG Agent]
    SUPERVISOR --> GENERAL[General Agent]

    EXPENSE --> TOOLS[Agent Tools]
    SCHEDULE --> TOOLS
    MEMORY --> TOOLS
    RAG --> TOOLS

    API --> OPENAI[OpenAI API]

    TOOLS --> APPDB[(RDS PostgreSQL<br/>Prisma + pgvector)]
    TOOLS --> MCP[Python MCP Server]

    API --> GRAPHDB[(RDS PostgreSQL<br/>LangGraph Checkpoint)]
    API --> REDIS[(Redis<br/>BullMQ · Lock · Socket Adapter)]
    API --> FILES[(EC2 Host Volume<br/>RAG Files)]

    subgraph EC2[AWS EC2]
        WEB
        API
        MCP
        REDIS
        FILES
    end
```

### 운영 구성

| 구성 요소 | 역할 |
|---|---|
| React + Nginx | 정적 파일 제공, `/api`, `/socket.io` reverse proxy |
| NestJS API | 인증, 채팅, Supervisor/Domain Agent, RAG, 메모리, BullMQ Processor |
| Python MCP Server | IQR 기반 지출 이상치 분석 MCP Tool 제공 |
| Redis | BullMQ, 승인 Lock, Socket.IO Adapter |
| RDS Application DB | 사용자·채팅·지출·일정·RAG·메모리 데이터 |
| RDS LangGraph DB | Checkpoint와 interrupt/resume 상태 |
| EC2 Host Volume | 업로드한 RAG 원본 파일 영속화 |
| GitHub Actions | 이미지 빌드, GHCR push, EC2 자동 배포 |

현재 프로젝트 규모에서는 API와 BullMQ Processor를 같은 NestJS 프로세스에서 실행합니다.
Redis는 EC2의 Docker Compose에서 운영하고,
Queue 복구에 필요한 작업 상태와 Agent 실행 상태는 PostgreSQL에 영속화합니다.

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Zustand, React Router |
| Backend | NestJS, TypeScript, Prisma |
| AI Agent | LangChain, LangGraph, OpenAI, MCP |
| Python Analysis | Python, MCP Python SDK, Pydantic |
| Realtime | Socket.IO, Redis Adapter |
| Queue | BullMQ, Redis |
| Database | PostgreSQL, AWS RDS |
| Search | pgvector, HNSW, PostgreSQL FTS, RRF |
| Authentication | JWT, Passport, bcrypt, Refresh Token Cookie |
| Infrastructure | Docker, Docker Compose, Nginx |
| CI/CD | GitHub Actions, GHCR, AWS OIDC |
| Cloud | AWS EC2, AWS RDS, Cloudflare, Let’s Encrypt |

---

## 프로젝트 구조

```txt
chat-ai-agent/
├─ apps/
│  ├─ api/
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  └─ migrations/
│  │  ├─ src/
│  │  │  ├─ agent/
│  │  │  ├─ chat/
│  │  │  ├─ queue/
│  │  │  ├─ rag/
│  │  │  ├─ redis/
│  │  │  └─ user-memory/
│  │  └─ Dockerfile
│  ├─ mcp/
│  │  ├─ server.py
│  │  ├─ pyproject.toml
│  │  └─ package.json
│  └─ web/
│     ├─ src/
│     ├─ nginx.conf
│     └─ Dockerfile
├─ packages/
│  └─ shared/
├─ docker-compose.dev.yml
├─ docker-compose.ec2.yml
├─ pnpm-workspace.yaml
├─ turbo.json
└─ .github/workflows/
```

---

## 로컬 실행

### 요구 사항

- Node.js 22
- pnpm
- Python 3.12
- uv
- Docker
- PostgreSQL
- Redis

### 설치

```bash
pnpm install
pnpm --filter api exec prisma generate
```

### Docker Compose로 전체 실행

```bash
docker compose -f docker-compose.dev.yml up -d
```

Redis, Python MCP Server, NestJS API, React + Nginx를 Docker Compose로 함께 실행합니다.

### 로컬 개발 서버 실행

애플리케이션을 Docker가 아닌 로컬 프로세스로 실행하려면 Redis와 PostgreSQL을 준비한 뒤
각 서비스를 실행합니다.

```bash
pnpm --filter api start:dev
pnpm --filter web dev
pnpm --filter mcp dev
```

### 전체 빌드

```bash
pnpm build
```

---

## 환경 변수

API 환경변수 예시:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://user:password@localhost:5432/chat_ai_agent
LANGGRAPH_DATABASE_URL=postgresql://user:password@localhost:5432/chat_ai_agent_langgraph
REDIS_URL=redis://localhost:6379/0

OPENAI_API_KEY=
OPENAI_MODEL=

JWT_SECRET=
JWT_REFRESH_SECRET=

MCP_ANALYSIS_SERVER_URL=http://127.0.0.1:8000/mcp
```
---

## 배포

배포는 GitHub Actions에서 API·Web·MCP 이미지를 생성해 GHCR에 push하고, EC2에서 해당
commit SHA 이미지를 pull하는 방식입니다.

```mermaid
sequenceDiagram
    participant DEV as Developer
    participant GH as GitHub Actions
    participant CR as GHCR
    participant EC2 as AWS EC2
    participant RDS as AWS RDS

    DEV->>GH: main push / workflow 실행
    GH->>GH: API·Web·MCP 이미지 빌드
    GH->>CR: commit SHA 태그 push
    GH->>EC2: 임시 SSH 허용 후 배포
    EC2->>CR: 이미지 pull
    EC2->>RDS: prisma migrate deploy
    EC2->>EC2: docker compose up -d
    GH->>GH: 임시 SSH 규칙 제거
```

운영 환경에서는 다음 서비스가 실행됩니다.

```txt
chat-ai-agent-web
chat-ai-agent-api
chat-ai-agent-mcp
chat-ai-agent-redis
```

---

## 운영 확인

```bash
docker compose -f docker-compose.ec2.yml ps
docker logs chat-ai-agent-api --since 10m
docker exec chat-ai-agent-redis redis-cli ping
docker exec chat-ai-agent-api pnpm exec prisma migrate status
```

운영 Smoke Test:

```txt
로그인
→ 채팅방 생성
→ 지출 등록
→ 지출 수정 승인
→ 서버 재시작 후 승인 복구
→ 사용자 메모리 추출
→ RAG 문서 업로드
→ 문서 기반 질문과 출처 확인
```

---

## 주요 트레이드오프

### Redis 운영 위치

현재는 단일 EC2 포트폴리오 서비스이므로 ElastiCache 대신 Docker Redis를 사용합니다.
API 인스턴스가 하나인 상황에서 Redis만 관리형으로 분리해도 고가용성 효과가 제한적인 반면,
비용과 운영 복잡도는 증가하기 때문입니다.

Redis에만 상태를 의존하지 않고 PostgreSQL에 작업 상태를 저장해 Queue 유실 시 복구할 수
있도록 설계했습니다.

### RAG 파일 저장

현재는 EC2 Host Volume에 원본 파일을 저장합니다. 컨테이너 교체에는 안전하지만 EC2 자체가
교체되는 환경에는 적합하지 않습니다. 다중 인스턴스나 무중단 교체가 필요해지면 S3 기반
Storage Adapter로 전환할 계획입니다.

### 검색 방식

pgvector cosine 유사도 기반 벡터 검색과 PostgreSQL Full Text Search 기반 키워드 검색을 함께 사용합니다.

각 검색 결과의 순위를 RRF(Reciprocal Rank Fusion)로 결합하여,
의미적으로 유사한 문서와 정확한 키워드가 포함된 문서를 함께 검색할 수 있도록 구성했습니다.

최종 검색 결과에서는 유사도 임계값과 문서별 청크 수 제한을 적용하여
관련성이 낮은 결과와 특정 문서의 과도한 편중을 줄입니다.

---

## 실행 화면

### 지출 수정 승인

![지출 수정 승인](docs/images/expense-approval.png)

### RAG 답변과 출처

![RAG 답변과 출처](docs/images/rag-answer-citations.png)

### 사용자 장기 메모리

![사용자 장기 메모리](docs/images/user-memory.png)
---

## 향후 개선

- RAG 원본 파일 저장소를 EC2 Volume에서 S3로 전환
- API와 BullMQ Worker 프로세스 분리
- 핵심 승인·복구 시나리오 자동 테스트 확대
- CloudWatch 기반 운영 알림 추가

---

## License

개인 포트폴리오 및 학습 목적으로 개발한 프로젝트입니다.
