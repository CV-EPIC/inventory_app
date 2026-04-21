import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { sku, qty } = req.body;

    if (!sku || !qty) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    await pool.query(`
      INSERT INTO stok_awal (sku, qty_awal)
      VALUES ($1,$2)
    `, [sku, qty]);

    res.status(200).json({ message: "Stok awal berhasil" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}