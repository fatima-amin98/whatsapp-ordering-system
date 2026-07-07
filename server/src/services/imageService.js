import crypto from 'crypto';
import { uploadImage, deleteImage, isSupabaseUrl } from './storage/supabaseStorage.js';

function generateFilename(storeId, originalName) {
  const ext = originalName.split('.').pop().toLowerCase() || 'jpg';
  const unique = crypto.randomUUID();
  const ts = Date.now();
  return `${storeId}/${unique}-${ts}.${ext}`;
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
