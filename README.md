# Inventory App

Aplikasi dashboard inventory berbasis web untuk mengelola penjualan, pembelian, stok, dan opname.

## Fitur

- **Dashboard Penjualan**: KPI, grafik, input manual, import CSV
- **Audit Stok**: Log transaksi penjualan dan pembelian
- **Persediaan**: Laporan stok produk
- **Forecasting**: Prediksi penjualan berdasarkan rata-rata
- **Stok Opname**: Input fisik, history, import/export

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup database PostgreSQL (gunakan Neon atau lokal):
   - Buat database
   - Update DATABASE_URL di .env

3. Inisialisasi database:
   ```bash
   npm run init-db
   ```

4. Jalankan server:
   ```bash
   npm start
   ```

5. Buka http://localhost:3000

## API Endpoints

- GET /api/kpi?bulan=X&tahun=Y
- GET /api/chart?tahun=Y
- POST /api/add-penjualan
- POST /api/add-pembelian
- POST /api/add-stok_awal
- POST /api/add-outlet
- GET /api/persediaan
- GET /api/audit
- GET /api/forecast
- Dan lainnya...

## Teknologi

- Frontend: HTML, CSS, JavaScript, Chart.js
- Backend: Node.js, Express
- Database: PostgreSQL