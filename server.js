const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-key-change-in-production';

// Basic enterprise security middleware
app.use(helmet());
app.use(express.json());

// Kubernetes Liveness & Readiness Probes
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime() });
});

app.get('/readyz', (req, res) => {
  res.status(200).json({ status: 'ready' });
});

// Mock Auth: Issue a token
app.post('/api/v1/auth/login', (req, res) => {
  const { username, role } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const token = jwt.sign(
    { sub: username, role: role || 'user', iss: 'auth-service' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return res.status(200).json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
});

// Token Verification
app.post('/api/v1/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.status(200).json({ valid: true, claims: decoded });
  } catch (err) {
    return res.status(401).json({ valid: false, error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Enterprise Auth Service listening on port ${PORT}`);
});