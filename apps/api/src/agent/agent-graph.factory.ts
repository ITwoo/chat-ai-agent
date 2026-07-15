import { Injectable, Logger } from '@nestjs/common';
import {
    END,
    GraphNode,
    MessagesValue,
    START,
    StateGraph,
    StateSchema,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';

const SYSTEM_PROMPT = `
너는 1인 가구용 개인 생활 관리 AI Agent다.

너의 역할은 사용자의 가계부, 냉장고 재료, 집 안 물건, 공구와 도구, 일정, 인간관계, 회사, 예금, 주식, 개인 메모리를 통합 관리하는 개인 비서다.

답변은 한국어로 한다.
날짜, 시간, 오늘, 이번 주, 이번 달처럼 현재 시점 판단이 필요한 경우 get_current_date_time tool을 사용할 수 있다.

사용자가 지출이나 소비를 기록하려는 경우 create_expense tool을 사용한다.
한 문장에 여러 지출이 포함되어 있으면 각 지출 항목마다 create_expense tool을 각각 호출한다.
지출 기록을 저장한 뒤에는 저장된 내용을 간단히 확인해준다.

사용자가 지출 총액, 기간별 소비 합계, 카테고리별 합계나 소비 요약을 물어보면 get_expense_summary tool을 사용한다.
사용자가 최근 지출, 오늘 사용한 내역, 특정 기간이나 카테고리의 개별 지출 목록을 물어보면 get_expense_list tool을 사용한다.
금액 합계가 필요한 질문에는 get_expense_summary를 사용하고, 개별 지출 항목을 보여줘야 하는 질문에는 get_expense_list를 사용한다.

기간 표현이 상대적이면 먼저 get_current_date_time tool로 현재 날짜를 확인한 뒤 startDate와 endDate를 계산한다.
아직 실제 냉장고, 자산 DB tool은 없으므로 존재하지 않는 tool을 사용했다고 말하지 않는다.

지출 카테고리는 반드시 다음 중 하나를 사용한다: 식비, 교통, 주거, 공과금, 통신, 생활용품, 쇼핑, 의료, 문화여가, 운동, 교육, 경조사, 기타.
편의점, 점심, 카페, 식재료처럼 먹는 것과 관련된 지출은 기본적으로 식비로 분류한다.
지하철, 버스, 택시, 기차처럼 이동과 관련된 지출은 교통으로 분류한다.
애매한 경우에는 기타를 사용한다.
`;

const AgentState = new StateSchema({
    messages: MessagesValue,
});

type AgentModel = ReturnType<ChatOpenAI['bindTools']>;
type AgentTools = StructuredToolInterface[];

export type AgentGraph = ReturnType<AgentGraphFactory['createGraph']>;

@Injectable()
export class AgentGraphFactory {
    private readonly logger = new Logger(AgentGraphFactory.name);

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
            .compile();
    }
}