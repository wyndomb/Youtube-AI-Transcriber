/**
 * Extracts a YouTube video ID from a URL.
 * Supports various YouTube URL formats including:
 * - Standard watch URLs: https://www.youtube.com/watch?v=VIDEO_ID
 * - Short URLs: https://youtu.be/VIDEO_ID
 * - Embed URLs: https://www.youtube.com/embed/VIDEO_ID
 * - Shortened URLs with additional parameters
 *
 * @param url - The YouTube URL to extract the video ID from
 * @returns The extracted video ID
 * @throws Error if no valid video ID could be extracted
 */
export function extractVideoId(url: string): string {
  if (!url) {
    throw new Error("No URL provided");
  }

  // List of regex patterns to try for different URL formats
  const patterns = [
    // Standard watch URL: https://www.youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?v=|youtube\.com\/watch\?.+&v=)([^&]+)/i,

    // Short URL: https://youtu.be/VIDEO_ID
    /(?:youtu\.be\/)([^?&/]+)/i,

    // Embed URL: https://www.youtube.com/embed/VIDEO_ID
    /(?:youtube\.com\/embed\/)([^?&/]+)/i,

    // Mobile URL: https://m.youtube.com/watch?v=VIDEO_ID
    /(?:m\.youtube\.com\/watch\?v=|m\.youtube\.com\/watch\?.+&v=)([^&]+)/i,

    // YouTube Shorts: https://youtube.com/shorts/VIDEO_ID
    /(?:youtube\.com\/shorts\/)([^?&/]+)/i,
  ];

  // Try each pattern until we find a match
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // If we get here, no pattern matched
  throw new Error(`Could not extract video ID from URL: ${url}`);
}

/**
 * Formats a number for display (e.g., 1234 -> "1,234")
 */
export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined || num === "") {
    return "0";
  }

  const numValue = typeof num === "string" ? parseInt(num, 10) : num;

  if (isNaN(numValue)) {
    return "0";
  }

  return new Intl.NumberFormat().format(numValue);
}

/**
 * Formats a date for display
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return "Unknown date";
  }

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (e) {
    return "Invalid date";
  }
}
