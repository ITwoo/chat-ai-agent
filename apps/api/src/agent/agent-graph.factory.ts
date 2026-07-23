import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
    END,
    GraphNode,
    MemorySaver,
    MessagesValue,
    START,
    StateGraph,
    StateSchema,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ConfigService } from '@nestjs/config';

const SYSTEM_PROMPT = `
너는 1인 가구용 개인 생활 관리 AI Agent다.

사용자의 가계부, 냉장고 재료, 집 안 물건, 공구와 도구, 일정, 인간관계, 회사, 자산, 개인 메모리와 생활 정보를 통합 관리하는 개인 비서 역할을 한다.

답변은 한국어로 한다.

사용자의 요청을 처리할 수 있는 tool이 있으면 각 tool의 이름, 설명과 입력 schema를 기준으로 적절한 tool을 선택해 사용한다.
현재 날짜나 상대적인 기간을 정확히 알아야 하면 현재 날짜와 시간을 확인한 뒤 처리한다.

사용자가 요청하지 않은 저장, 수정 또는 삭제를 임의로 실행하지 않는다.
기존 데이터를 수정하거나 삭제하려면 대상을 명확하게 식별하고, 필요한 경우 사용자의 확인을 거친다.

지출 수정에서는 다음 규칙을 반드시 따른다.
- find_expenses 결과가 여러 개이면 사용자가 수정 대상을 선택하게 한다.
- 사용자가 대상을 선택했고 변경 내용도 이미 명확하면 update_expense를 즉시 호출한다.
- update_expense 내부의 interrupt가 최종 승인을 담당한다.
- update_expense를 호출하기 전에 "수정할까요?", "진행할까요?" 같은 별도의 승인 질문을 하지 않는다.
- 사용자의 후보 선택은 수정 대상의 식별이며, 최종 승인 자체는 아니다.

tool 실행 결과를 근거로 답변하며, 실제로 실행하지 않은 작업을 실행했다고 말하지 않는다.
구현되지 않은 기능이나 존재하지 않는 tool을 사용했다고 말하지 않는다.

지출 카테고리는 반드시 다음 중 하나를 사용한다:
식비, 교통, 주거, 공과금, 통신, 생활용품, 쇼핑, 의료, 문화여가, 운동, 교육, 경조사, 기타.

편의점, 점심, 카페, 식재료처럼 먹는 것과 관련된 지출은 기본적으로 식비로 분류한다.
지하철, 버스, 택시, 기차처럼 이동과 관련된 지출은 교통으로 분류한다.
분류가 불명확하면 기타를 사용한다.

사용자가 자신이 업로드한 문서, 파일, 이력서, 메모 또는 자료의 내용을 질문하면 search_rag_documents tool을 사용해 관련 내용을 검색한다.

문서 검색 결과에 포함되지 않은 내용을 해당 문서에 있다고 단정하지 않는다.
검색 결과가 없거나 질문과 관련성이 낮으면 문서에서 근거를 찾지 못했다고 명확하게 답한다.
문서 검색 결과를 사용할 때는 답변 마지막에 참고한 파일명을 표시한다.
`;

const AgentState = new StateSchema({
    messages: MessagesValue,
});

type AgentModel = ReturnType<ChatOpenAI['bindTools']>;
type AgentTools = StructuredToolInterface[];

export type AgentGraph = ReturnType<AgentGraphFactory['createGraph']>;

@Injectable()
export class AgentGraphFactory implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AgentGraphFactory.name);
    private checkpointer!: PostgresSaver;

    constructor(
        private readonly configService: ConfigService,
    ){}

    async onModuleInit(): Promise<void> {
        const databaseUrl = this.configService.getOrThrow<string>('LANGGRAPH_DATABASE_URL');

        this.checkpointer = PostgresSaver.fromConnString(databaseUrl);

        await this.checkpointer.setup();

        this.logger.log('LangGraph PostgreSql checkpointer initialized');
    }

    async onModuleDestroy(): Promise<void> {
        await this.checkpointer.end();
    }

    createGraph(model: AgentModel, tools: AgentTools) {
        const callModel: GraphNode<typeof AgentState> = async (state) => {
            const response = await model.invoke([
                new SystemMessage(SYSTEM_PROMPT),
                ...state.messages,
            ]);

            return {
                messages: [response],
            };
        };

        const toolNode = new ToolNode(tools);

        const shouldContinue = (state: typeof AgentState.State) => {
            const lastMessage = state.messages.at(-1);

            if (
                lastMessage &&
                AIMessage.isInstance(lastMessage) &&
                (lastMessage.tool_calls?.length ?? 0) > 0
            ) {
                const toolNames = lastMessage.tool_calls?.map((toolCall) => toolCall.name).join(', ');

                this.logger.log(`[agent:tool_calls] ${toolNames}`);

                return 'tools';
            }

            return END;
        };

        return new StateGraph(AgentState)
            .addNode('callModel', callModel)
            .addNode('tools', toolNode)
            .addEdge(START, 'callModel')
            .addConditionalEdges('callModel', shouldContinue)
            .addEdge('tools', 'callModel')
            .compile({
                checkpointer: this.checkpointer,
            });
    }
}