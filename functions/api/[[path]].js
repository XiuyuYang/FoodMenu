import {
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
} from '../_utils.js';

async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

async function handleRegister(request, env) {
  if (!env.JWT_SECRET) return errorResponse('服务器未配置 JWT_SECRET', 503);
  var body = await readJson(request);
  if (!body || !body.email || !body.password) {
    return errorResponse('请填写邮箱和密码');
  }
  var email = String(body.email).trim().toLowerCase();
  var password = String(body.password);
  if (!isValidEmail(email)) return errorResponse('邮箱格式不正确');
  if (password.length < 6) return errorResponse('密码至少 6 位');

  var existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return errorResponse('该邮箱已注册', 409);

  var userId = crypto.randomUUID();
  var now = new Date().toISOString();
  var passwordHash = await createPasswordHash(password);

  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, gemini_api_key, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, email, passwordHash, '', now).run();

  var exp = Math.floor(Date.now() / 1000) + JWT_EXPIRY_DAYS * 86400;
  var token = await signJwt({ sub: userId, exp: exp }, env.JWT_SECRET);

  return jsonResponseWithHeaders({ ok: true, user: { id: userId, email: email } }, 201, {
    'Set-Cookie': makeTokenCookie(token)
  });
}

function jsonResponseWithHeaders(data, status, extraHeaders) {
  var headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
  }
  return new Response(JSON.stringify(data), { status: status || 200, headers: headers });
}

async function handleLogin(request, env) {
  if (!env.JWT_SECRET) return errorResponse('服务器未配置 JWT_SECRET', 503);
  var body = await readJson(request);
  if (!body || !body.email || !body.password) {
    return errorResponse('请填写邮箱和密码');
  }
  var email = String(body.email).trim().toLowerCase();
  var password = String(body.password);

  var user = await env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .bind(email).first();
  if (!user) return errorResponse('邮箱或密码错误', 401);

  var ok = await verifyPassword(password, user.password_hash);
  if (!ok) return errorResponse('邮箱或密码错误', 401);

  var exp = Math.floor(Date.now() / 1000) + JWT_EXPIRY_DAYS * 86400;
  var token = await signJwt({ sub: user.id, exp: exp }, env.JWT_SECRET);

  return jsonResponseWithHeaders({ ok: true, user: { id: user.id, email: user.email } }, 200, {
    'Set-Cookie': makeTokenCookie(token)
  });
}

async function handleLogout() {
  return jsonResponseWithHeaders({ ok: true }, 200, { 'Set-Cookie': clearTokenCookie() });
}

async function handleMe(request, env) {
  var user = await getAuthUser(request, env);
  if (!user) return errorResponse('未登录', 401);
  return jsonResponse({ user: { id: user.id, email: user.email } });
}

async function handleListDishes(request, env, user) {
  var rows = await env.DB.prepare(
    'SELECT id, name, category, image_data, created_at, updated_at FROM dishes WHERE user_id = ? ORDER BY name'
  ).bind(user.id).all();
  var dishes = (rows.results || []).map(dishRowToJson);
  return jsonResponse({ dishes: dishes });
}

async function handleCreateDish(request, env, user) {
  var body = await readJson(request);
  if (!body || !body.name) return errorResponse('请填写菜名');
  var name = String(body.name).trim();
  if (!name) return errorResponse('请填写菜名');
  var category = body.category || '荤菜';
  if (CATEGORIES.indexOf(category) === -1) category = '荤菜';

  var id = body.id || crypto.randomUUID();
  var now = new Date().toISOString();
  var imageData = body.image || null;
  if (imageData && imageData.length > 500000) {
    return errorResponse('图片过大，请压缩后重试');
  }

  await env.DB.prepare(
    'INSERT INTO dishes (id, user_id, name, category, image_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, name, category, imageData, now, now).run();

  return jsonResponse({ dish: dishRowToJson({
    id: id, name: name, category: category, image_data: imageData,
    created_at: now, updated_at: now
  }) }, 201);
}

async function handleUpdateDish(request, env, user, dishId) {
  var body = await readJson(request);
  if (!body) return errorResponse('无效请求');

  var existing = await env.DB.prepare(
    'SELECT id, name, category, image_data, created_at, updated_at FROM dishes WHERE id = ? AND user_id = ?'
  ).bind(dishId, user.id).first();
  if (!existing) return errorResponse('菜品不存在', 404);

  var name = body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) return errorResponse('请填写菜名');
  var category = body.category || existing.category;
  if (CATEGORIES.indexOf(category) === -1) category = existing.category;

  var imageData = existing.image_data;
  if (body.imageRemoved) {
    imageData = null;
  } else if (body.image !== undefined) {
    imageData = body.image;
  }
  if (imageData && imageData.length > 500000) {
    return errorResponse('图片过大，请压缩后重试');
  }

  var now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE dishes SET name = ?, category = ?, image_data = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(name, category, imageData, now, dishId, user.id).run();

  return jsonResponse({ dish: dishRowToJson({
    id: dishId, name: name, category: category, image_data: imageData,
    created_at: existing.created_at, updated_at: now
  }) });
}

