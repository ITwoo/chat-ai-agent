# Chat AI Agent

<p align="center">
  <strong>NestJS · React · LangGraph 기반 개인 관리 AI Agent</strong>
</p>

<p align="center">
  자연어 지출 관리, 사용자 승인, 중복 실행 방지, 장애 복구,
  장기 메모리와 RAG를 구현한 풀스택 서비스입니다.
</p>

<p align="center">
  <a href="https://woohyuk.dev"><strong>Live Demo</strong></a>
  ·
  <a href="https://www.woohyuk.dev">www.woohyuk.dev</a>
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
</p>

---

## 프로젝트 소개

`Chat AI Agent`는 단순 질의응답 챗봇이 아니라, 대화 문맥을 바탕으로 실제 Tool을 실행하는
개인 관리 AI Agent입니다.

사용자는 자연어로 지출을 등록·조회·수정할 수 있습니다. 데이터 변경처럼 중요한 작업은
LangGraph의 `interrupt/resume`으로 승인을 받은 뒤 실행하며, 중복 승인과 서버 재시작에도
안전하게 이어지도록 상태를 PostgreSQL과 Redis에 관리합니다.

업로드한 문서는 `pgvector`로 검색하고 답변에 출처를 함께 표시합니다. 사용자 선호·목표·제약은
장기 메모리로 추출해 이후 대화에 활용합니다.

---

## 핵심 기능

### AI 채팅

- Socket.IO 기반 실시간 스트리밍 응답
- 채팅방 생성·수정·삭제 및 메시지 페이지네이션
- 응답 생성 중지, 실패 처리, 재연결 후 채팅방 자동 재입장
- 대화 요약과 최근 메시지를 결합한 문맥 관리

### 지출 관리 Agent

- 자연어 기반 지출 등록·목록·요약·검색
- 수정 대상 탐색 후 사용자 승인 요청
- 승인 버튼과 채팅 입력을 통한 `approve / cancel / revise`
- 승인 전 데이터가 바뀌었는지 `version`으로 검증
- `operationKey`와 작업 이력으로 Tool 재실행 및 중복 반영 방지

### 승인과 장애 복구

- LangGraph `interrupt/resume`
- PostgreSQL Checkpointer를 이용한 실행 상태 저장
- `AgentPendingApproval`을 이용한 서버 재시작 후 승인 카드 복구
- Redis Lock을 이용한 승인 중복 처리 방지
- 처리 완료 후 대기 승인 상태 정리

### RAG

- TXT·PDF 문서 업로드
- BullMQ 기반 비동기 문서 처리
- OpenAI Embedding과 PostgreSQL `pgvector` 검색
- HNSW cosine index
- 답변에 문서명·청크 출처 표시
- 컨테이너 재생성 후에도 유지되는 RAG 파일 볼륨

### 사용자 장기 메모리

- 대화에서 선호·프로필·목표·제약 자동 추출
- 사용자별 메모리 검색·조회·삭제
- Embedding 기반 관련 메모리 검색
- BullMQ 재시도와 DB 상태 기반 Job 복구

### 인증과 운영

- Access Token + Refresh Token 인증
- HTTP와 Socket.IO 인증 연동
- Docker Compose 기반 운영
- AWS EC2·RDS 배포
- GitHub Actions·GHCR 기반 자동 배포
- Cloudflare DNS·Let’s Encrypt HTTPS

---

## 핵심 설계

### 1. 승인 기반 지출 수정

```mermaid
sequenceDiagram
    participant U as User
    participant W as React / Socket.IO
    participant A as NestJS API
    participant G as LangGraph
    participant DB as PostgreSQL

    U->>W: 지출 수정 요청
    W->>A: send_message
    A->>G: Agent 실행
    G->>DB: 수정 대상 조회
    G-->>A: interrupt(승인 요청)
    A->>DB: Pending Approval 저장
    A-->>W: 승인 카드 전송
    U->>W: approve / cancel / revise
    W->>A: 승인 응답
    A->>G: Command(resume)
    G->>DB: version 조건부 수정
    G-->>A: Tool 결과
    A-->>W: 최종 응답
```

승인 대기 중 다른 요청이 같은 지출을 변경하면 `expectedVersion`과 현재 `version`이 달라져
이전 승인을 거부합니다. 이를 통해 오래된 승인 카드가 최신 데이터를 덮어쓰지 않도록 했습니다.

### 2. 중복 실행 방지

중복 방지는 한 계층에만 의존하지 않습니다.

```txt
Tool Call
├─ operationKey 기반 지출 등록 멱등성
├─ approvalId 검증
├─ 처리 중인 방 상태 확인
├─ Redis 승인 Lock
├─ Expense.version 낙관적 동시성 제어
└─ ExpenseUpdateOperation 작업 이력
```

각 장치는 중복 클릭, 동일 Tool 재실행, 승인 대기 중 데이터 변경처럼 서로 다른 실패 상황을
담당합니다.

### 3. BullMQ 작업 복구

