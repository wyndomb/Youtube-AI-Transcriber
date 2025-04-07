import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import OpenAI from "openai";

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set in environment variables");
  throw new Error("OPENAI_API_KEY is not set in environment variables");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to fetch podcast metadata
const fetchPodcastMetadata = async (videoId: string) => {
  try {
    // We need to use a fully qualified URL in server components
    // Since we need to make an internal API call, construct the URL based on the request URL
    // This is a self-request to our own API endpoint
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "";

    const response = await fetch(`${origin}/api/podcast-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }

    const data = await response.json();
    return data.metadata;
  } catch (error) {
    console.error("Error fetching podcast metadata:", error);
    return null;
  }
};

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { url } = body;

    console.log("Processing URL:", url);

    if (!url) {
      console.error("No URL provided");
      return NextResponse.json({ error: "No URL provided" }, { status: 400 });
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

    // Fetch podcast metadata
    const metadata = await fetchPodcastMetadata(videoId);
    console.log("Fetched metadata:", metadata);

    // Get transcript
    try {
      console.log("Fetching transcript for video ID:", videoId);
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);

      if (!transcript || transcript.length === 0) {
        console.error("No transcript found for video ID:", videoId);
        return NextResponse.json(
          { error: "No transcript found for this video" },
          { status: 404 }
        );
      }

      const transcriptText = transcript.map((item) => item.text).join(" ");
      console.log("Transcript length:", transcriptText.length, "characters");

      if (!transcriptText || transcriptText.trim() === "") {
        console.error("Empty transcript for video ID:", videoId);
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
        "Truncated transcript length:",
        truncatedText.length,
        "characters"
      );

      // Generate summary using OpenAI
      try {
        console.log("Calling OpenAI API...");

        // Prepare metadata information for the prompt
        const metadataInfo = metadata
          ? `Video Title: ${metadata.title}\nChannel: ${metadata.channelName}\nDuration: ${metadata.duration}\n\n`
          : "";

        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: "system",
              content: `You're a chill podcast buddy who loves breaking down episodes in a friendly, conversational way. Talk like you're texting a friend about a cool podcast you just heard. Keep it casual but insightful!

Output Format (in Markdown):
1. ## Executive Summary
   Give a quick overview of what the podcast was about - the main vibes and key points. Make it 2 paragraphs. Keep it conversational and engaging.

2. ## Key Insights
   Identify and explain the most important ideas, revelations, or arguments presented in the podcast. Generate 5-7 points. For each one:
   - Explain it in a casual, friendly way yet insightful
   - Why it's worth thinking about
   - Add a timestamp if you can find one

3. ## Detailed Timeline
   Create a chronological breakdown of the podcast with timestamps at meaningful transition points:
   - [00:00:00] - [00:XX:XX]: Brief description of opening segment
   - [00:XX:XX] - [00:XX:XX]: Brief description of next topic/segment
  (Continue throughout the entire podcast)

4. ## Notable Quotes
   The best lines that stood out. Generate 3-5 points. For each one:
   - "Direct quote" - Who said it (timestamp if you have it)

5. ## Related Stuff
   Any books, articles, people, or other cool things they mentioned that listeners might want to check out.

6. ## Questions to Think About
   Some interesting questions that came up that might make you think. Generate 5-7 points.

Guidelines:
- Skip the boring parts and focus on the good stuff
- Point out when topics change
- Keep your personal opinions out of it
- Highlight the surprising or unique perspectives
- Note when people agree or disagree
- Think about what this all means in the bigger picture`,
            },
            {
              role: "user",
              content: `Please analyze the following podcast transcript and provide a summary according to the specified format:

${metadataInfo}${truncatedText}`,
            },
          ],
          model: "gpt-4o-mini",
          max_tokens: 2048,
          temperature: 0.7,
        });

        console.log("OpenAI API response received");
        const summary = completion.choices[0].message.content;

        if (!summary) {
          console.error("No summary generated by OpenAI");
          throw new Error("No summary generated by OpenAI");
        }

        // Format the summary to ensure proper Markdown
        const formattedSummary = summary
          // Ensure proper line breaks for headers
          .replace(/^(#+)\s+/gm, "\n$1 ")
          // Ensure proper line breaks for lists
          .replace(/^(\s*[-*])/gm, "\n$1")
          // Ensure proper line breaks for numbered lists
          .replace(/^(\s*\d+\.)/gm, "\n$1")
          // Remove any extra line breaks
          .replace(/\n{3,}/g, "\n\n")
          // Trim whitespace
          .trim();

        console.log("Summary length:", formattedSummary.length, "characters");

        // Return both the summary and metadata if available
        if (metadata) {
          return NextResponse.json({
            summary: formattedSummary,
            metadata: metadata,
          });
        }

        return NextResponse.json({ summary: formattedSummary });
      } catch (openaiError: any) {
        console.error("OpenAI API Error:", {
          message: openaiError.message,
          type: openaiError.type,
          stack: openaiError.stack,
          response: openaiError.response?.data,
        });
        return NextResponse.json(
          {
            error: `Failed to generate summary using AI: ${openaiError.message}`,
          },
          { status: 500 }
        );
      }
    } catch (transcriptError: any) {
      console.error("Transcript Error:", {
        message: transcriptError.message,
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
