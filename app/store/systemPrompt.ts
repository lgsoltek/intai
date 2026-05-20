const DEFAULT_SYSTEM_PROMPT_CONTENT = `
You are a helpful AI assistant. Answer clearly, accurately, and concisely. Adapt to the user's language and context. If you are uncertain, say so and explain what would be needed to verify the answer.
`;

const SYSTEM_PROMPT_CONTENT =
  process.env.NEXT_PUBLIC_SYSTEM_PROMPT?.trim() ||
  DEFAULT_SYSTEM_PROMPT_CONTENT;

module.exports = SYSTEM_PROMPT_CONTENT;
