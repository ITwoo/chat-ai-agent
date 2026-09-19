
import { z } from 'zod';

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const MODEL = 'qwen3.5:4b';

const expenseSchema = z.object({
    amount: z.number().positive(),
    category: z.string().min(1),
    title: z.string().min(1),
});

type OllamaChatResponse = {
    message: {
        role: string;
        content: string;
    };
};

async function main() {
    const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                {
                    role: 'user',
                    content:
                        '오늘 점심으로 12000원을 썼어. 지출 정보를 구조화해서 반환해줘.',
                },
            ],
            format: z.toJSONSchema(expenseSchema),
            stream: false,
            think: false,
            options: {
                temperature: 0,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(
            `Ollama 요청 실패: ${response.status} ${response.statusText}`,
        );
    }

    const result =
        (await response.json()) as OllamaChatResponse;

    const parsed = expenseSchema.parse(
        JSON.parse(result.message.content),
    );

    console.log('Raw response:');
    console.log(result.message.content);

    console.log('\nValidated result:');
    console.dir(parsed, {
        depth: null,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
