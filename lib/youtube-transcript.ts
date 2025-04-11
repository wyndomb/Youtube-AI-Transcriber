interface TranscriptLine {
  text: string;
  duration: number;
  offset: number;
}

// Helper to parse HH:MM:SS.ms format to seconds
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

// Extracts caption data from HTML, finds URL, fetches, and parses transcript
async function extractAndParseTranscriptFromHtml(
  html: string,
  videoId: string
): Promise<TranscriptLine[] | null> {
  console.log(`[${videoId}] Extracting transcript data from HTML...`);
  let rawCaptionsData = null;
  const patterns = [
    /"captions":\s*(\{.*?"captionTracks":.*?\}),\s*"videoDetails"/,
    /"captionTracks":\s*(\[.*?\])/,
    /"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext.*?)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const matchedData = match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      console.log(
        `[${videoId}] Found potential captions data using pattern: ${pattern.source.substring(
          0,
          30
        )}...`
      );
      if (pattern.source.includes("baseUrl")) {
        const decodedUrl = decodeURIComponent(JSON.parse(`"${matchedData}"`));
        rawCaptionsData = JSON.stringify({
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ baseUrl: decodedUrl }],
          },
        });
        console.log(`[${videoId}] Extracted direct transcript URL.`);
      } else {
        try {
          const parsed = JSON.parse(matchedData);
          if (
            parsed &&
            (parsed.captionTracks ||
              (parsed.playerCaptionsTracklistRenderer &&
                parsed.playerCaptionsTracklistRenderer.captionTracks))
          ) {
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
              rawCaptionsData = JSON.stringify(parsed);
            }
            console.log(`[${videoId}] Successfully parsed extracted JSON.`);
          } else {
            console.warn(`[${videoId}] Parsed JSON has unexpected structure.`);
          }
        } catch (parseError) {
          console.warn(
            `[${videoId}] Failed to parse extracted data for pattern ${pattern.source.substring(
              0,
              30
            )}...: ${parseError}`
          );
        }
      }
      if (rawCaptionsData) break;
    }
  }

  if (!rawCaptionsData) {
    console.error(
      `[${videoId}] No captions data found in video page using any pattern.`
    );
    return null;
  }

  let captionsData;
  try {
    captionsData = JSON.parse(rawCaptionsData);
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
    return null;
  }

  let transcriptUrl = "";
  const tracks = captionsData.playerCaptionsTracklistRenderer.captionTracks;
  const englishTrack = tracks.find((track: any) => track.languageCode === "en");
  transcriptUrl = englishTrack?.baseUrl || tracks[0]?.baseUrl;

  if (!transcriptUrl) {
    console.error(
      `[${videoId}] Could not find a valid baseUrl in caption tracks.`
    );
    return null;
  }
  console.log(
    `[${videoId}] Using transcript URL: ${transcriptUrl.substring(0, 60)}...`
  );

  // Fetch the transcript XML/TTML
  const transcriptResponse = await fetch(transcriptUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(10000),
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
  if (!transcriptContent || transcriptContent.length < 50) {
    console.error(`[${videoId}] Invalid or empty transcript content received.`);
    return null;
  }
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
  }

  // Parse the XML/TTML to extract transcript segments
  const transcript: TranscriptLine[] = [];
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
    } else {
      console.warn(
        `[${videoId}] Skipping segment due to invalid number format (XML): start='${match[1]}', dur='${match[2]}'`
      );
    }
  }

  if (transcript.length === 0) {
    console.log(
      `[${videoId}] XML pattern found no segments, trying TTML pattern...`
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
    return null;
  }

  console.log(
    `[${videoId}] Successfully extracted and parsed transcript from HTML: ${transcript.length} segments`
  );
  return transcript;
}

