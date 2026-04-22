import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const result = await pool.query(`
      SELECT id, nama_outlet
      FROM outlet
      ORDER BY nama_outlet
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("OUTLET LIST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
