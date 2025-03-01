# YouTube AI Podcast Assistant

A modern web application that helps users extract insights from YouTube podcasts through AI-powered summarization and interactive chat.

## Features

- **Podcast Summarization**: Automatically generates concise, well-structured summaries of YouTube podcast content
- **Interactive Chat**: Ask specific questions about the podcast content and get AI-generated answers
- **Seamless Experience**: Enter a YouTube URL once and switch between summary and chat features
- **Markdown Support**: All AI-generated content is formatted in Markdown for better readability
- **Responsive Design**: Works well on both desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **AI Integration**: OpenAI API
- **YouTube Integration**: Custom transcript extraction

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/youtube-ai-podcast-assistant.git
   cd youtube-ai-podcast-assistant
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env.local` file in the root directory with your OpenAI API key:

   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Usage

1. Enter a YouTube podcast URL in the input field
2. Click "Process Podcast" to extract the content
3. View the AI-generated summary in the Summary tab
4. Switch to the Chat tab to ask specific questions about the podcast content

## Project Structure

```
youtube-ai-podcast-assistant/
├── app/                  # Next.js app directory
│   ├── api/              # API routes
│   │   ├── chat/         # Chat API endpoint
│   │   └── summarize/    # Summarization API endpoint
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main page component
├── components/           # React components
│   ├── Chat.tsx          # Chat interface component
│   └── Summary.tsx       # Summary display component
├── public/               # Static assets
├── .env.local            # Environment variables (create this)
├── next.config.js        # Next.js configuration
├── package.json          # Project dependencies
├── postcss.config.js     # PostCSS configuration
├── tailwind.config.js    # Tailwind CSS configuration
└── tsconfig.json         # TypeScript configuration
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for providing the AI capabilities
- Next.js team for the amazing framework
- All open-source libraries used in this project
