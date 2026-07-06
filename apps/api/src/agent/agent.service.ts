import { Injectable } from '@nestjs/common';
import { END, GraphNode, MessagesValue, START, StateGraph, StateSchema } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ChatMessage } from '../generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { ChatMessageRole } from '@repo/shared';


// const SYSTEM_PROMPT = `
// 너는 사용자의 개발 학습을 도와주는 AI 어시스탄트다.
// 답변은 한국어로  한다.
// 사용자가 백엔드, NestJS, Prisma, LangChain, LangGraph를 학습 중이면 실무적인  관점으로 설명한다.
// 코드는  가능한 한 TypeScript/NestJS 기준으로 작성한다.
// `;

const SYSTEM_PROMPT  = `
답변은 한국어로 한다.
`
const AgentState = new StateSchema({
    messages: MessagesValue,
})

function createAgentGraph(model: ChatOpenAI) {
    const callModel: GraphNode<typeof AgentState> = async (state) => {
        const response = await model.invoke([
            new SystemMessage(SYSTEM_PROMPT),
            ...state.messages,
        ]);

        return {
            messages: [response],
        };
    };

    return new StateGraph(AgentState)
        .addNode('callModel', callModel)
        .addEdge(START, 'callModel')
        .addEdge('callModel', END)
        .compile();
}

type AgentGraph = ReturnType<typeof createAgentGraph>;

@Injectable()
export class AgentService {
    private readonly model: ChatOpenAI;
    private readonly graph: AgentGraph;

    constructor(private readonly configService: ConfigService) {
        this.model = new ChatOpenAI({
            apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
            model: this.configService.getOrThrow<string>('OPENAI_MODEL'),
            // temperature: 0.7,
        });

        this.graph = createAgentGraph(this.model);
    }

    async generateReply(messages: ChatMessage[]): Promise<string> {
        const langchainMessages = this.toLangChainMessages(messages);

        const result = await this.graph.invoke({
            messages: langchainMessages,
        });

        const lastMessage = result.messages.at(-1);

        if(!lastMessage || !AIMessage.isInstance(lastMessage)) {
            throw new Error('AI 응답을 생성하지 못했습니다.')
        }

        return this.messageContentToString(lastMessage.content)
    }

    async *streamReply(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
        const langchainMessages = this.toLangChainMessages(messages);

        const stream = await this.graph.stream(
            {
                messages: langchainMessages,
            },
            {
                streamMode: 'messages',
                signal,
            }
        );

        for await (const [messageChunk, metadata] of stream) {
            if(metadata.langgraph_node !== 'callModel') {
                continue;
            }

            const text = this.messageContentToString(messageChunk.content);

            if(text) {
                yield text;
            }
        }
    }

    private toLangChainMessages(messages: ChatMessage[]): BaseMessage[] {
        return messages.map((message) => {
            if (message.role === ChatMessageRole.USER) {
                return new HumanMessage(message.content);
            }

            if (message.role === ChatMessageRole.ASSISTANT) {
                return new AIMessage(message.content);
            }

            return new SystemMessage(message.content);
        });
    }

    private messageContentToString(content: AIMessage['content']): string {
        if (typeof content === 'string') {
            return content;
        }

        return content
            .map((part) => {
                if (typeof part === 'string') {
                    return part;
                }

                if (
                    typeof part === 'object' &&
                    part !== null &&
                    'text' in part &&
                    typeof part.text === 'string'
                ) {
                    return part.text;
                }

                return '';
            })
            .join('');
    }

}
