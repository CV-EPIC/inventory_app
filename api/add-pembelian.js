import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { tanggal, sku, qty } = req.body;

    if (!tanggal || !sku || !qty) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    await pool.query(`
      INSERT INTO pembelian (tanggal, sku, qty)
      VALUES ($1,$2,$3)
    `, [tanggal, sku, qty]);

    res.status(200).json({ message: "Pembelian berhasil" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}