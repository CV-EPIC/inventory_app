import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const result = await pool.query("SELECT sku FROM produk LIMIT 5");

    let csv = "tanggal,nama_outlet,sku,qty\r\n";

    result.rows.forEach(row => {
      csv += `2026-01-01,TOKO_CONTOH,${row.sku},1\r\n`;
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=template_penjualan.csv");

    res.status(200).send("\uFEFF" + csv); // 🔥 BOM UTF-8 FIX
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}