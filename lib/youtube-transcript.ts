interface TranscriptLine {
  text: string;
  duration: number;
  offset: number;
}

// Export the interface to be used in other modules
export type { TranscriptLine };

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
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
    "sec-ch-ua":
      '"Chromium";v="123", "Google Chrome";v="123", "Not:A-Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Upgrade-Insecure-Requests": "1",
    Referer: "https://www.youtube.com/",
    "Cache-Control": "max-age=0",
    // Additional headers to help bypass proxy detection
    "X-Forwarded-For": "66.249.66.1", // Simulating a Google crawler IP
    "X-Forwarded-Host": "www.youtube.com",
    DNT: "1", // Do Not Track
    Connection: "keep-alive",
  };
};

// Storage for cookies and session data between requests
let cookieJar = "";
let consentToken = "";
// Track last request time to avoid rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // Minimum 500ms between requests

// Simple cookie parser
const parseCookies = (cookieHeader: string | null): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const value = parts.slice(1).join("=").trim();
      cookies[name] = value;
    }
  });
  return cookies;
};

// Merge cookies to maintain session
const mergeCookies = (
  existingCookies: string,
  newCookieHeader: string | null
): string => {
  if (!newCookieHeader) return existingCookies;

  const existing = parseCookies(existingCookies);
  const newCookies = parseCookies(newCookieHeader);

  // Merge cookies, new ones override existing
  const merged = { ...existing, ...newCookies };

  // Convert back to cookie string
  return Object.entries(merged)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
};

// Simple cache for HTML content by videoId
const htmlCache: Record<string, { html: string; timestamp: number }> = {};
const CACHE_TTL = 60 * 1000; // 1 minute cache

