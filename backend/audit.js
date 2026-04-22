import pool from "../services/db.js";

async function getTableAvailability() {
  const result = await pool.query(`
    SELECT
      to_regclass('public.outlet_stok_awal') IS NOT NULL AS has_outlet_stok_awal,
      to_regclass('public.outlet_stok_masuk') IS NOT NULL AS has_outlet_stok_masuk,
      to_regclass('public.outlet_penjualan') IS NOT NULL AS has_outlet_penjualan,
      to_regclass('public.outlet_stok_penyesuaian') IS NOT NULL AS has_outlet_stok_penyesuaian,
      to_regclass('public.outlet_stok_opname') IS NOT NULL AS has_outlet_stok_opname
  `);

  return result.rows[0];
}

export default async function handler(req, res) {
  try {
    const { bulan, tahun, sku, outlet } = req.query;
    const availability = await getTableAvailability();
    const dbReady = Boolean(
      availability?.has_outlet_stok_awal
      && availability?.has_outlet_stok_masuk
      && availability?.has_outlet_penjualan
      && availability?.has_outlet_stok_penyesuaian
    );

    if (dbReady) {
      const [summaryResult, outletResult, movementResult, flagResult] = await Promise.all([
        pool.query(`
          WITH params AS (
            SELECT
              make_date($2::int, $1::int, 1) AS start_date,
              (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
          ),
          movement_union AS (
            SELECT tanggal, qty, 'warehouse_transfer' AS jenis
            FROM outlet_stok_masuk
            WHERE tanggal >= (SELECT start_date FROM params)
              AND tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR sku = $3)
              AND ($4::text = '' OR outlet_id IN (SELECT id FROM outlet WHERE nama_outlet = $4))
            UNION ALL
            SELECT tanggal, qty, 'outlet_sales' AS jenis
            FROM outlet_penjualan
            WHERE tanggal >= (SELECT start_date FROM params)
              AND tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR sku = $3)
              AND ($4::text = '' OR outlet_id IN (SELECT id FROM outlet WHERE nama_outlet = $4))
            UNION ALL
            SELECT tanggal, ABS(qty) AS qty, 'adjustment' AS jenis
            FROM outlet_stok_penyesuaian
            WHERE tanggal >= (SELECT start_date FROM params)
              AND tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR sku = $3)
              AND ($4::text = '' OR outlet_id IN (SELECT id FROM outlet WHERE nama_outlet = $4))
          )
          SELECT
            COUNT(*) AS total_mutasi,
            COALESCE(SUM(CASE WHEN jenis = 'warehouse_transfer' THEN qty ELSE 0 END), 0) AS stok_masuk_outlet,
            COALESCE(SUM(CASE WHEN jenis = 'outlet_sales' THEN qty ELSE 0 END), 0) AS penjualan_outlet,
            COALESCE(SUM(qty), 0) AS qty_bergerak,
            (
              SELECT COUNT(DISTINCT outlet_id)
              FROM (
                SELECT outlet_id FROM outlet_stok_masuk
                WHERE tanggal >= (SELECT start_date FROM params)
                  AND tanggal < (SELECT end_date FROM params)
                  AND ($4::text = '' OR outlet_id IN (SELECT id FROM outlet WHERE nama_outlet = $4))
                UNION
                SELECT outlet_id FROM outlet_penjualan
                WHERE tanggal >= (SELECT start_date FROM params)
                  AND tanggal < (SELECT end_date FROM params)
                  AND ($4::text = '' OR outlet_id IN (SELECT id FROM outlet WHERE nama_outlet = $4))
              ) outlets
            ) AS total_outlet
          FROM movement_union
        `, [bulan, tahun, sku || "", outlet || ""]),
        pool.query(`
          WITH params AS (
            SELECT make_date($2::int, $1::int, 1) AS start_date
          ),
          outlet_opening AS (
            SELECT outlet_id, sku, COALESCE(SUM(qty_awal), 0) AS qty
            FROM outlet_stok_awal
            WHERE periode = (SELECT start_date FROM params)
            GROUP BY outlet_id, sku
          ),
          stok_masuk AS (
            SELECT outlet_id, sku, COALESCE(SUM(qty), 0) AS qty
            FROM outlet_stok_masuk
            WHERE tanggal >= (SELECT start_date FROM params)
              AND tanggal < ((SELECT start_date FROM params) + interval '1 month')
            GROUP BY outlet_id, sku
          ),
          stok_keluar AS (
            SELECT outlet_id, sku, COALESCE(SUM(qty), 0) AS qty
            FROM outlet_penjualan
            WHERE tanggal >= (SELECT start_date FROM params)
              AND tanggal < ((SELECT start_date FROM params) + interval '1 month')
            GROUP BY outlet_id, sku
          ),
          penyesuaian AS (
            SELECT outlet_id, sku, COALESCE(SUM(qty), 0) AS qty
            FROM outlet_stok_penyesuaian
            WHERE tanggal >= (SELECT start_date FROM params)
              AND tanggal < ((SELECT start_date FROM params) + interval '1 month')
            GROUP BY outlet_id, sku
          ),
          keys AS (
            SELECT outlet_id, sku FROM outlet_opening
            UNION
            SELECT outlet_id, sku FROM stok_masuk
            UNION
            SELECT outlet_id, sku FROM stok_keluar
            UNION
            SELECT outlet_id, sku FROM penyesuaian
          )
          SELECT
            o.nama_outlet,
            p.sku,
            p.nama_produk,
            COALESCE(op.qty, 0) AS opening_stok,
            COALESCE(msk.qty, 0) AS stok_masuk,
            COALESCE(klr.qty, 0) AS stok_keluar,
            COALESCE(adj.qty, 0) AS penyesuaian,
            COALESCE(op.qty, 0) + COALESCE(msk.qty, 0) - COALESCE(klr.qty, 0) + COALESCE(adj.qty, 0) AS stok_akhir
          FROM keys k
          JOIN outlet o ON o.id = k.outlet_id
          JOIN produk p ON p.sku = k.sku
          LEFT JOIN outlet_opening op ON op.outlet_id = k.outlet_id AND op.sku = k.sku
          LEFT JOIN stok_masuk msk ON msk.outlet_id = k.outlet_id AND msk.sku = k.sku
          LEFT JOIN stok_keluar klr ON klr.outlet_id = k.outlet_id AND klr.sku = k.sku
          LEFT JOIN penyesuaian adj ON adj.outlet_id = k.outlet_id AND adj.sku = k.sku
          WHERE ($3::text = '' OR p.sku = $3)
            AND ($4::text = '' OR o.nama_outlet = $4)
          ORDER BY o.nama_outlet, p.nama_produk
        `, [bulan, tahun, sku || "", outlet || ""]),
        pool.query(`
          WITH params AS (
            SELECT
              make_date($2::int, $1::int, 1) AS start_date,
              (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
          )
          SELECT *
          FROM (
            SELECT
              m.tanggal,
              'Warehouse' AS sumber,
              'Stok Masuk Outlet' AS jenis,
              o.nama_outlet,
              m.sku,
              m.qty,
              COALESCE(m.ref_penjualan_id::text, '-') AS referensi,
              COALESCE(m.keterangan, '-') AS keterangan
            FROM outlet_stok_masuk m
            JOIN outlet o ON o.id = m.outlet_id
            WHERE m.tanggal >= (SELECT start_date FROM params)
              AND m.tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR m.sku = $3)
              AND ($4::text = '' OR o.nama_outlet = $4)

            UNION ALL

            SELECT
              s.tanggal,
              'Outlet' AS sumber,
              'Penjualan Outlet' AS jenis,
              o.nama_outlet,
              s.sku,
              s.qty,
              '-' AS referensi,
              COALESCE(s.keterangan, '-') AS keterangan
            FROM outlet_penjualan s
            JOIN outlet o ON o.id = s.outlet_id
            WHERE s.tanggal >= (SELECT start_date FROM params)
              AND s.tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR s.sku = $3)
              AND ($4::text = '' OR o.nama_outlet = $4)

            UNION ALL

            SELECT
              a.tanggal,
              'Audit' AS sumber,
              'Penyesuaian' AS jenis,
              o.nama_outlet,
              a.sku,
              a.qty,
              '-' AS referensi,
              COALESCE(a.alasan, '-') AS keterangan
            FROM outlet_stok_penyesuaian a
            JOIN outlet o ON o.id = a.outlet_id
            WHERE a.tanggal >= (SELECT start_date FROM params)
              AND a.tanggal < (SELECT end_date FROM params)
              AND ($3::text = '' OR a.sku = $3)
              AND ($4::text = '' OR o.nama_outlet = $4)
          ) movement_log
          ORDER BY tanggal DESC, nama_outlet
          LIMIT 300
        `, [bulan, tahun, sku || "", outlet || ""]),
        pool.query(`
          WITH params AS (
            SELECT make_date($2::int, $1::int, 1) AS start_date
          ),
          stock_data AS (
            SELECT
              o.nama_outlet,
              p.sku,
              p.nama_produk,
              COALESCE(op.qty_awal, 0) AS opening_stok,
              COALESCE(ms.qty, 0) AS stok_masuk,
              COALESCE(ks.qty, 0) AS stok_keluar,
              COALESCE(ad.qty, 0) AS penyesuaian,
              COALESCE(op.qty_awal, 0) + COALESCE(ms.qty, 0) - COALESCE(ks.qty, 0) + COALESCE(ad.qty, 0) AS stok_akhir
            FROM outlet o
            CROSS JOIN produk p
            LEFT JOIN (
              SELECT outlet_id, sku, SUM(qty_awal) AS qty_awal
              FROM outlet_stok_awal
              WHERE periode = (SELECT start_date FROM params)
              GROUP BY outlet_id, sku
            ) op ON op.outlet_id = o.id AND op.sku = p.sku
            LEFT JOIN (
              SELECT outlet_id, sku, SUM(qty) AS qty
              FROM outlet_stok_masuk
              WHERE tanggal >= (SELECT start_date FROM params)
                AND tanggal < ((SELECT start_date FROM params) + interval '1 month')
              GROUP BY outlet_id, sku
            ) ms ON ms.outlet_id = o.id AND ms.sku = p.sku
            LEFT JOIN (
              SELECT outlet_id, sku, SUM(qty) AS qty
              FROM outlet_penjualan
              WHERE tanggal >= (SELECT start_date FROM params)
                AND tanggal < ((SELECT start_date FROM params) + interval '1 month')
              GROUP BY outlet_id, sku
            ) ks ON ks.outlet_id = o.id AND ks.sku = p.sku
            LEFT JOIN (
              SELECT outlet_id, sku, SUM(qty) AS qty
              FROM outlet_stok_penyesuaian
              WHERE tanggal >= (SELECT start_date FROM params)
                AND tanggal < ((SELECT start_date FROM params) + interval '1 month')
              GROUP BY outlet_id, sku
            ) ad ON ad.outlet_id = o.id AND ad.sku = p.sku
            WHERE ($3::text = '' OR p.sku = $3)
              AND ($4::text = '' OR o.nama_outlet = $4)
          )
          SELECT nama_outlet, sku,
            CASE
              WHEN stok_akhir < 0 THEN 'STOK_MINUS'
              WHEN stok_keluar = 0 AND stok_masuk > 0 THEN 'TIDAK_ADA_PENJUALAN_OUTLET'
              WHEN ABS(penyesuaian) > GREATEST(stok_masuk * 0.25, 10) THEN 'PENYESUAIAN_TIDAK_WAJAR'
            END AS flag,
            CASE
              WHEN stok_akhir < 0 THEN 'Stok akhir outlet minus. Periksa penjualan outlet, input transfer, atau indikasi selisih.'
              WHEN stok_keluar = 0 AND stok_masuk > 0 THEN 'Outlet menerima stok tetapi belum ada penjualan outlet tercatat pada periode yang sama.'
              WHEN ABS(penyesuaian) > GREATEST(stok_masuk * 0.25, 10) THEN 'Nilai penyesuaian melebihi ambang audit bulanan.'
            END AS detail
          FROM stock_data
          WHERE (stok_akhir < 0 OR (stok_keluar = 0 AND stok_masuk > 0) OR ABS(penyesuaian) > GREATEST(stok_masuk * 0.25, 10))
          ORDER BY nama_outlet, sku
        `, [bulan, tahun, sku || "", outlet || ""])
      ]);

      return res.status(200).json({
        db_ready: true,
        summary: summaryResult.rows[0] || {},
        outlet_summary: outletResult.rows,
        movements: movementResult.rows,
        flags: flagResult.rows,
        notes: [
          "Gunakan outlet_stok_masuk untuk setiap transfer warehouse ke outlet.",
          "Gunakan outlet_penjualan untuk penjualan outlet agar stok keluar outlet tidak tercampur dengan penjualan warehouse.",
          "Gunakan outlet_stok_penyesuaian untuk selisih audit, retur, atau koreksi stok outlet.",
          "Isi outlet_stok_awal per outlet, SKU, dan periode agar opening stock audit bulanan konsisten."
        ]
      });
    }

    const [summaryResult, outletResult, movementResult] = await Promise.all([
      pool.query(`
        WITH params AS (
          SELECT
            make_date($2::int, $1::int, 1) AS start_date,
            (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
        ),
        movement_union AS (
          SELECT tanggal, qty, 'warehouse_transfer' AS jenis
          FROM penjualan
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
            AND ($4::text = '' OR nama_outlet = $4)
          UNION ALL
          SELECT tanggal, qty, 'warehouse_purchase' AS jenis
          FROM pembelian
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
            AND $4::text = ''
        )
        SELECT
          COUNT(*) AS total_mutasi,
          COALESCE(SUM(CASE WHEN jenis = 'warehouse_transfer' THEN qty ELSE 0 END), 0) AS stok_masuk_outlet,
          0 AS penjualan_outlet,
          COALESCE(SUM(qty), 0) AS qty_bergerak,
          (SELECT COUNT(DISTINCT nama_outlet) FROM penjualan
            WHERE tanggal >= (SELECT start_date FROM params)
              AND tanggal < (SELECT end_date FROM params)
              AND ($4::text = '' OR nama_outlet = $4)
          ) AS total_outlet
        FROM movement_union
      `, [bulan, tahun, sku || "", outlet || ""]),
      pool.query(`
        WITH params AS (
          SELECT
            make_date($2::int, $1::int, 1) AS start_date,
            (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
        ),
        transfer_before AS (
          SELECT nama_outlet, sku, COALESCE(SUM(qty), 0) AS qty
          FROM penjualan
          WHERE tanggal < (SELECT start_date FROM params)
            AND ($4::text = '' OR nama_outlet = $4)
          GROUP BY nama_outlet, sku
        ),
        transfer_month AS (
          SELECT nama_outlet, sku, COALESCE(SUM(qty), 0) AS qty
          FROM penjualan
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($4::text = '' OR nama_outlet = $4)
          GROUP BY nama_outlet, sku
        ),
        keys AS (
          SELECT nama_outlet, sku FROM transfer_before
          UNION
          SELECT nama_outlet, sku FROM transfer_month
        )
        SELECT
          k.nama_outlet,
          p.sku,
          p.nama_produk,
          COALESCE(tb.qty, 0) AS opening_stok,
          COALESCE(tm.qty, 0) AS stok_masuk,
          0 AS stok_keluar,
          0 AS penyesuaian,
          COALESCE(tb.qty, 0) + COALESCE(tm.qty, 0) AS stok_akhir
        FROM keys k
        JOIN produk p ON p.sku = k.sku
        LEFT JOIN transfer_before tb ON tb.nama_outlet = k.nama_outlet AND tb.sku = k.sku
        LEFT JOIN transfer_month tm ON tm.nama_outlet = k.nama_outlet AND tm.sku = k.sku
        WHERE ($3::text = '' OR p.sku = $3)
          AND ($4::text = '' OR k.nama_outlet = $4)
        ORDER BY k.nama_outlet, p.nama_produk
      `, [bulan, tahun, sku || "", outlet || ""]),
      pool.query(`
        WITH params AS (
          SELECT
            make_date($2::int, $1::int, 1) AS start_date,
            (make_date($2::int, $1::int, 1) + interval '1 month')::date AS end_date
        )
        SELECT *
        FROM (
          SELECT
            tanggal,
            'Warehouse' AS sumber,
            'Transfer ke Outlet' AS jenis,
            nama_outlet,
            sku,
            qty,
            '-' AS referensi,
            'Penjualan warehouse saat ini diperlakukan sebagai stok masuk outlet' AS keterangan
          FROM penjualan
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
            AND ($4::text = '' OR nama_outlet = $4)

          UNION ALL

          SELECT
            tanggal,
            'Warehouse' AS sumber,
            'Pembelian Warehouse' AS jenis,
            '-' AS nama_outlet,
            sku,
            qty,
            '-' AS referensi,
            'Masuk ke stok gudang' AS keterangan
          FROM pembelian
          WHERE tanggal >= (SELECT start_date FROM params)
            AND tanggal < (SELECT end_date FROM params)
            AND ($3::text = '' OR sku = $3)
            AND $4::text = ''
        ) movement_log
        ORDER BY tanggal DESC
        LIMIT 300
      `, [bulan, tahun, sku || "", outlet || ""])
    ]);

    const flags = outletResult.rows
      .filter(item => Number(item.stok_akhir || 0) > 0)
      .map(item => ({
        nama_outlet: item.nama_outlet,
        sku: item.sku,
        flag: "DB_OUTLET_BELUM_LENGKAP",
        detail: "Stok outlet belum bisa dipotong penjualan outlet karena tabel outlet_penjualan belum tersedia."
      }))
      .slice(0, 50);

    return res.status(200).json({
      db_ready: false,
      summary: summaryResult.rows[0] || {},
      outlet_summary: outletResult.rows,
      movements: movementResult.rows,
      flags,
      notes: [
        "Tambahkan tabel outlet_stok_awal, outlet_stok_masuk, outlet_penjualan, dan outlet_stok_penyesuaian.",
        "Pastikan penjualan warehouse ke outlet di-mirror ke outlet_stok_masuk.",
        "Import penjualan outlet ke outlet_penjualan agar stok akhir outlet tidak bias.",
        "File rancangan SQL tersedia di db_audit_outlet_proposal.sql."
      ]
    });
  } catch (err) {
    console.error("AUDIT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
