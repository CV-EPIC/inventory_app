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
      pembelian_month AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM pembelian
        WHERE tanggal >= (SELECT start_date FROM params)
          AND tanggal < (SELECT end_date FROM params)
        GROUP BY sku
      ),
      penjualan_month AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM penjualan
        WHERE tanggal >= (SELECT start_date FROM params)
          AND tanggal < (SELECT end_date FROM params)
        GROUP BY sku
      ),
      penyesuaian_before AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM stok_penyesuaian
        WHERE tanggal < (SELECT start_date FROM params)
        GROUP BY sku
      ),
      penyesuaian_month AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM stok_penyesuaian
        WHERE tanggal >= (SELECT start_date FROM params)
          AND tanggal < (SELECT end_date FROM params)
        GROUP BY sku
      ),
      pembelian_before AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM pembelian
        WHERE tanggal < (SELECT start_date FROM params)
        GROUP BY sku
      ),
      penjualan_before AS (
        SELECT sku, COALESCE(SUM(qty), 0) AS qty
        FROM penjualan
        WHERE tanggal < (SELECT start_date FROM params)
        GROUP BY sku
      )
      SELECT
        p.sku,
        p.nama_produk,
        (
          COALESCE(bs.total_qty_awal, 0)
          + COALESCE(pb_before.qty, 0)
          - COALESCE(pj_before.qty, 0)
          + COALESCE(adj_before.qty, 0)
        ) AS stok_awal,
        COALESCE(pb_month.qty, 0) AS pembelian,
        COALESCE(pj_month.qty, 0) AS penjualan,
        COALESCE(adj_month.qty, 0) AS penyesuaian,
        (
          COALESCE(bs.total_qty_awal, 0)
          + COALESCE(pb_before.qty, 0)
          - COALESCE(pj_before.qty, 0)
          + COALESCE(adj_before.qty, 0)
          + COALESCE(pb_month.qty, 0)
          - COALESCE(pj_month.qty, 0)
          + COALESCE(adj_month.qty, 0)
        ) AS stok_akhir
      FROM produk p
      LEFT JOIN base_stock bs ON bs.sku = p.sku
      LEFT JOIN pembelian_before pb_before ON pb_before.sku = p.sku
      LEFT JOIN penjualan_before pj_before ON pj_before.sku = p.sku
      LEFT JOIN penyesuaian_before adj_before ON adj_before.sku = p.sku
      LEFT JOIN pembelian_month pb_month ON pb_month.sku = p.sku
      LEFT JOIN penjualan_month pj_month ON pj_month.sku = p.sku
      LEFT JOIN penyesuaian_month adj_month ON adj_month.sku = p.sku
      WHERE ($3::text = '' OR p.sku = $3)
      ORDER BY p.nama_produk
    `, [bulan, tahun, sku || ""]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("PERSEDIAAN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
