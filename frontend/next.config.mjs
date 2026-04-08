/** @type {import('next').NextConfig} */
const defaultImageHosts = [
  "s4.anilist.co",
  "img.anili.st",
  "media.kitsu.io",
  "animesalt.ac",
  "raw.githubusercontent.com",
];

const extraImageHosts = String(process.env.NEXT_IMAGE_REMOTE_HOSTS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const imageHosts = Array.from(new Set([...defaultImageHosts, ...extraImageHosts]));

const nextConfig = {
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https", hostname })),
  },
};

export default nextConfig;
