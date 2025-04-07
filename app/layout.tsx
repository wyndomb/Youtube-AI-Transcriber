import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import ErrorBoundary from "../components/ErrorBoundary";

const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YouTube AI Podcast Assistant",
  description: "Summarize and chat with YouTube podcasts using AI",
  keywords: "YouTube, podcast, AI, summarizer, chat, assistant, transcript",
  authors: [{ name: "Your Name" }],
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={poppins.className}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
