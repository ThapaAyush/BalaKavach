import { parseCookie } from 'cookie';

export function getSessionCookieName(nodeEnv) {
  return nodeEnv === 'production' ? '__Host-kidsguard_session' : 'kidsguard_session';
}

export function readSessionToken(req, cookieName) {
  try {
    const cookies = parseCookie(req.get('cookie') ?? '');
    const token = cookies[cookieName];
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

function sessionCookieOptions(nodeEnv) {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

export function setSessionCookie(res, cookieName, token, maxAgeMs, nodeEnv) {
  res.cookie(cookieName, token, {
    ...sessionCookieOptions(nodeEnv),
    maxAge: maxAgeMs,
  });
}

export function clearSessionCookie(res, cookieName, nodeEnv) {
  res.clearCookie(cookieName, sessionCookieOptions(nodeEnv));
}
