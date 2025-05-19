import { NextResponse } from "next/server";
// Replace the youtube-transcript npm package with our custom implementation
// import { YoutubeTranscript, TranscriptConfig } from "youtube-transcript";
import { fetchTranscript, TranscriptLine } from "@/lib/youtube-transcript";
import OpenAI from "openai";
import { fetchMetadataFromYouTubeAPI } from "@/lib/youtube";
import { PodcastMetadata } from "@/components/PodcastMetadata";

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set in environment variables");
  throw new Error("OPENAI_API_KEY is not set in environment variables");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define a simple type for oEmbed response (can be shared or redefined)
interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

// Simple oEmbed fetch function (can be shared or redefined) - adjusted for this context
async function fetchOEmbedMetadataForSummarize(
  videoId: string
): Promise<Partial<PodcastMetadata> | null> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  try {
    console.log(
      `[${videoId}] (Summarize) Attempting oEmbed fallback for metadata...`
    );
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    }); // Cache & 8s timeout
    if (!response.ok) {
      console.error(
        `[${videoId}] (Summarize) oEmbed request failed with status ${response.status} ${response.statusText}`
      );
      return null;
    }
    const data: OEmbedResponse = await response.json();
    const metadata: Partial<PodcastMetadata> = {
      videoId: videoId,
      title: data.title || "YouTube Video (oEmbed)",
      channelName: data.author_name || "Unknown Channel (oEmbed)",
      thumbnails: data.thumbnail_url
        ? { default: { url: data.thumbnail_url, width: 0, height: 0 } }
        : null,
      duration: "0:00", // oEmbed doesn't provide duration
    };
    console.log(
      `[${videoId}] (Summarize) Successfully fetched partial metadata via oEmbed fallback.`
    );
    return metadata;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error(`[${videoId}] (Summarize) oEmbed request timed out.`);
    } else {
      console.error(
        `[${videoId}] (Summarize) Error fetching oEmbed metadata:`,
        error.message || error
      );
    }
    return null;
  }
}

