import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { middleware, errors, HttpError, identifier, text } from './http.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fields = `id, asset_tag AS "assetTag", name, category, location, description, status`;
export function createApp({ pool, bookingUrl = process.env.BOOKING_SERVICE_URL || 'http://127.0.0.1:4181' }) {
  const app = express();
  middleware(app, 'equipment');
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    if (['POST', 'PATCH'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(new HttpError(400, 'A JSON object is required.'));
    next();
  });
  app.get('/health/live', (req, res) => res.json({ status: 'up', service: 'equipment' }));
  app.get('/health/ready', async (req, res) => { await pool.query('SELECT 1'); res.json({ status: 'ready' }); });
  app.get('/api/equipment', async (req, res) => {
    const result = await pool.query(`SELECT ${fields} FROM equipment ORDER BY asset_tag`);
    res.json(result.rows);
  });
  app.get('/api/equipment/:id', async (req, res) => {
    const result = await pool.query(`SELECT ${fields} FROM equipment WHERE id=$1`, [identifier(req.params.id)]);
    if (!result.rowCount) throw new HttpError(404, 'Equipment was not found.');
    res.json(result.rows[0]);
  });
  app.post('/api/equipment', async (req, res) => {
    const data = req.body;
    const values = [text(data.assetTag, 'Asset tag', 30).toUpperCase(), text(data.name, 'Name', 100), text(data.category, 'Category', 50), text(data.location, 'Location', 100)];
    if (!/^[A-Z0-9-]{2,30}$/.test(values[0])) throw new HttpError(400, 'Asset tag may contain letters, numbers and hyphens.');
    if (data.description != null && (typeof data.description !== 'string' || data.description.length > 400)) throw new HttpError(400, 'Description must be 400 characters or fewer.');
    try {
      const result = await pool.query(`INSERT INTO equipment(asset_tag,name,category,location,description) VALUES($1,$2,$3,$4,$5) RETURNING ${fields}`, [...values, (data.description || '').trim()]);
      res.status(201).json(result.rows[0]);
    } catch (error) { if (error.code === '23505') throw new HttpError(409, 'That asset tag is already in use.'); throw error; }
  });
  app.patch('/api/equipment/:id', async (req, res) => {
    if (!['operational', 'maintenance'].includes(req.body.status)) throw new HttpError(400, 'Choose operational or maintenance status.');
    const result = await pool.query(`UPDATE equipment SET status=$1 WHERE id=$2 RETURNING ${fields}`, [req.body.status, identifier(req.params.id)]);
    if (!result.rowCount) throw new HttpError(404, 'Equipment was not found.');
    res.json(result.rows[0]);
  });
  for (const prefix of ['/api/bookings', '/api/availability']) {
    app.use(prefix, async (req, res) => {
      let upstream;
      try {
        upstream = await fetch(`${bookingUrl}${req.originalUrl}`, { method: req.method, headers: { 'Content-Type': 'application/json', 'X-Request-ID': req.requestId, ...(req.get('Idempotency-Key') ? { 'Idempotency-Key': req.get('Idempotency-Key') } : {}) }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body), signal: AbortSignal.timeout(5000) });
      } catch { throw new HttpError(503, 'Booking service is temporarily unavailable. Please try again.'); }
      const body = await upstream.json();
      if (upstream.headers.get('Idempotency-Replayed')) res.set('Idempotency-Replayed', 'true');
      res.status(upstream.status).json(body);
    });
  }
  app.get('/vendor/bootstrap.min.css', (req, res) => res.sendFile(path.join(root, 'node_modules/bootstrap/dist/css/bootstrap.min.css')));
  app.get('/vendor/bootstrap.bundle.min.js', (req, res) => res.sendFile(path.join(root, 'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js')));
  app.use('/vendor/icons', express.static(path.join(root, 'node_modules/bootstrap-icons/font')));
  app.use(express.static(path.join(root, 'public')));
  errors(app);
  return app;
}
