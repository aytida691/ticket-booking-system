const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Idle client errors shouldn't crash the whole process
  console.error('Unexpected PG pool error', err);
});

module.exports = pool;
