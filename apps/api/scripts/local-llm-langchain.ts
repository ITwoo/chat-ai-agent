import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ChatOllama } from '@langchain/ollama';
import { z } from 'zod';

import { ToolCallingChatModel } from '../src/llm/llm-model.type';

const MODEL = 'qwen3.5:4b';

const createExpenseTool = tool(
    async ({ amount, category, title }) => {
        return JSON.stringify({
            amount,
            category,
            title,
        });
    },
    {
        name: 'create_expense',
        description: '사용자의 지출을 기록한다.',
        schema: z.object({
            amount: z
                .number()
                .positive()
                .describe('지출 금액'),
            category: z
                .string()
                .describe('지출 카테고리'),
            title: z
                .string()
                .describe('지출 내용'),
        }),
    },
);

async function main() {
    const model = new ChatOllama({
        model: MODEL,
        temperature: 0,
        baseUrl: 'http://127.0.0.1:11434',
        think: false
    });

    const toolCallingModel: ToolCallingChatModel =
        model;

    console.log('=== ChatOllama 기본 호출 ===');

    const chatResponse =
        await toolCallingModel.invoke([
            new HumanMessage(
                '한 문장으로 자기소개해줘.',
            ),
        ]);

    console.log({
        content: chatResponse.content,
        usage: chatResponse.usage_metadata,
    });

    console.log('\n=== ChatOllama Tool Calling ===');

    const modelWithTools =
        toolCallingModel.bindTools([
            createExpenseTool,
        ]);

    const toolResponse =
        await modelWithTools.invoke([
            new HumanMessage(
                '오늘 점심으로 12000원을 썼어. 지출을 기록해줘.',
            ),
        ]);

    console.dir(
        {
            content: toolResponse.content,
            toolCalls: toolResponse.tool_calls,
            usage: toolResponse.usage_metadata,
        },
        {
            depth: null,
        },
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
