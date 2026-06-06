import express from 'express';
import cookieSession from 'cookie-session';
import multer from 'multer';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { db, uploadsDir } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_PASSWORD = process.env.APP_PASSWORD || 'jegesmedve';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession({
  name: 'session',
  secret: process.env.SESSION_SECRET || 'fagyaszto-titkos-kulcs',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}));

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(join(__dirname, 'public')));

// ─── Auth ────────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session?.loggedIn) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Bejelentkezés szükséges' });
  return res.redirect('/login.html');
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === APP_PASSWORD) {
    req.session.loggedIn = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Hibás jelszó' });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ loggedIn: !!req.session?.loggedIn });
});

app.use(requireAuth);

// ─── Fájlfeltöltés ───────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname) || '.jpg'}`),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// ─── Helyszínek (settings) ───────────────────────────────────────────────────

app.get('/api/locations', (req, res) => {
  res.json(db.prepare('SELECT * FROM locations ORDER BY name').all());
});

app.post('/api/locations', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Adj meg egy nevet' });
  try {
    db.prepare('INSERT INTO locations (name) VALUES (?)').run(name);
  } catch {
    return res.status(400).json({ error: 'Ez a tárhely már létezik' });
  }
  res.json({ ok: true });
});

app.delete('/api/locations/:id', (req, res) => {
  db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Termékek / készlet ──────────────────────────────────────────────────────

app.get('/api/products', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db.prepare('SELECT * FROM products WHERE quantity > 0 AND name LIKE ? ORDER BY name')
      .all(`%${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM products WHERE quantity > 0 ORDER BY name').all();
  }
  res.json(rows);
});

app.get('/api/products/all', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY name').all());
});

// Bevételezés: új tétel vagy meglévő mennyiségének növelése
app.post('/api/intake', upload.fields([
  { name: 'photo_product', maxCount: 1 },
  { name: 'photo_label', maxCount: 1 },
]), (req, res) => {
  const name = (req.body.name || '').trim();
  const quantity = parseInt(req.body.quantity, 10);
  const location = (req.body.location || '').trim();

  if (!name) return res.status(400).json({ error: 'Add meg a termék nevét' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Add meg a darabszámot' });

  const photoProduct = req.files?.photo_product?.[0]?.filename || null;
  const photoLabel = req.files?.photo_label?.[0]?.filename || null;

  const existing = db.prepare('SELECT * FROM products WHERE name = ? AND location = ?').get(name, location);
  if (existing) {
    db.prepare(`UPDATE products SET quantity = quantity + ?,
      photo_product = COALESCE(?, photo_product),
      photo_label = COALESCE(?, photo_label),
      updated_at = datetime('now')
      WHERE id = ?`).run(quantity, photoProduct, photoLabel, existing.id);
    return res.json({ ok: true, id: existing.id });
  }

  const info = db.prepare(`INSERT INTO products (name, quantity, location, photo_product, photo_label)
    VALUES (?, ?, ?, ?, ?)`).run(name, quantity, location, photoProduct, photoLabel);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Kivételezés: mennyiség csökkentése egy tételből
app.post('/api/outtake', (req, res) => {
  const id = parseInt(req.body.id, 10);
  const quantity = parseInt(req.body.quantity, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Hiányzó tétel' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Add meg a darabszámot' });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return res.status(404).json({ error: 'Nem található a tétel' });

  const newQty = Math.max(0, product.quantity - quantity);
  db.prepare(`UPDATE products SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(newQty, id);
  res.json({ ok: true, quantity: newQty });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Fagyasztó készletkezelő fut: http://localhost:${process.env.PORT || 3000}`);
});
