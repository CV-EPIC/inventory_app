import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const now = new Date();
    const bulan = Number(req.query?.bulan || now.getMonth() + 1);
    const tahun = Number(req.query?.tahun || now.getFullYear());
    const sku = req.query?.sku || "";

    const result = await pool.query(`
      WITH params AS (
        SELECT make_date($2::int, $1::int, 1) AS current_month
      ),
      month_refs AS (
        SELECT 0 AS idx, date_trunc('month', (SELECT current_month FROM params) - interval '2 month')::date AS ref_month
        UNION ALL
        SELECT 1 AS idx, date_trunc('month', (SELECT current_month FROM params) - interval '1 month')::date AS ref_month
        UNION ALL
        SELECT 2 AS idx, date_trunc('month', (SELECT current_month FROM params))::date AS ref_month
      ),
      monthly_sales AS (
        SELECT
          p.sku,
          p.nama_produk,
          mr.idx,
          COALESCE(SUM(j.qty), 0) AS qty
        FROM produk p
        CROSS JOIN month_refs mr
        LEFT JOIN penjualan j
          ON j.sku = p.sku
         AND date_trunc('month', j.tanggal)::date = mr.ref_month
        WHERE ($3::text = '' OR p.sku = $3)
        GROUP BY p.sku, p.nama_produk, mr.idx
      ),
      pivoted AS (
        SELECT
          sku,
          nama_produk,
          MAX(CASE WHEN idx = 0 THEN qty END) AS bulan_1,
          MAX(CASE WHEN idx = 1 THEN qty END) AS bulan_2,
          MAX(CASE WHEN idx = 2 THEN qty END) AS bulan_3
        FROM monthly_sales
        GROUP BY sku, nama_produk
      ),
      ema_calc AS (
        SELECT
          sku,
          nama_produk,
          COALESCE(bulan_1, 0) AS bulan_1,
          COALESCE(bulan_2, 0) AS bulan_2,
          COALESCE(bulan_3, 0) AS bulan_3,
          ROUND((
            0.5 * COALESCE(bulan_3, 0)
            + 0.25 * COALESCE(bulan_2, 0)
            + 0.25 * COALESCE(bulan_1, 0)
          )::numeric, 2) AS ema_3_bulan
        FROM pivoted
      )
      SELECT
        sku,
        nama_produk,
        bulan_1,
        bulan_2,
        bulan_3,
        ema_3_bulan,
        CEIL(ema_3_bulan * 1.10)::int AS forecast_bulan_depan
      FROM ema_calc
      ORDER BY nama_produk
    `, [bulan, tahun, sku]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("FORECAST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