// Extracts caption data from HTML, finds URL, fetches, and parses transcript
async function fetchTranscriptDirect(
  videoId: string
): Promise<TranscriptLine[] | null> {
  console.log(`[${videoId}] Attempting Direct Fetch Strategy...`);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };

  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers,
      signal: AbortSignal.timeout(15000), // Add timeout
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch video page: ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("text/html")) {
      console.warn(
        `[${videoId}] Direct fetch received unexpected content-type: ${contentType}. Content might be blocked.`
      );
      // Attempt to read text anyway, might contain error info
      const maybeErrorText = await response.text();
      console.warn(
        `[${videoId}] Received content snippet: ${maybeErrorText.substring(
          0,
          500
        )}`
      );
      throw new Error(`Invalid content type returned: ${contentType}`);
    }

    const html = await response.text();
    if (!html || html.length < 500) {
      throw new Error(
        `Empty or too short response from YouTube (Length: ${html?.length})`
      );
    }

    // Call the combined extraction and parsing function
    const transcript = await extractAndParseTranscriptFromHtml(html, videoId);

    if (!transcript) {
      // Error logging happens inside extractAndParseTranscriptFromHtml
      throw new Error("Transcript extraction/parsing failed");
    }

    return transcript;
  } catch (error: any) {
    console.error(`[${videoId}] Direct Fetch Strategy failed:`, error.message);
    // Log specific failure details if available
    if (error.message.includes("No captions data found")) {
      console.error(
        `[${videoId}] Specific failure: Could not find captions JSON/patterns in HTML.`
      );
    }
    // Re-throw or return null/empty based on desired handling for the sequence
    // Throwing allows the sequence runner to catch and log appropriately
    throw error; // Let the calling sequence handle the failure logging for this method
  }
}

