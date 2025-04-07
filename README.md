# YouTube AI Podcast Assistant

A modern web application that helps users extract insights from YouTube podcasts through AI-powered summarization and interactive chat.

## Features

- **User Authentication**: Secure sign-in via Google OAuth powered by Supabase
- **Podcast Transcription**: Automatically extracts transcripts from YouTube videos
- **YouTube Metadata Extraction**: Fetches video title, channel name, and duration for better context
- **AI-Powered Summarization**: Generates structured summaries of podcast content with:
  - Executive Summary
  - Key Insights with timestamps
  - Detailed Timeline
  - Notable Quotes
  - Related Resources
  - Thought-provoking Questions
- **Interactive Chat**: Ask specific questions about the podcast content and get AI-generated answers
- **Seamless Experience**: Enter a YouTube URL once and switch between summary and chat features
- **Markdown Support**: All AI-generated content is formatted in Markdown for better readability
- **Responsive Design**: Works well on both desktop and mobile devices
- **Error Handling**: Robust error handling for transcript extraction and API responses
- **Landing Page**: Modern landing page for unauthenticated users with sign-in options
- **Protected Dashboard**: Authenticated user workspace with podcast processing tools accessible only after login

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Authentication**: Supabase (Auth, Google Provider)
- **UI Components**: React Markdown, Headless UI, Hero Icons, `@supabase/ssr`, `@supabase/supabase-js`
- **Notifications**: React Hot Toast
- **AI Integration**: OpenAI API (using GPT-4o-mini)
- **YouTube Integration**: YouTube Transcript API, YouTube oEmbed API
- **State Management**: React useState/useEffect hooks
- **Build Tools**: TypeScript, PostCSS, Autoprefixer
- **Routing**: App Router with middleware for authenticated/unauthenticated routes

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key
- Supabase Project: Set up a project on [Supabase](https://supabase.com/)
- Supabase Project URL and Anon Key
- Google Cloud Project: Configured with OAuth 2.0 credentials (Client ID & Secret)
- Authorized Redirect URI in Google Cloud matching your Supabase callback URL (e.g., `YOUR_SUPABASE_URL/auth/v1/callback`)
- Supabase Authentication configured with your Google Client ID and Secret

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/youtube-ai-podcast-assistant.git
   cd youtube-ai-podcast-assistant
   ```

2. Install dependencies:

   ```bash
   npm install
   npm install @supabase/ssr @supabase/supabase-js
   ```

3. Create a `.env.local` file in the root directory with your keys:

   ```dotenv
   OPENAI_API_KEY=your_openai_api_key_here
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## User Experience

### Non-authenticated Users

Non-authenticated users will see the landing page at the root URL (`/`) with:

- Navigation bar with "Sign In" button
- Engaging hero section with a visual representation of the chat interface and a "Get Started" button
- Feature highlights showcasing key capabilities
- Step-by-step guide on how the platform works
- Call-to-action buttons ("Get Started", "Sign In") triggering the Google OAuth flow via Supabase

### Authenticated Users

After signing in (via Google OAuth redirect handled by Supabase), users are directed to the protected dashboard (`/dashboard`) where they can:

1. See their email in the Navbar and a "Sign Out" button
2. Enter a YouTube podcast URL in the input field
3. Click "Process Podcast" to extract the content
4. View the AI-generated summary in the Summary tab, including video metadata
5. Switch to the Chat tab to ask specific questions about the podcast content

## How It Works

1. **Authentication (Optional for Landing Page, Required for Dashboard)**:
   - User clicks "Sign In" or "Get Started" on the landing page.
   - App initiates Supabase Google OAuth flow.
   - Supabase handles the redirect to Google and the callback (`/auth/callback`).
   - Session is established via cookies managed by `@supabase/ssr`.
   - Middleware (`middleware.ts`) protects `/dashboard` and redirects users based on auth state.
2. **User Input**: Authenticated user enters a YouTube podcast URL in the dashboard input field
3. **Metadata & Transcript Extraction**:
   - App extracts metadata (title, channel, duration) using YouTube oEmbed API
   - App extracts the transcript from the video using the YouTube Transcript API
4. **AI Processing**:
   - For summaries: Transcript and metadata are sent to OpenAI API with specific prompts
   - For chat: User questions are sent with the transcript context to get relevant answers
5. **Display**: Results are displayed in a clean, user-friendly interface with proper Markdown formatting

## Technical Highlights

- Supabase integration for secure Google OAuth authentication
- Server-side session management using Next.js Middleware and `@supabase/ssr` helpers
- Client-side authentication state handling in components (`Navbar`, `app/page.tsx`)
- Handles large transcripts by truncating them to fit within OpenAI token limits
- Custom prompts to generate well-structured summaries with specific sections
- Metadata enrichment for improved context in AI processing
- Chat history management for contextual conversation
- Accessibility features including proper ARIA labels
- Responsive UI with loading indicators for better user experience
- Error handling for various failure scenarios (invalid URLs, missing transcripts, API failures)

## Project Structure

```
youtube-ai-podcast-assistant/
├── app/                  # Next.js app directory
│   ├── api/              # API routes
│   │   ├── chat/         # Chat API endpoint
│   │   ├── podcast-metadata/ # Metadata API endpoint
│   │   └── summarize/    # Summarization API endpoint
│   ├── auth/             # Authentication related routes
│   │   ├── callback/     # Supabase OAuth callback handler
│   │   │   └── route.ts
│   │   └── auth-code-error/ # Error page for auth failures
│   │       └── page.tsx
│   ├── dashboard/        # Protected dashboard page (authenticated users)
│   │   └── page.tsx      # Dashboard component
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Landing page component (unauthenticated users)
├── components/           # React components
│   ├── Chat.tsx          # Chat interface component
│   ├── Summary.tsx       # Summary display component
│   ├── PodcastHeader.tsx # Podcast header component
│   ├── PodcastMetadata.tsx # Metadata provider component
│   ├── Navbar.tsx        # Navigation bar (used in Dashboard, shows auth state)
│   └── ErrorBoundary.tsx # Error handling component
├── lib/
│   └── supabase/         # Supabase client utilities
│       ├── client.ts     # Browser client
│       └── server.ts     # Server/Middleware client
├── public/               # Static assets
│   ├── app-screenshot-new.png    # Updated screenshot name
│   └── create-screenshot.html # Tool for generating app screenshots
├── .env.local            # Environment variables (API keys, Supabase URL/Key)
├── middleware.ts         # Next.js middleware for auth redirects & session refresh
├── next.config.js        # Next.js configuration
├── package.json          # Project dependencies
├── postcss.config.js     # PostCSS configuration
├── supabaseplan.md       # Supabase implementation plan (optional)
├── tailwind.config.js    # Tailwind CSS configuration
└── tsconfig.json         # TypeScript configuration
```

## Landing Page Features

The landing page includes:

- Navigation bar with "Sign In" button
- Hero section with two-column layout (text and app screenshot)
- Feature cards highlighting key capabilities
- "How It Works" section explaining the user flow
- Call-to-action section for conversion
- Responsive design that works well on all devices

## Dashboard Features

The dashboard includes:

- YouTube URL input form
- Tabbed interface for Summary and Chat views
- Podcast metadata display with video thumbnail
- Interactive chat interface
- AI-generated summary with structured sections
- Responsive layout for different screen sizes

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for providing the AI capabilities
- Next.js team for the amazing framework
- All open-source libraries used in this project
