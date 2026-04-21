import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { tahun, sku } = req.query;

    const result = await pool.query(`
      SELECT 
        m.bulan,
        COALESCE(SUM(p.qty),0) AS total
      FROM generate_series(1,12) AS m(bulan)
      LEFT JOIN penjualan p
        ON EXTRACT(MONTH FROM p.tanggal) = m.bulan
        AND EXTRACT(YEAR FROM p.tanggal) = $1
        AND ($2::text = '' OR p.sku = $2)
      GROUP BY m.bulan
      ORDER BY m.bulan
    `, [tahun, sku || ""]);

    res.status(200).json(result.rows);

  } catch (err) {
    console.error("CHART ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
