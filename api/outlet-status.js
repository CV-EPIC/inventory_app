import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { bulan, tahun, sku } = req.query;

    const result = await pool.query(`
      WITH params AS (
        SELECT
          make_date($2::int, $1::int, 1) AS start_date,
          (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
      ),
      outlet_transaksi AS (
        SELECT DISTINCT nama_outlet
        FROM penjualan
        WHERE tanggal >= (SELECT start_date FROM params)
          AND tanggal < (SELECT end_date FROM params)
          AND ($3::text = '' OR sku = $3)
      )
      SELECT
        (SELECT COUNT(*) FROM outlet_transaksi) AS transaksi,
        (
          SELECT COUNT(*)
          FROM outlet
          WHERE nama_outlet NOT IN (SELECT nama_outlet FROM outlet_transaksi)
        ) AS tidak
    `, [bulan, tahun, sku || ""]);

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("OUTLET STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
