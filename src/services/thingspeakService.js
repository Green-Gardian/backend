/**
 * ThingSpeak IoT Data Service
 * Fetches real-time sensor data from ThingSpeak channels
 */
const axios = require('axios');

// ThingSpeak API base URL
const THINGSPEAK_API_BASE = 'https://api.thingspeak.com';

// Default configuration from environment
const DEFAULT_CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID || '';
const DEFAULT_READ_API_KEY = process.env.THINGSPEAK_READ_API_KEY || '';

// Field mapping - matches your ESP32 IoT device setup:
// field1 = fillLevel (%), field2 = temperature, field3 = humidity,
// field4 = smoke, field5 = latitude, field6 = longitude, field7 = connection type
const FIELD_MAPPING = {
    fillLevel: parseInt(process.env.THINGSPEAK_FIELD_FILL_LEVEL) || 1,    // field1 - Fill level (already %)
    temperature: parseInt(process.env.THINGSPEAK_FIELD_TEMPERATURE) || 2, // field2 - Temperature
    humidity: parseInt(process.env.THINGSPEAK_FIELD_HUMIDITY) || 3,       // field3 - Humidity
    smokeLevel: parseInt(process.env.THINGSPEAK_FIELD_SMOKE_LEVEL) || 4,  // field4 - Smoke/gas sensor (analog)
    latitude: parseInt(process.env.THINGSPEAK_FIELD_LATITUDE) || 5,       // field5 - GPS Latitude
    longitude: parseInt(process.env.THINGSPEAK_FIELD_LONGITUDE) || 6,     // field6 - GPS Longitude
};

// Whether the IoT device sends fill level as percentage directly (true) or as distance (false)
// Your ESP32 code already calculates fill %, so this should be true
const FILL_LEVEL_IS_PERCENTAGE = process.env.FILL_LEVEL_IS_PERCENTAGE !== 'false';

// Bin height in cm (only used if FILL_LEVEL_IS_PERCENTAGE is false)
const BIN_HEIGHT_CM = parseInt(process.env.BIN_HEIGHT_CM) || 100;

/**
 * Fetch the latest data from a ThingSpeak channel
 * @param {string} channelId - ThingSpeak channel ID
 * @param {string} apiKey - Read API key (optional for public channels)
 * @param {number} results - Number of results to fetch (default: 1 for latest)
 * @returns {Promise<Object>} - Latest feed data
 */
async function fetchChannelData(channelId = DEFAULT_CHANNEL_ID, apiKey = DEFAULT_READ_API_KEY, results = 1) {
    if (!channelId) {
        console.warn('ThingSpeak: No channel ID configured');
        return null;
    }

    try {
        const url = `${THINGSPEAK_API_BASE}/channels/${channelId}/feeds.json`;
        const params = {
            results,
        };

        if (apiKey) {
            params.api_key = apiKey;
        }

        const response = await axios.get(url, { params, timeout: 10000 });

        if (response.data && response.data.feeds && response.data.feeds.length > 0) {
            return {
                channel: response.data.channel,
                feeds: response.data.feeds,
                latestFeed: response.data.feeds[response.data.feeds.length - 1],
            };
        }

        return null;
    } catch (error) {
        console.error(`ThingSpeak fetch error for channel ${channelId}:`, error.message);
        return null;
    }
}

/**
 * Parse ThingSpeak feed data into bin sensor values
 * @param {Object} feed - ThingSpeak feed entry
 * @returns {Object} - Parsed sensor data for bin
 */
