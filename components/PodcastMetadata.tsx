import React, { useEffect, useState } from "react";

export interface PodcastMetadata {
  title: string;
  channelName: string;
  duration: string;
  videoId: string;
  description?: string;
  fullDescription?: string;
  descriptionTruncated?: boolean;
  publishedAt?: string | null;
  viewCount?: string | null;
  likeCount?: string | null;
  thumbnails?: {
    [key: string]: {
      url: string;
      width: number;
      height: number;
    };
  } | null;
}

interface PodcastMetadataProviderProps {
  videoUrl: string;
  children: (
    metadata: PodcastMetadata | null,
    loading: boolean
  ) => React.ReactNode;
}

const extractVideoId = (url: string): string | null => {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&?\s]+)/
  );
  return match ? match[1] : null;
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

export const PodcastMetadataProvider: React.FC<
  PodcastMetadataProviderProps
> = ({ videoUrl, children }) => {
  const [metadata, setMetadata] = useState<PodcastMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setLoading(true);
        const videoId = extractVideoId(videoUrl);

        if (!videoId) {
          throw new Error("Invalid YouTube URL");
        }

        // Call our metadata API endpoint
        const response = await fetch("/api/podcast-metadata", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: videoUrl,
            includeFull: true, // Always request full description
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch metadata");
        }

        const data = await response.json();
        setMetadata(data.metadata);
      } catch (error) {
        console.error("Error fetching metadata:", error);

        // Fallback metadata using the video ID
        const videoId = extractVideoId(videoUrl);
        if (videoId) {
          setMetadata({
            title: "YouTube Podcast",
            channelName: "Unknown Channel",
            duration: "00:00",
            videoId: videoId,
            description: "No description available for this podcast.",
            fullDescription: "No description available for this podcast.",
            descriptionTruncated: false,
          });
        } else {
          setMetadata(null);
        }
      } finally {
        setLoading(false);
      }
    };

    if (videoUrl) {
      fetchMetadata();
    }
  }, [videoUrl]);

  return <>{children(metadata, loading)}</>;
};
