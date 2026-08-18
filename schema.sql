-- ============================================================
-- Amaris Catering — D1 Schema
-- Satu baris JSON untuk seluruh state aplikasi (skala kecil,
-- banyak pembaca read-only). update_at untuk deteksi konflik.
-- ============================================================
CREATE TABLE IF NOT EXISTS state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
