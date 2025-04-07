"use client";

import { useState } from "react";

export default function ValidateMetadata() {
  const [url, setUrl] = useState("");
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFullDescription, setShowFullDescription] = useState(false);

  const validateMetadata = async () => {
    setLoading(true);
    setError("");
    setShowFullDescription(false); // Reset description state on new validation
    try {
      const response = await fetch("/api/podcast-metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          includeFull: true, // Always request the full description in the API
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to validate metadata");
      }

      setMetadata(data.metadata);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">YouTube Metadata Validator</h1>
      <div className="mb-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter YouTube URL"
          className="w-full p-2 border rounded"
        />
      </div>
      <button
        onClick={validateMetadata}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-blue-300"
      >
        {loading ? "Validating..." : "Validate Metadata"}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {metadata && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Metadata Results:</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 p-4 rounded shadow">
              <h3 className="font-medium text-lg mb-2">Basic Information</h3>
              <div className="space-y-2">
                <p>
                  <span className="font-semibold">Title:</span> {metadata.title}
                </p>
                <p>
                  <span className="font-semibold">Channel:</span>{" "}
                  {metadata.channelName}
                </p>
                <p>
                  <span className="font-semibold">Duration:</span>{" "}
                  {metadata.duration}
                </p>
                <p>
                  <span className="font-semibold">Video ID:</span>{" "}
                  {metadata.videoId}
                </p>
                {metadata.publishedAt && (
                  <p>
                    <span className="font-semibold">Published:</span>{" "}
                    {new Date(metadata.publishedAt).toLocaleDateString()}
                  </p>
                )}
                {metadata.viewCount && (
                  <p>
                    <span className="font-semibold">Views:</span>{" "}
                    {parseInt(metadata.viewCount).toLocaleString()}
                  </p>
                )}
                {metadata.likeCount && (
                  <p>
                    <span className="font-semibold">Likes:</span>{" "}
                    {parseInt(metadata.likeCount).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded shadow">
              <h3 className="font-medium text-lg mb-2">Description</h3>
              <div className="max-h-60 overflow-y-auto">
                <p className="whitespace-pre-wrap">
                  {showFullDescription
                    ? metadata.fullDescription
                    : metadata.description}
                </p>
                {metadata.descriptionTruncated && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="mt-2 text-blue-500 hover:text-blue-700 text-sm font-medium"
                  >
                    {showFullDescription ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {metadata.thumbnails && (
            <div className="bg-gray-50 p-4 rounded shadow">
              <h3 className="font-medium text-lg mb-2">Thumbnails</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(metadata.thumbnails).map(
                  ([key, thumb]: [string, any]) => (
                    <div key={key} className="text-center">
                      <img
                        src={thumb.url}
                        alt={`${key} thumbnail`}
                        className="mx-auto mb-2 rounded"
                      />
                      <p className="text-sm">
                        {key}: {thumb.width}x{thumb.height}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div className="mt-4 bg-gray-100 p-4 rounded overflow-auto max-h-96">
            <h3 className="font-medium text-lg mb-2">Raw JSON Data</h3>
            <pre className="text-xs">{JSON.stringify(metadata, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
