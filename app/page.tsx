"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

// NoSSR wrapper component to prevent hydration mismatches
function NoSSR({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? <>{children}</> : null;
}

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleNavigation = (path: string) => {
    if (mounted) {
      router.push(path);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error("Error signing in:", error.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7ff]">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="text-purple-700 font-bold text-xl">
                YouTube AI Podcast Assistant
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleSignIn}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? "Signing In..." : "Sign In"}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Two Column Layout */}
      <div className="max-w-7xl mx-auto px-4 pt-16 pb-12 sm:pt-24 sm:pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Left Column - Text Content */}
          <div className="text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-purple-700 mb-6">
              Transform Podcasts into Interactive Conversations
            </h1>
            <p className="text-lg text-gray-600 mb-10">
              Paste any podcast URL and let AI create summaries and engage in
              meaningful conversations about the content
            </p>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              <button
                onClick={handleSignIn}
                disabled={loading}
                className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-lg font-medium disabled:opacity-50"
              >
                {loading ? "Redirecting..." : "Get Started"}
              </button>
              <a
                href="#how-it-works"
                className="px-8 py-3 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-lg font-medium text-center"
              >
                Learn More
              </a>
            </div>
          </div>

          {/* Right Column - Screenshot */}
          <div className="relative flex justify-center md:justify-end">
            <div
              className="relative w-full rounded-xl shadow-2xl overflow-hidden border-8 border-white"
              style={{ maxHeight: "80vh" }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  paddingTop: "64.3%",
                }}
              >
                <NoSSR>
                  <Image
                    src="/app-screenshot-new.png"
                    alt="AI chat interface analyzing economic impacts from a podcast"
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority
                    className="object-cover rounded-lg"
                    style={{ objectFit: "cover" }}
                  />
                </NoSSR>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Key Features</h2>
            <p className="mt-4 text-lg text-gray-600">
              Everything you need to get more from your podcast listening
              experience
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Smart Summaries Card */}
            <div className="bg-[#f7f7ff] p-8 rounded-2xl shadow-md flex flex-col items-start h-full">
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
            <div className="bg-[#f7f7ff] p-8 rounded-2xl shadow-md flex flex-col items-start h-full">
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
            <div className="bg-[#f7f7ff] p-8 rounded-2xl shadow-md flex flex-col items-start h-full">
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
                Compatible with podcasts from YouTube and many more platforms.
              </p>
            </div>

            {/* AI-Powered Insights Card */}
            <div className="bg-[#f7f7ff] p-8 rounded-2xl shadow-md flex flex-col items-start h-full">
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
        </div>
      </div>

      {/* How It Works Section */}
      <div id="how-it-works" className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">How It Works</h2>
            <p className="mt-4 text-lg text-gray-600">
              Simple process, powerful results
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center mb-5 mx-auto">
                <span className="text-2xl font-bold text-purple-600">1</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Paste YouTube URL
              </h3>
              <p className="text-gray-600">
                Simply paste the URL of any YouTube podcast you want to analyze
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center mb-5 mx-auto">
                <span className="text-2xl font-bold text-purple-600">2</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                AI Processes the Content
              </h3>
              <p className="text-gray-600">
                Our advanced AI analyzes the audio transcript to extract key
                information
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center mb-5 mx-auto">
                <span className="text-2xl font-bold text-purple-600">3</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Interact with Results
              </h3>
              <p className="text-gray-600">
                Get a comprehensive summary or chat with the AI about specific
                content
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-purple-700 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Unlock Podcast Insights?
          </h2>
          <p className="text-lg text-purple-200 mb-8">
            Start summarizing and chatting with your favorite podcasts today.
          </p>
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="px-8 py-3 bg-white text-purple-700 rounded-lg hover:bg-gray-100 text-lg font-medium disabled:opacity-50"
          >
            {loading ? "Redirecting..." : "Get Started Now"}
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#f7f7ff] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500">
          &copy; {new Date().getFullYear()} YouTube AI Podcast Assistant. All
          rights reserved.
        </div>
      </footer>
    </div>
  );
}
