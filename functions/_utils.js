var CATEGORIES = ['荤菜', '素菜', '汤', '主食', '小吃'];
var COOKIE_NAME = 'foodmenu_token';
var JWT_EXPIRY_DAYS = 30;

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function errorResponse(message, status) {
  return jsonResponse({ error: message }, status || 400);
}

function base64UrlEncode(input) {
  var bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    bytes = input;
  }
  var binary = '';
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  var base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  var binary = atob(base64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signJwt(payload, secret) {
  var header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  var body = base64UrlEncode(JSON.stringify(payload));
  var data = header + '.' + body;
  var key = await getHmacKey(secret);
  var sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return data + '.' + base64UrlEncode(sig);
}

async function verifyJwt(token, secret) {
  var parts = token.split('.');
  if (parts.length !== 3) return null;
  var data = parts[0] + '.' + parts[1];
  var key = await getHmacKey(secret);
  var sigBytes = base64UrlDecode(parts[2]);
  var valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) return null;
  try {
    var payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
    var payload = JSON.parse(payloadJson);
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function makeTokenCookie(token) {
  var maxAge = JWT_EXPIRY_DAYS * 24 * 60 * 60;
  return COOKIE_NAME + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}

function clearTokenCookie() {
  return COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function getTokenFromRequest(request) {
  var cookie = request.headers.get('Cookie') || '';
  var parts = cookie.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.indexOf(COOKIE_NAME + '=') === 0) {
      return p.slice(COOKIE_NAME.length + 1);
    }
  }
  var auth = request.headers.get('Authorization') || '';
  if (auth.indexOf('Bearer ') === 0) return auth.slice(7);
  return null;
}

async function getAuthUser(request, env) {
  if (!env.JWT_SECRET) return null;
  var token = getTokenFromRequest(request);
  if (!token) return null;
  var payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload || !payload.sub) return null;
  var row = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(payload.sub).first();
  return row || null;
}

async function hashPassword(password, salt) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  var bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return base64UrlEncode(bits);
}

async function createPasswordHash(password) {
  var salt = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  var hash = await hashPassword(password, salt);
  return salt + ':' + hash;
}

async function verifyPassword(password, stored) {
  var parts = stored.split(':');
  if (parts.length !== 2) return false;
  var hash = await hashPassword(password, parts[0]);
  return hash === parts[1];
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function dishRowToJson(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    image: row.image_data || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parsePath(pathParam) {
  if (!pathParam) return [];
  if (Array.isArray(pathParam)) return pathParam;
  return String(pathParam).split('/').filter(Boolean);
}

export {
  CATEGORIES,
  JWT_EXPIRY_DAYS,
  jsonResponse,
  errorResponse,
  signJwt,
  getAuthUser,
  createPasswordHash,
  verifyPassword,
  isValidEmail,
  dishRowToJson,
  parsePath,
  makeTokenCookie,
  clearTokenCookie
};
