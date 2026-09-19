const OLLAMA_URL = 'http://localhost:11434/api/chat';
const MODEL = 'qwen3.5:4b';

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
                        '오늘 점심으로 12000원을 썼어. 지출을 기록해줘.',
                },
            ],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'create_expense',
                        description:
                            '사용자의 지출을 기록한다.',
                        parameters: {
                            type: 'object',
                            properties: {
                                amount: {
                                    type: 'number',
                                    description: '지출 금액',
                                },
                                category: {
                                    type: 'string',
                                    description: '지출 카테고리',
                                },
                                title: {
                                    type: 'string',
                                    description: '지출 내용',
                                },
                            },
                            required: [
                                'amount',
                                'category',
                                'title',
                            ],
                        },
                    },
                },
            ],
            stream: false,
            think: false,
        }),
    });

    if (!response.ok) {
        throw new Error(
            `Ollama 요청 실패: ${response.status} ${response.statusText}`,
        );
    }

    const result = await response.json();

    console.dir(result.message, {
        depth: null,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
