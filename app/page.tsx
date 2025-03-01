"use client";

import React, { useState, useEffect } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import toast, { Toaster } from "react-hot-toast";
import Summary from "../components/Summary";
import Chat from "../components/Chat";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "chat">("summary");
  const [isUrlValidated, setIsUrlValidated] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Function to validate YouTube URL format
  const isValidYoutubeUrl = (url: string): boolean => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  };

  // Extract video ID from URL
  const extractVideoId = (url: string): string | null => {
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&?\s]+)/
    );
    return match ? match[1] : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidYoutubeUrl(url)) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      toast.error("Could not extract video ID from URL");
      return;
    }

    setLoading(true);
    setIsSummaryLoading(true);
    setSummary(null);

    try {
      console.log("Submitting URL:", url);
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      console.log("Response:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate summary");
      }

      setSummary(data.summary);
      setIsUrlValidated(true);
      toast.success("Summary generated successfully!");
    } catch (error) {
      console.error("Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to generate summary";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setIsSummaryLoading(false);
    }
  };

  const validateUrl = async () => {
    if (!isValidYoutubeUrl(url)) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      toast.error("Could not extract video ID from URL");
      return;
    }

    setValidating(true);
    setIsChatLoading(true);
    setError(null);

    try {
      // Just check if the transcript exists
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          question:
            "Just checking if the transcript exists. Please respond with 'Yes'.",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to validate URL");
      }

      setIsUrlValidated(true);
      setActiveTab("chat");
      toast.success("Podcast loaded successfully!");
    } catch (error) {
      console.error("Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to validate URL";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setValidating(false);
      setIsChatLoading(false);
    }
  };

  const handleTabChange = (tab: "summary" | "chat") => {
    if (loading || validating) return;

    setActiveTab(tab);

    // If switching to chat and URL is not yet validated, validate it
    if (tab === "chat" && !isUrlValidated && url) {
      validateUrl();
    }

    // If switching to summary and no summary exists yet, generate it
    if (tab === "summary" && !summary && isUrlValidated) {
      setIsSummaryLoading(true);
      handleSubmit(new Event("submit") as any);
    }
  };

  // Handle URL input change
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    // Reset validation state when URL changes
    if (isUrlValidated) {
      setIsUrlValidated(false);
      setSummary(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-12">
      <Toaster position="bottom-right" />
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-8">
          YouTube AI Podcast Assistant
        </h1>

        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              <label
                htmlFor="youtube-url"
                className="text-gray-700 font-medium"
              >
                Enter a YouTube podcast URL
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="youtube-url"
                  type="text"
                  value={url}
                  onChange={handleUrlChange}
                  placeholder="Enter YouTube URL (e.g., https://www.youtube.com/watch?v=...)"
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || validating}
                  aria-label="YouTube URL"
                />
                <button
                  type="submit"
                  disabled={loading || validating || !url.trim()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={loading ? "Processing..." : "Process Podcast"}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <ArrowPathIcon className="w-5 h-5 animate-spin mr-2" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    "Process Podcast"
                  )}
                </button>
              </div>
              {error && (
                <div className="text-red-600 text-sm p-2 bg-red-50 rounded">
                  Error: {error}
                </div>
              )}
            </div>
          </form>
        </div>

        {isUrlValidated && (
          <div>
            <div className="flex border-b mb-4">
              <button
                onClick={() => handleTabChange("summary")}
                className={`px-4 py-2 font-medium ${
                  activeTab === "summary"
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                disabled={loading || validating}
                aria-label="Switch to Summary tab"
                aria-selected={activeTab === "summary"}
                role="tab"
              >
                Summary{" "}
                {isSummaryLoading && (
                  <span className="ml-2 inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                )}
              </button>
              <button
                onClick={() => handleTabChange("chat")}
                className={`px-4 py-2 font-medium ${
                  activeTab === "chat"
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                disabled={loading || validating}
                aria-label="Switch to Chat Assistant tab"
                aria-selected={activeTab === "chat"}
                role="tab"
              >
                Chat Assistant{" "}
                {isChatLoading && (
                  <span className="ml-2 inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                )}
              </button>
            </div>

            {activeTab === "summary" && (
              <>
                {summary ? (
                  <Summary summary={summary} videoUrl={url} />
                ) : (
                  <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto my-4 text-center py-12">
                    <div className="flex flex-col items-center justify-center">
                      {isSummaryLoading ? (
                        <>
                          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                          <p className="text-gray-600">Generating summary...</p>
                        </>
                      ) : (
                        <>
                          <p className="text-gray-600 mb-4">
                            No summary available yet.
                          </p>
                          <button
                            onClick={() =>
                              handleSubmit(new Event("submit") as any)
                            }
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Generate Summary
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "chat" && <Chat videoUrl={url} />}
          </div>
        )}
      </div>
    </main>
  );
}
