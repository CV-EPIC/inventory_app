import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const csv = req.body?.csv;

    if (!csv || csv.trim() === "") {
      return res.status(400).json({
        error: "CSV kosong / tidak terbaca"
      });
    }

    const rows = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);

    let success = 0;
    let skip = 0;

    for (let row of rows) {
      row = row.trim();

      if (!row) continue;
      if (row.toLowerCase().includes("nama_outlet")) continue;

      if (row.length < 3) {
        skip++;
        continue;
      }

      const cek = await pool.query(
        "SELECT 1 FROM outlet WHERE LOWER(nama_outlet)=LOWER($1)",
        [row]
      );

      if (cek.rows.length > 0) {
        skip++;
        continue;
      }

      await pool.query(
        "INSERT INTO outlet (nama_outlet) VALUES ($1)",
        [row.toUpperCase()]
      );

      success++;
    }

    return res.status(200).json({
      message: `Import outlet (${success} berhasil, ${skip} skip)`
    });
  } catch (err) {
    console.error("IMPORT OUTLET ERROR:", err);
    return res.status(500).json({
      error: err.message
    });
  }
}