// Custom function to fetch YouTube transcript directly
async function fetchYouTubeTranscriptDirectly(videoId: string) {
  console.log(`[${videoId}] Attempting direct transcript fetch...`);
  try {
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
        signal: AbortSignal.timeout(15000), // 15 second timeout
      }
    );

    if (!videoPageResponse.ok) {
      throw new Error(
        `Failed to fetch video page: ${videoPageResponse.status} ${videoPageResponse.statusText}`
      );
    }

    const contentType = videoPageResponse.headers.get("content-type");
    if (!contentType || !contentType.includes("text/html")) {
      // Sometimes YouTube might return JSON even on direct page request, handle this
      if (contentType.includes("application/json")) {
        console.warn(
          `[${videoId}] Direct fetch received JSON instead of HTML. Content might be blocked or page structure changed.`
        );
        // Optionally try to parse JSON for errors if relevant
      } else {
        throw new Error(`Invalid content type returned: ${contentType}`);
      }
    }

    const videoPageContent = await videoPageResponse.text();

    if (!videoPageContent || videoPageContent.length < 500) {
      // Increased threshold slightly
      throw new Error(
        `Empty or too short response from YouTube (Length: ${videoPageContent?.length})`
      );
    }

    // --- Start Regex Extraction ---
    let rawCaptionsData = null;
    const patterns = [
      /"captions":\s*(\{.*?"captionTracks":.*?\}),\s*"videoDetails"/, // Main pattern
      /"captionTracks":\s*(\[.*?\])/, // Simpler track array
      /"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext.*?)"/, // Corrected: Reduced escaping for slashes
    ];

    for (const pattern of patterns) {
      const match = videoPageContent.match(pattern);
      if (match && match[1]) {
        const matchedData = match[1]
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\"); // Basic cleaning
        console.log(
          `[${videoId}] Found potential captions data using pattern: ${pattern.source.substring(
            0,
            30
          )}...`
        );

        if (pattern.source.includes("baseUrl")) {
          // Handle direct URL pattern
          // Decode URL-encoded characters
          const decodedUrl = decodeURIComponent(JSON.parse(`"${matchedData}"`)); // Safer decoding
          rawCaptionsData = JSON.stringify({
            playerCaptionsTracklistRenderer: {
              captionTracks: [{ baseUrl: decodedUrl }],
            },
          });
          console.log(`[${videoId}] Extracted direct transcript URL.`);
        } else {
          // Attempt to parse as JSON for other patterns
          try {
            // More robust cleaning might be needed depending on YouTube's output
            const parsed = JSON.parse(matchedData);
            // Ensure structure is somewhat valid before accepting
            if (
              parsed &&
              (parsed.captionTracks ||
                (parsed.playerCaptionsTracklistRenderer &&
                  parsed.playerCaptionsTracklistRenderer.captionTracks))
            ) {
              // Re-stringify into a consistent format if needed, or use directly if structure matches
              if (
                parsed.captionTracks &&
                !parsed.playerCaptionsTracklistRenderer
              ) {
                rawCaptionsData = JSON.stringify({
                  playerCaptionsTracklistRenderer: {
                    captionTracks: parsed.captionTracks,
                  },
                });
              } else {
                rawCaptionsData = JSON.stringify(parsed); // Assume structure is okay
              }
              console.log(`[${videoId}] Successfully parsed extracted JSON.`);
            } else {
              console.warn(
                `[${videoId}] Parsed JSON has unexpected structure.`
              );
            }
          } catch (parseError) {
            console.warn(
              `[${videoId}] Failed to parse extracted data for pattern ${pattern.source.substring(
                0,
                30
              )}...: ${parseError}`
            );
            // Continue to next pattern
          }
        }
        if (rawCaptionsData) break; // Stop if valid data found
      }
    }
    // --- End Regex Extraction ---

    if (!rawCaptionsData) {
      console.error(
        `[${videoId}] No captions data found in video page using any pattern.`
      );
      // Optional: Log a snippet of the page for debugging (be careful with size/PII)
      // console.log(`[${videoId}] Page Snippet: ${videoPageContent.substring(0, 500)}`);
      throw new Error("No captions data found in video page");
    }

    let captionsData;
    try {
      captionsData = JSON.parse(rawCaptionsData); // Already cleaned during extraction
    } catch (e: any) {
      console.error(
        `[${videoId}] Failed to parse final captions JSON: ${
          e.message
        }. Raw Data: ${rawCaptionsData.substring(0, 200)}...`
      );
      throw new Error(`Failed to parse final captions data: ${e.message}`);
    }

    if (
      !captionsData?.playerCaptionsTracklistRenderer?.captionTracks ||
      captionsData.playerCaptionsTracklistRenderer.captionTracks.length === 0
    ) {
      console.warn(
        `[${videoId}] Parsed captions data lacks track information or is empty.`
      );
      throw new Error(
        "Transcript tracks unavailable or disabled in parsed data"
      );
    }

    // Find the first usable transcript URL (prefer 'en' if available, otherwise take first)
    let transcriptUrl = "";
    const tracks = captionsData.playerCaptionsTracklistRenderer.captionTracks;
    const englishTrack = tracks.find(
      (track: any) => track.languageCode === "en"
    );
    transcriptUrl = englishTrack?.baseUrl || tracks[0]?.baseUrl;

    if (!transcriptUrl) {
      console.error(
        `[${videoId}] Could not find a valid baseUrl in caption tracks.`
      );
      throw new Error("No valid transcript URL found in caption tracks");
    }
    console.log(
      `[${videoId}] Using transcript URL: ${transcriptUrl.substring(0, 60)}...`
    );

    // Fetch the transcript XML/TTML
    const transcriptResponse = await fetch(transcriptUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9", // Important for getting english transcript if auto-selected
        Accept: "*/*", // Accept any content type
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error(
        `[${videoId}] Failed to fetch transcript content: ${
          transcriptResponse.status
        } ${transcriptResponse.statusText}. Response: ${errorText.substring(
          0,
          200
        )}`
      );
      throw new Error(
        `Failed to fetch transcript data: ${transcriptResponse.status} ${transcriptResponse.statusText}`
      );
    }

    const transcriptContent = await transcriptResponse.text();

    // Basic validation of transcript content
    if (!transcriptContent || transcriptContent.length < 50) {
      console.error(
        `[${videoId}] Invalid or empty transcript content received.`
      );
      throw new Error("Invalid or empty transcript data received");
    }
    // More robust check: look for common transcript tags
    if (
      !transcriptContent.includes("<text") &&
      !transcriptContent.includes("<p")
    ) {
      console.warn(
        `[${videoId}] Transcript content might be invalid (missing common tags): ${transcriptContent.substring(
          0,
          200
        )}...`
      );
      // Decide whether to throw error or proceed cautiously
      // throw new Error("Transcript content appears invalid (missing tags)");
    }

    // Parse the XML/TTML to extract transcript segments
    const transcript = [];
    // Handle standard XML format <text start="..." dur="...">...</text>
    const xmlRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
    // Handle alternative format (often in TTML) <p begin="..." end="..." ...>...</p>
    const ttmlRegex = /<p begin="([^"]*)" end="([^"]*)"[^>]*>([^<]*)<\/p>/g;

    let match;
    // Try XML first
    while ((match = xmlRegex.exec(transcriptContent)) !== null) {
      const offset = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      // Basic sanity check for parsed numbers
      if (!isNaN(offset) && !isNaN(duration)) {
        transcript.push({
          text: match[3]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\\n/g, " ")
            .trim(),
          duration: duration,
          offset: offset,
        });
      } else {
        console.warn(
          `[${videoId}] Skipping segment due to invalid number format (XML): start='${match[1]}', dur='${match[2]}'`
        );
      }
    }

    // If XML parsing yielded nothing, try TTML format
    if (transcript.length === 0) {
      console.log(
        `[${videoId}] XML pattern found no segments, trying TTML pattern...`
      );
      while ((match = ttmlRegex.exec(transcriptContent)) !== null) {
        const offset = parseTimestamp(match[1]); // Need helper to parse HH:MM:SS.ms
        const end = parseTimestamp(match[2]);
        const duration = end - offset;
        // Basic sanity check for parsed numbers
        if (!isNaN(offset) && !isNaN(duration) && duration >= 0) {
          transcript.push({
            text: match[3]
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/\\n/g, " ")
              .trim(),
            duration: duration,
            offset: offset,
          });
        } else {
          console.warn(
            `[${videoId}] Skipping segment due to invalid number format (TTML): begin='${match[1]}', end='${match[2]}'`
          );
        }
      }
    }

    if (transcript.length === 0) {
      console.error(
        `[${videoId}] Failed to parse transcript content using both XML and TTML patterns. Content snippet: ${transcriptContent.substring(
          0,
          500
        )}...`
      );
      throw new Error("Failed to parse transcript XML/TTML content");
    }

    console.log(
      `[${videoId}] Successfully fetched and parsed transcript directly: ${transcript.length} segments`
    );
    return transcript;
  } catch (error: any) {
    // Enhanced logging
    console.error(
      `[${videoId}] Direct transcript fetch failed: ${error.message || error}`
    );
    // Add more specific logging based on error message content
    if (error.message?.includes("fetch video page")) {
      console.error(
        `[${videoId}] Specific failure: Fetching main video page. Status: ${
          error.message.split(": ")[1]
        }`
      );
    } else if (error.message?.includes("No captions data found")) {
      console.error(
        `[${videoId}] Specific failure: Could not find captions JSON/patterns in HTML.`
      );
    } else if (error.message?.includes("parse final captions data")) {
      console.error(
        `[${videoId}] Specific failure: Parsing extracted captions JSON.`
      );
    } else if (error.message?.includes("fetch transcript data")) {
      console.error(
        `[${videoId}] Specific failure: Fetching the transcript content file. Status: ${
          error.message.split(": ")[1]
        }`
      );
    } else if (error.message?.includes("parse transcript XML/TTML")) {
      console.error(
        `[${videoId}] Specific failure: Parsing the final transcript content.`
      );
    } else if (error.name === "AbortError") {
      console.error(
        `[${videoId}] Direct transcript fetch sub-request timed out.`
      );
    } else if (error.message?.includes("Invalid content type")) {
      console.error(
        `[${videoId}] Specific failure: Received unexpected content type from YouTube.`
      );
    } else if (error.message?.includes("Empty or too short response")) {
      console.error(
        `[${videoId}] Specific failure: Received unusable short response from YouTube.`
      );
    }
    // Re-throw the original error to be caught by the main handler's loop
    throw error;
  }
}

