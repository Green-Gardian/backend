/**
 * Bin Data Fetcher Service
 * Fetches real IoT data from ThingSpeak and updates bin records
 * Replaces the previous simulation-based approach
 */
const binModel = require('../models/bin');
const websocketService = require('./websocketService');
const thingspeakService = require('./thingspeakService');

let intervalHandle = null;


const POLL_INTERVAL_MS = process.env.BIN_IOT_POLL_INTERVAL_MS
  ? parseInt(process.env.BIN_IOT_POLL_INTERVAL_MS)
  : 15000;

const lastEntryIds = new Map();

function determineStatus(fillLevel) {
  if (fillLevel >= 100) return 'full';
  if (fillLevel >= 80) return 'critical';
  if (fillLevel >= 60) return 'warning';
  if (fillLevel > 0) return 'filling';
  return 'idle';
}

async function fetchBinIoTData(bin) {
  const channelId = bin.thingspeak_channel_id || process.env.THINGSPEAK_CHANNEL_ID;
  const apiKey = bin.thingspeak_api_key || process.env.THINGSPEAK_READ_API_KEY;

  if (!channelId) {
    console.log(`Bin ${bin.id}: No ThingSpeak channel configured, skipping IoT fetch`);
    return null;
  }

  try {
    const iotData = await thingspeakService.fetchLatestBinData(channelId, apiKey);

    if (!iotData) {
      console.log(`Bin ${bin.id}: No data received from ThingSpeak channel ${channelId}`);
      return null;
    }

    const lastEntryId = lastEntryIds.get(bin.id);
    if (lastEntryId && lastEntryId === iotData.entryId) {
      return null;
    }

    lastEntryIds.set(bin.id, iotData.entryId);

    console.log(`Bin ${bin.id}: Received new IoT data - Fill: ${iotData.fillLevel}%, Entry: ${iotData.entryId}`);

    return iotData;
  } catch (error) {
    console.error(`Bin ${bin.id}: Error fetching IoT data:`, error.message);
    return null;
  }
}


async function tick() {
  try {
    const bins = await binModel.getBins();
    const updates = [];

    for (const bin of bins) {
      const iotData = await fetchBinIoTData(bin);

      if (iotData && iotData.fillLevel !== null) {

        const updatesForBin = {
          fill_level: iotData.fillLevel,
          status: determineStatus(iotData.fillLevel),
          iot_last_update: iotData.timestamp,
          iot_entry_id: iotData.entryId,
        };

        if (iotData.smokeLevel !== null) {
          updatesForBin.smoke_level = iotData.smokeLevel;
        }
        if (iotData.temperature !== null) {
          updatesForBin.temperature = iotData.temperature;
        }
        if (iotData.humidity !== null) {
          updatesForBin.humidity = iotData.humidity;
        }
        if (iotData.rawFillValue !== null && iotData.rawFillValue !== undefined) {
          updatesForBin.raw_distance = iotData.rawFillValue;
        }
        // Update GPS coordinates if IoT device provides valid location
        if (iotData.latitude !== null && iotData.longitude !== null) {
          updatesForBin.latitude = iotData.latitude;
          updatesForBin.longitude = iotData.longitude;
          console.log(`Bin ${bin.id}: GPS updated to ${iotData.latitude}, ${iotData.longitude}`);
        }
        const updated = await binModel.updateBin(bin.id, updatesForBin);
        updates.push(updated);


        try {
          const assignmentService = require('./assignmentService');
          await assignmentService.checkAndCreateTask(updated, websocketService);
          await assignmentService.checkAndCompleteTask(updated, websocketService);
        } catch (taskErr) {
          console.error('Bin IoT auto-task error:', taskErr);
        }
      }
    }

    if (updates.length > 0) {
      websocketService.sendToAll('bins:update', updates);
      console.log(`IoT Poller: Updated ${updates.length} bin(s) with fresh data`);
    }
  } catch (err) {
    console.error('Bin IoT poller tick error:', err);
  }
}

function start() {
  if (intervalHandle) {
    console.log('Bin IoT poller already running');
    return;
  }

  const defaultChannel = process.env.THINGSPEAK_CHANNEL_ID;
  if (!defaultChannel) {
    console.warn('⚠️  THINGSPEAK_CHANNEL_ID not set in environment. Bin IoT polling will only work for bins with configured thingspeak_channel_id.');
  }

  tick();

  intervalHandle = setInterval(tick, POLL_INTERVAL_MS);
  console.log(`✅ Bin IoT poller started, polling every ${POLL_INTERVAL_MS / 1000}s`);
}

function stop() {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  lastEntryIds.clear();
  console.log('Bin IoT poller stopped');
}

async function pollNow() {
  await tick();
}

async function getIoTStatus() {
  const bins = await binModel.getBins();
  const statuses = [];

  for (const bin of bins) {
    const channelId = bin.thingspeak_channel_id || process.env.THINGSPEAK_CHANNEL_ID;
    const apiKey = bin.thingspeak_api_key || process.env.THINGSPEAK_READ_API_KEY;

    if (channelId) {
      const status = await thingspeakService.checkConnection(channelId, apiKey);
      statuses.push({
        binId: bin.id,
        binName: bin.name,
        ...status,
      });
    } else {
      statuses.push({
        binId: bin.id,
        binName: bin.name,
        connected: false,
        error: 'No ThingSpeak channel configured',
      });
    }
  }

  return statuses;
}

module.exports = {
  start,
  stop,
  pollNow,
  getIoTStatus,
  POLL_INTERVAL_MS,
};
