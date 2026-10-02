import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Learnova",
    short_name: "Learnova",
    description: "An AI tutor that learns how you learn",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F3EA",
    theme_color: "#5B4FE9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
