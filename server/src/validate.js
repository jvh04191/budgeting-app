const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function str(value, field, { optional = false } = {}) {
  if (value == null || value === '') {
    if (optional) return null;
    throw new HttpError(400, `${field} is required`);
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  return value.trim();
}

export function cents(value, field, { allowZero = false } = {}) {
  if (!Number.isInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new HttpError(400, `${field} must be a positive integer number of cents`);
  }
  return value;
}

export function date(value, field, opts) {
  const v = str(value, field, opts);
  if (v !== null && !DATE.test(v)) throw new HttpError(400, `${field} must be YYYY-MM-DD`);
  return v;
}

export function month(value, field = 'month') {
  const v = str(value, field);
  if (!MONTH.test(v)) throw new HttpError(400, `${field} must be YYYY-MM`);
  return v;
}

export function oneOf(value, field, options) {
  if (!options.includes(value)) throw new HttpError(400, `${field} must be one of: ${options.join(', ')}`);
  return value;
}
