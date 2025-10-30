// Zaynix - Supabase-backed uploader + proxy CDN
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const sanitize = require('sanitize-filename');
const fetch = require('node-fetch');
require('dotenv').config();

const { supabase } = require('./utils/supabase');

const app = express();
const PORT = process.env.PORT || 3000;
const BUCKET = process.env.SUPABASE_BUCKET || 'zaynix-files';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '209715200'); // 200MB
const DELETE_TOKEN = process.env.DELETE_TOKEN || 'changeme_delete_token';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('tiny'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// multer in-memory storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

// Helper: safe filename
function safeName(name) {
  return sanitize(name).replace(/\s+/g, '_');
}

// Upload route -> uploads file buffer to Supabase Storage
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const orig = req.file.originalname || 'file';
    const ext = path.extname(orig).toLowerCase();
    const filename = `${Date.now()}-${safeName(path.basename(orig, ext))}${ext}`;

    const { data, error } = await supabase.storage.from(BUCKET).upload(filename, req.file.buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: req.file.mimetype
    });

    if (error) {
      console.error('Supabase upload error', error);
      return res.status(500).json({ error: 'Upload failed', detail: error.message || error });
    }

    // build proxied URL on our domain
    const url = `${req.protocol}://${req.get('host')}/${encodeURIComponent(filename)}`;
    return res.json({
      filename,
      url,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete route -> delete from Supabase
app.post('/api/delete', async (req, res) => {
  try {
    const token = req.headers['x-delete-token'] || req.body.token;
    if (token !== DELETE_TOKEN) return res.status(403).json({ error: 'Forbidden' });

    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const { error } = await supabase.storage.from(BUCKET).remove([filename]);
    if (error) return res.status(500).json({ error: 'Delete failed', detail: error.message });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// List files (get list from Supabase)
app.get('/files', async (req, res) => {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { sortBy: { column: 'created_at', order: 'desc' } });
    if (error) return res.status(500).send('Failed to list files');
    // render a simple page listing files
    const files = data.map(f => ({
      name: f.name,
      url: `${req.protocol}://${req.get('host')}/${encodeURIComponent(f.name)}`,
      size: f.size,
      created_at: f.created_at
    }));
    // quick HTML
    let html = '<h1>Uploaded files</h1><ul>';
    for (const f of files) {
      html += `<li><a href="${f.url}">${f.name}</a> - ${f.size} bytes - ${f.created_at}</li>`;
    }
    html += '</ul><p><a href="/">Upload more</a></p>';
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Proxy GET route: serve clean root URL like /1630319889-file.mp4
app.get('/:filename', async (req, res, next) => {
  try {
    const name = req.params.filename;
    // Avoid clashing with existing routes (api, files, etc.)
    const reserved = ['api', 'files', 'favicon.ico', 'css', 'js', 'public'];
    if (reserved.includes(name)) return next();

    // simple filename validation
    if (!/^\d{9,}[-A-Za-z0-9_\-.]*\.[A-Za-z0-9]+$/.test(name)) return next();

    // Build Supabase public URL
    const supaUrl = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${process.env.SUPABASE_BUCKET}/${encodeURIComponent(name)}`;

    // Fetch from Supabase and stream to client
    const r = await fetch(supaUrl);
    if (!r.ok) return res.status(404).send('Not found');

    // forward content-type & cache headers
    const ctype = r.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ctype);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // stream body
    r.body.pipe(res);
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// Root page - upload UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Zaynix listening on port ${PORT}`);
});