// Helper to parse HH:MM:SS.ms timestamps from TTML
function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(":");
  let seconds = 0;
  if (parts.length === 3) {
    seconds += parseFloat(parts[0]) * 3600;
    seconds += parseFloat(parts[1]) * 60;
    seconds += parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds += parseFloat(parts[0]) * 60;
    seconds += parseFloat(parts[1]);
  } else if (parts.length === 1) {
    seconds += parseFloat(parts[0]);
  }
  return isNaN(seconds) ? 0 : seconds; // Return 0 if parsing fails
}

// Helper function to fetch podcast metadata (Refactored for Summarize route)
const fetchPodcastMetadataForSummarize = async (
  videoId: string
): Promise<Partial<PodcastMetadata> | null> => {
  let metadata: Partial<PodcastMetadata> | null = null;

  // 1. Try fetching using the YouTube Data API (shared function)
  try {
    console.log(
      `[${videoId}] (Summarize) Attempting metadata fetch via YouTube API...`
    );
    metadata = await fetchMetadataFromYouTubeAPI(videoId);
    if (metadata) {
      console.log(
        `[${videoId}] (Summarize) Metadata successfully fetched via YouTube API.`
      );
      return metadata;
    } else {
      console.warn(
        `[${videoId}] (Summarize) YouTube API metadata fetch returned null, proceeding to fallback.`
      );
    }
  } catch (apiError: any) {
    console.error(
      `[${videoId}] (Summarize) Error during YouTube API metadata fetch: ${
        apiError.message || apiError
      }. Proceeding to fallback.`
    );
    if (apiError.name === "AbortError") {
      console.error(`[${videoId}] (Summarize) YouTube API request timed out.`);
    }
  }

  // 2. If API fails or returns null, try oEmbed fallback specific to this route
  if (!metadata) {
    try {
      console.log(
        `[${videoId}] (Summarize) Attempting metadata fetch via oEmbed fallback...`
      );
      metadata = await fetchOEmbedMetadataForSummarize(videoId); // Use the function defined in this file
      if (metadata) {
        console.log(
          `[${videoId}] (Summarize) Metadata successfully fetched via oEmbed.`
        );
        return metadata;
      } else {
        console.warn(
          `[${videoId}] (Summarize) oEmbed metadata fetch also returned null.`
        );
      }
    } catch (oembedError: any) {
      console.error(
        `[${videoId}] (Summarize) Error during oEmbed metadata fetch: ${
          oembedError.message || oembedError
        }`
      );
    }
  }

  // 3. If both methods fail, return null
  if (!metadata) {
    console.error(
      `[${videoId}] (Summarize) All methods failed to fetch metadata.`
    );
    return null;
  }

  return metadata;
};

