// image-utils: Utility functions for handling Next.js optimized images

/**
 * Extract the original image URL from a Next.js optimized image URL
 * Handles URLs like: /_next/image?url=<encoded-url>&w=1080&q=75
 */
export function getOriginalImageUrl(optimizedUrl: string): string {
  if (!optimizedUrl) return optimizedUrl;
  
  // If it's already a direct URL (starts with http:// or https://), return as-is
  if (optimizedUrl.startsWith('http://') || optimizedUrl.startsWith('https://')) {
    return optimizedUrl;
  }
  
  // If it's a Next.js optimized image URL, extract the original URL
  if (optimizedUrl.startsWith('/_next/image')) {
    try {
      // Handle both client-side (with window) and server-side
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://example.com';
      const url = new URL(optimizedUrl, baseUrl);
      const urlParam = url.searchParams.get('url');
      if (urlParam) {
        // Decode the URL parameter
        return decodeURIComponent(urlParam);
      }
    } catch {
      // If parsing fails, return the original URL
    }
  }
  
  // If it's a relative path, make it absolute
  if (optimizedUrl.startsWith('/')) {
    if (typeof window !== 'undefined') {
      return new URL(optimizedUrl, window.location.origin).href;
    }
    return optimizedUrl;
  }
  
  return optimizedUrl;
}

/**
 * Get the direct image URL for opening in a new tab
 * This ensures images open properly instead of downloading
 * The imageUrl passed should be the original URL (not the Next.js optimized URL)
 */
export function getImageUrlForNewTab(imageUrl: string): string {
  if (!imageUrl) return imageUrl;
  
  // If it's already a full URL, return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // If it's a Next.js optimized URL, extract the original
  if (imageUrl.startsWith('/_next/image')) {
    return getOriginalImageUrl(imageUrl);
  }
  
  // If it's a relative path, make it absolute
  if (typeof window !== 'undefined') {
    return new URL(imageUrl, window.location.origin).href;
  }
  
  // Server-side fallback
  return imageUrl;
}