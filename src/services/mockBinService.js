/**
 * Mock Bin Simulation Service
 * Creates a test bin and fills it 5% every 5 seconds (100% in ~20 ticks / ~100s).
 * Broadcasts real-time WebSocket events so the frontend can test push notifications.
 */
const websocketService = require('./websocketService');
const { pool } = require('../config/db');

const getBinModel = () => require('../models/bin');

const MOCK_BIN_NAME = '__mock_test_bin__';
const FILL_STEP = 5;        // percent per tick
const TICK_MS = 5000;       // 5 seconds

// Thresholds that trigger a bin:alert notification
const ALERT_THRESHOLDS = [
  { level: 60,  type: 'warning',  title: 'Bin Warning',  message: 'Bin is 60% full — approaching capacity.' },
  { level: 80,  type: 'critical', title: 'Bin Critical', message: 'Bin is 80% full — collection needed soon!' },
  { level: 100, type: 'full',     title: 'Bin Full',     message: 'Bin is 100% full — immediate collection required!' },
];

// Map of binId -> { intervalHandle, societyId }
const activeSimulations = new Map();

function determineStatus(fillLevel) {
  if (fillLevel >= 100) return 'full';
  if (fillLevel >= 80)  return 'critical';
  if (fillLevel >= 60)  return 'warning';
  if (fillLevel > 0)    return 'filling';
  return 'idle';
}

async function fillTick(binId) {
  try {
    const bin = await getBinModel().getBinById(binId);
    if (!bin) {
      stopSimulation(binId);
      return;
    }

    const prevLevel  = parseFloat(bin.fill_level || 0);
    const newLevel   = Math.min(100, prevLevel + FILL_STEP);
    const newStatus  = determineStatus(newLevel);

    const updated = await getBinModel().updateBin(binId, {
      fill_level: newLevel,
      status:     newStatus,
    });

    // Persist to bin_logs
    try {
      await pool.query(
        `INSERT INTO bin_logs (bin_id, fill_level, temperature, humidity, smoke_level, recorded_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [binId, newLevel, updated.temperature, updated.humidity, updated.smoke_level]
      );
    } catch (logErr) {
      console.error('[MockBin] bin_logs insert failed:', logErr.message);
    }

    // Broadcast live bin update to all connected clients
    websocketService.sendToAll('bins:update', [updated]);
    console.log(`[MockBin] fill tick → ${newLevel}% (status: ${newStatus})`);

    // Fire threshold alerts (only when the threshold is first crossed)
    for (const threshold of ALERT_THRESHOLDS) {
      if (prevLevel < threshold.level && newLevel >= threshold.level) {
        const alertPayload = {
          binId:     updated.id,
          binName:   updated.name,
          fillLevel: newLevel,
          type:      threshold.type,
          title:     threshold.title,
          message:   threshold.message,
          timestamp: new Date().toISOString(),
        };
        websocketService.sendToAll('bin:alert', alertPayload);
        console.log(`[MockBin] alert dispatched → ${threshold.type} at ${newLevel}%`);
      }
    }

    // Auto-stop when full
    if (newLevel >= 100) {
      stopSimulation(binId);
      websocketService.sendToAll('bin:simulation:complete', {
        binId,
        message: 'Mock bin simulation complete — bin is full.',
        timestamp: new Date().toISOString(),
      });
      console.log('[MockBin] simulation complete — bin is full');
    }
  } catch (err) {
    console.error('[MockBin] fillTick error:', err);
  }
}

function stopSimulation(binId) {
  const sim = activeSimulations.get(binId);
  if (sim) {
    clearInterval(sim.intervalHandle);
    activeSimulations.delete(binId);
  }
}

/**
 * Start (or restart) the mock bin simulation.
 * Finds an existing bin named MOCK_BIN_NAME or creates one, resets fill to 0,
 * then starts a 5-second interval that adds 5% per tick.
 */
async function start() {
  const binModel = getBinModel();

  // Find or create mock bin
  const bins = await binModel.getBins();
  let mockBin = bins.find(b => b.name === MOCK_BIN_NAME);

  if (!mockBin) {
    mockBin = await binModel.createBin({
      name:    MOCK_BIN_NAME,
      address: '1 Mock Street, Test City',
      society: 'Mock Society',
      latitude:   0.0,
      longitude:  0.0,
      fill_level: 0,
      status:     'idle',
    });
    console.log(`[MockBin] created bin id=${mockBin.id}`);
  } else {
    // Reset to 0 for a fresh run
    mockBin = await binModel.updateBin(mockBin.id, { fill_level: 0, status: 'idle' });
    console.log(`[MockBin] reset existing bin id=${mockBin.id} to 0%`);
  }

  // Clear any running simulation for this bin
  stopSimulation(mockBin.id);

  // Broadcast initial state immediately
  websocketService.sendToAll('bins:update', [mockBin]);

  // Start the interval
  const handle = setInterval(() => fillTick(mockBin.id), TICK_MS);
  activeSimulations.set(mockBin.id, { intervalHandle: handle });

  console.log(`[MockBin] simulation started — filling every ${TICK_MS / 1000}s`);
  return mockBin;
}

/**
 * Stop the mock bin simulation without deleting the bin.
 */
async function stop() {
  const bins = await getBinModel().getBins();
  const mockBin = bins.find(b => b.name === MOCK_BIN_NAME);
  if (mockBin) {
    stopSimulation(mockBin.id);
  }
  console.log('[MockBin] simulation stopped manually');
  return mockBin || null;
}

/**
 * Return the current state of the mock bin + whether the simulation is running.
 */
async function getStatus() {
  const bins = await getBinModel().getBins();
  const mockBin = bins.find(b => b.name === MOCK_BIN_NAME);
  if (!mockBin) {
    return { bin: null, running: false };
  }
  return {
    bin:     mockBin,
    running: activeSimulations.has(mockBin.id),
  };
}

module.exports = { start, stop, getStatus, MOCK_BIN_NAME, FILL_STEP, TICK_MS };
