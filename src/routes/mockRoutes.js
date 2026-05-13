/**
 * Mock routes — no authentication required.
 * These endpoints exist solely for testing/development; remove in production.
 */
const express = require('express');
const router = express.Router();
const mockBinController = require('../controllers/mockBinController');

// POST /mock/bin/start  — create bin if absent, reset fill to 0, begin 5s interval
router.post('/bin/start', mockBinController.startSimulation);

// POST /mock/bin/stop   — cancel the running interval
router.post('/bin/stop', mockBinController.stopSimulation);

// GET  /mock/bin/status — current fill level + whether simulation is running
router.get('/bin/status', mockBinController.getSimulationStatus);

module.exports = router;