// Function to fetch transcript using YouTube API (Enhanced Logging)
// Note: This often requires OAuth for non-public captions. API key might only work for public ones.
async function fetchYouTubeTranscriptViaAPI(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn(
      `[${videoId}] YouTube API key missing, cannot attempt transcript via API.`
    );
    return null;
  }
  console.log(`[${videoId}] Attempting transcript fetch via YouTube API...`);
  try {
    // Fetch caption list
    const listUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
    const listResponse = await fetch(listUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error(
        `[${videoId}] YouTube API caption list request failed: Status ${
          listResponse.status
        }. Response: ${errorText.substring(0, 200)}`
      );
      if (listResponse.status === 403) {
        // Forbidden often means captions disabled by owner or requires OAuth
        console.warn(
          `[${videoId}] API Error 403: Captions likely disabled or require owner permission (OAuth).`
        );
        throw new Error(`Captions disabled or private (API 403)`);
      } else if (listResponse.status === 404) {
        console.warn(`[${videoId}] API Error 404: Video/Captions not found.`);
        throw new Error(`Video or captions not found (API 404)`);
      } else {
        throw new Error(
          `Failed to list captions via API: ${listResponse.statusText}`
        );
      }
    }

    const listData = await listResponse.json();
    if (!listData.items || listData.items.length === 0) {
      console.warn(`[${videoId}] YouTube API returned no caption tracks.`);
      throw new Error("No caption tracks found via API");
    }

    // Prefer English, fallback to first available
    const englishTrack = listData.items.find(
      (item: any) => item.snippet?.language === "en"
    );
    const trackToDownload = englishTrack || listData.items[0];
    const captionId = trackToDownload.id;

    console.log(
      `[${videoId}] Found API caption track ID: ${captionId}, Language: ${trackToDownload.snippet?.language}`
    );

    // Download the caption track (try common formats, srt might work with API key)
    // Note: download often requires OAuth, but try standard formats. ttml is common.
    let downloadedTranscript = null;
    const formatsToTry = ["srt", "vtt", "ttml"]; // Common formats
    for (const format of formatsToTry) {
      const downloadUrl = `https://www.googleapis.com/youtube/v3/captions/${captionId}?key=${apiKey}&tfmt=${format}`;
      try {
        console.log(`[${videoId}] Attempting API download format: ${format}`);
        const downloadResponse = await fetch(downloadUrl, {
          signal: AbortSignal.timeout(10000),
        });
        if (downloadResponse.ok) {
          downloadedTranscript = await downloadResponse.text();
          console.log(
            `[${videoId}] Successfully downloaded API transcript format: ${format}`
          );
          break; // Success
        } else {
          const errorText = await downloadResponse.text();
          console.warn(
            `[${videoId}] API download failed for format ${format}: Status ${
              downloadResponse.status
            }. Response: ${errorText.substring(0, 200)}`
          );
          // Continue to next format
        }
      } catch (downloadError: any) {
        console.warn(
          `[${videoId}] Error during API download attempt for format ${format}: ${downloadError.message}`
        );
        // Continue to next format
      }
    }

    if (!downloadedTranscript) {
      console.error(
        `[${videoId}] Failed to download API transcript using formats: ${formatsToTry.join(
          ", "
        )}`
      );
      throw new Error(`Failed to download caption track using any format`);
    }

    // Simple parsing (assuming SRT or VTT-like format - needs improvement for robustness)
    // This is a placeholder - a proper SRT/VTT parser is recommended
    const lines = downloadedTranscript.split("\\n");
    const transcript = lines
      .map((line) => line.trim())
      .filter((line) => line && !line.match(/^\d+$/) && !line.includes("-->")) // Basic filter
      .map((text) => ({ text, duration: 0, offset: 0 })); // Dummy duration/offset

    if (transcript.length === 0) {
      console.error(
        `[${videoId}] Failed to parse downloaded API transcript content.`
      );
      throw new Error("Failed to parse downloaded API transcript");
    }

    console.log(
      `[${videoId}] Successfully fetched and parsed transcript via YouTube API: ${transcript.length} lines (basic parse).`
    );
    return transcript; // Return the parsed transcript
  } catch (error: any) {
    console.error(
      `[${videoId}] YouTube API transcript fetch failed: ${
        error.message || error
      }`
    );
    if (error.name === "AbortError") {
      console.error(
        `[${videoId}] YouTube API transcript fetch sub-request timed out.`
      );
    }
    // Specific logging based on error message
    if (
      error.message?.includes("Captions disabled") ||
      error.message?.includes("API 403")
    ) {
      console.warn(
        `[${videoId}] Transcript fetch via API blocked (likely disabled/private).`
      );
    } else if (error.message?.includes("No caption tracks")) {
      console.warn(`[${videoId}] No caption tracks listed by API.`);
    } else if (error.message?.includes("Failed to download")) {
      console.error(
        `[${videoId}] Critical failure during API transcript download phase.`
      );
    }
    return null; // Indicate failure to the caller to try next method
  }
}

