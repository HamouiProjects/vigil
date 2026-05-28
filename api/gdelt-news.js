export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const country = req.query.country || '';
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(country + ' conflict')}&mode=artlist&maxrecords=3&timespan=3d&format=json`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({ articles: [] });
  }
}
