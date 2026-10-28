import { HttpError } from './validate.js';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOOPBACK_ADDRESS = /^(::1|127(\.\d{1,3}){3}|::ffff:127(\.\d{1,3}){3})$/i;

export const isLoopbackAddress = (address) => LOOPBACK_ADDRESS.test(String(address || ''));

// The API has no login, so the network peer itself must be this computer. The Host header is
// client-controlled and only guards against DNS rebinding from a browser, so it is checked as well.
export function localOnly({ allowedHosts = [] } = {}) {
  return (req, _res, next) => {
    if (!isLoopbackAddress(req.socket?.remoteAddress)) return next(new HttpError(403, 'local requests only'));
    const host = String(req.headers.host || '');
    if (LOCAL_HOST.test(host) || allowedHosts.includes(host.toLowerCase())) return next();
    next(new HttpError(403, 'host not allowed'));
  };
}

export function assertLoopbackBind(host) {
  if (host === 'localhost' || isLoopbackAddress(host)) return;
  throw new Error(
    `Refusing to listen on "${host}": the API has no login and serves bank data. Use 127.0.0.1 until authentication is added.`,
  );
}
