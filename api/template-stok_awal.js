export default function handler(req, res) {
  const csv = `sku,qty
10001,100
10002,200`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=template_stok_awal.csv");
  res.status(200).send(csv);
}