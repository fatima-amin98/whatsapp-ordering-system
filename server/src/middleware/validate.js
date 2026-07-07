import { normalizePhone, validatePhone as validatePakPhone } from '../utils/phoneUtils.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_STRING_LENGTH = 5000;
const MAX_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 1000;

export function validateCheckoutInput(req, res, next) {
  const { customerName, customerPhone, fulfillmentMethod, deliveryAddress, items } = req.body;

  const errors = [];

  if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 1) {
    errors.push({ field: 'customerName', message: 'Customer name is required' });
  }
  if (customerName && customerName.trim().length > MAX_NAME_LENGTH) {
    errors.push({ field: 'customerName', message: `Name must be under ${MAX_NAME_LENGTH} characters` });
  }

  if (!customerPhone || typeof customerPhone !== 'string') {
    errors.push({ field: 'customerPhone', message: 'Phone number is required' });
  } else {
    const phoneCheck = validatePakPhone(customerPhone);
    if (!phoneCheck.valid) {
      errors.push({ field: 'customerPhone', message: phoneCheck.error });
    }
  }

  if (!fulfillmentMethod || !['delivery', 'pickup'].includes(fulfillmentMethod)) {
    errors.push({ field: 'fulfillmentMethod', message: 'Select a valid fulfillment method' });
  }

  if (fulfillmentMethod === 'delivery' && (!deliveryAddress || typeof deliveryAddress !== 'string' || deliveryAddress.trim().length < 1)) {
    errors.push({ field: 'deliveryAddress', message: 'Delivery address is required' });
  }
  if (deliveryAddress && deliveryAddress.length > MAX_ADDRESS_LENGTH) {
    errors.push({ field: 'deliveryAddress', message: `Address must be under ${MAX_ADDRESS_LENGTH} characters` });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push({ field: 'items', message: 'Cart cannot be empty' });
  } else {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productId || typeof item.productId !== 'string') {
        errors.push({ field: `items[${i}].productId`, message: 'Product ID is required' });
      } else if (!UUID_REGEX.test(item.productId)) {
        errors.push({ field: `items[${i}].productId`, message: 'Invalid product ID format' });
      }
      if (!item.quantity || !Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push({ field: `items[${i}].quantity`, message: 'Quantity must be a positive integer' });
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const normalizedPhone = customerPhone ? validatePakPhone(customerPhone).normalized : null;

  req.cleanInput = {
    customerName: customerName.trim().slice(0, MAX_NAME_LENGTH),
    customerPhone: normalizedPhone,
    fulfillmentMethod,
    deliveryAddress: fulfillmentMethod === 'delivery' ? deliveryAddress.trim().slice(0, MAX_ADDRESS_LENGTH) : null,
    items,
  };

  next();
}

export function validateProductInput(req, res, next) {
  const { name, price, description, imageUrl, categoryId } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    errors.push({ field: 'name', message: 'Product name is required' });
  }
  if (name && name.length > 150) {
    errors.push({ field: 'name', message: 'Name must be under 150 characters' });
  }

  if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
    errors.push({ field: 'price', message: 'Price must be a valid non-negative number' });
  }

  if (description && typeof description !== 'string') {
    errors.push({ field: 'description', message: 'Description must be text' });
  }

  if (imageUrl && typeof imageUrl !== 'string') {
    errors.push({ field: 'imageUrl', message: 'Image URL must be text' });
  }

  if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() && !/^https?:\/\/.+/.test(imageUrl.trim())) {
    errors.push({ field: 'imageUrl', message: 'Image URL must start with http:// or https://' });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  req.cleanInput = {
    name: name.trim().slice(0, 150),
    price: Math.round(parseFloat(price) * 100) / 100,
    description: description ? description.trim().slice(0, MAX_STRING_LENGTH) : null,
    imageUrl: imageUrl && imageUrl.trim() ? imageUrl.trim() : null,
    categoryId: categoryId && typeof categoryId === 'string' ? categoryId : null,
  };

  next();
}

