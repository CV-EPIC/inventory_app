import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const result = await pool.query(`
      SELECT sku, nama_produk
      FROM produk
      ORDER BY nama_produk
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("PRODUK LIST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
