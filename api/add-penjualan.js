import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { tanggal, nama_outlet, sku, qty } = req.body;

    // VALIDASI
    if (!tanggal || !nama_outlet || !sku || !qty) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    // Cek apakah SKU ada
    const cek = await pool.query(
      "SELECT * FROM produk WHERE sku = $1",
      [sku]
    );

    if (cek.rows.length === 0) {
      return res.status(400).json({ error: "SKU tidak ditemukan" });
    }

    await pool.query(`
      INSERT INTO penjualan (tanggal, nama_outlet, sku, qty)
      VALUES ($1, $2, $3, $4)
    `, [tanggal, nama_outlet.toUpperCase().trim(), sku, qty]);

    res.status(200).json({ message: "Berhasil ditambahkan" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}