export function validateStoreSettings(req, res, next) {
  const { storeName, whatsappNumber, allowDelivery, allowPickup, deliveryFee, freeDeliveryThreshold, pickupAddress, pickupInstructions, storeStatus } = req.body;
  const errors = [];

  if (storeName !== undefined) {
    if (typeof storeName !== 'string' || storeName.trim().length < 1 || storeName.length > 100) {
      errors.push({ field: 'storeName', message: 'Store name must be 1-100 characters' });
    }
  }

  if (whatsappNumber !== undefined) {
    const phoneCheck = validatePakPhone(whatsappNumber);
    if (!phoneCheck.valid) {
      errors.push({ field: 'whatsappNumber', message: phoneCheck.error });
    }
  }

  if (deliveryFee !== undefined && (isNaN(Number(deliveryFee)) || Number(deliveryFee) < 0)) {
    errors.push({ field: 'deliveryFee', message: 'Delivery fee must be a non-negative number' });
  }

  if (freeDeliveryThreshold !== undefined && freeDeliveryThreshold !== null && (isNaN(Number(freeDeliveryThreshold)) || Number(freeDeliveryThreshold) < 0)) {
    errors.push({ field: 'freeDeliveryThreshold', message: 'Free delivery threshold must be a non-negative number' });
  }

  if (allowDelivery === false && allowPickup === false) {
    errors.push({ field: 'allowDelivery', message: 'At least one fulfillment method must be enabled' });
  }

  if (storeStatus !== undefined && !["open", "temporarily_closed", "closed"].includes(storeStatus)) {
    errors.push({ field: "storeStatus", message: "Store status must be open, temporarily_closed, or closed" });
  }

  if (pickupAddress && pickupAddress.length > 1000) {
    errors.push({ field: 'pickupAddress', message: 'Address must be under 1000 characters' });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  req.cleanInput = {};
  if (storeName !== undefined) req.cleanInput.storeName = storeName.trim().slice(0, 100);
  if (whatsappNumber !== undefined) req.cleanInput.whatsappNumber = validatePakPhone(whatsappNumber).normalized;
  if (allowDelivery !== undefined) req.cleanInput.allowDelivery = Boolean(allowDelivery);
  if (allowPickup !== undefined) req.cleanInput.allowPickup = Boolean(allowPickup);
  if (deliveryFee !== undefined) req.cleanInput.deliveryFee = Math.round(parseFloat(deliveryFee) * 100) / 100;
  if (freeDeliveryThreshold !== undefined) req.cleanInput.freeDeliveryThreshold = freeDeliveryThreshold !== null ? Math.round(parseFloat(freeDeliveryThreshold) * 100) / 100 : null;
  if (pickupAddress !== undefined) req.cleanInput.pickupAddress = pickupAddress.trim().slice(0, 1000);
  if (pickupInstructions !== undefined) req.cleanInput.pickupInstructions = pickupInstructions.trim().slice(0, MAX_STRING_LENGTH);
  if (storeStatus !== undefined) req.cleanInput.storeStatus = storeStatus;

  next();
}

export function validateBusinessHours(req, res, next) {
  const { hours } = req.body;
  const errors = [];

  if (!hours || !Array.isArray(hours) || hours.length !== 7) {
    return res.status(400).json({ error: 'Business hours must contain all 7 days' });
  }

  const validDays = [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i];
    if (!validDays.includes(h.dayOfWeek)) {
      errors.push({ field: `hours[${i}].dayOfWeek`, message: 'Invalid day of week' });
    }
    if (!h.isClosed) {
      if (!h.openTime || typeof h.openTime !== 'string') {
        errors.push({ field: `hours[${i}].openTime`, message: 'Open time is required' });
      }
      if (!h.closeTime || typeof h.closeTime !== 'string') {
        errors.push({ field: `hours[${i}].closeTime`, message: 'Close time is required' });
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  req.cleanHours = hours.map(h => ({
    day_of_week: h.dayOfWeek,
    open_time: h.isClosed ? '00:00' : h.openTime,
    close_time: h.isClosed ? '00:00' : h.closeTime,
    is_closed: Boolean(h.isClosed),
  }));

  next();
}

export function validateRegisterInput(req, res, next) {
  const { storeName, slug, whatsappNumber, password, verificationToken } = req.body;
  const errors = [];

  if (!storeName || typeof storeName !== 'string' || storeName.trim().length < 1 || storeName.length > 100) {
    errors.push({ field: 'storeName', message: 'Store name is required (1-100 chars)' });
  }

  if (!slug || typeof slug !== 'string') {
    errors.push({ field: 'slug', message: 'Store URL slug is required' });
  } else if (!/^[a-z0-9-]{2,100}$/.test(slug)) {
    errors.push({ field: 'slug', message: 'Slug can only contain lowercase letters, numbers, and hyphens' });
  }

  if (!whatsappNumber || typeof whatsappNumber !== 'string') {
    errors.push({ field: 'whatsappNumber', message: 'WhatsApp number is required' });
  } else {
    const phoneCheck = validatePakPhone(whatsappNumber);
    if (!phoneCheck.valid) {
      errors.push({ field: 'whatsappNumber', message: phoneCheck.error });
    }
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  } else if (password.length > 128) {
    errors.push({ field: 'password', message: 'Password must be under 128 characters' });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const normalizedPhone = validatePakPhone(whatsappNumber).normalized;

  req.cleanInput = {
    storeName: storeName.trim().slice(0, 100),
    slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    whatsappNumber: normalizedPhone,
    password,
    verificationToken,
  };

  next();
}
