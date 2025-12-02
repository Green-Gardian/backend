const { pool } = require('../config/db');

const createBin = async (bin) => {
  const {
    name,
    address,
    society,
    latitude = 0.0,
    longitude = 0.0,
    fill_level = 0.0,
    temperature = null,
    humidity = null,
    smoke_level = 0,
    distances = { d1: 'FAILED', d2: 'FAILED', d3: 'FAILED', d4: 'FAILED' },
    valid_sensors = 0,
    avg_distance = 'N/A',
    status = 'idle',
  } = bin;

  const res = await pool.query(
    `INSERT INTO bins (name, address, society, latitude, longitude, fill_level, temperature, humidity, smoke_level, distances, valid_sensors, avg_distance, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), now()) RETURNING *`,
    [
      name,
      address,
      society,
      latitude,
      longitude,
      fill_level,
      temperature,
      humidity,
      smoke_level,
      JSON.stringify(distances),
      valid_sensors,
      avg_distance,
      status,
    ]
  );

  return res.rows[0];
};

const getBins = async () => {
  const res = await pool.query(`SELECT * FROM bins ORDER BY id ASC`);
  return res.rows;
};

const getBinById = async (id) => {
  const res = await pool.query(`SELECT * FROM bins WHERE id = $1`, [id]);
  return res.rows[0];
};

const updateBin = async (id, updates) => {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of Object.keys(updates)) {
    fields.push(`${key} = $${idx}`);
    if (key === 'distances') values.push(JSON.stringify(updates[key]));
    else values.push(updates[key]);
    idx++;
  }

  if (fields.length === 0) return getBinById(id);

  values.push(id);
  const q = `UPDATE bins SET ${fields.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
  const res = await pool.query(q, values);
  return res.rows[0];
};

const deleteBin = async (id) => {
  await pool.query(`DELETE FROM bins WHERE id = $1`, [id]);
  return true;
};

module.exports = {
  createBin,
  getBins,
  getBinById,
  updateBin,
  deleteBin,
};
