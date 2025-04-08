"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ValidateTranscript() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const validateTranscript = async () => {
    setLoading(true);
    setError(null);
    setTranscript(null);

    try {
      // Make a simple request to our chat API with a minimal question
      // This will test the transcript fetching functionality
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          question:
            "Just testing the transcript. Please say 'Transcript fetched successfully!'",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to validate transcript");
      }

      setTranscript(data.answer);
    } catch (error) {
      console.error("Error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to validate transcript";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">YouTube Transcript Validator</h1>
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
        onClick={validateTranscript}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-blue-300"
      >
        {loading ? "Validating..." : "Validate Transcript"}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {transcript && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Transcript Result:</h2>
          <div className="p-4 bg-gray-50 rounded-lg border">{transcript}</div>
        </div>
      )}

      <div className="mt-4">
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-gray-200 rounded"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
