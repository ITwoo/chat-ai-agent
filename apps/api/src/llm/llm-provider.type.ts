export const LLM_PROVIDERS = [
    'openai',
    'google',
    'anthropic',
] as const;

export type LlmProvider =
    (typeof LLM_PROVIDERS)[number];

export function isLlmProvider(
    value: string,
): value is LlmProvider {
    return LLM_PROVIDERS.some(
        (provider) => provider === value,
    );
}