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
  // The legacy CGI keyword search can take longer than a serverless request.
  // Search-a-licious is the dedicated full-text index, including Romanian names.
  const safeQuery = query.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
  const url = code
    ? `https://world.openfoodfacts.org/api/v2/product/${code}?fields=${FIELDS}`
    : `https://search.openfoodfacts.org/search?q=${encodeURIComponent(safeQuery)}&langs=ro,en&boost_phrase=true&page_size=20&fields=${FIELDS}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`Open Food Facts: ${response.status}`);
    const data = await response.json();
    const products = code ? (data.status === 1 ? [data.product] : []) : (data.hits || []);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.end(JSON.stringify({ products }));
  } catch (error) {
    console.error('Food lookup failed', { kind: code ? 'barcode' : 'search', message: error.message });
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Food database temporarily unavailable' }));
  }
}
