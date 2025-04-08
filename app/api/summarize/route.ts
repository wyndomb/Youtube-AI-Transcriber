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

// Custom function to fetch YouTube transcript directly
// This serves as a fallback if the youtube-transcript library fails
async function fetchYouTubeTranscriptDirectly(videoId: string) {
  try {
    console.log(`[${videoId}] Attempting direct transcript fetch...`);

    // First, fetch the video page to extract necessary tokens
    const videoPageResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(15000), // 15 second timeout
      }
    );

    if (!videoPageResponse.ok) {
      throw new Error(
        `Failed to fetch video page: ${videoPageResponse.status} ${videoPageResponse.statusText}`
      );
    }

    // Check content type to ensure we got HTML
    const contentType = videoPageResponse.headers.get("content-type");
    if (!contentType || !contentType.includes("text/html")) {
      throw new Error(`Invalid content type returned: ${contentType}`);
    }

    const videoPageContent = await videoPageResponse.text();

    // Check if we got a meaningful response
    if (!videoPageContent || videoPageContent.length < 1000) {
      throw new Error("Empty or too short response from YouTube");
    }

    // Extract captions data from the page
    const captionsMatch = videoPageContent.match(
      /"captions":(.*?),"videoDetails"/
    );

    // If the first pattern doesn't match, try alternative patterns
    let captionsData;
    let rawCaptionsData = null;

    if (captionsMatch && captionsMatch[1]) {
      rawCaptionsData = captionsMatch[1];
    } else {
      // Try alternative pattern
      const altCaptionsMatch = videoPageContent.match(
        /\\"captionTracks\\":(\[.*?\])/
      );

      if (altCaptionsMatch && altCaptionsMatch[1]) {
        // Directly create a structure compatible with our existing code
        console.log(`[${videoId}] Found captions using alternative pattern 1`);

        try {
          // Clean the JSON string before parsing
          const cleanedAltJson = altCaptionsMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\\\u/g, "\\u")
            .replace(/\\\\/g, "\\");

          const captionTracks = JSON.parse(cleanedAltJson);

          if (captionTracks && captionTracks.length > 0) {
            // Create a structure compatible with our existing code
            rawCaptionsData = JSON.stringify({
              playerCaptionsTracklistRenderer: {
                captionTracks: captionTracks,
              },
            });
          }
        } catch (parseError) {
          console.error(
            `[${videoId}] Failed to parse alternative captions data:`,
            parseError
          );
        }
      }

      // If still no match, try a third pattern that looks for direct baseUrl
      if (!rawCaptionsData) {
        const thirdPatternMatch = videoPageContent.match(
          /\\"baseUrl\\":\\"(https:\/\/www\.youtube\.com\/api\/timedtext[^"\\]*)/
        );

        if (thirdPatternMatch && thirdPatternMatch[1]) {
          console.log(
            `[${videoId}] Found captions using alternative pattern 2`
          );

          // Extract the URL and decode it
          const transcriptUrl = thirdPatternMatch[1]
            .replace(/\\u0026/g, "&")
            .replace(/\\\\/g, "\\");

          // Create a compatible structure with the URL directly
          rawCaptionsData = JSON.stringify({
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  baseUrl: transcriptUrl,
                },
              ],
            },
          });
        }
      }
    }

    if (!rawCaptionsData) {
      throw new Error("No captions data found in video page");
    }

    // Parse captions data
    try {
      // Clean up the JSON string before parsing
      const cleanedJson = rawCaptionsData
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      captionsData = JSON.parse(cleanedJson);
    } catch (e: any) {
      throw new Error(`Failed to parse captions data: ${e.message}`);
    }

    // Check if captions are available
    if (!captionsData.playerCaptionsTracklistRenderer) {
      throw new Error("Transcript is disabled on this video");
    }

    if (!captionsData.playerCaptionsTracklistRenderer.captionTracks) {
      throw new Error("No transcript tracks available");
    }

    // Get the first available transcript URL (usually English if available)
    const transcriptUrl =
      captionsData.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl;

    // Fetch the transcript XML
    const transcriptResponse = await fetch(transcriptUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!transcriptResponse.ok) {
      throw new Error(
        `Failed to fetch transcript data: ${transcriptResponse.status} ${transcriptResponse.statusText}`
      );
    }

    const transcriptXml = await transcriptResponse.text();

    // Validate that we received proper XML data
    if (!transcriptXml || !transcriptXml.includes("<transcript>")) {
      throw new Error("Invalid transcript data received");
    }

    // Parse the XML to extract transcript
    const regex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
    let matches = [];
    let match;
    while ((match = regex.exec(transcriptXml)) !== null) {
      matches.push(match);
    }

    if (matches.length === 0) {
      throw new Error("Failed to parse transcript XML");
    }

    // Convert to transcript format
    const transcript = matches.map((match) => ({
      text: match[3]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"'),
      duration: parseFloat(match[2]),
      offset: parseFloat(match[1]),
    }));

    console.log(
      `[${videoId}] Successfully fetched transcript directly: ${transcript.length} segments`
    );
    return transcript;
  } catch (error) {
    console.error(`[${videoId}] Direct transcript fetch failed:`, error);
    throw error;
  }
}

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

    console.log("Using API origin:", origin);

    try {
      const response = await fetch(`${origin}/api/podcast-metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
        }),
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      const data = await response.json();
      return data.metadata;
    } catch (fetchError) {
      console.error("Error making metadata request:", fetchError);

      // If the internal API call fails, try fetching directly from YouTube's oEmbed API
      // as a backup that doesn't require the YouTube API key
      console.log(
        `[${videoId}] Attempting direct oEmbed fallback for metadata...`
      );

      const oEmbedResponse = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!oEmbedResponse.ok) {
        throw new Error(`oEmbed fallback failed: ${oEmbedResponse.statusText}`);
      }

      const oEmbedData = await oEmbedResponse.json();

      // Create a simplified metadata object from oEmbed data
      return {
        title: oEmbedData.title || "YouTube Video",
        channelName: oEmbedData.author_name || "Unknown Channel",
        duration: "Unknown duration",
        videoId: videoId,
        description: "Fetched with fallback method",
      };
    }
  } catch (error) {
    console.error("Error fetching podcast metadata:", error);

    // Return minimal metadata using just the video ID since that's all we really need
    return {
      title: "YouTube Video",
      channelName: "Unknown Channel",
      duration: "Unknown duration",
      videoId: videoId,
      description: "Could not fetch metadata",
    };
  }
};

// Add a new function for fetching transcripts via the official YouTube API
async function fetchYouTubeTranscriptViaAPI(videoId: string) {
  try {
    console.log(
      `[${videoId}] Attempting to fetch transcript via YouTube API...`
    );

    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      throw new Error("YouTube API key is not configured");
    }

    // First, we need to get the caption track IDs
    const captionListUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;

    const captionListResponse = await fetch(captionListUrl, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!captionListResponse.ok) {
      throw new Error(
        `Failed to fetch caption list: ${captionListResponse.status} ${captionListResponse.statusText}`
      );
    }

    const captionList = await captionListResponse.json();

    if (!captionList.items || captionList.items.length === 0) {
      throw new Error("No caption tracks found");
    }

    // Find the English track preferably, or use the first one
    let captionTrack = captionList.items[0];
    for (const track of captionList.items) {
      if (track.snippet.language === "en") {
        captionTrack = track;
        break;
      }
    }

    // Now get the actual transcript using the YouTube transcript URL format
    const transcriptUrl = `https://www.youtube.com/api/timedtext?lang=${captionTrack.snippet.language}&v=${videoId}&fmt=srv3`;

    const transcriptResponse = await fetch(transcriptUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!transcriptResponse.ok) {
      throw new Error(
        `Failed to fetch transcript data: ${transcriptResponse.status} ${transcriptResponse.statusText}`
      );
    }

    const transcriptXml = await transcriptResponse.text();

    // Parse the XML to extract transcript
    const regex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
    let matches = [];
    let match;
    while ((match = regex.exec(transcriptXml)) !== null) {
      matches.push(match);
    }

    if (matches.length === 0) {
      throw new Error("Failed to parse transcript XML");
    }

    // Convert to transcript format
    const transcript = matches.map((match) => ({
      text: match[3]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"'),
      duration: parseFloat(match[2]),
      offset: parseFloat(match[1]),
    }));

    console.log(
      `[${videoId}] Successfully fetched transcript via API: ${transcript.length} segments`
    );
    return transcript;
  } catch (error) {
    console.error(`[${videoId}] YouTube API transcript fetch failed:`, error);
    throw error;
  }
}

