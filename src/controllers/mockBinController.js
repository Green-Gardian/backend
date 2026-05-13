const mockBinService = require('../services/mockBinService');

const startSimulation = async (req, res) => {
  try {
    const bin = await mockBinService.start();
    res.json({
      success: true,
      message: `Mock bin simulation started — fills ${mockBinService.FILL_STEP}% every ${mockBinService.TICK_MS / 1000}s`,
      data: bin,
    });
  } catch (err) {
    console.error('[MockBin] startSimulation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const stopSimulation = async (req, res) => {
  try {
    const bin = await mockBinService.stop();
    res.json({ success: true, message: 'Mock bin simulation stopped', data: bin });
  } catch (err) {
    console.error('[MockBin] stopSimulation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getSimulationStatus = async (req, res) => {
  try {
    const status = await mockBinService.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    console.error('[MockBin] getSimulationStatus error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { startSimulation, stopSimulation, getSimulationStatus };