function parseFeedToBinData(feed) {
    if (!feed) return null;

    // Parse fill level
    let fillLevel = null;
    const fillValue = parseFloat(feed[`field${FIELD_MAPPING.fillLevel}`]);

    if (!isNaN(fillValue)) {
        if (FILL_LEVEL_IS_PERCENTAGE) {
            // IoT device already sends fill level as percentage (0-100)
            fillLevel = Math.max(0, Math.min(100, fillValue));
        } else {
            // Convert distance to fill percentage
            // If sensor measures distance from top to trash, less distance = more full
            fillLevel = Math.max(0, Math.min(100, ((BIN_HEIGHT_CM - fillValue) / BIN_HEIGHT_CM) * 100));
        }
    }

    // Parse temperature (field2 in your ESP32 code)
    let temperature = null;
    const tempValue = parseFloat(feed[`field${FIELD_MAPPING.temperature}`]);
    if (!isNaN(tempValue)) {
        temperature = tempValue;
    }

    // Parse humidity (field3 in your ESP32 code)
    let humidity = null;
    const humidValue = parseFloat(feed[`field${FIELD_MAPPING.humidity}`]);
    if (!isNaN(humidValue)) {
        humidity = humidValue;
    }

    // Parse smoke level (field4 in your ESP32 code - analog value)
    let smokeLevel = null;
    const smokeValue = parseFloat(feed[`field${FIELD_MAPPING.smokeLevel}`]);
    if (!isNaN(smokeValue)) {
        smokeLevel = smokeValue;
    }

    // Parse GPS coordinates (field5 and field6 in your ESP32 code)
    let latitude = null;
    let longitude = null;
    const latValue = parseFloat(feed[`field${FIELD_MAPPING.latitude}`]);
    const lonValue = parseFloat(feed[`field${FIELD_MAPPING.longitude}`]);
    if (!isNaN(latValue) && latValue !== 0) {
        latitude = latValue;
    }
    if (!isNaN(lonValue) && lonValue !== 0) {
        longitude = lonValue;
    }

    return {
        fillLevel: fillLevel !== null ? parseFloat(fillLevel.toFixed(2)) : null,
        temperature,
        humidity,
        smokeLevel,
        latitude,
        longitude,
        rawFillValue: fillValue, // Store original value for debugging
        timestamp: feed.created_at,
        entryId: feed.entry_id,
    };
}

/**
 * Fetch and parse the latest bin data from ThingSpeak
 * @param {string} channelId - ThingSpeak channel ID
 * @param {string} apiKey - Read API key
 * @returns {Promise<Object|null>} - Parsed bin sensor data
 */
async function fetchLatestBinData(channelId, apiKey) {
    const data = await fetchChannelData(channelId, apiKey, 1);

    if (data && data.latestFeed) {
        const parsed = parseFeedToBinData(data.latestFeed);
        if (parsed) {
            parsed.channelName = data.channel?.name;
            parsed.channelDescription = data.channel?.description;
            parsed.lastUpdate = data.channel?.updated_at;
        }
        return parsed;
    }

    return null;
}

/**
 * Fetch historical data for a bin from ThingSpeak
 * @param {string} channelId - ThingSpeak channel ID
 * @param {string} apiKey - Read API key
 * @param {number} results - Number of historical entries (max 8000)
 * @returns {Promise<Array>} - Array of parsed sensor data
 */
async function fetchHistoricalData(channelId, apiKey, results = 100) {
    const data = await fetchChannelData(channelId, apiKey, results);

    if (data && data.feeds) {
        return data.feeds.map(feed => parseFeedToBinData(feed)).filter(Boolean);
    }

    return [];
}

/**
 * Check if ThingSpeak connection is working
 * @param {string} channelId - ThingSpeak channel ID
 * @param {string} apiKey - Read API key
 * @returns {Promise<Object>} - Connection status
 */
async function checkConnection(channelId = DEFAULT_CHANNEL_ID, apiKey = DEFAULT_READ_API_KEY) {
    try {
        const data = await fetchChannelData(channelId, apiKey, 1);

        if (data && data.channel) {
            return {
                connected: true,
                channelId,
                channelName: data.channel.name,
                lastEntryId: data.latestFeed?.entry_id,
                lastUpdate: data.latestFeed?.created_at,
            };
        }

        return {
            connected: false,
            error: 'No data received from ThingSpeak',
        };
    } catch (error) {
        return {
            connected: false,
            error: error.message,
        };
    }
}

module.exports = {
    fetchChannelData,
    parseFeedToBinData,
    fetchLatestBinData,
    fetchHistoricalData,
    checkConnection,
    FIELD_MAPPING,
    BIN_HEIGHT_CM,
    FILL_LEVEL_IS_PERCENTAGE,
};
