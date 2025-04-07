import { NextRequest, NextResponse } from "next/server";

// Helper function to truncate description
const truncateDescription = (
  description: string,
  maxLength: number = 300
): string => {
  if (!description) return "";
  if (description.length <= maxLength) return description;
  return description.substring(0, maxLength) + "...";
};

// Actual function to fetch YouTube metadata using the YouTube Data API
const fetchYouTubeMetadata = async (
  videoId: string,
  includeFull: boolean = false
) => {
  try {
    // Use YouTube Data API to get detailed video information
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      throw new Error("YouTube API key is not configured");
    }

    // Fetch detailed video information from the YouTube Data API
    const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails,statistics&key=${apiKey}`;
    const videoResponse = await fetch(videoDetailsUrl);

    if (!videoResponse.ok) {
      throw new Error(
        `Failed to fetch video details: ${videoResponse.statusText}`
      );
    }

    const videoData = await videoResponse.json();

    if (!videoData.items || videoData.items.length === 0) {
      throw new Error("No video details found");
    }

    const videoDetails = videoData.items[0];
    const snippet = videoDetails.snippet;
    const contentDetails = videoDetails.contentDetails;

    // Use the YouTube oEmbed API as a fallback for some data
    const oEmbedResponse = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    const oEmbedData = oEmbedResponse.ok ? await oEmbedResponse.json() : null;

    // Format the ISO 8601 duration to a readable format
    const duration = contentDetails.duration
      ? formatISODuration(contentDetails.duration)
      : "Unknown duration";

    const fullDescription =
      snippet.description || oEmbedData?.title || "No description available.";

    return {
      title: snippet.title || oEmbedData?.title || "Unknown Title",
      channelName:
        snippet.channelTitle || oEmbedData?.author_name || "Unknown Channel",
      duration: duration,
      videoId: videoId,
      description: includeFull
        ? fullDescription
        : truncateDescription(fullDescription),
      fullDescription: fullDescription, // Always include the full description for reference
      descriptionTruncated: fullDescription.length > 300, // Flag indicating if description was truncated
      publishedAt: snippet.publishedAt || null,
      viewCount: videoDetails.statistics?.viewCount || null,
      likeCount: videoDetails.statistics?.likeCount || null,
      thumbnails: snippet.thumbnails || null,
    };
  } catch (error: any) {
    console.error("Error fetching YouTube metadata:", error);
    // Fallback to oEmbed if the YouTube Data API fails
    try {
      const oEmbedResponse = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );

      if (oEmbedResponse.ok) {
        const oEmbedData = await oEmbedResponse.json();
        return {
          title: oEmbedData.title || "YouTube Video",
          channelName: oEmbedData.author_name || "Unknown Channel",
          duration: "Unknown duration",
          videoId: videoId,
          description: "Could not retrieve full video description.",
          fullDescription: "Could not retrieve full video description.",
          descriptionTruncated: false,
        };
      }
    } catch (fallbackError) {
      console.error("Fallback to oEmbed also failed:", fallbackError);
    }

    // Return basic info with the video ID we have if all else fails
    return {
      title: "YouTube Video",
      channelName: "Unknown Channel",
      duration: "Unknown duration",
      videoId: videoId,
      description: "Could not retrieve video information.",
      fullDescription: "Could not retrieve video information.",
      descriptionTruncated: false,
    };
  }
};

// Helper function to format ISO 8601 duration to readable time
const formatISODuration = (isoDuration: string): string => {
  // ISO 8601 duration format: PT#H#M#S
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);

  if (!matches) {
    return "Unknown duration";
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

export async function POST(request: NextRequest) {
  try {
    const { url, includeFull } = await request.json();

    // Extract video ID from URL
    const videoIdMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&?\s]+)/
    );

    if (!videoIdMatch) {
      return NextResponse.json(
        { error: "Could not extract video ID from URL" },
        { status: 400 }
      );
    }

    const videoId = videoIdMatch[1];

    // Fetch metadata from YouTube
    const metadata = await fetchYouTubeMetadata(videoId, includeFull);

    return NextResponse.json({ metadata });
  } catch (error) {
    console.error("Error processing podcast metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch podcast metadata" },
      { status: 500 }
    );
  }
}
