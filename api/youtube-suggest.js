export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const q = String(req.query?.q || '').trim();
  if (!q) return res.status(200).json([]);
  try {
    const url = new URL('https://suggestqueries.google.com/complete/search');
    url.search = new URLSearchParams({ client: 'firefox', ds: 'yt', q });
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Suggestion upstream returned ${response.status}`);
    const data = await response.json();
    const terms = (data?.[1] || []).map(item => typeof item === 'string' ? item : item?.[0]).filter(Boolean).slice(0, 8);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(terms);
  } catch (error) {
    return res.status(200).json([]);
  }
}
