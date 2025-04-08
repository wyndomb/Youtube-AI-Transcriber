# YouTube Transcript Issue Troubleshooting Plan

This document outlines our systematic approach to resolving the YouTube transcript fetching issue that occurs on the Vercel deployment but not in local development.

## Current Issue

- ✅ Application works correctly in local development environment
- ❌ Application fails on Vercel deployment with error: `Failed to fetch video transcript: [YoutubeTranscript] 🚨 Transcript is disabled on this video`

## Hypotheses

1. **CORS Restrictions**: Vercel's environment may have stricter CORS policies than local development
2. **YouTube IP Blocking**: YouTube may be blocking or restricting requests from Vercel's server IP ranges
3. **Library Compatibility**: The transcript fetching library might not be compatible with Vercel's serverless environment
4. **Authentication/Headers**: The requests from Vercel might be missing necessary headers or user-agent information
5. **Server vs. Client Execution**: The code might be executing in a different context (client vs server) on Vercel
6. **YouTube Page Structure**: The structure of YouTube pages might be different when accessed from Vercel's IP ranges

## Action Plan

### Phase 1: Diagnosis and Information Gathering

- [x] **1.1 Examine Current Implementation**

  - [x] Locate the transcript fetching code in the codebase (`app/api/summarize/route.ts`, `app/api/chat/route.ts`)
  - [x] Identify which library/method is being used (`youtube-transcript` v1.0.6, method: `YoutubeTranscript.fetchTranscript(videoId)`)
  - [x] Determine if fetching happens on client or server side (Server-side via Next.js API routes)

- [x] **1.2 Basic Vercel Debugging**

  - [x] Add verbose logging to transcript fetching code
  - [x] Deploy to Vercel and check logs for additional error information
  - [x] Test with multiple known-good YouTube videos to confirm the pattern
  - [x] **FINDING**: Error `Failed to fetch metadata: Unauthorized` points to missing YouTube API key in Vercel environment

- [x] **1.3 Environment Comparison**
  - [x] Document Node.js version in local vs Vercel (Vercel: Node.js 18.x, Local: Node.js 20.x)
  - [x] Check for environment variables that might affect behavior (YOUTUBE_API_KEY is set in local but was missing in Vercel)
  - [x] Compare package versions between environments (youtube-transcript v1.0.6 in both environments)

## Current Diagnosis

Initial diagnosis indicated that the YouTube API key was missing from the Vercel environment. This was added, but the issue persisted. Further investigation revealed several key issues:

1. The URL construction for internal API calls was missing the proper protocol prefix on Vercel deployments
2. YouTube transcript fetching may be blocked by YouTube when coming from Vercel IP addresses
3. YouTube returns different page structures when accessed from cloud providers vs. residential IPs
4. The regex pattern used to extract captions data was failing on certain videos

## Implemented Solution

We've addressed these issues with a multi-faceted approach:

1. Added more detailed logging to track down the exact point of failure
2. Fixed the URL construction for internal API calls to include the proper protocol
3. Implemented a custom fallback method for transcript fetching that uses a direct approach with browser-like headers
4. Added retry logic to try multiple methods of fetching transcripts
5. Implemented multiple regex patterns to extract captions from different YouTube page structures
6. Added timeout handling for HTTP requests to prevent hanging in error cases
7. Improved error handling and user-facing error messages

### Phase 2: Initial Fixes

- [x] **2.1 Server-Side Implementation**

  - [x] Improve the server-side transcript fetching code with a robust fallback solution
  - [x] Add proper error handling with specific error types
  - [x] Deploy and test

- [x] **2.2 CORS Handling**

  - [x] Add appropriate browser-like headers to requests
  - [x] Use a proper user-agent string
  - [x] Deploy and test

- [x] **2.3 Error Handling Improvements**
  - [x] Add graceful fallbacks for when transcripts aren't available
  - [x] Improve error messages shown to users
  - [x] Deploy and test

### Phase 3: Advanced Fixes (Implemented)

- [x] **3.1 Multiple Regex Patterns**

  - [x] Implement multiple regex patterns to handle different YouTube page structures
  - [x] Create fallback mechanisms to try alternative extraction methods
  - [x] Add specific error handling for each extraction method

- [x] **3.2 Request Improvements**

  - [x] Add timeout handling to prevent hanging requests
  - [x] Validate response content types and structures
  - [x] Add more detailed error reporting

- [x] **3.3 User Experience**
  - [x] Improve user-facing error messages
  - [x] Add specific guidance for videos without captions
  - [x] Handle edge cases more gracefully

### Phase 4: Future Alternatives (If Needed)

- [ ] **4.1 Try Official YouTube API**

  - [ ] Set up YouTube Data API credentials
  - [ ] Implement transcript fetching using official API
  - [ ] Add as environment variable to Vercel
  - [ ] Deploy and test

- [ ] **4.2 Alternative Libraries**

  - [ ] Research alternative YouTube transcript libraries
  - [ ] Implement a selected alternative
  - [ ] Deploy and test

- [ ] **4.3 Proxy Solution**
  - [ ] Create a proxy API endpoint that forwards requests to YouTube
  - [ ] Configure to mask server origins and appear as browser requests
  - [ ] Deploy and test

## Monitoring and Validation

For the implemented solution:

1. Deploy to Vercel
2. Test with at least 3 different YouTube videos:
   - One with known captions
   - One with auto-generated captions
   - One in a non-English language
3. Monitor logs for any errors
4. Test with the specific video ID that previously failed: b9gPwO-IsB4

## Success Criteria

- Application successfully retrieves transcripts for videos that have them available
- Application properly handles and communicates when transcripts are unavailable
- Solution works consistently across multiple videos and over time
- User receives helpful error messages when transcripts cannot be fetched

## Implementation Notes

- Document all attempted solutions
- For each attempt, note exactly what changed and the results
- Track any new error messages or behaviors

## Rollback Plan

If any implementation significantly degrades the application:

- Revert to the previous working deployment
- Document what caused the issue for future reference
