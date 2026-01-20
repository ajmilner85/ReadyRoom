/**
 * HEALTH CHECK ROUTES
 *
 * PURPOSE: Provide health check endpoints for load balancers and monitoring
 *
 * ENDPOINTS:
 * - GET /api/health - Returns JSON with status and timestamp
 * - HEAD /api/health - Lightweight health check (no body)
 *
 * DEPENDENCIES:
 * - None (pure Express routes)
 *
 * USAGE:
 * Registered in main server: app.use('/api', require('./routes/health'));
 */

const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Also support HEAD requests for lightweight health checks
router.head('/health', (req, res) => {
  res.status(200).end();
});

module.exports = router;
