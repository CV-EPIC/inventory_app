import pool from "../services/db.js";

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    const { tanggal, items, keterangan } = req.body;

    if (!tanggal || !Array.isArray(items)) {
      return res.status(400).json({ error: "Payload tidak valid" });
    }

    await client.query("BEGIN");

    // 1) HEADER
    const header = await client.query(`
      INSERT INTO stok_opname (tanggal, total_item, total_selisih, keterangan)
      VALUES ($1, $2, 0, $3)
      RETURNING id
    `, [tanggal, items.length, keterangan || null]);

    const opnameId = header.rows[0].id;

    let totalSelisih = 0;

    // 2) DETAIL + 3) PENYESUAIAN
    for (const it of items) {
      const sku = it.sku;
      const sistem = Number(it.sistem || 0);
      const fisik  = Number(it.fisik  || 0);
      const selisih = fisik - sistem;

      totalSelisih += Math.abs(selisih);

      // simpan detail
      await client.query(`
        INSERT INTO stok_opname_detail
        (opname_id, sku, stok_sistem, stok_fisik, selisih)
        VALUES ($1,$2,$3,$4,$5)
      `, [opnameId, sku, sistem, fisik, selisih]);

      // simpan penyesuaian (hanya kalau beda)
      if (selisih !== 0) {
        await client.query(`
          INSERT INTO stok_penyesuaian (tanggal, sku, qty, keterangan)
          VALUES ($1,$2,$3,$4)
        `, [
          tanggal,
          sku,
          selisih, // bisa negatif/positif
          `Opname #${opnameId}`
        ]);
      }
    }

    // update total selisih di header
    await client.query(`
      UPDATE stok_opname
      SET total_selisih = $1
      WHERE id = $2
    `, [totalSelisih, opnameId]);

    await client.query("COMMIT");

    res.json({ message: "Opname tersimpan & stok disesuaikan", opname_id: opnameId });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("SIMPAN OPNAME ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}