// Add a new function using a completely different scraping approach
async function fetchYouTubeTranscriptViaInnertubeAPI(videoId: string) {
  try {
    console.log(
      `[${videoId}] Attempting to fetch transcript via Innertube API...`
    );

    // First get the initial page to extract context data
    const initialResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(15000), // 15 second timeout
      }
    );

    if (!initialResponse.ok) {
      throw new Error(
        `Failed to fetch video page: ${initialResponse.status} ${initialResponse.statusText}`
      );
    }

    const html = await initialResponse.text();

    // Extract API key - try multiple patterns
    let innertubeApiKey = null;

    // Pattern 1
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    if (apiKeyMatch && apiKeyMatch[1]) {
      innertubeApiKey = apiKeyMatch[1];
    }

    // Pattern 2 (alternative)
    if (!innertubeApiKey) {
      const apiKeyMatch2 = html.match(/innertubeApiKey":"([^"]+)"/);
      if (apiKeyMatch2 && apiKeyMatch2[1]) {
        innertubeApiKey = apiKeyMatch2[1];
      }
    }

    // Pattern 3 (another alternative)
    if (!innertubeApiKey) {
      const apiKeyMatch3 = html.match(
        /INNERTUBE_API_KEY\s*[:=]\s*['"]([^'"]+)['"]/
      );
      if (apiKeyMatch3 && apiKeyMatch3[1]) {
        innertubeApiKey = apiKeyMatch3[1];
      }
    }

    if (!innertubeApiKey) {
      throw new Error("Could not extract Innertube API key");
    }

    // Extract client version - try multiple patterns
    let clientVersion = null;

    // Pattern a
    const clientVersionMatch = html.match(/"clientVersion":"([^"]+)"/);
    if (clientVersionMatch && clientVersionMatch[1]) {
      clientVersion = clientVersionMatch[1];
    }

    // Pattern b (alternative)
    if (!clientVersion) {
      const clientVersionMatch2 = html.match(/clientVersion":"([^"]+)"/);
      if (clientVersionMatch2 && clientVersionMatch2[1]) {
        clientVersion = clientVersionMatch2[1];
      }
    }

    // If all else fails, use a hardcoded recent version
    if (!clientVersion) {
      console.log(`[${videoId}] Using hardcoded client version as fallback`);
      clientVersion = "2.20240529.01.00";
    }

    // Try alternative direct method for getting transcripts if we have issues with the API
    try {
      // Now we'll use the Innertube API to request the transcript
      const response = await fetch(
        `https://www.youtube.com/youtubei/v1/get_transcript?key=${innertubeApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "WEB",
                clientVersion: clientVersion,
                hl: "en",
                gl: "US",
              },
            },
            params: Buffer.from(JSON.stringify({ videoId })).toString("base64"),
          }),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch transcript: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Check if there are captions
      if (
        !data ||
        !data.actions ||
        !data.actions[0] ||
        !data.actions[0].updateEngagementPanelAction
      ) {
        throw new Error("No transcript data in response");
      }

      const transcriptRenderer =
        data.actions[0].updateEngagementPanelAction.content.transcriptRenderer;

      if (
        !transcriptRenderer ||
        !transcriptRenderer.body ||
        !transcriptRenderer.body.transcriptBodyRenderer
      ) {
        throw new Error("No transcript body found");
      }

      const cueGroups =
        transcriptRenderer.body.transcriptBodyRenderer.cueGroups;

      if (!cueGroups || cueGroups.length === 0) {
        throw new Error("No cue groups found in transcript");
      }

      // Parse the transcript data
      const transcript = cueGroups.map((cueGroup) => {
        const cue =
          cueGroup.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer;
        return {
          text: cue.cue.simpleText,
          duration: 0, // Transcript from this API might not include durations
          offset: parseFloat(cue.startOffsetMs) / 1000, // Convert ms to seconds
        };
      });

      console.log(
        `[${videoId}] Successfully fetched transcript via Innertube API: ${transcript.length} segments`
      );
      return transcript;
    } catch (innerApiError) {
      console.error(
        `[${videoId}] Innertube API request failed:`,
        innerApiError
      );

      // We might still be able to extract the transcript directly from the page
      console.log(
        `[${videoId}] Attempting to extract transcript directly from page...`
      );

      // Find the transcript data in the initial page response
      const transcriptData = html.match(/"captionTracks":\[(.*?)\]/);
      if (!transcriptData || !transcriptData[1]) {
        throw new Error("No transcript data found in page");
      }

      // Find the first caption track URL
      const baseUrlMatch = transcriptData[1].match(/"baseUrl":"([^"]+)"/);
      if (!baseUrlMatch || !baseUrlMatch[1]) {
        throw new Error("No baseUrl found in transcript data");
      }

      // Clean up the URL (unescape)
      const transcriptUrl = baseUrlMatch[1]
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/");

      // Fetch the transcript XML
      const transcriptResponse = await fetch(transcriptUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!transcriptResponse.ok) {
        throw new Error(
          `Failed to fetch transcript data: ${transcriptResponse.status} ${transcriptResponse.statusText}`
        );
      }

      const transcriptXml = await transcriptResponse.text();

      // Parse the XML to extract transcript
      const regex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
      let matches = [];
      let match;
      while ((match = regex.exec(transcriptXml)) !== null) {
        matches.push(match);
      }

      if (matches.length === 0) {
        throw new Error("Failed to parse transcript XML");
      }

      // Convert to transcript format
      const transcript = matches.map((match) => ({
        text: match[3]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"'),
        duration: parseFloat(match[2]),
        offset: parseFloat(match[1]),
      }));

      console.log(
        `[${videoId}] Successfully extracted transcript from page: ${transcript.length} segments`
      );
      return transcript;
    }
  } catch (error) {
    console.error(`[${videoId}] Innertube API transcript fetch failed:`, error);
    throw error;
  }
}

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
      console.log(`[${videoId}] Attempting to fetch transcript...`);

      let transcript;

      // First try with the standard library
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
        console.log(
          `[${videoId}] Standard library successfully fetched transcript: ${transcript?.length} segments`
        );
      } catch (standardError) {
        console.error(
          `[${videoId}] Standard library transcript fetch failed:`,
          standardError
        );
        console.log(
          `[${videoId}] Attempting fallback transcript fetch method...`
        );

        // Try with our custom direct fetch method
        try {
          transcript = await fetchYouTubeTranscriptDirectly(videoId);
        } catch (directError) {
          console.error(
            `[${videoId}] Direct transcript fetch failed:`,
            directError
          );

          // Try with our YouTube API method
          try {
            transcript = await fetchYouTubeTranscriptViaAPI(videoId);
          } catch (apiError) {
            console.error(
              `[${videoId}] YouTube API transcript fetch failed:`,
              apiError
            );

            // Try with our Innertube API method as last resort
            transcript = await fetchYouTubeTranscriptViaInnertubeAPI(videoId);
          }
        }
      }

      console.log(
        `[${videoId}] Raw transcript response received. Length: ${transcript?.length}`
      );

      if (!transcript || transcript.length === 0) {
        console.error(`[${videoId}] No transcript data found in the response.`);
        return NextResponse.json(
          { error: "No transcript found for this video" },
          { status: 404 }
        );
      }

      const transcriptText = transcript.map((item) => item.text).join(" ");
      console.log(
        `[${videoId}] Transcript processed. Text length: ${transcriptText.length}`
      );

      if (!transcriptText || transcriptText.trim() === "") {
        console.error(`[${videoId}] Processed transcript text is empty.`);
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
        `[${videoId}] Truncated transcript text length: ${truncatedText.length}`
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
      console.error(`[${videoId}] Transcript Fetching Error:`, {
        message: transcriptError.message,
        name: transcriptError.name,
        // Consider logging more properties if available, e.g., error code
        stack: transcriptError.stack,
      });

      // Provide more user-friendly error messages based on the error
      let userErrorMessage = `Failed to fetch video transcript: ${transcriptError.message}`;
      let statusCode = 404;

      if (
        transcriptError.message.includes("No captions data found") ||
        transcriptError.message.includes("Transcript is disabled") ||
        transcriptError.message.includes("No transcript tracks available") ||
        transcriptError.message.includes("No caption tracks found") ||
        transcriptError.message.includes("No cue groups found")
      ) {
        userErrorMessage =
          "This video doesn't have captions or transcripts available. Please try a different YouTube video that has captions enabled.";
      } else if (
        transcriptError.message.includes("Failed to fetch video page")
      ) {
        userErrorMessage =
          "Unable to access this YouTube video. The video might be private, restricted, or no longer available.";
      } else if (
        transcriptError.message.includes("Unauthorized") ||
        transcriptError.message.includes("API key")
      ) {
        statusCode = 500;
        userErrorMessage =
          "There was an authorization issue accessing YouTube's data. This is a server configuration problem.";
      }

      // Check if we should try to get some basic metadata anyway, even though transcript failed
      try {
        const basicMetadata = await fetchPodcastMetadata(videoId);

        return NextResponse.json(
          {
            error: userErrorMessage,
            metadata: basicMetadata, // Include metadata even when transcript fails
            videoId,
          },
          { status: statusCode }
        );
      } catch (metadataError) {
        // If even metadata fails, just return the error
        return NextResponse.json(
          { error: userErrorMessage, videoId },
          { status: statusCode }
        );
      }
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
