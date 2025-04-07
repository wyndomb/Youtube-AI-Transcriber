import React, { useState } from "react";
import {
  ClockIcon,
  ChatBubbleLeftRightIcon,
  ShareIcon,
  EyeIcon,
  HandThumbUpIcon,
  CalendarIcon,
} from "@heroicons/react/24/outline";

interface PodcastHeaderProps {
  videoId: string;
  title: string;
  channelName: string;
  duration: string;
  viewCount?: string | null;
  likeCount?: string | null;
  publishedAt?: string | null;
  onChatClick: () => void;
  activeTab: "summary" | "chat";
}

const PodcastHeader: React.FC<PodcastHeaderProps> = ({
  videoId,
  title,
  channelName,
  duration,
  viewCount,
  likeCount,
  publishedAt,
  onChatClick,
  activeTab,
}) => {
  // Use the highest quality thumbnail available (maxresdefault is best quality)
  // With fallback to hqdefault if maxresdefault isn't available
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const fallbackThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const [imgSrc, setImgSrc] = useState(thumbnailUrl);

  // Format the published date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown date";

    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: title,
          text: `Check out this podcast: ${title}`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        })
        .catch((err) => console.error("Error sharing:", err));
    } else {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6">
      <div className="md:flex">
        {/* Fixed width container that matches 16:9 aspect ratio at 420x240 */}
        <div className="md:w-[420px] md:flex-shrink-0 relative">
          {/* Mobile: Dynamic 16:9 aspect ratio with padding trick */}
          {/* Desktop: Fixed height matching 16:9 ratio of width */}
          <div className="w-full pt-[56.25%] md:pt-0 md:h-[236px]">
            <img
              className="absolute inset-0 w-full h-full object-cover"
              src={imgSrc}
              alt={title}
              onError={() => setImgSrc(fallbackThumbnailUrl)}
            />
          </div>
        </div>
        <div className="p-6 flex flex-col justify-between w-full max-w-full">
          <div>
            <p className="text-sm text-purple-600 font-semibold uppercase tracking-wide">
              {channelName}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 mt-1 mb-4">
              {title}
            </h1>

            {/* Metadata stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-4 mb-4">
              <div className="flex items-center text-gray-600">
                <ClockIcon className="h-5 w-5 mr-1.5 text-gray-500" />
                <span>{duration}</span>
              </div>

              {publishedAt && (
                <div className="flex items-center text-gray-600">
                  <CalendarIcon className="h-5 w-5 mr-1.5 text-gray-500" />
                  <span>{formatDate(publishedAt)}</span>
                </div>
              )}

              {viewCount && (
                <div className="flex items-center text-gray-600">
                  <EyeIcon className="h-5 w-5 mr-1.5 text-gray-500" />
                  <span>{parseInt(viewCount).toLocaleString()} views</span>
                </div>
              )}

              {likeCount && (
                <div className="flex items-center text-gray-600">
                  <HandThumbUpIcon className="h-5 w-5 mr-1.5 text-gray-500" />
                  <span>{parseInt(likeCount).toLocaleString()} likes</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={onChatClick}
              className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "chat"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-100 text-purple-700 hover:bg-purple-200"
              }`}
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2" />
              Chat About This
            </button>
            <button
              onClick={handleShare}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              <ShareIcon className="h-4 w-4 mr-2" />
              Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PodcastHeader;
