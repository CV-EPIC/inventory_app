import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { bulan, tahun, sku } = req.query;

    const result = await pool.query(`
      WITH params AS (
        SELECT
          make_date($2::int, $1::int, 1) AS start_date,
          (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
      )
      SELECT
        p.nama_produk,
        COALESCE(SUM(j.qty), 0) AS total
      FROM penjualan j
      JOIN produk p ON p.sku = j.sku
      WHERE j.tanggal >= (SELECT start_date FROM params)
        AND j.tanggal < (SELECT end_date FROM params)
        AND ($3::text = '' OR j.sku = $3)
      GROUP BY p.nama_produk
      ORDER BY total DESC, p.nama_produk
      LIMIT 5
    `, [bulan, tahun, sku || ""]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("TOP PRODUK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
