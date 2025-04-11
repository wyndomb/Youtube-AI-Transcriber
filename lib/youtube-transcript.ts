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

// Enhanced headers to better mimic a real browser
const getBrowserLikeHeaders = () => {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
    "sec-ch-ua":
      '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "Upgrade-Insecure-Requests": "1",
    Referer: "https://www.youtube.com/",
    "Cache-Control": "max-age=0",
  };
};

// Storage for cookies and session data between requests
let cookieJar = "";
let consentToken = "";

// Simple cache for HTML content by videoId
const htmlCache: Record<string, { html: string; timestamp: number }> = {};
const CACHE_TTL = 60 * 1000; // 1 minute cache

// Helper function to establish YouTube session and get initial cookies
async function establishYouTubeSession(): Promise<boolean> {
  try {
    // Reset cookie jar for a fresh session
    cookieJar = "";

    // Initial touch to get YouTube cookies and possibly consent page
    const initialResponse = await fetch("https://www.youtube.com/", {
      headers: getBrowserLikeHeaders(),
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    // Save cookies from initial request
    const setCookieHeader = initialResponse.headers.get("set-cookie");
    if (setCookieHeader) {
      cookieJar = setCookieHeader;

      // Look for and process consent tokens if available
      const html = await initialResponse.text();
      const consentMatch = html.match(/consent.youtube.com\/[^"]+/);
      if (consentMatch) {
        const consentUrl = `https://${consentMatch[0]}`;
        await processConsentPage(consentUrl);
      }

      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to establish YouTube session: ${error}`);
    return false;
  }
}

// Helper function to handle YouTube consent pages
async function processConsentPage(consentUrl: string): Promise<void> {
  try {
    // First fetch the consent page
    const consentPageResponse = await fetch(consentUrl, {
      headers: {
        ...getBrowserLikeHeaders(),
        ...(cookieJar ? { Cookie: cookieJar } : {}),
      },
      redirect: "follow",
    });

    // Update cookies
    const consentCookies = consentPageResponse.headers.get("set-cookie");
    if (consentCookies) {
      cookieJar = consentCookies;
    }

    // Parse the consent page
    const consentHtml = await consentPageResponse.text();

    // Find the form data needed for consent
    const formMatch = consentHtml.match(/<form[^>]*>[\s\S]*?<\/form>/i);
    if (formMatch) {
      // Extract form action URL
      const actionMatch = formMatch[0].match(/action="([^"]+)"/);
      const formAction = actionMatch ? actionMatch[1] : "";

      // Extract hidden fields - fix for TypeScript compatibility
      const hiddenFieldRegex =
        /<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g;
      const formData = new URLSearchParams();

      // Use a regular RegExp.exec approach instead of matchAll
      let hiddenMatch;
      while ((hiddenMatch = hiddenFieldRegex.exec(formMatch[0])) !== null) {
        formData.append(hiddenMatch[1], hiddenMatch[2]);
      }

      // Add consent selection (agree to all)
      formData.append("consent_submitted", "true");
      formData.append("continue", "https://www.youtube.com/");
      formData.append("bl", "boq_identityfrontenduiserver_20231128.03_p0");
      formData.append("hl", "en");
      formData.append("consent_ack", "yes");
      formData.append("consent_hl", "en");
      formData.append("consent_gac", "1");

      // Submit the consent form
      const submitResponse = await fetch(formAction || consentUrl, {
        method: "POST",
        headers: {
          ...getBrowserLikeHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        body: formData.toString(),
        redirect: "follow",
      });

      // Update cookies once more
      const submitCookies = submitResponse.headers.get("set-cookie");
      if (submitCookies) {
        cookieJar = submitCookies;
        console.log("Processed YouTube consent page successfully");
      }
    }
  } catch (error) {
    console.warn(`Failed to process consent page: ${error}`);
  }
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
      ...getBrowserLikeHeaders(),
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    signal: AbortSignal.timeout(10000),
  });

  // Save cookies for future requests
  const setCookieHeader = transcriptResponse.headers.get("set-cookie");
  if (setCookieHeader) {
    cookieJar = setCookieHeader;
  }

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

  try {
    // Check if we already have a session, if not establish one
    if (!cookieJar) {
      console.log(
        `[${videoId}] No active session, establishing YouTube session first...`
      );
      await establishYouTubeSession();
    }

    // Check cache first
    if (
      htmlCache[videoId] &&
      Date.now() - htmlCache[videoId].timestamp < CACHE_TTL
    ) {
      console.log(`[${videoId}] Using cached HTML content`);
      const transcript = await extractAndParseTranscriptFromHtml(
        htmlCache[videoId].html,
        videoId
      );
      if (transcript) {
        return transcript;
      }
      // If parsing failed with cached content, clear cache and try fresh fetch
      delete htmlCache[videoId];
    }

    // Random delay to mimic human behavior (100-300ms)
    await new Promise((resolve) =>
      setTimeout(resolve, 100 + Math.random() * 200)
    );

    // Log request headers for debugging
    const requestHeaders = {
      ...getBrowserLikeHeaders(),
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    };
    console.log(
      `[${videoId}] Request headers (subset): User-Agent=${requestHeaders[
        "User-Agent"
      ]?.substring(0, 30)}..., Accept-Language=${
        requestHeaders["Accept-Language"]
      }, Cookie=${cookieJar ? "Set" : "Not set"}`
    );

    // Main video page request with cookies
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: requestHeaders,
      signal: AbortSignal.timeout(15000),
    });

    // Log response details for debugging
    console.log(
      `[${videoId}] YouTube response status: ${response.status}, URL: ${
        response.url
      }, Content-Type: ${response.headers.get("content-type")}`
    );

    // Check if we were redirected to consent page
    const finalUrl = response.url;
    if (finalUrl.includes("consent.youtube.com")) {
      console.log(`[${videoId}] Redirected to consent page, processing...`);
      await processConsentPage(finalUrl);

      // Retry the main request after consent
      console.log(
        `[${videoId}] Retrying main request after processing consent...`
      );
      const retryResponse = await fetch(
        `https://www.youtube.com/watch?v=${videoId}`,
        {
          headers: {
            ...getBrowserLikeHeaders(),
            ...(cookieJar ? { Cookie: cookieJar } : {}),
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      // Log retry response details
      console.log(
        `[${videoId}] Retry response status: ${retryResponse.status}, URL: ${retryResponse.url}`
      );

      // Update cookies from the retry response
      const retryCookies = retryResponse.headers.get("set-cookie");
      if (retryCookies) {
        cookieJar = retryCookies;
      }

      // Continue with this response
      if (!retryResponse.ok) {
        throw new Error(
          `Failed to fetch video page after consent: ${retryResponse.status}`
        );
      }

      const html = await retryResponse.text();
      // Log HTML size and check for key markers
      console.log(
        `[${videoId}] Received HTML size: ${
          html.length
        }, Contains captions data: ${html.includes(
          "captionTracks"
        )}, Contains player data: ${html.includes("ytInitialPlayerResponse")}`
      );

      // Cache the HTML content
      htmlCache[videoId] = { html, timestamp: Date.now() };

      // Continue with parsing
      const transcript = await extractAndParseTranscriptFromHtml(html, videoId);
      if (!transcript) {
        throw new Error("Transcript extraction/parsing failed after consent");
      }
      return transcript;
    }

    // Update cookies from the video page response
    const videoPageCookies = response.headers.get("set-cookie");
    if (videoPageCookies) {
      cookieJar = videoPageCookies;
    }

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

    // Log HTML content diagnostics
    console.log(
      `[${videoId}] HTML content length: ${
        html.length
      }, Contains captions data: ${html.includes(
        "captionTracks"
      )}, Contains player data: ${html.includes("ytInitialPlayerResponse")}`
    );

    // Update cache with the fresh HTML
    htmlCache[videoId] = { html, timestamp: Date.now() };

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

  try {
    // 1. Fetch Initial Page Content with enhanced headers
    const initialResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          ...getBrowserLikeHeaders(),
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    // Update cookies from this response
    const setCookieHeader = initialResponse.headers.get("set-cookie");
    if (setCookieHeader) {
      cookieJar = setCookieHeader;
    }

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

    // 3. Make the Innertube API request with enhanced headers
    const playerApiUrl = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;
    const playerApiResponse = await fetch(playerApiUrl, {
      method: "POST",
      headers: {
        ...getBrowserLikeHeaders(),
        "Content-Type": "application/json",
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": INNERTUBE_CONTEXT.client.clientVersion,
        ...(cookieJar ? { Cookie: cookieJar } : {}),
      },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        videoId: videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    // Update cookies from this API response
    const apiCookies = playerApiResponse.headers.get("set-cookie");
    if (apiCookies) {
      cookieJar = apiCookies;
    }

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

    // 6. Fetch the transcript with enhanced headers
    const transcriptResponse = await fetch(transcriptUrl, {
      headers: {
        ...getBrowserLikeHeaders(),
        ...(cookieJar ? { Cookie: cookieJar } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });

    // Update cookies again
    const transcriptCookies = transcriptResponse.headers.get("set-cookie");
    if (transcriptCookies) {
      cookieJar = transcriptCookies;
    }

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
          {
            headers: getBrowserLikeHeaders(),
            signal: AbortSignal.timeout(15000),
          }
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
