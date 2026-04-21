-- Database Schema for CV EPIC Warehouse

CREATE TABLE IF NOT EXISTS produk (
  sku VARCHAR(50) PRIMARY KEY,
  nama_produk VARCHAR(255) NOT NULL,
  harga_beli NUMERIC(14,2) DEFAULT 0,
  harga_jual NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outlet (
  id SERIAL PRIMARY KEY,
  nama_outlet VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS penjualan (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  nama_outlet VARCHAR(255) NOT NULL,
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty INTEGER NOT NULL CHECK (qty >= 0),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pembelian (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty INTEGER NOT NULL CHECK (qty >= 0),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stok_awal (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty_awal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stok_penyesuaian (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty INTEGER NOT NULL,
  keterangan TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stok_opname (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  total_item INTEGER NOT NULL DEFAULT 0,
  total_selisih INTEGER NOT NULL DEFAULT 0,
  keterangan TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stok_opname_detail (
  id SERIAL PRIMARY KEY,
  opname_id INTEGER NOT NULL REFERENCES stok_opname(id) ON DELETE CASCADE,
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  stok_sistem INTEGER NOT NULL,
  stok_fisik INTEGER NOT NULL,
  selisih INTEGER NOT NULL
);

-- Audit outlet tables
CREATE TABLE IF NOT EXISTS outlet_stok_awal (
  id SERIAL PRIMARY KEY,
  outlet_id INTEGER NOT NULL REFERENCES outlet(id),
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  periode DATE NOT NULL,
  qty_awal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (outlet_id, sku, periode)
);

CREATE TABLE IF NOT EXISTS outlet_stok_masuk (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  outlet_id INTEGER NOT NULL REFERENCES outlet(id),
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty INTEGER NOT NULL CHECK (qty >= 0),
  sumber VARCHAR(30) NOT NULL DEFAULT 'warehouse_transfer',
  ref_penjualan_id INTEGER,
  keterangan TEXT,
  checker VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outlet_penjualan (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  outlet_id INTEGER NOT NULL REFERENCES outlet(id),
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty INTEGER NOT NULL CHECK (qty >= 0),
  sumber VARCHAR(30) NOT NULL DEFAULT 'sales_outlet',
  keterangan TEXT,
  imported_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outlet_stok_penyesuaian (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  outlet_id INTEGER NOT NULL REFERENCES outlet(id),
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty INTEGER NOT NULL,
  alasan TEXT,
  checker VARCHAR(100),
  approved_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outlet_stok_opname (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  outlet_id INTEGER NOT NULL REFERENCES outlet(id),
  total_item INTEGER NOT NULL DEFAULT 0,
  total_selisih INTEGER NOT NULL DEFAULT 0,
  checker VARCHAR(100),
  approved_by VARCHAR(100),
  keterangan TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outlet_stok_opname_detail (
  id SERIAL PRIMARY KEY,
  opname_id INTEGER NOT NULL REFERENCES outlet_stok_opname(id) ON DELETE CASCADE,
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  stok_sistem INTEGER NOT NULL,
  stok_fisik INTEGER NOT NULL,
  selisih INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_penjualan_tanggal_sku ON penjualan (tanggal, sku);
CREATE INDEX IF NOT EXISTS idx_pembelian_tanggal_sku ON pembelian (tanggal, sku);
CREATE INDEX IF NOT EXISTS idx_penyesuaian_tanggal_sku ON stok_penyesuaian (tanggal, sku);
CREATE INDEX IF NOT EXISTS idx_outlet_stok_masuk_tanggal ON outlet_stok_masuk (tanggal, outlet_id, sku);
CREATE INDEX IF NOT EXISTS idx_outlet_penjualan_tanggal ON outlet_penjualan (tanggal, outlet_id, sku);
CREATE INDEX IF NOT EXISTS idx_outlet_penyesuaian_tanggal ON outlet_stok_penyesuaian (tanggal, outlet_id, sku);

INSERT INTO produk (sku, nama_produk, harga_beli, harga_jual) VALUES
('SKU001', 'Produk A', 10000, 15000),
('SKU002', 'Produk B', 20000, 25000),
('SKU003', 'Produk C', 15000, 20000)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO outlet (nama_outlet) VALUES
('OUTLET 1'),
('OUTLET 2'),
('OUTLET 3')
ON CONFLICT (nama_outlet) DO NOTHING;

INSERT INTO stok_awal (sku, qty_awal) VALUES
('SKU001', 100),
('SKU002', 50),
('SKU003', 75)
ON CONFLICT DO NOTHING;
