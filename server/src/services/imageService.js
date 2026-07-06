import crypto from 'crypto';
import { uploadImage, deleteImage, isSupabaseUrl } from './storage/supabaseStorage.js';

function generateFilename(storeId, originalName) {
  const ext = originalName.split('.').pop().toLowerCase() || 'jpg';
  const unique = crypto.randomUUID();
  const ts = Date.now();
  return `${storeId}/${unique}-${ts}.${ext}`;
}

function extractFilenameFromPath(storeId, uniquePart) {
  return `${storeId}/${uniquePart}`;
}

/**
 * Upload a product image to storage and return the public URL.
 */
export async function uploadProductImage(storeId, file) {
  const filename = generateFilename(storeId, file.originalname);
  return await uploadImage(storeId, filename, file.buffer, file.mimetype);
}

/**
 * Delete an image from storage if it's a Supabase-hosted image.
 * Returns silently for non-Supabase URLs (externally hosted).
 */
export async function deleteProductImage(imageUrl) {
  if (isSupabaseUrl(imageUrl)) {
    await deleteImage(imageUrl);
  }
}

/**
 * Replace a product image: deletes the old one from storage, uploads the new one.
 * Returns the new URL, or null if no file is provided.
 */
export async function replaceProductImage(storeId, oldImageUrl, newFile) {
  if (!newFile) return null;

  if (oldImageUrl) {
    await deleteProductImage(oldImageUrl);
  }

  return await uploadProductImage(storeId, newFile);
}
