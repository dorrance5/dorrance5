/* The meal plan and the grocery list for dorrance.me/recipes. index.js sends /api/meals and /api/meals/* here.
   Two people share them: the admin and one partner account that the admin picks in Recipes > Settings. No one else
   can read them. They are private, so they live in KV and not in the public GitHub repository.
   recipes/meals.js has the data and the ops, and the page uses the same file.

   GET  /api/meals                    -> { people, days, list }, and { partner } for the admin   (the two planners)
   POST /api/meals          { ops }   -> the same, after the ops                                 (the two planners)
   PUT  /api/meals/partner  { key }   -> { partner }: an approved account's key, or '' for no one  (admin)

   KV (the LIB binding) keeps:
     meals:data     the data that recipes/meals.js describes
     meals:partner  { key, id, name } of the partner's account. With the id, a new account that takes the name of a
                    removed one is not the partner.
   A GET only reads. A POST is one read and one write; the page sends its ops in batches, at most one each 1.2 s.
   KV takes one write a second to one key: a POST that meets another one answers 429 { error: 'busy' }, and the page
   sends again. Over the day's free writes, a POST answers 503 { error: 'full' }. */
import M from '../recipes/meals.js';
import { json, who, adminName } from './auth.js';

const DATA = 'meals:data', PARTNER = 'meals:partner', USER = 'auth:user:';
const today = () => new Date().toISOString().slice(0, 10);

async function body(req) {
  const text = await req.text().catch(() => '');
  if (text.length > 64000) return null;
  try { const b = JSON.parse(text); return b && typeof b === 'object' ? b : null; } catch { return null; }
}
// The partner, { key, id, name }, or null. For the admin, the account is checked too: it may have been removed.
async function partnerFor(env, me) {
  const p = await env.LIB.get(PARTNER, 'json');
  if (!p || typeof p.key !== 'string') return null;
  if (!me.admin) return p;
  const u = await env.LIB.get(USER + p.key, 'json');
  return u && u.id === p.id && u.status === 'approved' ? p : null;
}
const isPlanner = (me, p) => me.admin || (!!p && me.key === p.key && me.id === p.id);

function answer(env, me, partner, data) {
  const d = M.tidy(data);
  const out = { people: [adminName(env), ...(partner ? [partner.name] : [])], days: d.days, list: d.list };
  if (me.admin) out.partner = partner ? { key: partner.key, name: partner.name } : null;
  return json(out);
}

export async function meals(req, env, url) {
  const path = url.pathname.replace(/^\/api\/meals\/?/, '').replace(/\/$/, '');
  if (path !== '' && path !== 'partner') return json({ error: 'not found' }, 404);
  const me = await who(req, env);
  if (!me) return json({ error: 'signin' }, 401);

  if (path === 'partner') {
    if (req.method !== 'PUT') return json({ error: 'method' }, 405);
    if (!me.admin) return json({ error: 'admin' }, 403);
    const b = await body(req);
    if (!b || typeof b.key !== 'string' || b.key.length > 40) return json({ error: 'body' }, 400);
    if (!b.key) { await env.LIB.delete(PARTNER); return json({ partner: null }); }
    const u = await env.LIB.get(USER + b.key, 'json');
    if (!u || u.status !== 'approved') return json({ error: 'nobody' }, 404);
    await env.LIB.put(PARTNER, JSON.stringify({ key: b.key, id: u.id, name: u.name }));
    return json({ partner: { key: b.key, name: u.name } });
  }

  const partner = await partnerFor(env, me);
  if (!isPlanner(me, partner)) return json({ error: 'planner' }, 403);
  const read = () => env.LIB.get(DATA, { type: 'json', cacheTtl: 30 });
  if (req.method === 'GET') return answer(env, me, partner, await read());
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const b = await body(req);
  const ops = b && Array.isArray(b.ops) && b.ops.length <= M.MAX.ops ? b.ops.map(M.check) : null;
  if (!ops || ops.some(op => !op)) return json({ error: 'body' }, 400);
  const before = await read();
  if (!ops.length) return answer(env, me, partner, before);
  const data = M.apply(before, ops, me.name, today());
  try { await env.LIB.put(DATA, JSON.stringify(data)); }
  catch (e) { return /limit/i.test(String(e && e.message)) ? json({ error: 'full' }, 503) : json({ error: 'busy' }, 429); }
  return answer(env, me, partner, data);
}
