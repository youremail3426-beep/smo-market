require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ไม่พบ DATABASE_URL ในไฟล์ .env");
  console.error("กรุณาใส่ URL ของฐานข้อมูลก่อนรันคำสั่งนี้ครับ");
  process.exit(1);
}

const client = new Client({ connectionString });

async function initDB() {
  try {
    console.log("⏳ กำลังเชื่อมต่อกับฐานข้อมูล...");
    await client.connect();
    console.log("✅ เชื่อมต่อสำเร็จ!");

    const sqlPath = path.join(__dirname, 'database.sql');
    const sqlScript = fs.readFileSync(sqlPath, 'utf8');

    console.log("⏳ กำลังสร้างตารางและข้อมูลเริ่มต้น...");
    await client.query(sqlScript);
    
    console.log("🎉 สร้างตาราง stalls และข้อมูลล็อก A1-A10 เสร็จสมบูรณ์แล้ว!");
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาด:", err.message);
  } finally {
    await client.end();
  }
}

initDB();
