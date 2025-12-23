// server/flyer-automation/layout/sizeFromImage.js

/**
 * Decide flyer card size from image aspect ratio
 * aspectRatio = width / height
 */
export function decideSizeFromAspectRatio(aspectRatio) {
  if (!aspectRatio || typeof aspectRatio !== "number") return "SMALL";

  // Tall / slim (bottles, rolls)
  if (aspectRatio < 0.75) return "MEDIUM";

  // Very wide hero (rare)
  if (aspectRatio > 1.6) return "LARGE";

  // Default
  return "SMALL";
}