RAG와 사용자 메모리 작업은 Redis Queue 상태만 신뢰하지 않고 PostgreSQL에도 작업 상태를
저장합니다.

```txt
요청 저장
→ DB 상태 PENDING
→ BullMQ Job 등록
→ PROCESSING
→ 완료 시 READY / ACTIVE
```

서버가 재시작되거나 Redis Job이 사라진 경우 DB 상태와 Queue 상태를 비교해 필요한 Job을
다시 등록합니다.

### 4. RAG 출처 제공

```txt
문서 업로드
→ 텍스트 추출
→ 청크 분할
→ Embedding 생성
→ pgvector 저장
→ cosine 검색
→ 답변 생성
→ 검색 청크를 출처로 저장·표시
```

문서 내용은 시스템 명령이 아니라 검색 데이터로 전달하며, 답변 근거를 확인할 수 있도록
인용 정보를 함께 반환합니다.

---

## 아키텍처

```mermaid
flowchart LR
    USER[Browser] --> CF[Cloudflare]
    CF --> WEB[Nginx + React]

    WEB -->|/api| API[NestJS API]
    WEB -->|/socket.io| API

    API --> OPENAI[OpenAI API]
    API --> APPDB[(RDS PostgreSQL<br/>Prisma + pgvector)]
    API --> GRAPHDB[(RDS PostgreSQL<br/>LangGraph Checkpoint)]
    API --> REDIS[(Redis<br/>BullMQ · Lock · Socket Adapter)]
    API --> FILES[(EC2 Host Volume<br/>RAG Files)]

    subgraph EC2[AWS EC2]
        WEB
        API
        REDIS
        FILES
    end
```

### 운영 구성

| 구성 요소 | 역할 |
|---|---|
| React + Nginx | 정적 파일 제공, `/api`, `/socket.io` reverse proxy |
| NestJS API | 인증, 채팅, Agent, RAG, 메모리, BullMQ Processor |
| Redis | BullMQ, 승인 Lock, Socket.IO Adapter |
| RDS Application DB | 사용자·채팅·지출·RAG·메모리 데이터 |
| RDS LangGraph DB | Checkpoint와 interrupt/resume 상태 |
| EC2 Host Volume | 업로드한 RAG 원본 파일 영속화 |
| GitHub Actions | 이미지 빌드, GHCR push, EC2 자동 배포 |

현재 프로젝트 규모에서는 API와 BullMQ Processor를 같은 NestJS 프로세스에서 실행합니다.
Redis는 EC2의 Docker Compose에서 운영하고, 영구 상태의 원본은 PostgreSQL에 둡니다.

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Zustand, React Router |
| Backend | NestJS, TypeScript, Prisma |
| AI Agent | LangChain, LangGraph, OpenAI |
| Realtime | Socket.IO, Redis Adapter |
| Queue | BullMQ, Redis |
| Database | PostgreSQL, AWS RDS |
| Vector Search | pgvector, HNSW, cosine distance |
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
- Docker
- PostgreSQL
- Redis

### 설치

```bash
pnpm install
pnpm --filter api exec prisma generate
```

### 인프라 실행

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 개발 서버 실행

```bash
pnpm --filter api start:dev
pnpm --filter web dev
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
```

Web 환경변수:

```env
# apps/web/.env.development
VITE_API_URL=http://localhost:3000
```

```env
# apps/web/.env.production
VITE_API_URL=https://woohyuk.dev
```

> `VITE_*` 값은 브라우저 번들에 포함되므로 비밀값을 넣지 않습니다.

---

## 배포

배포는 GitHub Actions에서 API·Web 이미지를 생성해 GHCR에 push하고, EC2에서 해당
commit SHA 이미지를 pull하는 방식입니다.

```mermaid
sequenceDiagram
    participant DEV as Developer
    participant GH as GitHub Actions
    participant CR as GHCR
    participant EC2 as AWS EC2
    participant RDS as AWS RDS

    DEV->>GH: main push / workflow 실행
    GH->>GH: API·Web 이미지 빌드
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

현재는 pgvector cosine 검색에 집중합니다. PostgreSQL Full Text Search와 RRF를 결합한
하이브리드 검색은 구현 복잡도 대비 현재 데이터 규모에서 얻는 효과가 작아 보류했습니다.

---

## 실행 화면

운영 화면 캡처는 다음 순서로 추가할 예정입니다.

```txt
docs/images/
├─ chat-expense-create.png
├─ expense-approval.png
├─ expense-update-completed.png
├─ rag-answer-citations.png
└─ user-memory.png
```

---

## 향후 개선

- RAG 원본 파일 저장소를 EC2 Volume에서 S3로 전환
- API와 BullMQ Worker 프로세스 분리
- 하이브리드 검색 도입 여부를 데이터 기반으로 재평가
- 핵심 승인·복구 시나리오 자동 테스트 확대
- CloudWatch 기반 운영 알림 추가

---

## License

개인 포트폴리오 및 학습 목적으로 개발한 프로젝트입니다.
