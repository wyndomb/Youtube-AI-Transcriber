import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "react-hot-toast";
import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { PodcastMetadata } from "./PodcastMetadata";

interface SummaryProps {
  summary: string;
  videoUrl: string;
}

const Summary: React.FC<SummaryProps> = ({ summary, videoUrl }) => {
  const [metadata, setMetadata] = useState<PodcastMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch metadata if it's not already in the summary
  useEffect(() => {
    const fetchMetadata = async () => {
      if (!videoUrl) return;

      try {
        setLoading(true);
        const response = await fetch("/api/podcast-metadata", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: videoUrl }),
        });

        if (response.ok) {
          const data = await response.json();
          setMetadata(data.metadata);
        }
      } catch (error) {
        console.error("Error fetching metadata:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [videoUrl]);

  const handleCopy = async () => {
    try {
      // Include metadata in the copied content if available
      let fullContent = "";

      if (metadata) {
        fullContent += `# ${metadata.title}\n`;
        fullContent += `Channel: ${metadata.channelName}\n`;
        fullContent += `Duration: ${metadata.duration}\n`;

        // Add published date if available
        if (metadata.publishedAt) {
          const date = new Date(metadata.publishedAt);
          fullContent += `Published: ${date.toLocaleDateString()}\n`;
        }

        // Add view count if available
        if (metadata.viewCount) {
          fullContent += `Views: ${parseInt(
            metadata.viewCount
          ).toLocaleString()}\n`;
        }

        // Add like count if available
        if (metadata.likeCount) {
          fullContent += `Likes: ${parseInt(
            metadata.likeCount
          ).toLocaleString()}\n`;
        }

        fullContent += "\n";
      }

      fullContent += summary;

      await navigator.clipboard.writeText(fullContent);
      toast.success("Summary copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy to clipboard. Please try again.");
    }
  };

  return (
    <div className="bg-white rounded-lg">
      <div className="flex justify-end p-2">
        <button
          onClick={handleCopy}
          className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          aria-label="Copy summary to clipboard"
        >
          <DocumentDuplicateIcon className="h-4 w-4 mr-1.5" />
          Copy
        </button>
      </div>

      <div className="px-4 pb-4 overflow-y-auto max-h-[70vh]">
        {/* Metadata section has been removed */}

        <div className="w-full max-w-full overflow-hidden markdown-content bg-gray-50 border border-gray-200 rounded-lg p-6 py-0">
          <div className="prose prose-lg !max-w-full !w-full prose-headings:text-purple-700 prose-h1:text-2xl prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-200 prose-h3:text-lg prose-h3:text-gray-700 prose-h3:mt-6 prose-p:text-gray-600 prose-p:my-4 prose-p:leading-relaxed prose-ul:my-4 prose-ol:my-4 prose-li:my-1.5 prose-li:text-gray-600 prose-strong:text-purple-800 prose-strong:font-medium prose-a:text-purple-600 prose-a:no-underline hover:prose-a:underline">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Summary;
