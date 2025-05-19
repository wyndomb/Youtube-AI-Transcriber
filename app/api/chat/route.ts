import { NextResponse } from "next/server";
// Replace the youtube-transcript npm package with our custom implementation
// import { YoutubeTranscript } from "youtube-transcript";
import { fetchTranscript, TranscriptLine } from "@/lib/youtube-transcript";
import OpenAI from "openai";

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set in environment variables");
  throw new Error("OPENAI_API_KEY is not set in environment variables");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Custom direct fetch function is now handled in the youtube-transcript library
// Removing the redundant fetchYouTubeTranscriptDirectly function

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { url, question, chatHistory = [] } = body;

    console.log("Processing chat for URL:", url);
    console.log("Question:", question);

    if (!url) {
      console.error("No URL provided");
      return NextResponse.json({ error: "No URL provided" }, { status: 400 });
    }

    if (!question) {
      console.error("No question provided");
      return NextResponse.json(
        { error: "No question provided" },
        { status: 400 }
      );
    }

    // Extract video ID from URL
    const videoId = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&?\s]+)/
    )?.[1];

    if (!videoId) {
      console.error("Invalid YouTube URL:", url);
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    console.log("Extracted video ID:", videoId);

    // Get transcript
    try {
      console.log(`[${videoId}] Attempting to fetch transcript for chat...`);

      let transcript;

      // Use our custom library that handles all methods internally
      try {
        transcript = await fetchTranscript(videoId);
        console.log(
          `[${videoId}] Successfully fetched transcript for chat: ${transcript?.length} segments`
        );
      } catch (error: any) {
        console.error(`[${videoId}] Transcript fetch failed for chat:`, error);

        // Check for specific error about captions being unavailable
        if (
          error.message.includes("doesn't have captions") ||
          error.message.includes("has disabled captions")
        ) {
          return NextResponse.json(
            {
              error: "CAPTIONS_UNAVAILABLE",
              message:
                "This video doesn't have captions or has disabled captions. Please try a video with captions enabled.",
            },
            { status: 404 }
          );
        }

        return NextResponse.json(
          { error: "No transcript found for this video" },
          { status: 404 }
        );
      }

      console.log(
        `[${videoId}] Raw transcript response received for chat. Length: ${transcript?.length}`
      );

      if (!transcript || transcript.length === 0) {
        console.error(
          `[${videoId}] No transcript data found in the response for chat.`
        );
        return NextResponse.json(
          { error: "No transcript found for this video" },
          { status: 404 }
        );
      }

      const transcriptText = transcript.map((item) => item.text).join(" ");
      console.log(
        `[${videoId}] Transcript processed for chat. Text length: ${transcriptText.length}`
      );

      if (!transcriptText || transcriptText.trim() === "") {
        console.error(
          `[${videoId}] Processed transcript text is empty for chat.`
        );
        return NextResponse.json(
          { error: "Empty transcript found for this video" },
          { status: 404 }
        );
      }

      // Truncate transcript if it's too long (OpenAI has token limits)
      const maxChars = 42000; // Approximately 12000 tokens
      const truncatedText =
        transcriptText.length > maxChars
          ? transcriptText.slice(0, maxChars) + "..."
          : transcriptText;

      console.log(
        `[${videoId}] Truncated transcript text length for chat: ${truncatedText.length}`
      );

      // Prepare chat history for the API
      const messages = [
        {
          role: "system",
          content: `You're a friendly podcast assistant who helps users understand podcast content better. You have access to the transcript of a YouTube podcast. Answer questions about the podcast in a conversational, helpful way. 

When answering:
- Be specific and reference the content directly
- If you can identify timestamps for relevant parts, include them
- If the question asks about something not covered in the podcast, politely explain that it wasn't discussed
- Keep your tone casual and friendly, like you're chatting with a friend
- If appropriate, mention related topics that were discussed in the podcast that might interest the user

Here's the podcast transcript: ${truncatedText}`,
        },
        ...chatHistory,
        {
          role: "user",
          content: question,
        },
      ];

      // Generate answer using OpenAI
      try {
        console.log("Calling OpenAI API for chat...");
        const completion = await openai.chat.completions.create({
          messages,
          model: "gpt-4o-mini",
          max_tokens: 1024,
          temperature: 0.7,
        });

        console.log("OpenAI API response received");
        const answer = completion.choices[0].message.content;

        if (!answer) {
          console.error("No answer generated by OpenAI");
          throw new Error("No answer generated by OpenAI");
        }

        console.log("Answer length:", answer.length, "characters");
        return NextResponse.json({
          answer,
          chatHistory: [
            ...chatHistory,
            { role: "user", content: question },
            { role: "assistant", content: answer },
          ],
        });
      } catch (openaiError: any) {
        console.error("OpenAI API Error:", {
          message: openaiError.message,
          type: openaiError.type,
          stack: openaiError.stack,
          response: openaiError.response?.data,
        });
        return NextResponse.json(
          {
            error: `Failed to generate answer using AI: ${openaiError.message}`,
          },
          { status: 500 }
        );
      }
    } catch (transcriptError: any) {
      console.error(`[${videoId}] Transcript Fetching Error (Chat):`, {
        message: transcriptError.message,
        name: transcriptError.name,
        // Consider logging more properties if available, e.g., error code
        stack: transcriptError.stack,
      });
      return NextResponse.json(
        {
          error: `Failed to fetch video transcript: ${transcriptError.message}`,
        },
        { status: 404 }
      );
    }
  } catch (error: any) {
    console.error("General Error:", {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: `Failed to process request: ${error.message}` },
      { status: 500 }
    );
  }
}
