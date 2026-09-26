// Read-only Open Food Facts lookup for the nutrition diary. Keep the request
// server-side so the upstream receives the identifying User-Agent it requires.
const FIELDS = 'code,product_name,product_name_ro,brands,quantity,nutriments,image_front_small_url,countries_tags';
const USER_AGENT = 'openGym/1.2.4 (https://github.com/cornaciu/openGym)';

function searchUrl(query, romanianOnly) {
  const params = new URLSearchParams({
    q: romanianOnly ? `(${query}) AND countries_tags:"en:romania"` : query,
    langs: 'ro,en',
    boost_phrase: 'true',
    page_size: '30',
    fields: FIELDS
  });
  return `https://search.openfoodfacts.org/search?${params}`;
}

function usableProducts(products) {
  return products.filter(product =>
    (product.product_name || product.product_name_ro) &&
    ['energy-kcal_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g']
      .some(key => product.nutriments?.[key] != null)
  );
}

async function searchProducts(query, romanianOnly) {
  const response = await fetch(searchUrl(query, romanianOnly), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Open Food Facts: ${response.status}`);
  const data = await response.json();
  const products = usableProducts(data.hits || []);
  if (!romanianOnly) return products;
  return products.filter(product => (product.countries_tags || []).includes('en:romania'));
}

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
  try {
    let products, market;
    if (code) {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${FIELDS}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error(`Open Food Facts: ${response.status}`);
      const data = await response.json();
      products = data.status === 1 ? [data.product] : [];
    } else {
      // Try Romanian listings first. If none match (common for generic foods
      // searched in English), use the global index as a clearly marked fallback.
      try { products = await searchProducts(safeQuery, true); } catch { products = []; }
      market = products.length ? 'ro' : 'global';
      if (!products.length) products = await searchProducts(safeQuery, false);
    }
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.end(JSON.stringify({ products, market }));
  } catch (error) {
    console.error('Food lookup failed', { kind: code ? 'barcode' : 'search', message: error.message });
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Food database temporarily unavailable' }));
  }
}
