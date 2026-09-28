require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connectDatabase, getDatabaseStatus } = require('./config/db');
const apiRoutes = require('./routes');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'cloud-state.json');
const ALLOWED_KEYS = new Set([
  'sih_lm_applications',
  'sih_lm_certificates',
  'sih_lm_gatc_tests',
  'sih_lm_gatc_standards',
  'sih_lm_audit_logs',
  'sih_lm_officers',
  'sih_lm_registered_users'
]);

function readState() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

function certificateResponse(cert, state) {
  if (!cert) return null;
  const expiry = cert.validUntil || cert.expiryDate;
  const expiryTime = expiry ? new Date(`${expiry}T23:59:59.999Z`).getTime() : 0;
  const now = Date.now();
  const isExpired = !expiryTime || expiryTime < now;
  const app = (state.sih_lm_applications || []).find(item => item.id === cert.appId || item.id === cert.applicationId);
  return {
    ...cert,
    liveStatus: cert.outcome === 'REJECTED' || isExpired ? (cert.outcome === 'REJECTED' ? 'REJECTED' : 'EXPIRED') : 'VALID',
    isValid: cert.outcome !== 'REJECTED' && !isExpired,
    expiresInSeconds: Math.max(0, Math.floor((expiryTime - now) / 1000)),
    serverTime: new Date(now).toISOString(),
    source: 'GATC cloud registry',
    applicationStatus: app ? app.status : null
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(ROOT));
app.use('/api', apiRoutes);

app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'verimatrix-registry',
    serverTime: new Date().toISOString(),
    database: getDatabaseStatus()
  });
});

app.get('/api/v1/state', (req, res) => {
  const state = readState();
  const keys = String(req.query.keys || '').split(',').filter(key => ALLOWED_KEYS.has(key));
  res.set('Cache-Control', 'no-store');
  res.json({
    serverTime: new Date().toISOString(),
    state: Object.fromEntries(keys.map(key => [key, state[key] || []]))
  });
});

app.post('/api/v1/sync', (req, res) => {
  const { key, data } = req.body || {};
  if (!ALLOWED_KEYS.has(key) || !Array.isArray(data)) {
    return res.status(400).json({ error: 'A supported storage key and array data are required.' });
  }

  const state = readState();
  state[key] = data;
  state.lastSyncedAt = new Date().toISOString();
  writeState(state);
  return res.json({ ok: true, key, syncedAt: state.lastSyncedAt, recordCount: data.length });
});

app.get('/api/v1/certificates/:certificateId', (req, res) => {
  const state = readState();
  const cert = (state.sih_lm_certificates || []).find(item => item.certId === req.params.certificateId);
  const result = certificateResponse(cert, state);
  if (!result) {
    return res.status(404).json({ valid: false, liveStatus: 'NOT_FOUND', certificateId: req.params.certificateId, serverTime: new Date().toISOString() });
  }

  const accessLog = state.sih_lm_audit_logs || [];
  accessLog.unshift({
    timestamp: new Date().toISOString(),
    action: 'Public Certificate Verification',
    details: `${req.params.certificateId} checked through cloud registry.`,
    eventId: crypto.randomUUID()
  });
  state.sih_lm_audit_logs = accessLog.slice(0, 5000);
  writeState(state);
  return res.json(result);
});

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed.', details: Object.values(error.errors).map(item => item.message) });
  }
  if (error.code === 11000) return res.status(409).json({ error: 'A record with the same unique identifier already exists.' });
  console.error(`[api] ${error.message}`);
  return res.status(500).json({ error: 'Internal server error.' });
});

async function startServer() {
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(`VeriMatrix server listening on http://localhost:${PORT}`);
    if (getDatabaseStatus().stateLabel !== 'connected') {
      console.warn('[mongodb] business data APIs are not enabled until MongoDB is connected');
    }
  });
}

if (require.main === module) startServer();

module.exports = { app, startServer };
