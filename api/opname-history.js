import pool from "../services/db.js";

export default async function handler(req, res) {
  try {

    const { bulan, tahun } = req.query;

    const result = await pool.query(`
      SELECT 
        id,
        tanggal,
        total_item,
        total_selisih
      FROM stok_opname
      WHERE EXTRACT(MONTH FROM tanggal) = $1
      AND EXTRACT(YEAR FROM tanggal) = $2
      ORDER BY tanggal DESC
    `, [bulan, tahun]);

    res.status(200).json(result.rows);

  } catch (err) {
    console.error("ERROR HISTORY:", err);
    res.status(500).json({ error: err.message });
  }
}