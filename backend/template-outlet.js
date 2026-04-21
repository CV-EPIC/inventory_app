export default function handler(req, res) {
  const csv = `nama_outlet
OUTLET A
OUTLET B
OUTLET C`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=template_outlet.csv");
  res.status(200).send(csv);
}