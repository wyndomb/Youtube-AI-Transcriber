import React from "react";

export default function AuthCodeError() {
  return (
    <div
      style={{ padding: "20px", fontFamily: "sans-serif", textAlign: "center" }}
    >
      <h1>Authentication Error</h1>
      <p>
        Sorry, we couldn't sign you in. There was an issue during the
        authentication process.
      </p>
      <p>Please try signing in again.</p>
      <a href="/">Go back to Home</a>
    </div>
  );
}
