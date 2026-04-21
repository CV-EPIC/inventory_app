import pool from "../services/db.js";

// FORMAT TANGGAL (MM/DD/YYYY → YYYY-MM-DD)
function formatTanggal(tgl) {
  if (!tgl) return null;

  if (tgl.includes("/")) {
    const [bulan, hari, tahun] = tgl.split("/");
    return `${tahun}-${bulan.padStart(2, "0")}-${hari.padStart(2, "0")}`;
  }

  return tgl; // sudah format benar
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { csv } = req.body;

    // VALIDASI INPUT
    if (!csv || csv.trim().length === 0) {
      return res.status(400).json({ error: "CSV kosong / tidak terbaca" });
    }

    console.log("CSV MASUK:\n", csv);

    // CLEAN & SPLIT
    const lines = csv
      .replace(/^\uFEFF/, "") // hapus BOM
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l);

    if (lines.length <= 1) {
      return res.status(400).json({ error: "CSV tidak ada data" });
    }

    const rows = lines.slice(1); // skip header

    let success = 0;
    let failed = 0;

    for (let row of rows) {
      try {
        const cols = row.split(/[,;]/);

        if (cols.length < 4) {
          console.log("SKIP kolom kurang:", row);
          failed++;
          continue;
        }

        let [tanggal, nama_outlet, sku, qty] = cols.map(c => c.trim());

        if (!tanggal || !nama_outlet || !sku || !qty) {
          console.log("SKIP data kosong:", row);
          failed++;
          continue;
        }

        // FIX qty
        qty = qty.replace("\r", "");

        // VALIDASI SKU
        const cek = await pool.query(
          "SELECT 1 FROM produk WHERE TRIM(sku) = $1",
          [sku]
        );

        if (cek.rows.length === 0) {
          console.log("SKU tidak ditemukan:", sku);
          failed++;
          continue;
        }

        await pool.query(
          `INSERT INTO penjualan (tanggal, nama_outlet, sku, qty)
           VALUES ($1, $2, $3, $4)`,
          [
            formatTanggal(tanggal),
            nama_outlet.toUpperCase(),
            sku,
            parseInt(qty)
          ]
        );

        success++;

      } catch (errRow) {
        console.log("ERROR ROW:", row, errRow.message);
        failed++;
      }
    }

    return res.status(200).json({
      message: `Import berhasil (${success} data, ${failed} gagal)`
    });

  } catch (err) {
    console.error("ERROR IMPORT:", err);
    return res.status(500).json({ error: err.message });
  }
}