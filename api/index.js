import addOutletHandler from "../backend/add-outlet.js";
import addPembelianHandler from "../backend/add-pembelian.js";
import addPenjualanHandler from "../backend/add-penjualan.js";
import addStokAwalHandler from "../backend/add-stok_awal.js";
import auditHandler from "../backend/audit.js";
import chartHandler from "../backend/chart.js";
import forecastHandler from "../backend/forecast.js";
import importOutletHandler from "../backend/import-outlet.js";
import importPembelianHandler from "../backend/import-pembelian.js";
import importPenjualanHandler from "../backend/import-penjualan.js";
import importStokAwalHandler from "../backend/import-stok_awal.js";
import kpiHandler from "../backend/kpi.js";
import opnameHistoryHandler from "../backend/opname-history.js";
import outletStatusHandler from "../backend/outlet-status.js";
import outletListHandler from "../backend/outlet-list.js";
import persediaanHandler from "../backend/persediaan.js";
import outletTransaksiHandler from "../backend/outlet-transaksi.js";
import produkListHandler from "../backend/produk-list.js";
import simpanOpnameHandler from "../backend/simpan-opname.js";
import stokSistemHandler from "../backend/stok-sistem.js";
import templateOutletHandler from "../backend/template-outlet.js";
import templatePembelianHandler from "../backend/template-pembelian.js";
import templatePenjualanHandler from "../backend/template-penjualan.js";
import templateStokAwalHandler from "../backend/template-stok_awal.js";
import topOutletHandler from "../backend/top-outlet.js";
import topProdukHandler from "../backend/top-produk.js";

const routes = {
  "GET /kpi": kpiHandler,
  "GET /chart": chartHandler,
  "GET /top-produk": topProdukHandler,
  "GET /top-outlet": topOutletHandler,
  "GET /outlet-status": outletStatusHandler,
  "GET /outlet-list": outletListHandler,
  "GET /outlet-transaksi": outletTransaksiHandler,
  "GET /template-outlet": templateOutletHandler,
  "GET /template-penjualan": templatePenjualanHandler,
  "GET /template-pembelian": templatePembelianHandler,
  "GET /template-stok_awal": templateStokAwalHandler,
  "GET /stok-sistem": stokSistemHandler,
  "GET /opname-history": opnameHistoryHandler,
  "GET /persediaan": persediaanHandler,
  "GET /audit": auditHandler,
  "GET /forecast": forecastHandler,
  "GET /produk-list": produkListHandler,
  "POST /add-penjualan": addPenjualanHandler,
  "POST /add-pembelian": addPembelianHandler,
  "POST /add-stok_awal": addStokAwalHandler,
  "POST /add-outlet": addOutletHandler,
  "POST /import-penjualan": importPenjualanHandler,
  "POST /import-pembelian": importPembelianHandler,
  "POST /import-stok_awal": importStokAwalHandler,
  "POST /import-outlet": importOutletHandler,
  "POST /simpan-opname": simpanOpnameHandler
};

function getRoutePath(req) {
  if (req.query?.route) {
    return `/${String(req.query.route).replace(/^\/+/, "")}`;
  }

  const url = new URL(req.url, "http://localhost");
  return url.pathname.replace(/^\/api/, "") || "/";
}

export default async function handler(req, res) {
  const routePath = getRoutePath(req);
  const key = `${req.method} ${routePath}`;
  const routeHandler = routes[key];

  if (!routeHandler) {
    return res.status(404).json({ error: `Route tidak ditemukan: ${key}` });
  }

  return routeHandler(req, res);
}
