-- Safe migration for Neon SQL Editor
-- Tujuan:
-- 1. Menjaga tabel existing tetap aman
-- 2. Menambahkan kolom/tabel yang dibutuhkan aplikasi terbaru
-- 3. Menyiapkan audit stok outlet tanpa merusak data lama

BEGIN;

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
  qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pembelian (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stok_awal (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) NOT NULL REFERENCES produk(sku),
  qty_awal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE produk
  ADD COLUMN IF NOT EXISTS harga_beli NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS harga_jual NUMERIC(14,2) DEFAULT 0;

ALTER TABLE outlet
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE penjualan
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE pembelian
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE stok_awal
  ADD COLUMN IF NOT EXISTS qty_awal INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

UPDATE stok_awal
SET qty_awal = COALESCE(qty_awal, 0)
WHERE qty_awal IS NULL;

ALTER TABLE stok_awal
  ALTER COLUMN qty_awal SET DEFAULT 0;

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
  qty INTEGER NOT NULL DEFAULT 0,
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
  qty INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_penjualan_tanggal_sku
  ON penjualan (tanggal, sku);

CREATE INDEX IF NOT EXISTS idx_pembelian_tanggal_sku
  ON pembelian (tanggal, sku);

CREATE INDEX IF NOT EXISTS idx_penyesuaian_tanggal_sku
  ON stok_penyesuaian (tanggal, sku);

CREATE INDEX IF NOT EXISTS idx_outlet_stok_awal_periode
  ON outlet_stok_awal (periode, outlet_id, sku);

CREATE INDEX IF NOT EXISTS idx_outlet_stok_masuk_tanggal
  ON outlet_stok_masuk (tanggal, outlet_id, sku);

CREATE INDEX IF NOT EXISTS idx_outlet_penjualan_tanggal
  ON outlet_penjualan (tanggal, outlet_id, sku);

CREATE INDEX IF NOT EXISTS idx_outlet_penyesuaian_tanggal
  ON outlet_stok_penyesuaian (tanggal, outlet_id, sku);

CREATE OR REPLACE VIEW vw_outlet_stock_monthly AS
WITH opening AS (
  SELECT outlet_id, sku, periode, SUM(qty_awal) AS qty_awal
  FROM outlet_stok_awal
  GROUP BY outlet_id, sku, periode
),
masuk AS (
  SELECT outlet_id, sku, date_trunc('month', tanggal)::date AS periode, SUM(qty) AS qty_masuk
  FROM outlet_stok_masuk
  GROUP BY outlet_id, sku, date_trunc('month', tanggal)::date
),
keluar AS (
  SELECT outlet_id, sku, date_trunc('month', tanggal)::date AS periode, SUM(qty) AS qty_keluar
  FROM outlet_penjualan
  GROUP BY outlet_id, sku, date_trunc('month', tanggal)::date
),
adjust AS (
  SELECT outlet_id, sku, date_trunc('month', tanggal)::date AS periode, SUM(qty) AS qty_adjust
  FROM outlet_stok_penyesuaian
  GROUP BY outlet_id, sku, date_trunc('month', tanggal)::date
),
keys AS (
  SELECT outlet_id, sku, periode FROM opening
  UNION
  SELECT outlet_id, sku, periode FROM masuk
  UNION
  SELECT outlet_id, sku, periode FROM keluar
  UNION
  SELECT outlet_id, sku, periode FROM adjust
)
SELECT
  o.nama_outlet,
  p.sku,
  p.nama_produk,
  k.periode,
  COALESCE(op.qty_awal, 0) AS opening_stok,
  COALESCE(ms.qty_masuk, 0) AS stok_masuk,
  COALESCE(kl.qty_keluar, 0) AS stok_keluar,
  COALESCE(ad.qty_adjust, 0) AS penyesuaian,
  COALESCE(op.qty_awal, 0)
    + COALESCE(ms.qty_masuk, 0)
    - COALESCE(kl.qty_keluar, 0)
    + COALESCE(ad.qty_adjust, 0) AS stok_akhir
FROM keys k
JOIN outlet o ON o.id = k.outlet_id
JOIN produk p ON p.sku = k.sku
LEFT JOIN opening op ON op.outlet_id = k.outlet_id AND op.sku = k.sku AND op.periode = k.periode
LEFT JOIN masuk ms ON ms.outlet_id = k.outlet_id AND ms.sku = k.sku AND ms.periode = k.periode
LEFT JOIN keluar kl ON kl.outlet_id = k.outlet_id AND kl.sku = k.sku AND kl.periode = k.periode
LEFT JOIN adjust ad ON ad.outlet_id = k.outlet_id AND ad.sku = k.sku AND ad.periode = k.periode;

COMMIT;

-- Setelah migrasi berhasil:
-- 1. Isi outlet_stok_awal untuk opening stock outlet per bulan
-- 2. Mirror penjualan warehouse ke outlet_stok_masuk
-- 3. Import penjualan outlet ke outlet_penjualan
