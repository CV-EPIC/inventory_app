import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { bulan, tahun, sku } = req.query;

    if (!bulan || !tahun) {
      return res.status(400).json({ error: "bulan dan tahun wajib diisi" });
    }

    const result = await pool.query(`
      WITH params AS (
        SELECT
          make_date($2::int, $1::int, 1) AS start_date,
          (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
      ),
      penjualan_filter AS (
        SELECT *
        FROM penjualan
        WHERE tanggal >= (SELECT start_date FROM params)
          AND tanggal < (SELECT end_date FROM params)
          AND ($3::text = '' OR sku = $3)
      ),
      outlet_transaksi AS (
        SELECT DISTINCT nama_outlet FROM penjualan_filter
      ),
      produk_terjual AS (
        SELECT DISTINCT sku FROM penjualan_filter
      )
      SELECT
        COALESCE(SUM(pf.qty), 0) AS total_qty,
        COALESCE(SUM(pf.qty * pr.harga_jual), 0) AS total_nilai,
        COALESCE(SUM(pf.qty * pr.harga_beli), 0) AS total_modal,
        COALESCE(SUM(pf.qty * pr.harga_jual) - SUM(pf.qty * pr.harga_beli), 0) AS profit,
        (SELECT COUNT(*) FROM produk_terjual) AS produk_terjual,
        (
          SELECT COUNT(*)
          FROM produk
          WHERE ($3::text = '' OR sku = $3)
            AND sku NOT IN (SELECT sku FROM produk_terjual)
        ) AS produk_belum,
        (SELECT COUNT(*) FROM outlet_transaksi) AS outlet_transaksi,
        (
          SELECT COUNT(*)
          FROM outlet
          WHERE nama_outlet NOT IN (SELECT nama_outlet FROM outlet_transaksi)
        ) AS outlet_tidak
      FROM penjualan_filter pf
      LEFT JOIN produk pr ON pr.sku = pf.sku
    `, [bulan, tahun, sku || ""]);

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("KPI ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
