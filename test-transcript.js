// Test script for transcript fetching
import { fetchTranscript } from "./lib/youtube-transcript.js";

async function testTranscriptFetch() {
  const videoId = "d3dPRkyNbj8"; // The video ID that was failing

  console.log(`Testing transcript fetch for video ID: ${videoId}`);

  try {
    const transcript = await fetchTranscript(videoId);
    console.log(`Success! Fetched ${transcript.length} transcript segments`);
    // Print the first few segments
    console.log("First 3 segments:");
    transcript.slice(0, 3).forEach((segment, i) => {
      console.log(`[${i}] ${segment.offset}s: ${segment.text}`);
    });
    return true;
  } catch (error) {
    console.error(`Failed to fetch transcript: ${error.message}`);
    return false;
  }
}

// Run the test
testTranscriptFetch().then((success) => {
  console.log(`Test ${success ? "PASSED" : "FAILED"}`);
});
