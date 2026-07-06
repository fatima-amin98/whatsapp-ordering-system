import jwt from 'jsonwebtoken';
import config from '../config.js';

export function signJwt(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiry,
  });
}

export function verifyJwt(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}
