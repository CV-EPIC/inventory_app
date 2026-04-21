import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { nama_outlet } = req.body;

    if (!nama_outlet) {
      return res.status(400).json({ error: "Nama outlet kosong" });
    }

    await pool.query(`
      INSERT INTO outlet (nama_outlet)
      VALUES ($1)
    `, [nama_outlet.toUpperCase()]);

    res.status(200).json({ message: "Outlet berhasil ditambah" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}