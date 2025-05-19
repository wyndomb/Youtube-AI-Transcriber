import OpenAI from "openai";

// Create a singleton instance of the OpenAI client
// This ensures we only create one instance of the client throughout the application
let openaiInstance: OpenAI | null = null;

// Initialize OpenAI client with proper error handling
export function getOpenAIInstance(): OpenAI {
  if (openaiInstance) {
    return openaiInstance;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing from environment variables. Please set it in .env.local or your environment."
    );
  }

  try {
    openaiInstance = new OpenAI({
      apiKey,
    });
    return openaiInstance;
  } catch (error: any) {
    console.error("Failed to initialize OpenAI client:", error);
    throw new Error(`Failed to initialize OpenAI client: ${error.message}`);
  }
}

// Export a ready-to-use instance
export const openai = getOpenAIInstance();
