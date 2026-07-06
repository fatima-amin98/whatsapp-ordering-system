const rateLimitMap = new Map();
const MAX_MAP_SIZE = 10000;

function setIntervalCleanup() {
  setInterval(() => {
    const now = Date.now();
    if (rateLimitMap.size > MAX_MAP_SIZE) {
      const entries = [...rateLimitMap.entries()];
      entries.sort((a, b) => a[1].windowStart - b[1].windowStart);
      const toDelete = entries.slice(0, rateLimitMap.size - MAX_MAP_SIZE);
      for (const [key] of toDelete) {
        rateLimitMap.delete(key);
      }
    }
    for (const [key, entry] of rateLimitMap) {
      if (now - entry.windowStart > 3600000) {
        rateLimitMap.delete(key);
      }
    }
  }, 60000);
}

setIntervalCleanup();

export function checkRateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || (now - entry.windowStart) > windowMs) {
    if (rateLimitMap.size >= MAX_MAP_SIZE) {
      return { allowed: true };
    }
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= maxAttempts) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count += 1;
  return { allowed: true };
}

export function orderRateLimit(req, res, next) {
  const phone = req.cleanInput?.customerPhone;
  if (!phone) return next();

  const { allowed, retryAfter } = checkRateLimit(
    `order:${phone}`,
    3,
    60 * 60 * 1000
  );

  if (!allowed) {
    return res.status(429).json({
      error: `Too many orders from this number. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
    });
  }

  next();
}

export function generalRateLimit(maxAttempts, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const { allowed, retryAfter } = checkRateLimit(key, maxAttempts, windowMs);
    if (!allowed) {
      return res.status(429).json({
        error: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      });
    }
    next();
  };
}
