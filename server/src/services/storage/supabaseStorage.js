import { createClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'product-images';

let supabase = null;

function getClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Supabase configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

async function ensureBucket() {
  const client = getClient();
  const { data: buckets, error: listError } = await client.storage.listBuckets();

  if (listError) {
    throw new Error(`Failed to list storage buckets: ${listError.message}`);
  }

  const exists = buckets.some((b) => b.name === BUCKET_NAME);
  if (exists) return;

  const { error: createError } = await client.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });

  if (createError) {
    throw new Error(`Failed to create storage bucket: ${createError.message}`);
  }

  console.log(`[Storage] Created bucket: ${BUCKET_NAME}`);
}

export async function uploadImage(storeId, filename, buffer, contentType) {
  await ensureBucket();
  const client = getClient();

  const path = `${storeId}/${filename}`;

  const { error } = await client.storage
    .from(BUCKET_NAME)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: urlData } = client.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path);

  return urlData.publicUrl;
}

export async function deleteImage(imageUrl) {
  if (!imageUrl) return;
  await ensureBucket();
  const client = getClient();

  const path = extractPathFromUrl(imageUrl);
  if (!path) return;

  const { error } = await client.storage
    .from(BUCKET_NAME)
    .remove([path]);

  if (error && error.message !== 'Object not found') {
    console.error(`[Storage] Failed to delete ${path}: ${error.message}`);
  }
}

function extractPathFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split('/');
    const bucketIdx = parts.indexOf(BUCKET_NAME);
    if (bucketIdx === -1) return null;
    return parts.slice(bucketIdx + 1).join('/');
  } catch {
    return null;
  }
}

export function isSupabaseUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host.includes('supabase.co');
  } catch {
    return false;
  }
}