// Function to fetch transcript using Innertube API (Enhanced Logging)
async function fetchYouTubeTranscriptViaInnertubeAPI(videoId: string) {
  console.log(`[${videoId}] Attempting transcript fetch via Innertube API...`);
  let pageContent = ""; // Store page content for debugging
  try {
    // 1. Fetch the video page
    const pageResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!pageResponse.ok) {
      throw new Error(
        `Failed to fetch video page: ${pageResponse.status} ${pageResponse.statusText}`
      );
    }
    pageContent = await pageResponse.text();
    if (!pageContent || pageContent.length < 1000) {
      throw new Error("Empty or too short response from YouTube page fetch");
    }

    // 2. Extract necessary data (API Key, Client Version, Context)
    const apiKeyMatch = pageContent.match(/"innertubeApiKey":"([^"]+)"/);
    const clientVersionMatch = pageContent.match(/"clientVersion":"([^"]+)"/);
    // Context extraction is complex, find ytInitialPlayerResponse or similar
    const playerResponseMatch = pageContent.match(
      /ytInitialPlayerResponse\s*=\s*(\{.*?\});/
    );

    if (!apiKeyMatch || !apiKeyMatch[1])
      throw new Error("Could not extract Innertube API key");
    if (!clientVersionMatch || !clientVersionMatch[1])
      throw new Error("Could not extract client version");
    if (!playerResponseMatch || !playerResponseMatch[1])
      throw new Error(
        "Could not extract player context (ytInitialPlayerResponse)"
      );

    const apiKey = apiKeyMatch[1];
    const clientVersion = clientVersionMatch[1];
    let playerResponse;
    try {
      playerResponse = JSON.parse(playerResponseMatch[1]);
    } catch (e: any) {
      console.error(
        `[${videoId}] Failed to parse ytInitialPlayerResponse JSON: ${e.message}`
      );
      throw new Error("Failed to parse player context JSON");
    }

    // Find captions URL within the player response
    const captionTracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error("No caption tracks found in Innertube player response");
    }

    // Prefer English track, fallback to the first one
    const englishTrack = captionTracks.find(
      (track: any) => track.languageCode === "en"
    );
    const targetTrack = englishTrack || captionTracks[0];
    const captionsUrl = targetTrack?.baseUrl;

    if (!captionsUrl) {
      throw new Error(
        "Could not find captions baseUrl in Innertube player response"
      );
    }

    console.log(
      `[${videoId}] Found Innertube captions URL for lang ${
        targetTrack.languageCode
      }: ${captionsUrl.substring(0, 60)}...`
    );

    // 3. Fetch the actual transcript from the Innertube captions URL
    const transcriptResponse = await fetch(captionsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error(
        `[${videoId}] Innertube captions URL fetch failed: Status ${
          transcriptResponse.status
        }. Response: ${errorText.substring(0, 200)}`
      );
      throw new Error(
        `Innertube captions URL fetch failed: ${transcriptResponse.statusText}`
      );
    }

    const transcriptContent = await transcriptResponse.text();
    if (!transcriptContent || transcriptContent.length < 50) {
      throw new Error("Empty or invalid transcript content from Innertube URL");
    }

    // 4. Parse the transcript (reuse direct fetch parsing logic)
    const transcript = [];
    const xmlRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
    const ttmlRegex = /<p begin="([^"]*)" end="([^"]*)"[^>]*>([^<]*)<\/p>/g;
    let match;

    while ((match = xmlRegex.exec(transcriptContent)) !== null) {
      const offset = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      if (!isNaN(offset) && !isNaN(duration)) {
        transcript.push({
          text: match[3]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\\n/g, " ")
            .trim(),
          duration: duration,
          offset: offset,
        });
      }
    }

    if (transcript.length === 0) {
      console.log(
        `[${videoId}] Innertube XML pattern found no segments, trying TTML pattern...`
      );
      while ((match = ttmlRegex.exec(transcriptContent)) !== null) {
        const offset = parseTimestamp(match[1]);
        const end = parseTimestamp(match[2]);
        const duration = end - offset;
        if (!isNaN(offset) && !isNaN(duration) && duration >= 0) {
          transcript.push({
            text: match[3]
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/\\n/g, " ")
              .trim(),
            duration: duration,
            offset: offset,
          });
        }
      }
    }

    if (transcript.length === 0) {
      console.error(
        `[${videoId}] Failed to parse Innertube transcript content using both XML and TTML patterns. Content snippet: ${transcriptContent.substring(
          0,
          500
        )}...`
      );
      throw new Error("Failed to parse Innertube transcript content");
    }

    console.log(
      `[${videoId}] Successfully fetched and parsed transcript via Innertube API: ${transcript.length} segments`
    );
    return transcript;
  } catch (error: any) {
    console.error(
      `[${videoId}] Innertube API transcript fetch failed: ${
        error.message || error
      }`
    );
    // Add specific logging based on error messages
    if (error.message?.includes("fetch video page")) {
      console.error(
        `[${videoId}] Innertube Failure: Fetching initial page. Status: ${
          error.message.split(": ")[1]
        }`
      );
    } else if (error.message?.includes("extract Innertube API key")) {
      console.error(
        `[${videoId}] Innertube Failure: Extracting API key. Check page structure.`
      );
      // console.log(`[${videoId}] Innertube Page Snippet: ${pageContent?.substring(0, 500)}`); // Debugging
    } else if (error.message?.includes("extract client version")) {
      console.error(
        `[${videoId}] Innertube Failure: Extracting client version. Check page structure.`
      );
    } else if (error.message?.includes("extract player context")) {
      console.error(
        `[${videoId}] Innertube Failure: Extracting ytInitialPlayerResponse. Check page structure.`
      );
    } else if (error.message?.includes("parse player context")) {
      console.error(
        `[${videoId}] Innertube Failure: Parsing ytInitialPlayerResponse JSON.`
      );
    } else if (error.message?.includes("No caption tracks found")) {
      console.warn(
        `[${videoId}] Innertube Info: No caption tracks listed in player response.`
      );
    } else if (error.message?.includes("Could not find captions baseUrl")) {
      console.error(
        `[${videoId}] Innertube Failure: Found tracks but no baseUrl.`
      );
    } else if (error.message?.includes("Innertube captions URL fetch failed")) {
      console.error(
        `[${videoId}] Innertube Failure: Fetching final transcript content. Status: ${
          error.message.split(": ")[1]
        }`
      );
    } else if (
      error.message?.includes("Failed to parse Innertube transcript content")
    ) {
      console.error(
        `[${videoId}] Innertube Failure: Parsing final transcript content.`
      );
    } else if (error.name === "AbortError") {
      console.error(
        `[${videoId}] Innertube API transcript fetch sub-request timed out.`
      );
    } else if (error.message?.includes("Empty or too short response")) {
      console.error(
        `[${videoId}] Innertube Failure: Empty/short response fetching initial page.`
      );
    } else if (error.message?.includes("Empty or invalid transcript content")) {
      console.error(
        `[${videoId}] Innertube Failure: Empty/short response fetching final transcript.`
      );
    }
    return null; // Indicate failure to the caller to try next method
  }
}

