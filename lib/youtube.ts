import { PodcastMetadata } from "@/components/PodcastMetadata"; // Corrected import path

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/videos";

/**
 * Fetches video metadata directly from the YouTube Data API v3.
 *
 * @param videoId - The ID of the YouTube video.
 * @returns A promise that resolves to the podcast metadata or null if fetching fails.
 */
export async function fetchMetadataFromYouTubeAPI(
  videoId: string
): Promise<Partial<PodcastMetadata> | null> {
  if (!YOUTUBE_API_KEY) {
    console.warn("YouTube API key is missing. Cannot fetch metadata via API.");
    return null;
  }

  const url = `${YOUTUBE_API_URL}?part=snippet,contentDetails,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;

  try {
    console.log(`Fetching metadata from YouTube API for video ID: ${videoId}`);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Add a specific referer header that matches what's allowed in Google Cloud Console
        // or use the app's own domain when deployed
        Referer: "https://youtube-ai-podcast.vercel.app/",
        // Add an origin header to match the referer
        Origin: "https://youtube-ai-podcast.vercel.app",
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        `YouTube API request failed with status ${response.status}: ${errorData}`
      );
      // Distinguish between common errors
      if (response.status === 401 || response.status === 403) {
        console.error(
          "Potential YouTube API Key issue (invalid, restricted, or quota exceeded)."
        );
        // Log more details for debugging
        console.error(`Full error: ${errorData}`);
        console.error(
          `Request URL: ${url.replace(
            YOUTUBE_API_KEY || "",
            "[API_KEY_REDACTED]"
          )}`
        );
      } else if (response.status === 404) {
        console.error(`Video with ID ${videoId} not found via YouTube API.`);
      }
      return null; // Indicate failure to the caller
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.warn(
        `No items found in YouTube API response for video ID: ${videoId}`
      );
      return null;
    }

    const item = data.items[0];
    const snippet = item.snippet;
    const contentDetails = item.contentDetails;
    const statistics = item.statistics;

    // Basic validation
    if (!snippet || !contentDetails || !statistics) {
      console.warn(
        `Incomplete data received from YouTube API for video ID: ${videoId}`
      );
      return null;
    }

    // Construct the thumbnails object expected by the interface
    const bestThumbnail =
      snippet.thumbnails?.maxres ||
      snippet.thumbnails?.high ||
      snippet.thumbnails?.medium ||
      snippet.thumbnails?.default;
    const thumbnailsData = bestThumbnail
      ? {
          high: {
            url: bestThumbnail.url,
            width: bestThumbnail.width,
            height: bestThumbnail.height,
          },
        }
      : null;

    // Format duration if needed (implement formatISODuration)
    const formattedDuration = contentDetails.duration
      ? formatISODuration(contentDetails.duration)
      : "0:00";

    const metadata: Partial<PodcastMetadata> = {
      videoId: videoId,
      title: snippet.title || "Untitled Podcast",
      channelName: snippet.channelTitle || "Unknown Channel",
      thumbnails: thumbnailsData,
      publishedAt: snippet.publishedAt || null,
      description: snippet.description || null,
      fullDescription: snippet.description || null,
      duration: formattedDuration,
      viewCount: statistics.viewCount || null,
      likeCount: statistics.likeCount || null,
      descriptionTruncated: snippet.description
        ? snippet.description.length > 300
        : false,
    };

    console.log(
      `Successfully fetched metadata from YouTube API for video ID: ${videoId}`
    );
    return metadata;
  } catch (error: any) {
    console.error(
      `Error fetching metadata from YouTube API for video ID ${videoId}:`,
      error.message || error
    );
    // Add more specific error logging if needed
    if (error.name === "AbortError") {
      console.error("YouTube API request timed out.");
    } else if (error instanceof TypeError) {
      console.error("Network error or issue constructing YouTube API request.");
    }
    return null; // Indicate failure
  }
}

// Helper function to format ISO 8601 duration to readable time (HH:MM:SS or MM:SS)
// This should match the format expected by PodcastMetadata interface
const formatISODuration = (isoDuration: string): string => {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);

  if (!matches) {
    return "0:00"; // Default or error format
  }

  const hours = matches[1] ? parseInt(matches[1]) : 0;
  const minutes = matches[2] ? parseInt(matches[2]) : 0;
  const seconds = matches[3] ? parseInt(matches[3]) : 0;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Define PodcastMetadata type if not imported globally or adjust import path
// interface PodcastMetadata {
//   videoId: string;
//   title: string;
//   channelName: string;
//   thumbnailUrl: string;
// //   duration?: number; // In seconds - optional
// }
