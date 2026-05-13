"use client";

import { useState } from "react";

export function DemoVideo() {
  const [muted, setMuted] = useState(true);

  return (
    <div className="video-frame">
      <video
        autoPlay
        className="demo-video"
        loop
        muted={muted}
        playsInline
        poster="/images/demo.png"
        preload="auto"
      >
        <source src="/demo.mp4" type="video/mp4" />
      </video>
      <button
        aria-label={muted ? "Unmute demo video" : "Mute demo video"}
        className={muted ? "mute-button mute-button-muted" : "mute-button"}
        onClick={() => setMuted((value) => !value)}
        type="button"
      >
        {muted ? (
          <svg
            aria-hidden="true"
            className="speaker-icon"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M3.5 10.25h4l5.25-4.5v12.5l-5.25-4.5h-4v-3.5Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.55"
            />
            <path
              d="m16.5 8.5 5 5m0-5-5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.65"
            />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="speaker-icon"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M3.5 10.25h4l5.25-4.5v12.5l-5.25-4.5h-4v-3.5Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.55"
            />
            <path
              d="M16.25 8.25a5.25 5.25 0 0 1 0 7.5M19 5.75a8.75 8.75 0 0 1 0 12.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.55"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
