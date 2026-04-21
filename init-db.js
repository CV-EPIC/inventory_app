import pool from './services/db.js';
import fs from 'fs';

async function initDB() {
  try {
    console.log('Initializing database...');

    // Read schema file
    const schema = fs.readFileSync('./schema.sql', 'utf8');

    // Execute schema
    await pool.query(schema);

    console.log('Database initialized successfully!');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    pool.end();
  }
}

initDB();