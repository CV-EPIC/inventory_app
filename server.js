import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.')); // Serve static files from current directory

// Import API handlers
import kpiHandler from './api/kpi.js';
import chartHandler from './api/chart.js';
import topProdukHandler from './api/top-produk.js';
import topOutletHandler from './api/top-outlet.js';
import outletStatusHandler from './api/outlet-status.js';
import addPenjualanHandler from './api/add-penjualan.js';
import addPembelianHandler from './api/add-pembelian.js';
import addStokAwalHandler from './api/add-stok_awal.js';
import addOutletHandler from './api/add-outlet.js';
import importPenjualanHandler from './api/import-penjualan.js';
import importPembelianHandler from './api/import-pembelian.js';
import importStokAwalHandler from './api/import-stok_awal.js';
import importOutletHandler from './api/import-outlet.js';
import templateOutletHandler from './api/template-outlet.js';
import templatePenjualanHandler from './api/template-penjualan.js';
import templatePembelianHandler from './api/template-pembelian.js';
import templateStokAwalHandler from './api/template-stok_awal.js';
import stokSistemHandler from './api/stok-sistem.js';
import opnameHistoryHandler from './api/opname-history.js';
import simpanOpnameHandler from './api/simpan-opname.js';
import persediaanHandler from './api/persediaan.js';
import auditHandler from './api/audit.js';
import forecastHandler from './api/forecast.js';
import produkListHandler from './api/produk-list.js';

// API Routes
app.get('/api/kpi', kpiHandler);
app.get('/api/chart', chartHandler);
app.get('/api/top-produk', topProdukHandler);
app.get('/api/top-outlet', topOutletHandler);
app.get('/api/outlet-status', outletStatusHandler);
app.post('/api/add-penjualan', addPenjualanHandler);
app.post('/api/add-pembelian', addPembelianHandler);
app.post('/api/add-stok_awal', addStokAwalHandler);
app.post('/api/add-outlet', addOutletHandler);
app.post('/api/import-penjualan', importPenjualanHandler);
app.post('/api/import-pembelian', importPembelianHandler);
app.post('/api/import-stok_awal', importStokAwalHandler);
app.post('/api/import-outlet', importOutletHandler);
app.get('/api/template-outlet', templateOutletHandler);
app.get('/api/template-penjualan', templatePenjualanHandler);
app.get('/api/template-pembelian', templatePembelianHandler);
app.get('/api/template-stok_awal', templateStokAwalHandler);
app.get('/api/stok-sistem', stokSistemHandler);
app.get('/api/opname-history', opnameHistoryHandler);
app.post('/api/simpan-opname', simpanOpnameHandler);
app.get('/api/persediaan', persediaanHandler);
app.get('/api/audit', auditHandler);
app.get('/api/forecast', forecastHandler);
app.get('/api/produk-list', produkListHandler);

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
