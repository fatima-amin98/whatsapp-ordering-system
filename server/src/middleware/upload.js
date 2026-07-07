import multer from 'multer';

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PNG, JPG, JPEG, WEBP.`), false);
  }
}

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
}).single('image');

export function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image must be under 5 MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
}
