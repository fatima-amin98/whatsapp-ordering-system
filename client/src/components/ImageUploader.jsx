import { useState, useRef, useCallback } from 'react';
import { api } from '../api';

const UNSUPPORTED_URL_PATTERNS = [
  /\/_next\/image/i,
  /google\.com\/imgres/i,
  /bing\.com\/images/i,
  /\/search\?.*q=/i,
  /data:image/i,
];

function hasValidImageExtension(url) {
  return /\.(jpe?g|png|webp|gif|avif|svg|bmp)(\?.*)?$/i.test(url);
}

function validateImageUrl(url) {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();

  if (!/^https?:\/\/.+/.test(trimmed)) {
    return 'URL must start with http:// or https://';
  }
  for (const pattern of UNSUPPORTED_URL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'This does not appear to be a direct image URL. Please provide a direct image link (.jpg, .png, .webp).';
    }
  }
  if (!hasValidImageExtension(trimmed)) {
    return 'This may not be a direct image URL. Use a link ending in .jpg, .png, .webp.';
  }
  return null;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageUploader({ currentImageUrl, onImageUrlChange, error }) {
  const [mode, setMode] = useState(currentImageUrl ? 'existing' : 'upload');
  const [previewUrl, setPreviewUrl] = useState(currentImageUrl || null);
  const [urlInput, setUrlInput] = useState(currentImageUrl || '');
  const [urlError, setUrlError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const clearState = useCallback(() => {
    setPreviewUrl(null);
    setUrlInput('');
    setUrlError(null);
    setUploadError(null);
    onImageUrlChange(null);
  }, [onImageUrlChange]);

  const handleRemove = useCallback(() => {
    clearState();
    setMode('upload');
    if (fileRef.current) fileRef.current.value = '';
  }, [clearState]);

  const handleFileSelect = useCallback(async (file) => {
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setUploadError('Unsupported format. Use PNG, JPG, or WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be under 5 MB.');
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);
      const result = await api.uploadImage(formData);
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(result.imageUrl);
      onImageUrlChange(result.imageUrl);
      setMode('existing');
    } catch (err) {
      setUploadError(err.data?.error || err.message || 'Upload failed');
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }, [onImageUrlChange]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleUrlConfirm = useCallback(() => {
    if (!urlInput.trim()) {
      setUrlError('Please enter an image URL.');
      return;
    }
    const validationErr = validateImageUrl(urlInput);
    if (validationErr) {
      setUrlError(validationErr);
      return;
    }
    setUrlError(null);
    setPreviewUrl(urlInput.trim());
    onImageUrlChange(urlInput.trim());
    setMode('existing');
  }, [urlInput, onImageUrlChange]);

  const handleSwitchToUrl = () => setMode('url');
  const handleSwitchToUpload = () => setMode('upload');

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Product Image</label>

      {/* Preview */}
      {previewUrl && mode === 'existing' && (
        <div className="mb-3">
          <div className="relative inline-block">
            <img
              src={previewUrl}
              alt="Product preview"
              className="h-24 w-24 object-cover rounded-lg border"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => { setMode('upload'); setPreviewUrl(null); onImageUrlChange(null); }}
                className="text-xs text-blue-600 hover:underline"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload mode */}
      {(mode === 'upload') && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-600 mb-1">Drag & drop an image here, or</p>
            <label className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer">
              Choose Image
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); }}
              />
            </label>
            <p className="text-xs text-gray-400 mt-2">PNG, JPG, or WEBP. Max 5 MB.</p>
          </div>

          {uploading && (
            <div className="mt-2 text-center">
              <svg className="animate-spin h-5 w-5 text-blue-600 mx-auto mb-1" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-xs text-gray-500">Uploading...</p>
            </div>
          )}

          {previewUrl && uploading === false && (
            <div className="mt-2">
              <img src={previewUrl} alt="Preview" className="h-20 w-20 object-cover rounded-lg border" />
            </div>
          )}

          {uploadError && <p className="text-red-500 text-xs mt-1">{uploadError}</p>}

          <div className="mt-3 text-center">
            <button type="button" onClick={handleSwitchToUrl} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Or paste an image URL instead
            </button>
          </div>
        </div>
      )}

      {/* URL input mode */}
      {(mode === 'url') && (
        <div>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
              placeholder="https://example.com/product.webp"
              className={`flex-1 border ${urlError ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
            />
            <button
              type="button"
              onClick={handleUrlConfirm}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Use URL
            </button>
          </div>
          {urlError && <p className="text-red-500 text-xs mt-1">{urlError}</p>}
          <p className="text-xs text-gray-400 mt-1">
            Paste a direct image URL. /_next/image and other optimization URLs are not supported.
          </p>

          <div className="mt-3 text-center">
            <button type="button" onClick={handleSwitchToUpload} className="text-xs text-gray-400 hover:text-gray-600 underline">
              ← Back to upload
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
