// The family photos Home shows, as the client sees them. Client-safe.

export interface PhotoInfo {
  /** Stable id (hex). The picture itself is at /api/photos/<id>. */
  id: string;
  /** When the photo was taken, ISO, or null when that isn't known. */
  takenAt: string | null;
}

export interface PhotosPayload {
  photos: PhotoInfo[];
  /** False when what's saved won't survive a redeploy (no volume). */
  durable: boolean;
  /** The most photos Hearth will keep. */
  max: number;
}

/** The longest side, in pixels, a photo is resized to before it is sent. */
export const PHOTO_MAX_EDGE = 1600;
