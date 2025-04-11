async function fetchTranscriptDirect(
  videoId: string
): Promise<TranscriptLine[]> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers,
  });

  try {
    const html = await response.text();
    const captionsJson = extractCaptionsFromHtml(html);

    if (!captionsJson) {
      console.error(
        "[Direct Fetch Debug] No captions JSON found. HTML Snippet (first 1000 chars):",
        html.substring(0, 1000)
      );
      throw new Error("No captions data found in video page");
    }

    return captionsJson;
  } catch (error) {
    console.error("[Direct Fetch Error] Failed to parse captions JSON:", error);
    console.error(
      "[Direct Fetch Debug] HTML Snippet (first 1000 chars):",
      html.substring(0, 1000)
    );
    throw new Error("Could not find or parse captions JSON in HTML");
  }
}

async function fetchTranscriptInnertube(
  videoId: string
): Promise<TranscriptLine[] | null> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers,
  });

  try {
    const playerResponse = await response.json();

    if (
      !playerResponse ||
      !playerResponse.captions ||
      !playerResponse.captions.playerCaptionsTracklistRenderer
    ) {
      console.error(
        "[Innertube Debug] Missing playerCaptionsTracklistRenderer. Player Response Snippet:",
        JSON.stringify(playerResponse || {}).substring(0, 1000)
      );
      throw new Error(
        "Could not find captions renderer in Innertube player response"
      );
    }

    const captionTracks =
      playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      console.error(
        "[Innertube Debug] No caption tracks found. Player Response Snippet:",
        JSON.stringify(playerResponse).substring(0, 1000)
      );
      console.error(
        "[Innertube Info] No caption tracks listed in player response."
      );
      throw new Error("No caption tracks found in Innertube player response");
    }

    return captionTracks;
  } catch (error) {
    console.error(
      "[Innertube Error] Failed to fetch or parse captions:",
      error
    );
    return null;
  }
}
