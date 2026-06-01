import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { ShoppingBag, Clock, CheckCircle, Info } from 'lucide-react';
import './App.css';

// จำลอง User Session ID
const USER_ID = Math.random().toString(36).substring(2, 10);
// เชื่อมต่อ WebSocket
const socket = io('http://localhost:3000');

function App() {
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myHold, setMyHold] = useState(null); // ล็อกที่เรากด hold ไว้

  useEffect(() => {
    // 1. ดึงข้อมูลครั้งแรกเมื่อโหลดหน้า
    fetch('http://localhost:3000/api/stalls')
      .then(res => res.json())
      .then(data => {
        setStalls(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch:', err);
        setLoading(false);
      });

    // 2. รับข้อมูลอัปเดตแบบ Real-time
    socket.on('stall_updated', (updatedStall) => {
      setStalls(prevStalls => 
        prevStalls.map(s => s.id === updatedStall.id ? updatedStall : s)
      );
    });

    return () => socket.off('stall_updated');
  }, []);

  const getStallState = (stall) => {
    const now = new Date();
    if (stall.status === 'hold' && new Date(stall.hold_expires_at) < now) {
      return 'available';
    }
    return stall.status;
  };

  const handleHoldStall = async (stall) => {
    const state = getStallState(stall);
    if (state === 'booked') return alert('ขออภัย ล็อกนี้มีผู้จับจองแล้ว');
    if (state === 'hold') {
      if (stall.hold_by === USER_ID) {
        // ให้กดยืนยันการจอง
        handleBookStall(stall);
        return;
      }
      return alert('มีผู้ใช้อื่นกำลังทำรายการอยู่ กรุณารอสักครู่');
    }
    
    try {
      const res = await fetch(`http://localhost:3000/api/stalls/${stall.id}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMyHold(stall.id);
      alert('ล็อกคิวสำเร็จ! คุณมีเวลา 15 นาทีในการชำระเงิน (คลิกที่ล็อกเดิมเพื่อยืนยัน)');
    } catch (error) {
      alert(error.message);
    }
  };

  const handleBookStall = async (stall) => {
    if (!window.confirm(`ยืนยันการชำระเงินสำหรับ ${stall.name} ใช่หรือไม่?`)) return;

    try {
      const res = await fetch(`http://localhost:3000/api/stalls/${stall.id}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMyHold(null);
      alert('จองสำเร็จ! ขอบคุณที่ใช้บริการ');
    } catch (error) {
      alert(error.message);
    }
  };

  if (loading) return <div className="loading-screen">กำลังโหลดแผนผังตลาด...</div>;

  return (
    <div className="app-container">
      <header className="header">
        <h1>SMO FTE Night Market</h1>
        <p>ระบบจองล็อกขายของออนไลน์ โดยสโมสรนักศึกษาคณะครุศาสตร์อุตสาหกรรม (SMO FTE)</p>
      </header>

      <div className="legend">
        <div className="legend-item">
          <span className="status-dot available"></span> ว่าง (กดเพื่อจอง)
        </div>
        <div className="legend-item">
          <span className="status-dot hold"></span> ติดจอง / รอยืนยัน (15 นาที)
        </div>
        <div className="legend-item">
          <span className="status-dot booked"></span> จองสำเร็จแล้ว
        </div>
      </div>

      <main className="market-layout">
        <div className="stall-grid">
          {stalls.map(stall => {
            const state = getStallState(stall);
            const isMyHold = stall.hold_by === USER_ID && state === 'hold';
            
            return (
              <div 
                key={stall.id} 
                className={`stall-card ${state} ${isMyHold ? 'my-hold' : ''}`}
                onClick={() => handleHoldStall(stall)}
              >
                <div className="stall-header">
                  <span className="stall-id">{stall.id}</span>
                  {state === 'available' && <ShoppingBag size={18} />}
                  {state === 'hold' && <Clock size={18} />}
                  {state === 'booked' && <CheckCircle size={18} />}
                </div>
                
                <div className="stall-content">
                  <h3>{stall.name}</h3>
                  {isMyHold && (
                    <div className="action-hint">คลิกเพื่อยืนยันชำระเงิน</div>
                  )}
                  {state === 'hold' && !isMyHold && (
                    <div className="stall-wait"><Info size={12}/> กำลังทำรายการ</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="footer">
        <p>Your Session ID: {USER_ID}</p>
      </footer>
    </div>
  );
}

export default App;
