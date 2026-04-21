import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { bulan, tahun, sku } = req.query;

    if (!bulan || !tahun) {
      return res.status(400).json({ error: "bulan & tahun wajib" });
    }

    const result = await pool.query(`
      WITH params AS (
        SELECT
          make_date($2::int, $1::int, 1) AS start_date,
          (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
      ),
      base_stock AS (
        SELECT sku, COALESCE(SUM(qty_awal), 0) AS total_qty_awal
        FROM stok_awal
        GROUP BY sku
      ),
      pembelian_upto AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM pembelian
        WHERE tanggal < (SELECT end_date FROM params)
        GROUP BY sku
      ),
      penjualan_upto AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM penjualan
        WHERE tanggal < (SELECT end_date FROM params)
        GROUP BY sku
      ),
      penyesuaian_upto AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM stok_penyesuaian
        WHERE tanggal < (SELECT end_date FROM params)
        GROUP BY sku
      )
      SELECT
        p.sku,
        p.nama_produk,
        (
          COALESCE(bs.total_qty_awal, 0)
          + COALESCE(pb.qty, 0)
          - COALESCE(pj.qty, 0)
          + COALESCE(adj.qty, 0)
        ) AS stok
      FROM produk p
      LEFT JOIN base_stock bs ON bs.sku = p.sku
      LEFT JOIN pembelian_upto pb ON pb.sku = p.sku
      LEFT JOIN penjualan_upto pj ON pj.sku = p.sku
      LEFT JOIN penyesuaian_upto adj ON adj.sku = p.sku
      WHERE ($3::text = '' OR p.sku = $3)
      ORDER BY p.nama_produk
    `, [bulan, tahun, sku || ""]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("ERROR STOK:", err);
    res.status(500).json({ error: err.message });
  }
}