async function handleDeleteDish(env, user, dishId) {
  var result = await env.DB.prepare('DELETE FROM dishes WHERE id = ? AND user_id = ?')
    .bind(dishId, user.id).run();
  if (!result.meta || result.meta.changes === 0) {
    return errorResponse('菜品不存在', 404);
  }
  return jsonResponse({ ok: true });
}

async function handleSync(request, env, user) {
  var body = await readJson(request);
  if (!body || !Array.isArray(body.dishes)) return errorResponse('无效数据');
  var imported = 0;
  for (var i = 0; i < body.dishes.length; i++) {
    var d = body.dishes[i];
    if (!d || !d.name) continue;
    var id = d.id || crypto.randomUUID();
    var category = d.category || '荤菜';
    if (CATEGORIES.indexOf(category) === -1) category = '荤菜';
    var now = new Date().toISOString();
    var created = d.createdAt || now;
    var image = d.image || null;
    if (image && image.length > 500000) image = null;

    var exists = await env.DB.prepare('SELECT id FROM dishes WHERE id = ? AND user_id = ?')
      .bind(id, user.id).first();
    if (exists) continue;

    await env.DB.prepare(
      'INSERT INTO dishes (id, user_id, name, category, image_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, user.id, String(d.name).trim(), category, image, created, d.updatedAt || created).run();
    imported++;
  }
  return jsonResponse({ ok: true, imported: imported });
}

var GEMINI_MODEL = 'gemini-2.0-flash';

async function handleAnalyze(request, env) {
  var apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return errorResponse('识图服务未配置', 503);

  var body = await readJson(request);
  if (!body || !body.image) return errorResponse('请提供图片');

  var base64 = String(body.image);
  if (base64.indexOf(',') !== -1) {
    base64 = base64.split(',')[1];
  }

  var categoriesStr = CATEGORIES.join('、');
  var prompt =
    '这是一道菜的照片。请识别这道菜的中文名称，并从以下分类中选择最合适的一个：' +
    categoriesStr +
    '。只返回 JSON，格式为 {"name":"菜名","category":"分类"}，不要其他文字。' +
    '如果无法识别，name 填"未知菜品"，category 填"荤菜"。';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

  var geminiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: base64 } }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    })
  });

  if (!geminiRes.ok) {
    var errData = await geminiRes.json().catch(function () { return {}; });
    var msg = (errData.error && errData.error.message) || '识图 API 请求失败';
    return errorResponse(msg, 502);
  }

  var data = await geminiRes.json();
  var text = data.candidates[0].content.parts[0].text;
  var result = JSON.parse(text);
  var name = result.name || '未知菜品';
  var category = result.category || '荤菜';
  if (CATEGORIES.indexOf(category) === -1) category = '荤菜';

  return jsonResponse({ name: name, category: category });
}

export async function onRequest(context) {
  var request = context.request;
  var env = context.env;
  var segments = parsePath(context.params.path);
  var method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  }

  try {
    if (segments[0] === 'auth') {
      if (segments[1] === 'register' && method === 'POST') return handleRegister(request, env);
      if (segments[1] === 'login' && method === 'POST') return handleLogin(request, env);
      if (segments[1] === 'logout' && method === 'POST') return handleLogout();
      if (segments[1] === 'me' && method === 'GET') return handleMe(request, env);
    }

    var user = await getAuthUser(request, env);
    if (!user) return errorResponse('未登录', 401);

    if (segments[0] === 'dishes') {
      if (segments.length === 1) {
        if (method === 'GET') return handleListDishes(request, env, user);
        if (method === 'POST') return handleCreateDish(request, env, user);
      }
      if (segments.length === 2) {
        var dishId = segments[1];
        if (method === 'PUT') return handleUpdateDish(request, env, user, dishId);
        if (method === 'DELETE') return handleDeleteDish(env, user, dishId);
      }
    }

    if (segments[0] === 'sync' && method === 'POST') {
      return handleSync(request, env, user);
    }

    if (segments[0] === 'analyze' && method === 'POST') {
      return handleAnalyze(request, env);
    }

    return errorResponse('未找到接口', 404);
  } catch (err) {
    console.error(err);
    return errorResponse('服务器错误', 500);
  }
}
