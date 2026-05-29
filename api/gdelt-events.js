module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = 'https://api.gdeltproject.org/api/v2/events/search?query=cameo:19&mode=pointdata&maxrecords=250&timespan=7d&format=json';
  try {
    const r = await fetch(url);
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(text);
  } catch (e) {
    res.status(200).json({ features: [] });
  }
}
