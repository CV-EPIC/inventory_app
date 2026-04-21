-- Proposal audit stok outlet untuk CV EPIC Warehouse
-- Prinsip:
-- 1. Penjualan warehouse ke outlet = stok masuk outlet
-- 2. Penjualan outlet = stok keluar outlet
-- 3. Penyesuaian / selisih audit outlet harus dicatat terpisah
-- 4. Opening stock outlet wajib tersimpan per outlet, SKU, dan periode audit

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

CREATE INDEX IF NOT EXISTS idx_outlet_stok_awal_periode ON outlet_stok_awal (periode, outlet_id, sku);
CREATE INDEX IF NOT EXISTS idx_outlet_stok_masuk_periode ON outlet_stok_masuk (tanggal, outlet_id, sku);
CREATE INDEX IF NOT EXISTS idx_outlet_penjualan_periode ON outlet_penjualan (tanggal, outlet_id, sku);
CREATE INDEX IF NOT EXISTS idx_outlet_penyesuaian_periode ON outlet_stok_penyesuaian (tanggal, outlet_id, sku);

-- View ringkas stok outlet per periode audit.
-- Formula:
-- opening stock + stok masuk - penjualan outlet +/- penyesuaian
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

-- Rekomendasi sinkron API:
-- 1. Saat insert ke tabel penjualan warehouse, mirror juga ke outlet_stok_masuk.
-- 2. Import penjualan outlet langsung ke outlet_penjualan.
-- 3. Selisih dari opname outlet harus otomatis buat record di outlet_stok_penyesuaian.
-- 4. Endpoint audit membaca outlet_stok_awal + outlet_stok_masuk + outlet_penjualan + outlet_stok_penyesuaian.
