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
              d="M4 9.75h3.2L12.5 5.5v13l-5.3-4.25H4v-4.5Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="m17 9 4 4m0-4-4 4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
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
              d="M4 9.75h3.2L12.5 5.5v13l-5.3-4.25H4v-4.5Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M16 8.25a5 5 0 0 1 0 7.5M18.75 5.5a8.75 8.75 0 0 1 0 13"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
