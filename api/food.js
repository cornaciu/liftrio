// Read-only Open Food Facts lookup for the nutrition diary. Keep the request
// server-side so the upstream receives the identifying User-Agent it requires.
const FIELDS = 'code,product_name,product_name_ro,brands,quantity,nutriments,image_front_small_url';
const USER_AGENT = 'openGym/1.2.4 (https://github.com/cornaciu/openGym)';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  const code = String(req.query.code || '').trim();
  const query = String(req.query.q || '').trim();
  if ((code && !/^\d{8,14}$/.test(code)) || (!code && (query.length < 2 || query.length > 80))) {
    res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid food query' }));
  }
  const url = code
    ? `https://world.openfoodfacts.org/api/v2/product/${code}?fields=${FIELDS}`
    : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=${FIELDS}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error(`Open Food Facts: ${response.status}`);
    const data = await response.json();
    const products = code ? (data.status === 1 ? [data.product] : []) : (data.products || []);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.end(JSON.stringify({ products }));
  } catch {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Food database unavailable' }));
  }
}
