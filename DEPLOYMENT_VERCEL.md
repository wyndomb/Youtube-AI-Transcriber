# Deploying YouTube AI Podcast Assistant to Vercel

This document outlines the steps to deploy the application to Vercel.

## 1. Prerequisites

- Ensure your code is pushed to a Git repository (GitHub, GitLab, or Bitbucket).
- Have a Vercel account ([https://vercel.com/signup](https://vercel.com/signup)).

## 2. Vercel Project Setup

1.  Log in to your Vercel dashboard.
2.  Click **Add New...** -> **Project**.
3.  **Import Git Repository**: Select the Git provider where your repository is hosted and import the `youtube-ai-podcast-assistant` repository.
4.  Vercel should automatically detect it as a Next.js project.

## 3. Configure Project Settings

1.  **Framework Preset**: Verify Vercel sets it to "Next.js".
2.  **Build & Development Settings**: The defaults usually work for Next.js (`npm run build`, output directory `.next`). No changes are typically needed.
3.  **Environment Variables**: This is crucial.
    - Navigate to your project's **Settings** -> **Environment Variables**.
    - Add the following variables:
      - `OPENAI_API_KEY`: Enter your OpenAI API key. Mark it as **Secret**.
      - `NEXT_PUBLIC_SUPABASE_URL`: Enter your Supabase project URL.
      - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Enter your Supabase Anon Key.
      - `YOUTUBE_API_KEY`: Enter your YouTube Data API key. Mark it as **Secret**.
    - _Note: The `NEXT_PUBLIC_` prefixes are required for the Supabase variables to be accessible in the browser.\_

## 4. Deploy

1.  Review the settings.
2.  Click the **Deploy** button.
3.  Vercel will clone the repository, install dependencies (`npm install`), build the project (`npm run build`), and deploy it. Wait for the process to complete.

## 5. Update Supabase & Google Cloud Redirect URIs

_This is a critical post-deployment step._

1.  **Get Deployment URL**: Once Vercel deployment is successful, note your production URL (e.g., `your-project-name.vercel.app`).
2.  **Update Supabase**:
    - Go to your Supabase project dashboard -> **Authentication** -> **URL Configuration**.
    - In the **Redirect URLs** section, add your Vercel production URL followed by `/auth/v1/callback`.
    - Example: `https://your-project-name.vercel.app/auth/v1/callback`
    - Save the changes.
3.  **Update Google Cloud Console**:
    - Go to your Google Cloud project -> **APIs & Services** -> **Credentials**.
    - Find the OAuth 2.0 Client ID you configured for Supabase authentication.
    - Edit the client ID.
    - Under **Authorized redirect URIs**, add the _exact same_ Vercel callback URL as added in Supabase.
    - Example: `https://your-project-name.vercel.app/auth/v1/callback`
    - Save the changes.

_Failure to update these redirect URIs will prevent the Google Sign-In from working on your deployed Vercel application._

## 6. Testing

1.  Access your Vercel deployment URL in a browser.
2.  Verify the landing page loads correctly.
3.  Test the **Sign In** button and complete the Google OAuth flow. You should be redirected to the `/dashboard`.
4.  On the dashboard, enter a valid YouTube podcast URL.
5.  Click **Process Podcast**.
6.  Verify that the metadata, summary, and chat features work as expected.
7.  Test the **Sign Out** functionality.