// Add rate limiting protection
const waitBetweenRequests = async (): Promise<void> => {
  const now = Date.now();
  const elapsed = now - lastRequestTime;

  if (elapsed < MIN_REQUEST_INTERVAL) {
    // Add some randomness to make the delay less predictable (450-550ms)
    const delay = MIN_REQUEST_INTERVAL - elapsed + (Math.random() * 100 - 50);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  lastRequestTime = Date.now();
};

// Helper function to establish YouTube session and get initial cookies
async function establishYouTubeSession(): Promise<boolean> {
  try {
    // Reset cookie jar for a fresh session
    cookieJar = "";

    // Wait to avoid rate limiting
    await waitBetweenRequests();

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
    // Wait to avoid rate limiting
    await waitBetweenRequests();

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
      cookieJar = mergeCookies(cookieJar, consentCookies);
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

      // Wait to avoid rate limiting
      await waitBetweenRequests();

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
        cookieJar = mergeCookies(cookieJar, submitCookies);
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

  // More comprehensive patterns to extract captions data
  const patterns = [
    // Standard pattern for captions object
    /"captions":\s*(\{.*?"captionTracks":.*?\}),\s*"videoDetails"/,

    // Alternative pattern for direct captionTracks array
    /"captionTracks":\s*(\[.*?\])/,

    // Direct baseUrl extraction pattern
    /"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/,

    // Newer YouTube format with embedded JSON
    /\{"captionTracks":(\[.*?\]),"audioTracks"/,

    // Patterns for various JSON structures
    /"playerCaptionsTracklistRenderer"\s*:\s*(\{.*?\})/,

    // Special pattern for timedtext in video_id format
    new RegExp(`\\/api\\/timedtext\\?.*?v=${videoId}[^"]+`, "g"),

    // Try to find playerResponse JSON object which contains captions
    /ytInitialPlayerResponse\s*=\s*(\{.*?\});/,

    // New pattern for finding playerResponse in newer YouTube structure
    /"playerResponse":"(\{.*?\})"/,

    // Additional pattern for player_response in legacy structure
    /"player_response":"(.*?)"/,

    // Pattern for initial data in newer YouTube
    /ytInitialData\s*=\s*(\{.*?\});/,

    // Pattern for finding caption tracks in ytcfg data
    /"CAPTION_TRACKS_RESPONSE":"(.*?)"/,
  ];

  // First try to extract from ytInitialPlayerResponse which is more reliable
  const playerResponseMatch = html.match(
    /ytInitialPlayerResponse\s*=\s*(\{.*?\});/
  );

  if (playerResponseMatch && playerResponseMatch[1]) {
    try {
      const playerResponse = JSON.parse(playerResponseMatch[1]);
      // Check if captions exist in the player response
      if (
        playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
      ) {
        console.log(`[${videoId}] Found captions in ytInitialPlayerResponse`);
        rawCaptionsData = JSON.stringify(playerResponse.captions);
      }
    } catch (e) {
      console.warn(
        `[${videoId}] Failed to parse ytInitialPlayerResponse: ${e}`
      );
    }
  }

  // If we couldn't get data from ytInitialPlayerResponse, try other patterns
  if (!rawCaptionsData) {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let matchedData = match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");

        // Handle URL encoded JSON (common in player_response)
        if (
          pattern.source.includes("player_response") ||
          pattern.source.includes("CAPTION_TRACKS_RESPONSE")
        ) {
          try {
            matchedData = decodeURIComponent(matchedData);
          } catch (e) {
            console.warn(`[${videoId}] Failed to decode URI component: ${e}`);
          }
        }

        console.log(
          `[${videoId}] Found potential captions data using pattern: ${pattern.source.substring(
            0,
            30
          )}...`
        );

        if (
          pattern.source.includes("baseUrl") ||
          pattern.source.includes("timedtext")
        ) {
          // Handle direct URL pattern
          try {
            // If it's already a URL, use it directly; otherwise, decode it
            let decodedUrl = matchedData;
            if (matchedData.includes('\\"')) {
              decodedUrl = decodeURIComponent(JSON.parse(`"${matchedData}"`)); // Safer decoding
            }

            // If the URL is relative, make it absolute
            if (decodedUrl.startsWith("/api/timedtext")) {
              decodedUrl = `https://www.youtube.com${decodedUrl}`;
            }

            rawCaptionsData = JSON.stringify({
              playerCaptionsTracklistRenderer: {
                captionTracks: [{ baseUrl: decodedUrl }],
              },
            });
            console.log(
              `[${videoId}] Extracted direct transcript URL: ${decodedUrl.substring(
                0,
                60
              )}...`
            );
          } catch (e) {
            console.warn(`[${videoId}] Failed to decode URL: ${e}`);
          }
        } else {
          // Attempt to parse as JSON for other patterns
          try {
            // Enhanced JSON parsing with better error handling
            let parsed;

            // Handle escaped JSON strings
            if (matchedData.startsWith('"') && matchedData.endsWith('"')) {
              try {
                matchedData = JSON.parse(matchedData);
              } catch (e) {
                console.warn(`[${videoId}] Failed to parse JSON string: ${e}`);
              }
            }

            try {
              parsed = JSON.parse(matchedData);
            } catch (e) {
              // Try cleaning the string more aggressively if initial parse fails
              console.warn(
                `[${videoId}] First parse attempt failed, trying with additional cleaning`
              );
              matchedData = matchedData
                .replace(/\n/g, "")
                .replace(/\r/g, "")
                .replace(/\t/g, "")
                .replace(/\\x(\d\d)/g, (_, p1) =>
                  String.fromCharCode(parseInt(p1, 16))
                );

              // Try replacing escaped backslashes and quotes more thoroughly
              matchedData = matchedData
                .replace(/\\\\"/g, '"')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\");

              try {
                parsed = JSON.parse(matchedData);
              } catch (e2) {
                console.warn(
                  `[${videoId}] Second parse attempt also failed: ${e2}`
                );
                // One more attempt with even more aggressive cleaning
                try {
                  matchedData = matchedData
                    .replace(/[\\]+"/g, '"')
                    .replace(/[\\]+/g, "\\");
                  parsed = JSON.parse(matchedData);
                } catch (e3) {
                  console.warn(
                    `[${videoId}] Third parse attempt failed: ${e3}`
                  );
                  throw e; // Throw the original error
                }
              }
            }

            // Process the parsed data based on its structure
            if (parsed) {
              if (parsed.captionTracks) {
                rawCaptionsData = JSON.stringify({
                  playerCaptionsTracklistRenderer: {
                    captionTracks: parsed.captionTracks,
                  },
                });
              } else if (
                parsed.playerCaptionsTracklistRenderer &&
                parsed.playerCaptionsTracklistRenderer.captionTracks
              ) {
                rawCaptionsData = JSON.stringify(parsed);
              } else if (
                parsed.captions &&
                parsed.captions.playerCaptionsTracklistRenderer
              ) {
                rawCaptionsData = JSON.stringify(parsed.captions);
              } else {
                // Advanced search through the object
                const findCaptionTracks = (obj: any) => {
                  if (!obj || typeof obj !== "object") return null;

                  // Direct match for captionTracks array
                  if (
                    Array.isArray(obj.captionTracks) &&
                    obj.captionTracks.length > 0
                  ) {
                    return {
                      playerCaptionsTracklistRenderer: {
                        captionTracks: obj.captionTracks,
                      },
                    };
                  }

                  // Match for common playerCaptionsTracklistRenderer pattern
                  if (obj.playerCaptionsTracklistRenderer?.captionTracks) {
                    return {
                      playerCaptionsTracklistRenderer:
                        obj.playerCaptionsTracklistRenderer,
                    };
                  }

                  // Look for captions object
                  if (
                    obj.captions?.playerCaptionsTracklistRenderer?.captionTracks
                  ) {
                    return obj.captions;
                  }

                  // Recursively search keys that are objects or arrays
                  for (const key in obj) {
                    if (obj[key] && typeof obj[key] === "object") {
                      const result = findCaptionTracks(obj[key]);
                      if (result) return result;
                    }
                  }

                  return null;
                };

                const captionsObject = findCaptionTracks(parsed);
                if (captionsObject) {
                  rawCaptionsData = JSON.stringify(captionsObject);
                  console.log(
                    `[${videoId}] Found caption tracks through deep object search`
                  );
                }
              }

              if (rawCaptionsData) {
                console.log(`[${videoId}] Successfully parsed extracted JSON.`);
              } else {
                console.warn(
                  `[${videoId}] Parsed JSON has unexpected structure.`
                );
                // Dump first 200 chars of structure for debugging
                console.warn(
                  `[${videoId}] Structure: ${JSON.stringify(parsed).substring(
                    0,
                    200
                  )}`
                );
              }
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
        if (rawCaptionsData) break; // Stop if valid data found
      }
    }
  }

  // Last resort: try to find any timedtext URL in the HTML
  if (!rawCaptionsData) {
    const timedTextMatch = html.match(
      /https:\/\/www\.youtube\.com\/api\/timedtext[^"]+/
    );
    if (timedTextMatch) {
      try {
        const timedTextUrl = timedTextMatch[0].replace(/\\u0026/g, "&");
        console.log(
          `[${videoId}] Found fallback timedtext URL: ${timedTextUrl.substring(
            0,
            60
          )}...`
        );
        rawCaptionsData = JSON.stringify({
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ baseUrl: timedTextUrl }],
          },
        });
      } catch (e) {
        console.warn(
          `[${videoId}] Failed to process fallback timedtext URL: ${e}`
        );
      }
    }
  }

  if (!rawCaptionsData) {
    console.error(
      `[${videoId}] No captions data found in video page using any pattern.`
    );
    // Log a snippet of the HTML for debugging
    console.error(`[${videoId}] HTML snippet: ${html.substring(0, 500)}...`);
    return null;
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

  // More robust extraction of caption tracks
  let captionTracks = null;

  // Check multiple possible structures
  if (captionsData?.playerCaptionsTracklistRenderer?.captionTracks) {
    captionTracks = captionsData.playerCaptionsTracklistRenderer.captionTracks;
  } else if (captionsData?.captionTracks) {
    captionTracks = captionsData.captionTracks;
  }

  if (!captionTracks || captionTracks.length === 0) {
    console.warn(
      `[${videoId}] Parsed captions data lacks track information or is empty.`
    );
    throw new Error("Transcript tracks unavailable or disabled in parsed data");
  }

  // Find the first usable transcript URL (prefer 'en' if available, otherwise take first)
  let transcriptUrl = "";
  const englishTrack = captionTracks.find(
    (track: any) => track.languageCode === "en"
  );
  transcriptUrl = englishTrack?.baseUrl || captionTracks[0]?.baseUrl;

  if (!transcriptUrl) {
    console.error(
      `[${videoId}] Could not find a valid baseUrl in caption tracks.`
    );
    throw new Error("No valid transcript URL found in caption tracks");
  }

  // Add necessary URL parameters if they're missing
  if (!transcriptUrl.includes("lang=")) {
    transcriptUrl += transcriptUrl.includes("?") ? "&lang=en" : "?lang=en";
  }
  if (!transcriptUrl.includes("fmt=")) {
    transcriptUrl += "&fmt=srv3"; // Request a modern format
  }

  console.log(
    `[${videoId}] Using transcript URL: ${transcriptUrl.substring(0, 60)}...`
  );

  // Wait to avoid rate limiting
  await waitBetweenRequests();

  // Fetch the transcript XML/TTML with enhanced error handling
  let transcriptResponse;
  try {
    console.log(`[${videoId}] Fetching transcript content...`);
    transcriptResponse = await fetch(transcriptUrl, {
      headers: getBrowserLikeHeaders(),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
  } catch (fetchError: any) {
    console.error(
      `[${videoId}] Failed to fetch transcript content: ${fetchError.message}`
    );
    if (fetchError.name === "AbortError") {
      throw new Error("Transcript fetch timed out - try again later");
    }
    throw new Error(`Failed to fetch transcript: ${fetchError.message}`);
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

  // Enhanced validation of transcript content
  if (!transcriptContent || transcriptContent.length < 50) {
    console.error(`[${videoId}] Invalid or empty transcript content received.`);
    throw new Error("Invalid or empty transcript data received");
  }

  // Enhanced content type detection
  const contentType = transcriptResponse.headers.get("content-type");
  console.log(`[${videoId}] Transcript content type: ${contentType}`);

  // More robust check: look for common transcript tags
  const hasTextTags = transcriptContent.includes("<text");
  const hasPTags = transcriptContent.includes("<p");

  if (!hasTextTags && !hasPTags) {
    console.warn(
      `[${videoId}] Transcript content might be invalid (missing common tags): ${transcriptContent.substring(
        0,
        200
      )}...`
    );
    // Don't throw immediately, still try to parse
  }

  // Parse the XML/TTML to extract transcript segments
  const transcript = [];

  // Handle standard XML format <text start="..." dur="...">...</text>
  const xmlRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

  // Handle alternative format (often in TTML) <p begin="..." end="..." ...>...</p>
  const ttmlRegex = /<p begin="([^"]*)" end="([^"]*)"[^>]*>([^<]*)<\/p>/g;

  // Handle another TTML variant
  const ttmlRegex2 = /<p t="([^"]*)" d="([^"]*)"[^>]*>([^<]*)<\/p>/g;

  // Handle yet another YouTube variant
  const ttmlRegex3 =
    /<p id="[^"]*" begin="([^"]*)" end="([^"]*)"[^>]*>([^<]*)<\/p>/g;

  let match;
  let foundSegments = false;

  // Try XML first
  while ((match = xmlRegex.exec(transcriptContent)) !== null) {
    foundSegments = true;
    const offset = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    // Basic sanity check for parsed numbers
    if (!isNaN(offset) && !isNaN(duration)) {
      transcript.push({
        text: decodeAndCleanText(match[3]),
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
      foundSegments = true;
      const offset = parseTimestamp(match[1]); // Need helper to parse HH:MM:SS.ms
      const end = parseTimestamp(match[2]);
      const duration = end - offset;
      // Basic sanity check for parsed numbers
      if (!isNaN(offset) && !isNaN(duration) && duration >= 0) {
        transcript.push({
          text: decodeAndCleanText(match[3]),
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

  // Try the second TTML variant if still no results
  if (transcript.length === 0) {
    console.log(
      `[${videoId}] TTML pattern found no segments, trying alternative TTML pattern...`
    );
    while ((match = ttmlRegex2.exec(transcriptContent)) !== null) {
      foundSegments = true;
      const offset = parseFloat(match[1]) / 1000; // Convert ms to seconds
      const duration = parseFloat(match[2]) / 1000; // Convert ms to seconds

      if (!isNaN(offset) && !isNaN(duration) && duration >= 0) {
        transcript.push({
          text: decodeAndCleanText(match[3]),
          duration: duration,
          offset: offset,
        });
      } else {
        console.warn(
          `[${videoId}] Skipping segment due to invalid number format (TTML2): t='${match[1]}', d='${match[2]}'`
        );
      }
    }
  }

  // Try the third TTML variant if still no results
  if (transcript.length === 0) {
    console.log(
      `[${videoId}] Alternative TTML pattern found no segments, trying third TTML pattern...`
    );
    while ((match = ttmlRegex3.exec(transcriptContent)) !== null) {
      foundSegments = true;
      const offset = parseTimestamp(match[1]);
      const end = parseTimestamp(match[2]);
      const duration = end - offset;

      if (!isNaN(offset) && !isNaN(duration) && duration >= 0) {
        transcript.push({
          text: decodeAndCleanText(match[3]),
          duration: duration,
          offset: offset,
        });
      } else {
        console.warn(
          `[${videoId}] Skipping segment due to invalid number format (TTML3): begin='${match[1]}', end='${match[2]}'`
        );
      }
    }
  }

  if (transcript.length === 0) {
    if (foundSegments) {
      console.error(
        `[${videoId}] Found transcript segments but failed to parse them properly. Content sample: ${transcriptContent.substring(
          0,
          500
        )}...`
      );
    } else {
      console.error(
        `[${videoId}] Failed to parse transcript content - no segments found. Content sample: ${transcriptContent.substring(
          0,
          500
        )}...`
      );
    }
    throw new Error("Failed to parse transcript XML/TTML content");
  }

  console.log(
    `[${videoId}] Successfully fetched and parsed transcript: ${transcript.length} segments`
  );
  return transcript;
}

// Helper function to decode and clean text from XML/HTML
function decodeAndCleanText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
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
    await waitBetweenRequests();
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
      await waitBetweenRequests();
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
        cookieJar = mergeCookies(cookieJar, retryCookies);
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
      cookieJar = mergeCookies(cookieJar, videoPageCookies);
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
    // Wait to avoid rate limiting
    await waitBetweenRequests();

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
      cookieJar = mergeCookies(cookieJar, setCookieHeader);
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

    // Wait to avoid rate limiting
    await waitBetweenRequests();

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
      cookieJar = mergeCookies(cookieJar, apiCookies);
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

    // Wait to avoid rate limiting
    await waitBetweenRequests();

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
      cookieJar = mergeCookies(cookieJar, transcriptCookies);
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
          text: decodeAndCleanText(match[3]),
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
            text: decodeAndCleanText(match[3]),
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
        // Wait to avoid rate limiting
        await waitBetweenRequests();

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

// Helper function to check if video likely has no captions available
async function checkIfCaptionsUnavailable(videoId: string): Promise<boolean> {
  try {
    // Fetch the video page to look for indicators that captions are unavailable
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: getBrowserLikeHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return false; // Can't determine, don't assume unavailable
    }

    const html = await response.text();

    // Check for markers that indicate no captions
    const noSubtitlesIndicators = [
      'class="ytp-subtitles-button ytp-button" style="display: none;"', // Subtitle button hidden
      '"captionTracks":[]', // Empty captions tracks array
      '"hasCaptions":false', // Explicit indicator
    ];

    for (const indicator of noSubtitlesIndicators) {
      if (html.includes(indicator)) {
        console.log(
          `[${videoId}] Found indicator that captions are unavailable: ${indicator}`
        );
        return true;
      }
    }

    // Check video metadata section for captions flag - without using 's' flag
    const playerResponseMatch = html.match(
      /"playerResponse":\s*(\{[\s\S]*?\}\});/
    );
    if (playerResponseMatch && playerResponseMatch[1]) {
      try {
        const playerData = JSON.parse(playerResponseMatch[1]);
        if (playerData?.videoDetails?.isCrawlable === false) {
          console.log(
            `[${videoId}] Video is marked as not crawlable, captions likely unavailable`
          );
          return true;
        }

        // Check if captions are explicitly disabled
        if (
          playerData?.captions?.playerCaptionsTracklistRenderer
            ?.captionTracks === undefined ||
          (Array.isArray(
            playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks
          ) &&
            playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks
              .length === 0)
        ) {
          console.log(
            `[${videoId}] No caption tracks found in player response`
          );
          return true;
        }
      } catch (e) {
        console.warn(`[${videoId}] Error parsing player response:`, e);
      }
    }

    return false; // No clear indication that captions are unavailable
  } catch (error) {
    console.warn(
      `[${videoId}] Error checking if captions are unavailable:`,
      error
    );
    return false; // Can't determine, don't assume unavailable
  }
}

// Export the main transcript fetching functions
export async function fetchTranscript(
  videoId: string
): Promise<TranscriptLine[] | null> {
  console.log(
    `[${videoId}] Starting transcript fetching sequence with all methods...`
  );
  let lastError: Error | null = null;

  // First check if captions are likely unavailable to avoid unnecessary attempts
  const captionsLikelyUnavailable = await checkIfCaptionsUnavailable(videoId);
  if (captionsLikelyUnavailable) {
    console.log(
      `[${videoId}] Pre-check indicates captions are unavailable for this video`
    );
    throw new Error(
      "This video doesn't have captions or has disabled captions. Consider using a video with captions or a different video."
    );
  }

  // Try each method in sequence
  try {
    console.log(`[${videoId}] Trying transcript method: Library...`);
    const transcript = await fetchTranscriptLibrary(videoId);
    if (transcript && transcript.length > 0) {
      console.log(
        `[${videoId}] Transcript successfully fetched using method: Library (${transcript.length} segments).`
      );
      return transcript;
    }
  } catch (error: any) {
    console.warn(`[${videoId}] Transcript method Library failed.`);
    lastError = error;
  }

  try {
    console.log(`[${videoId}] Trying transcript method: Direct...`);
    const transcript = await fetchTranscriptDirect(videoId);
    if (transcript && transcript.length > 0) {
      console.log(
        `[${videoId}] Transcript successfully fetched using method: Direct (${transcript.length} segments).`
      );
      return transcript;
    }
  } catch (error: any) {
    console.warn(`[${videoId}] Transcript method Direct failed.`);
    lastError = error;
  }

  try {
    console.log(`[${videoId}] Trying transcript method: Innertube...`);
    const transcript = await fetchTranscriptInnertube(videoId);
    if (transcript && transcript.length > 0) {
      console.log(
        `[${videoId}] Transcript successfully fetched using method: Innertube (${transcript.length} segments).`
      );
      return transcript;
    } else if (transcript === null) {
      console.warn(
        `[${videoId}] Transcript method Innertube completed but returned null/undefined.`
      );
    }
  } catch (error: any) {
    console.warn(`[${videoId}] Transcript method Innertube failed.`);
    lastError = error;
  }

  // If we get here, all methods failed
  if (lastError) {
    // Check errors for specific patterns
    if (
      lastError.message.includes("No captions data found") ||
      lastError.message.includes("No valid transcript URL found") ||
      lastError.message.includes("Transcript tracks unavailable")
    ) {
      console.error(
        `[${videoId}] This video doesn't appear to have captions available.`
      );
      throw new Error(
        "This video doesn't have captions or has disabled captions. Consider using a video with captions or a different video."
      );
    } else {
      console.error(
        `[${videoId}] Failed to fetch transcript using all available methods. Last error: ${lastError.message}`
      );
      throw lastError;
    }
  } else {
    console.error(
      `[${videoId}] Failed to fetch transcript using all available methods. Last error: Unknown`
    );
    throw new Error(
      "Failed to fetch transcript using all available methods. The video may not have captions available."
    );
  }
}

// Simple wrapper for the third-party library
async function fetchTranscriptLibrary(
  videoId: string
): Promise<TranscriptLine[]> {
  // This would normally use the third-party library, but since we have our own implementation,
  // we can throw an error that will cause the sequence to try the next method
  throw new Error("Library method not implemented");
}

export {
  fetchTranscriptDirect,
  fetchTranscriptInnertube,
  extractAndParseTranscriptFromHtml,
};
