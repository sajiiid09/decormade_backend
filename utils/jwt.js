import crypto from 'node:crypto';

const header = { alg: 'HS256', typ: 'JWT' };

const base64UrlEncode = (value) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString();

const parseExpiresIn = (expiresIn) => {
  if (!expiresIn) return null;

  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    return expiresIn * 1000;
  }

  const numeric = Number(expiresIn);
  if (!Number.isNaN(numeric)) {
    return numeric * 1000;
  }

  const match = /^\s*(\d+)\s*([smhd])\s*$/i.exec(expiresIn);
  if (!match) {
    return null;
  }

  const unit = match[2].toLowerCase();
  const value = Number(match[1]);
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] ?? 1) * 1000;
};

const createError = (name, message) => {
  const error = new Error(message);
  error.name = name;
  return error;
};

export const sign = (payload, secret, options = {}) => {
  if (!secret) {
    throw new Error('JWT secret is required to sign tokens');
  }

  const ttl = parseExpiresIn(options.expiresIn);
  const tokenPayload = { ...payload };

  if (ttl) {
    tokenPayload.exp = Math.floor((Date.now() + ttl) / 1000);
  }

  const headerPart = base64UrlEncode(header);
  const payloadPart = base64UrlEncode(tokenPayload);
  const data = `${headerPart}.${payloadPart}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  return `${data}.${signature}`;
};

export const verify = (token, secret) => {
  if (!secret) {
    throw new Error('JWT secret is required to verify tokens');
  }

  const parts = token?.split('.');
  if (!parts || parts.length !== 3) {
    throw createError('JsonWebTokenError', 'jwt malformed');
  }

  const [headerPart, payloadPart, signature] = parts;
  const data = `${headerPart}.${payloadPart}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  const isValidSignature =
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!isValidSignature) {
    throw createError('JsonWebTokenError', 'invalid signature');
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart));

  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw createError('TokenExpiredError', 'jwt expired');
  }

  return payload;
};