// fetchTranscriptInnertube remains largely the same, as it relies on a different initial fetch mechanism
// Potentially add more specific parsing/error handling within it if needed.
async function fetchTranscriptInnertube(
  videoId: string
): Promise<TranscriptLine[] | null> {
  console.log(`[${videoId}] Attempting Innertube API Strategy...`);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };

  try {
    // 1. Fetch Initial Page Content (similar to Direct, might be needed for Innertube keys/context)
    const initialResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      { headers, signal: AbortSignal.timeout(15000) }
    );
    if (!initialResponse.ok) {
      throw new Error(
        `Innertube initial page fetch failed: ${initialResponse.status} ${initialResponse.statusText}`
      );
    }
    const html = await initialResponse.text();

    // 2. Extract Innertube API Key and Context from the HTML
    // Simplified regex - robust extraction is complex and brittle
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"(.*?)"/);
    const clientVersionMatch = html.match(
      /"INNERTUBE_CONTEXT_CLIENT_VERSION":"(.*?)"/
    );

    if (!apiKeyMatch || !clientVersionMatch) {
      console.error(
        `[${videoId}] Failed to extract Innertube API key or client version from page.`
      );
      // Maybe fallback to trying transcript extraction from this HTML directly?
      console.log(
        `[${videoId}] Attempting direct extraction from Innertube strategy's initial fetch...`
      );
      return await extractAndParseTranscriptFromHtml(html, videoId); // Fallback within fallback
      // throw new Error("Failed to extract Innertube API key/version");
    }
    const INNERTUBE_API_KEY = apiKeyMatch[1];
    const INNERTUBE_CONTEXT = {
      client: {
        clientName: "WEB",
        clientVersion: clientVersionMatch[1],
        // Other context fields might be necessary depending on YT changes
      },
    };

    console.log(
      `[${videoId}] Extracted Innertube Key: ${INNERTUBE_API_KEY.substring(
        0,
        10
      )}..., Version: ${INNERTUBE_CONTEXT.client.clientVersion}`
    );

    // 3. Make the Innertube API request for player data
    const playerApiUrl = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;
    const playerApiResponse = await fetch(playerApiUrl, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId: videoId }),
      signal: AbortSignal.timeout(10000),
    });

    if (!playerApiResponse.ok) {
      const errorText = await playerApiResponse.text();
      console.error(
        `[${videoId}] Innertube Player API request failed: ${
          playerApiResponse.status
        }. Response: ${errorText.substring(0, 300)}`
      );
      throw new Error(
        `Innertube Player API request failed: ${playerApiResponse.status}`
      );
    }

    const playerResponse = await playerApiResponse.json();

    // 4. Find Caption Tracks within Player Response
    if (
      !playerResponse?.captions?.playerCaptionsTracklistRenderer
        ?.captionTracks ||
      playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks
        .length === 0
    ) {
      console.error(
        `[${videoId}] No caption tracks found in Innertube player response`
      );
      console.error(
        "[Innertube Debug] No caption tracks found. Player Response Snippet:",
        JSON.stringify(playerResponse?.captions || {}).substring(0, 1000)
      );
      console.error(
        "[Innertube Info] No caption tracks listed in player response."
      );
      // Don't throw yet, maybe try extracting from initial page fetch as last resort
      // throw new Error('No caption tracks found in Innertube player response');
      console.log(
        `[${videoId}] Innertube API had no tracks, attempting direct extraction from initial page fetch...`
      );
      return await extractAndParseTranscriptFromHtml(html, videoId); // Final fallback attempt
    }

    const captionTracks =
      playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;

    // 5. Select and Fetch Transcript URL (similar to direct method)
    let transcriptUrl = "";
    const englishTrack = captionTracks.find(
      (track: any) => track.languageCode === "en"
    );
    transcriptUrl = englishTrack?.baseUrl || captionTracks[0]?.baseUrl;

    if (!transcriptUrl) {
      console.error(
        `[${videoId}] Could not find a valid baseUrl in Innertube caption tracks.`
      );
      return null; // Or throw
    }
    console.log(
      `[${videoId}] Using Innertube transcript URL: ${transcriptUrl.substring(
        0,
        60
      )}...`
    );

    // 6. Fetch and Parse the Transcript XML/TTML (identical logic to direct fetch)
    const transcriptResponse = await fetch(transcriptUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error(
        `[${videoId}] Failed to fetch Innertube transcript content: ${
          transcriptResponse.status
        } ${transcriptResponse.statusText}. Response: ${errorText.substring(
          0,
          200
        )}`
      );
      throw new Error(
        `Failed to fetch Innertube transcript data: ${transcriptResponse.status} ${transcriptResponse.statusText}`
      );
    }

    const transcriptContent = await transcriptResponse.text();
    if (!transcriptContent || transcriptContent.length < 50) {
      console.error(
        `[${videoId}] Invalid or empty Innertube transcript content received.`
      );
      return null;
    }
    if (
      !transcriptContent.includes("<text") &&
      !transcriptContent.includes("<p")
    ) {
      console.warn(
        `[${videoId}] Innertube transcript content might be invalid (missing common tags): ${transcriptContent.substring(
          0,
          200
        )}...`
      );
    }

    // Parse the XML/TTML to extract transcript segments
    const transcript: TranscriptLine[] = [];
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
        `[${videoId}] Failed to parse Innertube transcript content using both XML and TTML patterns.`
      );
      return null;
    }

    console.log(
      `[${videoId}] Successfully fetched and parsed transcript via Innertube API: ${transcript.length} segments`
    );
    return transcript;
  } catch (error: any) {
    console.error(`[${videoId}] Innertube API Strategy failed:`, error.message);
    // Check if it failed before even getting tracks, if so, try direct extraction from initial page fetch
    if (
      error.message.includes("Failed to extract Innertube API key") ||
      error.message.includes("Innertube Player API request failed")
    ) {
      console.log(
        `[${videoId}] Innertube core API failed, attempting direct extraction from initial page fetch...`
      );
      // Need to ensure html was fetched if error occurred early
      try {
        const initialResponse = await fetch(
          `https://www.youtube.com/watch?v=${videoId}`,
          { headers, signal: AbortSignal.timeout(15000) }
        );
        if (initialResponse.ok) {
          const html = await initialResponse.text();
          return await extractAndParseTranscriptFromHtml(html, videoId);
        }
      } catch (fallbackError: any) {
        console.error(
          `[${videoId}] Final fallback extraction also failed:`,
          fallbackError.message
        );
      }
    }
    throw error; // Let the calling sequence handle the failure logging for this method
  }
}
