"use client";

export function DemoVideo() {
  return (
    <div className="video-frame">
      <video
        autoPlay
        className="demo-video"
        loop
        muted
        playsInline
        poster="/images/demo.png"
        preload="metadata"
        width={1280}
        height={720}
      >
        <source src="/demo.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
