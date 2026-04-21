export default function handler(req, res) {
  const csv = `tanggal,sku,qty
2026-01-01,10001,50
2026-01-02,10002,30`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=template_pembelian.csv");
  res.status(200).send(csv);
}