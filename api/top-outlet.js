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
        nama_outlet,
        COALESCE(SUM(qty), 0) AS total
      FROM penjualan
      WHERE tanggal >= (SELECT start_date FROM params)
        AND tanggal < (SELECT end_date FROM params)
        AND ($3::text = '' OR sku = $3)
      GROUP BY nama_outlet
      ORDER BY total DESC, nama_outlet
      LIMIT 5
    `, [bulan, tahun, sku || ""]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("TOP OUTLET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
