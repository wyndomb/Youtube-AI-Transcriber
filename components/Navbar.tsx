"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Session } from "@supabase/supabase-js";

const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, [supabase.auth]);

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
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error.message);
    } else {
      setSession(null);
      router.push("/");
    }
    setLoading(false);
  };

  return (
    <nav className="flex items-center justify-between w-full max-w-7xl mx-auto px-4 py-6">
      <Link href="/" className="flex items-center">
        <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center mr-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="white"
            className="w-6 h-6"
          >
            <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
            <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
          </svg>
        </div>
        <span className="text-2xl font-bold text-purple-600">PodAI</span>
      </Link>
      <div className="flex items-center space-x-4">
        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : session ? (
          <>
            {pathname === "/dashboard" ? (
              <Link
                href="/"
                className="text-gray-600 hover:text-purple-600 transition-colors"
              >
                Home
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-purple-600 transition-colors"
              >
                Dashboard
              </Link>
            )}
            <Link
              href="/validate-transcript"
              className="text-gray-600 hover:text-purple-600 transition-colors"
            >
              Validate Transcript
            </Link>
            <span className="text-sm text-gray-600 hidden sm:inline">
              {session.user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors"
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/validate-transcript"
              className="text-gray-600 hover:text-purple-600 transition-colors mr-4"
            >
              Validate Transcript
            </Link>
            <button
              onClick={handleSignIn}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
            >
              <span>Sign In with Google</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
