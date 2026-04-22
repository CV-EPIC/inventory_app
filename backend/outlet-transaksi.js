import pool from "../services/db.js";

async function getTableAvailability() {
  const result = await pool.query(`
    SELECT
      to_regclass('public.outlet_stok_awal') IS NOT NULL AS has_outlet_stok_awal,
      to_regclass('public.outlet_stok_masuk') IS NOT NULL AS has_outlet_stok_masuk,
      to_regclass('public.outlet_penjualan') IS NOT NULL AS has_outlet_penjualan,
      to_regclass('public.outlet_stok_penyesuaian') IS NOT NULL AS has_outlet_stok_penyesuaian
  `);

  return result.rows[0];
}

export default async function handler(req, res) {
  try {
    const { bulan, tahun, sku, status, outlet } = req.query;
    const availability = await getTableAvailability();
    const dbReady = Boolean(
      availability?.has_outlet_stok_awal
      && availability?.has_outlet_stok_masuk
      && availability?.has_outlet_penjualan
      && availability?.has_outlet_stok_penyesuaian
    );

    if (dbReady) {
      const summaryResult = await pool.query(`
        WITH params AS (
          SELECT
            make_date($2::int, $1::int, 1) AS start_date,
            (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
        ),
        warehouse_sales_month AS (
          SELECT nama_outlet, COALESCE(SUM(qty), 0) AS qty_transaksi
          FROM penjualan
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
          GROUP BY nama_outlet
        ),
        opening AS (
          SELECT outlet_id, COALESCE(SUM(qty_awal), 0) AS opening_stok
          FROM outlet_stok_awal
          WHERE periode = (SELECT start_date FROM params)
            AND ($3::text = '' OR sku = $3)
          GROUP BY outlet_id
        ),
        masuk AS (
          SELECT outlet_id, COALESCE(SUM(qty), 0) AS stok_masuk
          FROM outlet_stok_masuk
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
          GROUP BY outlet_id
        ),
        keluar AS (
          SELECT outlet_id, COALESCE(SUM(qty), 0) AS stok_keluar
          FROM outlet_penjualan
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
          GROUP BY outlet_id
        ),
        adjust AS (
          SELECT outlet_id, COALESCE(SUM(qty), 0) AS penyesuaian
          FROM outlet_stok_penyesuaian
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
          GROUP BY outlet_id
        ),
        merged AS (
          SELECT
            o.id AS outlet_id,
            o.nama_outlet,
            COALESCE(ws.qty_transaksi, 0) AS qty_transaksi,
            COALESCE(op.opening_stok, 0) + COALESCE(ms.stok_masuk, 0) - COALESCE(kl.stok_keluar, 0) + COALESCE(ad.penyesuaian, 0) AS stok_akhir
          FROM outlet o
          LEFT JOIN warehouse_sales_month ws ON ws.nama_outlet = o.nama_outlet
          LEFT JOIN opening op ON op.outlet_id = o.id
          LEFT JOIN masuk ms ON ms.outlet_id = o.id
          LEFT JOIN keluar kl ON kl.outlet_id = o.id
          LEFT JOIN adjust ad ON ad.outlet_id = o.id
        )
        SELECT
          outlet_id,
          nama_outlet,
          qty_transaksi,
          stok_akhir,
          CASE WHEN qty_transaksi > 0 THEN 'sudah' ELSE 'belum' END AS status_transaksi,
          CASE
            WHEN qty_transaksi > 0 THEN 'Outlet sudah melakukan transaksi pada periode ini.'
            WHEN stok_akhir <= 0 THEN 'Belum transaksi karena stok outlet habis atau minus.'
            ELSE 'Belum transaksi meski stok masih tersedia, perlu follow up outlet.'
          END AS catatan
        FROM merged
        WHERE ($4::text = '' OR CASE WHEN qty_transaksi > 0 THEN 'sudah' ELSE 'belum' END = $4)
        ORDER BY
          CASE WHEN qty_transaksi > 0 THEN 0 ELSE 1 END,
          nama_outlet
      `, [bulan, tahun, sku || "", status || ""]);

      const totalsResult = await pool.query(`
        WITH params AS (
          SELECT
            make_date($2::int, $1::int, 1) AS start_date,
            (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
        ),
        warehouse_sales_month AS (
          SELECT DISTINCT nama_outlet
          FROM penjualan
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
        )
        SELECT
          (SELECT COUNT(*) FROM warehouse_sales_month) AS sudah,
          (
            SELECT COUNT(*)
            FROM outlet
            WHERE nama_outlet NOT IN (SELECT nama_outlet FROM warehouse_sales_month)
          ) AS belum
      `, [bulan, tahun, sku || ""]);

      let detail = [];
      let selectedOutlet = outlet || summaryResult.rows[0]?.nama_outlet || "";
      if (selectedOutlet && !summaryResult.rows.some(item => item.nama_outlet === selectedOutlet)) {
        selectedOutlet = summaryResult.rows[0]?.nama_outlet || "";
      }

      if (selectedOutlet) {
        const detailResult = await pool.query(`
          WITH params AS (
            SELECT
              make_date($2::int, $1::int, 1) AS start_date,
              (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
          ),
          target_outlet AS (
            SELECT id, nama_outlet
            FROM outlet
            WHERE nama_outlet = $4
            LIMIT 1
          ),
          opening AS (
            SELECT sku, COALESCE(SUM(qty_awal), 0) AS opening_stok
            FROM outlet_stok_awal
            WHERE outlet_id = (SELECT id FROM target_outlet)
              AND periode = (SELECT start_date FROM params)
              AND ($3::text = '' OR sku = $3)
            GROUP BY sku
          ),
          masuk AS (
            SELECT sku, COALESCE(SUM(qty), 0) AS stok_masuk
            FROM outlet_stok_masuk
            WHERE outlet_id = (SELECT id FROM target_outlet)
              AND tanggal >= (SELECT start_date FROM params)
              AND tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR sku = $3)
            GROUP BY sku
          ),
          keluar AS (
            SELECT sku, COALESCE(SUM(qty), 0) AS stok_keluar
            FROM outlet_penjualan
            WHERE outlet_id = (SELECT id FROM target_outlet)
              AND tanggal >= (SELECT start_date FROM params)
              AND tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR sku = $3)
            GROUP BY sku
          ),
          adjust AS (
            SELECT sku, COALESCE(SUM(qty), 0) AS penyesuaian
            FROM outlet_stok_penyesuaian
            WHERE outlet_id = (SELECT id FROM target_outlet)
              AND tanggal >= (SELECT start_date FROM params)
              AND tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR sku = $3)
            GROUP BY sku
          ),
          keys AS (
            SELECT sku FROM opening
            UNION
            SELECT sku FROM masuk
            UNION
            SELECT sku FROM keluar
            UNION
            SELECT sku FROM adjust
          )
          SELECT
            p.sku,
            p.nama_produk,
            COALESCE(op.opening_stok, 0) AS opening_stok,
            COALESCE(ms.stok_masuk, 0) AS stok_masuk,
            COALESCE(kl.stok_keluar, 0) AS stok_keluar,
            COALESCE(ad.penyesuaian, 0) AS penyesuaian,
            COALESCE(op.opening_stok, 0) + COALESCE(ms.stok_masuk, 0) - COALESCE(kl.stok_keluar, 0) + COALESCE(ad.penyesuaian, 0) AS stok_akhir
          FROM keys k
          JOIN produk p ON p.sku = k.sku
          LEFT JOIN opening op ON op.sku = k.sku
          LEFT JOIN masuk ms ON ms.sku = k.sku
          LEFT JOIN keluar kl ON kl.sku = k.sku
          LEFT JOIN adjust ad ON ad.sku = k.sku
          ORDER BY p.nama_produk
        `, [bulan, tahun, sku || "", selectedOutlet]);

        detail = detailResult.rows;
      }

      return res.status(200).json({
        db_ready: true,
        outlets: summaryResult.rows,
        totals: totalsResult.rows[0],
        selected_outlet: selectedOutlet,
        detail
      });
    }

    const summaryResult = await pool.query(`
      WITH params AS (
        SELECT
          make_date($2::int, $1::int, 1) AS start_date,
          (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
      ),
      sales_month AS (
        SELECT nama_outlet, COALESCE(SUM(qty), 0) AS qty_transaksi
        FROM penjualan
        WHERE tanggal >= (SELECT start_date FROM params)
          AND tanggal < (SELECT end_date FROM params)
          AND ($3::text = '' OR sku = $3)
        GROUP BY nama_outlet
      ),
      transfer_upto AS (
        SELECT nama_outlet, COALESCE(SUM(qty), 0) AS stok_akhir
        FROM penjualan
        WHERE tanggal < (SELECT end_date FROM params)
          AND ($3::text = '' OR sku = $3)
        GROUP BY nama_outlet
      )
      SELECT
        o.id AS outlet_id,
        o.nama_outlet,
        COALESCE(sm.qty_transaksi, 0) AS qty_transaksi,
        COALESCE(tf.stok_akhir, 0) AS stok_akhir,
        CASE WHEN COALESCE(sm.qty_transaksi, 0) > 0 THEN 'sudah' ELSE 'belum' END AS status_transaksi,
        CASE
          WHEN COALESCE(sm.qty_transaksi, 0) > 0 THEN 'Outlet sudah melakukan transaksi pada periode ini.'
          WHEN COALESCE(tf.stok_akhir, 0) <= 0 THEN 'Belum transaksi dan stok outlet terindikasi habis berdasarkan transfer warehouse.'
          ELSE 'Belum transaksi, namun data penjualan outlet belum tersedia sehingga perlu konfirmasi manual.'
        END AS catatan
      FROM outlet o
      LEFT JOIN sales_month sm ON sm.nama_outlet = o.nama_outlet
      LEFT JOIN transfer_upto tf ON tf.nama_outlet = o.nama_outlet
      WHERE ($4::text = '' OR CASE WHEN COALESCE(sm.qty_transaksi, 0) > 0 THEN 'sudah' ELSE 'belum' END = $4)
      ORDER BY CASE WHEN COALESCE(sm.qty_transaksi, 0) > 0 THEN 0 ELSE 1 END, o.nama_outlet
    `, [bulan, tahun, sku || "", status || ""]);

    const totalsResult = await pool.query(`
      WITH params AS (
        SELECT
          make_date($2::int, $1::int, 1) AS start_date,
          (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
      ),
      sales_month AS (
        SELECT DISTINCT nama_outlet
        FROM penjualan
        WHERE tanggal >= (SELECT start_date FROM params)
          AND tanggal < (SELECT end_date FROM params)
          AND ($3::text = '' OR sku = $3)
      )
      SELECT
        (SELECT COUNT(*) FROM sales_month) AS sudah,
        (
          SELECT COUNT(*)
          FROM outlet
          WHERE nama_outlet NOT IN (SELECT nama_outlet FROM sales_month)
        ) AS belum
    `, [bulan, tahun, sku || ""]);

    let detail = [];
    let selectedOutlet = outlet || summaryResult.rows[0]?.nama_outlet || "";
    if (selectedOutlet && !summaryResult.rows.some(item => item.nama_outlet === selectedOutlet)) {
      selectedOutlet = summaryResult.rows[0]?.nama_outlet || "";
    }
    if (selectedOutlet) {
      const detailResult = await pool.query(`
        WITH params AS (
          SELECT
            make_date($2::int, $1::int, 1) AS start_date,
            (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
        ),
        transfer_upto AS (
          SELECT sku, COALESCE(SUM(qty), 0) AS stok_akhir
          FROM penjualan
          WHERE nama_outlet = $4
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
          GROUP BY sku
        ),
        transfer_month AS (
          SELECT sku, COALESCE(SUM(qty), 0) AS stok_masuk
          FROM penjualan
          WHERE nama_outlet = $4
            AND tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
          GROUP BY sku
        )
        SELECT
          p.sku,
          p.nama_produk,
          0 AS opening_stok,
          COALESCE(tm.stok_masuk, 0) AS stok_masuk,
          0 AS stok_keluar,
          0 AS penyesuaian,
          COALESCE(tu.stok_akhir, 0) AS stok_akhir
        FROM transfer_upto tu
        JOIN produk p ON p.sku = tu.sku
        LEFT JOIN transfer_month tm ON tm.sku = tu.sku
        ORDER BY p.nama_produk
      `, [bulan, tahun, sku || "", selectedOutlet]);

      detail = detailResult.rows;
    }

    return res.status(200).json({
      db_ready: false,
      outlets: summaryResult.rows,
      totals: totalsResult.rows[0],
      selected_outlet: selectedOutlet,
      detail
    });
  } catch (err) {
    console.error("OUTLET TRANSAKSI ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
