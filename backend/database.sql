-- สร้างตาราง stalls
CREATE TABLE IF NOT EXISTS stalls (
  id VARCHAR(10) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'available', -- 'available', 'hold', 'booked'
  hold_by VARCHAR(100),
  hold_expires_at TIMESTAMP
);

-- เพิ่มข้อมูลจำลอง (A1 - A10)
INSERT INTO stalls (id, name, status) VALUES
('A1', 'ล็อก A1', 'available'),
('A2', 'ล็อก A2', 'available'),
('A3', 'ล็อก A3', 'available'),
('A4', 'ล็อก A4', 'available'),
('A5', 'ล็อก A5', 'available'),
('A6', 'ล็อก A6', 'available'),
('A7', 'ล็อก A7', 'available'),
('A8', 'ล็อก A8', 'available'),
('A9', 'ล็อก A9', 'available'),
('A10', 'ล็อก A10', 'available')
ON CONFLICT (id) DO NOTHING;