// Main POST handler (modified to handle metadata failure and try multiple transcript methods)
export async function POST(request: Request) {
  // Extract the videoId from the request body
  let reqData;
  try {
    reqData = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { videoId } = reqData;

  if (!videoId) {
    return NextResponse.json(
      { error: "Missing videoId parameter" },
      { status: 400 }
    );
  }

  console.log(`[${videoId}] Processing summarize request...`);

  // Fetch YouTube metadata
  console.log(`[${videoId}] Fetching video metadata...`);
  let metadata = null;
  let metadataError = null;
  try {
    metadata = await fetchMetadataFromYouTubeAPI(videoId);
    console.log(`[${videoId}] Metadata successfully fetched.`);
  } catch (error: any) {
    console.error(
      `[${videoId}] Error fetching metadata from YouTube API:`,
      error.message || error
    );
    metadataError = error.message || "Unknown error fetching metadata";

    // Try fallback via oEmbed
    try {
      metadata = await fetchOEmbedMetadataForSummarize(videoId);
      if (metadata) {
        console.log(
          `[${videoId}] Partial metadata retrieved via oEmbed fallback.`
        );
        metadataError = null; // Clear error if fallback succeeded
      }
    } catch (fallbackError: any) {
      console.error(
        `[${videoId}] Fallback oEmbed metadata fetch also failed:`,
        fallbackError.message || fallbackError
      );
    }
  }

  // --- Transcript Fetching Logic with Fallbacks ---
  // Update the transcript fetching to use our custom implementation
  let transcript: any = null; // Use 'any' or a specific transcript segment type
  let lastTranscriptError: Error | null = null;

  try {
    // Try our custom implementation from the lib
    console.log(
      `[${videoId}] Attempting to fetch transcript with custom library...`
    );
    transcript = await fetchTranscript(videoId);
    if (transcript && transcript.length > 0) {
      console.log(
        `[${videoId}] Successfully fetched transcript using custom implementation.`
      );
    } else {
      console.warn(
        `[${videoId}] Custom implementation returned empty transcript.`
      );
      throw new Error("No transcript content returned");
    }
  } catch (error: any) {
    console.error(
      `[${videoId}] Error fetching transcript:`,
      error.message || error
    );
    lastTranscriptError = error;

    // If this is a specific error about captions not being available,
    // we'll handle it differently in the UI response
    if (
      error.message.includes("doesn't have captions") ||
      error.message.includes("has disabled captions")
    ) {
      return NextResponse.json(
        {
          error: "CAPTIONS_UNAVAILABLE",
          message: error.message,
          metadata: metadata || null,
        },
        { status: 404 }
      );
    }
  }

  // If we still don't have a valid transcript, return an error
  if (!transcript || transcript.length === 0) {
    return NextResponse.json(
      {
        error: "TRANSCRIPT_FETCH_FAILED",
        message: lastTranscriptError?.message || "Failed to fetch transcript",
        metadata: metadata || null,
      },
      { status: 500 }
    );
  }

  // ... rest of the code remains the same

  // Replace this comment with the actual processing code:
  // Process the transcript and generate a summary
  console.log(
    `[${videoId}] Transcript obtained (${transcript.length} segments), proceeding to format and summarize...`
  );

  // Join transcript segments into a single string
  let processedTranscriptText = transcript
    .map((item: { text: string }) => item.text)
    .join(" ");

  // Basic check for meaningful transcript content
  let summary = "Could not generate summary."; // Default summary

  if (processedTranscriptText.trim().length < 50) {
    // Arbitrary short length check
    console.warn(
      `[${videoId}] Transcript text seems very short (${
        processedTranscriptText.trim().length
      } chars), summary might be poor.`
    );
    summary =
      "Summary could not be generated (transcript content was too short or invalid).";
    processedTranscriptText =
      "Transcript content appears invalid or too short.";

    return NextResponse.json(
      {
        metadata: metadata, // Return metadata
        summary: summary,
        transcript: processedTranscriptText,
        error: "Transcript content invalid/short.",
      },
      { status: 200 }
    );
  }

  // --- Summarization Logic ---
  try {
    const MAX_TRANSCRIPT_LENGTH = 100000; // gpt-4o-mini has large context, but keep reasonable limit
    let transcriptForPrompt = processedTranscriptText;
    if (processedTranscriptText.length > MAX_TRANSCRIPT_LENGTH) {
      console.warn(
        `[${videoId}] Transcript length (${processedTranscriptText.length}) exceeds limit (${MAX_TRANSCRIPT_LENGTH}), truncating.`
      );
      transcriptForPrompt = processedTranscriptText.substring(
        0,
        MAX_TRANSCRIPT_LENGTH
      );
    }

    // Construct a more detailed prompt
    const prompt = `
      **Analyze the following podcast transcript:**

      **Metadata:**
      - Title: ${metadata?.title || "N/A"}
      - Channel: ${metadata?.channelName || "N/A"}
      ${metadata?.duration ? `- Duration: ${metadata.duration}` : ""}

      **Transcript:**
      """
      ${transcriptForPrompt}
      """

      **Instructions:**
      Generate a comprehensive yet concise summary in Markdown format. Structure the summary with the following sections, ensuring each section has meaningful content derived *only* from the provided transcript and metadata. If a section cannot be populated from the text, omit it or state "Not applicable based on transcript."

      1.  **Executive Summary:** (1-2 paragraphs capturing the core essence and main topics discussed).
      2.  **Key Insights:** (3-5 distinct bullet points highlighting the most important takeaways, arguments, or findings).
      3.  **Notable Quotes:** (2-3 impactful or representative quotes directly from the transcript, correctly attributed if possible, otherwise just list the quote).
      4.  **Potential Action Items / Further Questions:** (1-3 actionable suggestions or thought-provoking questions raised by the content).

      **Formatting Requirements:**
      - Use standard Markdown (headers, bolding, lists).
      - Ensure clarity, accuracy, and conciseness.
      - Do NOT add any introductory or concluding phrases outside of the requested sections.
      - Output only the Markdown content.
    `;

    console.log(
      `[${videoId}] Sending request to OpenAI (gpt-4o-mini) for summarization...`
    );
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200, // Increased slightly for potentially longer summaries
      temperature: 0.5,
    });
    console.log(`[${videoId}] OpenAI summarization response received.`);

    if (
      !response.choices ||
      response.choices.length === 0 ||
      !response.choices[0].message?.content
    ) {
      // Log the API response if available and failed
      console.error(
        `[${videoId}] Invalid or empty response received from OpenAI. Response:`,
        JSON.stringify(response, null, 2)
      );
      throw new Error("Invalid or empty response received from OpenAI.");
    }

    summary = response.choices[0].message.content.trim();
  } catch (openaiError: any) {
    console.error(
      `[${videoId}] Error during OpenAI summarization: ${
        openaiError.message || openaiError
      }`
    );
    // Check for specific OpenAI errors (e.g., rate limits, content policy)
    if (openaiError.response) {
      // Check if it's an API error response
      console.error(
        `[${videoId}] OpenAI API Error Details: Status ${
          openaiError.response.status
        }, Data: ${JSON.stringify(openaiError.response.data)}`
      );
      summary = `Error generating summary due to OpenAI API issue (Status: ${openaiError.response.status}). Please try again later.`;
    } else {
      summary = "Error generating summary. Please try again later.";
    }
    // Keep the processed transcript text available even if summary fails
  }

  // Return successful response with metadata and summary
  console.log(
    `[${videoId}] Process completed successfully. Returning summary and transcript.`
  );
  return NextResponse.json({
    metadata: metadata as PodcastMetadata, // Cast to full type
    summary,
    transcript: processedTranscriptText, // Return the full processed text
    error: null, // Explicitly null on success
  });
}

// Removed the old fetchPodcastMetadata internal fetch logic
// Added enhanced logging to catch blocks of transcript fetchers
// Updated main POST handler to try multiple transcript methods sequentially
// Updated OpenAI model and prompt structure
// Improved error handling and user messaging when transcript fetching fails completely
// Refactored metadata fetching to use shared functions
// Added TTML parsing fallback to direct fetch
// Added helper for timestamp parsing
