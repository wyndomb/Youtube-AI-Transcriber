import { NextRequest, NextResponse } from "next/server";
import { fetchMetadataFromYouTubeAPI } from "@/lib/youtube"; // Import the shared function
import { PodcastMetadata } from "@/components/PodcastMetadata"; // Use correct import path

// Define a simple type for oEmbed response
interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  // Add other fields if needed (e.g., width, height for thumbnail)
}

// Simple oEmbed fetch function - returns only basic fields matching PodcastMetadata structure
async function fetchOEmbedMetadata(
  videoId: string
): Promise<Partial<PodcastMetadata> | null> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  try {
    console.log(`Attempting oEmbed fallback for video ID: ${videoId}`);
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    }); // Cache & 8s timeout
    if (!response.ok) {
      console.error(
        `oEmbed request failed with status ${response.status} ${response.statusText}`
      );
      return null;
    }
    const data: OEmbedResponse = await response.json();

    // Map oEmbed response to PodcastMetadata structure
    const metadata: Partial<PodcastMetadata> = {
      videoId: videoId,
      title: data.title || "YouTube Video (oEmbed)",
      channelName: data.author_name || "Unknown Channel (oEmbed)",
      // Construct a basic thumbnail object if URL exists
      thumbnails: data.thumbnail_url
        ? { default: { url: data.thumbnail_url, width: 0, height: 0 } }
        : null,
      duration: "0:00", // oEmbed doesn't provide duration
      description: "Description unavailable via oEmbed.",
      fullDescription: "Description unavailable via oEmbed.",
      descriptionTruncated: false,
      // Other fields like viewCount, likeCount, publishedAt are not available via oEmbed
    };
    console.log(
      `Successfully fetched partial metadata via oEmbed fallback for video ID: ${videoId}`
    );
    return metadata;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error(`oEmbed request timed out for video ID ${videoId}.`);
    } else {
      console.error(
        `Error fetching oEmbed metadata for video ID ${videoId}:`,
        error.message || error
      );
    }
    return null;
  }
}

export async function POST(request: NextRequest) {
  let videoId = ""; // For logging scope
  try {
    // includeFull is no longer needed as API function gets full description anyway
    const { url } = await request.json();

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

    videoId = videoIdMatch[1];
    console.log(`[${videoId}] Received request for metadata.`);

    // Attempt to fetch metadata using the shared YouTube API function
    let metadata = await fetchMetadataFromYouTubeAPI(videoId);

    // If API fetch fails or returns null, attempt oEmbed fallback
    if (!metadata) {
      console.warn(
        `[${videoId}] YouTube API metadata fetch failed or returned null, attempting oEmbed fallback.`
      );
      metadata = await fetchOEmbedMetadata(videoId);
    }

    // If both methods fail, return an error
    if (!metadata) {
      console.error(`[${videoId}] All methods failed to fetch metadata.`);
      // Return a more specific error message
      return NextResponse.json(
        {
          error: `Failed to fetch podcast metadata for video ${videoId} using all available methods.`,
        },
        { status: 500 }
      );
    }

    // Return the successful metadata (either from API or oEmbed)
    console.log(`[${videoId}] Successfully returning metadata.`);
    // Ensure the returned object matches the expected structure (even if partial)
    return NextResponse.json({ metadata: metadata as PodcastMetadata }); // Cast to full type if confident, otherwise handle partial data downstream
  } catch (error: any) {
    // Catch potential errors during request parsing or ID extraction
    const idSuffix = videoId ? ` for video ${videoId}` : "";
    console.error(
      `Error processing podcast metadata request${idSuffix}:`,
      error.message || error
    );
    return NextResponse.json(
      { error: `Internal server error processing metadata request${idSuffix}` },
      { status: 500 }
    );
  }
}
