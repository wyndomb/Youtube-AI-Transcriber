"use client";

import React, { useState, useEffect } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import toast, { Toaster } from "react-hot-toast";
import Summary from "../../components/Summary";
import Chat from "../../components/Chat";
import Navbar from "../../components/Navbar";
import PodcastHeader from "../../components/PodcastHeader";
import { PodcastMetadataProvider } from "../../components/PodcastMetadata";

export default function Dashboard() {
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
    <div className="min-h-screen bg-[#f7f7ff]">
      <Navbar />
      <Toaster position="bottom-right" />

      <div className="max-w-7xl mx-auto px-4">
        <div className="pt-8 pb-16 md:pt-12 md:pb-24 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-purple-700 mb-6">
            Transform Podcasts into
            <br />
            Interactive Conversations
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto mb-10">
            Paste any podcast URL and let AI create summaries and engage in
            meaningful conversations about the content
          </p>

          <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-md">
            <div className="flex items-center mb-4">
              <div className="w-6 h-6 mr-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-purple-600"
                >
                  <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                  <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold">Enter Podcast URL</h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    id="youtube-url"
                    type="text"
                    value={url}
                    onChange={handleUrlChange}
                    placeholder="https://podcast-url.com/episode"
                    className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    disabled={loading || validating}
                    aria-label="YouTube URL"
                  />
                  <button
                    type="submit"
                    disabled={loading || validating || !url.trim()}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    aria-label={loading ? "Processing..." : "Analyze"}
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <ArrowPathIcon className="w-5 h-5 animate-spin mr-2" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-5 h-5 mr-2"
                        >
                          <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75c-1.036 0-1.875-.84-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75C3.84 21.75 3 20.91 3 19.875v-6.75z" />
                        </svg>
                        Analyze
                      </div>
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
        </div>

        {/* Feature Cards Section - only shown when no podcast summary is generated */}
        {!isUrlValidated && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto px-4 pb-20">
            {/* Smart Summaries Card */}
            <div className="bg-white p-8 rounded-2xl shadow-md flex flex-col items-start h-full">
              <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center mb-5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-purple-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Smart Summaries
              </h3>
              <p className="text-gray-600">
                Get comprehensive summaries that capture the key points and
                insights from any podcast.
              </p>
            </div>

            {/* Interactive Chat Card */}
            <div className="bg-white p-8 rounded-2xl shadow-md flex flex-col items-start h-full">
              <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center mb-5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-purple-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 00-1.032-.211 50.89 50.89 0 00-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 002.433 3.984L7.28 21.53A.75.75 0 016 21v-4.03a48.527 48.527 0 01-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979z" />
                  <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 001.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0015.75 7.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Interactive Chat
              </h3>
              <p className="text-gray-600">
                Ask questions about the podcast content and get detailed answers
                from our AI assistant.
              </p>
            </div>

            {/* Works Everywhere Card */}
            <div className="bg-white p-8 rounded-2xl shadow-md flex flex-col items-start h-full">
              <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center mb-5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-purple-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                  <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Works Everywhere
              </h3>
              <p className="text-gray-600">
                Compatible with podcasts from Spotify, Apple Podcasts, YouTube,
                and many more platforms.
              </p>
            </div>

            {/* AI-Powered Insights Card */}
            <div className="bg-white p-8 rounded-2xl shadow-md flex flex-col items-start h-full">
              <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center mb-5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-purple-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" />
                  <path d="M5.25 5.25a3 3 0 00-3 3v10.5a3 3 0 003 3h10.5a3 3 0 003-3V13.5a.75.75 0 00-1.5 0v5.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V8.25a1.5 1.5 0 011.5-1.5h5.25a.75.75 0 000-1.5H5.25z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                AI-Powered Insights
              </h3>
              <p className="text-gray-600">
                Advanced AI analyzes podcasts to extract the most relevant
                information and context.
              </p>
            </div>
          </div>
        )}

        {isUrlValidated && (
          <div className="max-w-5xl mx-auto">
            <PodcastMetadataProvider videoUrl={url}>
              {(metadata, metadataLoading) => (
                <>
                  {metadata && (
                    <PodcastHeader
                      videoId={metadata.videoId}
                      title={metadata.title}
                      channelName={metadata.channelName}
                      duration={metadata.duration}
                      viewCount={metadata.viewCount}
                      likeCount={metadata.likeCount}
                      publishedAt={metadata.publishedAt}
                      onChatClick={() => handleTabChange("chat")}
                      activeTab={activeTab}
                    />
                  )}

                  <div className="bg-white rounded-lg mb-8">
                    <div className="flex border-b">
                      <button
                        onClick={() => handleTabChange("summary")}
                        className={`flex-1 py-4 font-medium text-center transition-colors ${
                          activeTab === "summary"
                            ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                        }`}
                        disabled={loading || validating}
                        aria-label="Switch to Summary tab"
                        aria-selected={activeTab === "summary"}
                        role="tab"
                      >
                        <div className="flex items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-14.25C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                            />
                          </svg>
                          <span>Summary</span>
                          {isSummaryLoading && (
                            <span className="ml-2 inline-block w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => handleTabChange("chat")}
                        className={`flex-1 py-4 font-medium text-center transition-colors ${
                          activeTab === "chat"
                            ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                        }`}
                        disabled={loading || validating}
                        aria-label="Switch to Chat Assistant tab"
                        aria-selected={activeTab === "chat"}
                        role="tab"
                      >
                        <div className="flex items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                            />
                          </svg>
                          <span>Chat Assistant</span>
                          {isChatLoading && (
                            <span className="ml-2 inline-block w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></span>
                          )}
                        </div>
                      </button>
                    </div>

                    <div
                      role="tabpanel"
                      aria-label="Tab Content"
                      className="w-full"
                    >
                      <div className="max-w-full">
                        {activeTab === "summary" && (
                          <Summary summary={summary || ""} videoUrl={url} />
                        )}
                        {activeTab === "chat" && <Chat videoUrl={url} />}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </PodcastMetadataProvider>
          </div>
        )}
      </div>
    </div>
  );
}
