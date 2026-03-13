/**
 * Image compression utilities for #subFlow
 * Reduces image sizes from 1-5MB to 100-300KB using Canvas
 */

interface CompressOptions {
  maxWidth?: number;
  quality?: number;
  format?: 'webp' | 'jpeg';
}

interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Check if browser supports WebP encoding
 */
function supportsWebP(): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

/**
 * Load an image file into an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Compress an image file using Canvas
 * @param file - Original image file
 * @param options - Compression options
 * @returns Compressed image blob with dimensions
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<CompressResult> {
  const {
    maxWidth = 1200,
    quality = 0.75,
    format = supportsWebP() ? 'webp' : 'jpeg'
  } = options;

  const img = await loadImage(file);
  
  // Calculate new dimensions maintaining aspect ratio
  let { width, height } = img;
  
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  // Create canvas and draw resized image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to blob
  const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve({ blob, width, height });
        } else {
          reject(new Error('Failed to compress image'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Create a small thumbnail for placeholder/blur effect
 * @param file - Original image file
 * @returns Small thumbnail blob (200px width)
 */
export async function createThumbnail(file: File): Promise<Blob> {
  const result = await compressImage(file, {
    maxWidth: 200,
    quality: 0.6,
    format: supportsWebP() ? 'webp' : 'jpeg'
  });
  return result.blob;
}

/**
 * Get file extension based on mime type
 */
export function getFileExtension(blob: Blob): string {
  if (blob.type === 'image/webp') return 'webp';
  if (blob.type === 'image/jpeg') return 'jpg';
  if (blob.type === 'image/png') return 'png';
  if (blob.type === 'video/mp4') return 'mp4';
  if (blob.type === 'video/quicktime') return 'mov';
  if (blob.type === 'video/webm') return 'webm';
  if (blob.type.startsWith('video/')) return 'mp4';
  return 'jpg';
}

/**
 * Check if a URL points to a video file
 */
export function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(mp4|mov|webm|avi|mkv|m4v)(\?|$)/.test(lower) || lower.includes('video');
}

/**
 * Get duration of a video file in seconds
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
