const express = require('express');
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: '*', // ในระบบจริงควรระบุโดเมน
    methods: ['GET', 'POST']
  } 
});

app.use(cors());
app.use(express.json());

// สำหรับ Demo ในกรณีที่ไม่ได้ตั้งค่า DATABASE_URL (จำลอง in-memory แบบง่ายเพื่อทดสอบ)
const useMockDB = !process.env.DATABASE_URL;
let mockStalls = [];
if (useMockDB) {
  console.log("⚠️ No DATABASE_URL provided. Using In-Memory Mock DB (for UI demo only).");
  for (let i = 1; i <= 10; i++) {
    mockStalls.push({
      id: `A${i}`, name: `ล็อก A${i}`, status: 'available', hold_by: null, hold_expires_at: null
    });
  }
}

// เชื่อมต่อ PostgreSQL
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

// ดึงข้อมูลล็อกทั้งหมด
app.get('/api/stalls', async (req, res) => {
  try {
    const now = new Date();

    if (useMockDB) {
      mockStalls = mockStalls.map(stall => {
        if (stall.status === 'hold' && stall.hold_expires_at < now) {
          return { ...stall, status: 'available', hold_by: null, hold_expires_at: null };
        }
        return stall;
      });
      return res.json(mockStalls);
    }

    const { rows } = await pool.query('SELECT * FROM stalls ORDER BY CAST(SUBSTRING(id FROM 2) AS INTEGER)');
    
    // ตรวจสอบว่าล็อกที่ติด Hold อยู่ หมดเวลาไปหรือยัง (เกิน 15 นาที)
    const updatedStalls = rows.map(stall => {
      if (stall.status === 'hold' && stall.hold_expires_at < now) {
        return { ...stall, status: 'available', hold_by: null, hold_expires_at: null };
      }
      return stall;
    });

    res.json(updatedStalls);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API สำหรับการเลือกล็อกคิว (Temporary Hold)
app.post('/api/stalls/:id/hold', async (req, res) => {
  const stallId = req.params.id;
  const { userId } = req.body; 
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60000); // 15 mins

  if (useMockDB) {
    const stallIndex = mockStalls.findIndex(s => s.id === stallId);
    if (stallIndex === -1) return res.status(404).json({ error: 'ไม่พบล็อกนี้' });
    
    const stall = mockStalls[stallIndex];
    if (stall.status === 'booked' || (stall.status === 'hold' && stall.hold_expires_at > now && stall.hold_by !== userId)) {
      return res.status(400).json({ error: 'ล็อกนี้ไม่ว่าง หรือมีผู้ใช้อื่นกำลังทำรายการ' });
    }

    mockStalls[stallIndex] = { ...stall, status: 'hold', hold_by: userId, hold_expires_at: expiresAt };
    io.emit('stall_updated', mockStalls[stallIndex]);
    return res.json(mockStalls[stallIndex]);
  }

  const client = await pool.connect();
  try {
    // 1. เริ่มต้น Transaction
    await client.query('BEGIN'); 

    // 2. คว้าล็อก (Lock) ข้อมูลแถวนี้ไว้ด้วย FOR UPDATE 
    const { rows } = await client.query('SELECT * FROM stalls WHERE id = $1 FOR UPDATE', [stallId]);
    const stall = rows[0];

    if (!stall) throw new Error('ไม่พบล็อกนี้');

    // 3. เช็คสถานะปัจจุบัน
    if (stall.status === 'booked' || (stall.status === 'hold' && stall.hold_expires_at > now && stall.hold_by !== userId)) {
      throw new Error('ล็อกนี้ไม่ว่าง หรือมีผู้ใช้อื่นกำลังทำรายการ');
    }

    // 4. เปลี่ยนสถานะเป็น hold พร้อมบวกเวลาไปอีก 15 นาที
    const updateQuery = `
      UPDATE stalls 
      SET status = 'hold', hold_by = $1, hold_expires_at = $2 
      WHERE id = $3 RETURNING *
    `;
    const updated = await client.query(updateQuery, [userId, expiresAt, stallId]);

    // 5. Commit ยืนยันการทำงานลง Database
    await client.query('COMMIT'); 

    // 6. ส่ง WebSockets ไปบอก Client ทุกคน
    io.emit('stall_updated', updated.rows[0]);

    res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK'); 
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// API สำหรับยืนยันการชำระเงินและจองถาวร (Booked)
app.post('/api/stalls/:id/book', async (req, res) => {
  const stallId = req.params.id;
  const { userId } = req.body; 

  if (useMockDB) {
    const stallIndex = mockStalls.findIndex(s => s.id === stallId);
    if (stallIndex === -1) return res.status(404).json({ error: 'ไม่พบล็อกนี้' });
    
    const stall = mockStalls[stallIndex];
    if (stall.status !== 'hold' || stall.hold_by !== userId) {
      return res.status(400).json({ error: 'ไม่อนุญาตให้ทำรายการ' });
    }

    mockStalls[stallIndex] = { ...stall, status: 'booked' };
    io.emit('stall_updated', mockStalls[stallIndex]);
    return res.json(mockStalls[stallIndex]);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); 
    const { rows } = await client.query('SELECT * FROM stalls WHERE id = $1 FOR UPDATE', [stallId]);
    const stall = rows[0];

    if (!stall || stall.status !== 'hold' || stall.hold_by !== userId) {
      throw new Error('ไม่อนุญาตให้ทำรายการ หรือหมดเวลาการจอง');
    }

    const updateQuery = `UPDATE stalls SET status = 'booked' WHERE id = $1 RETURNING *`;
    const updated = await client.query(updateQuery, [stallId]);

    await client.query('COMMIT'); 
    io.emit('stall_updated', updated.rows[0]);
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK'); 
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
