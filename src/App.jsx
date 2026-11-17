import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { QRCodeSVG } from 'qrcode.react';

const env = import.meta.env;
const ready = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
const supabase = ready ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY) : null;
const roomUrl = env.VITE_ROOM_URL || window.location.origin;
const params = new URLSearchParams(location.search);
const isRequest = params.get('request') === '1';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(ready ? 'เชื่อมต่อระบบแล้ว' : 'โหมดทดลอง: ยังไม่ได้ตั้งค่าฐานข้อมูล');
  const [pin, setPin] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [demoQueue, setDemoQueue] = useState([]);
  const [mascotOn, setMascotOn] = useState(() => {
    try { return localStorage.getItem('jukebox-mascots') !== 'off'; } catch { return true; }
  });
  const playerRef = useRef(null);
  const isHost = !isRequest;

  const loadQueue = async () => {
    if (!supabase) return;
    const [{ data, error }, { data: now }] = await Promise.all([
      supabase.from('queue').select('*').eq('status', 'waiting').order('position'),
      supabase.from('room_state').select('*').eq('id', 1).maybeSingle()
    ]);
    if (!error) setQueue(data || []);
    setCurrent(now?.video_id ? now : null);
  };

  useEffect(() => {
    if (!supabase) { setQueue(demoQueue); return; }
    loadQueue();
    const channel = supabase.channel('jukebox-room')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, loadQueue)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_state' }, loadQueue)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!isHost || !current?.video_id) return;
    function initPlayer() {
      if (playerRef.current) {
        try { playerRef.current.loadVideoById(current.video_id); } catch {}
        return;
      }
      const mount = document.getElementById('yt-player');
      if (!mount || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player('yt-player', {
        width: '100%', height: '100%', videoId: current.video_id,
        playerVars: { autoplay: 1, playsinline: 1, enablejsapi: 1, origin: location.origin },
        events: {
          onReady: e => e.target.playVideo(),
          onStateChange: e => { if (e.data === 0) nextTrack(); },
          onError: () => setNotice('วิดีโอนี้เล่นไม่ได้ อาจถูกจำกัดการฝังหรือไม่พร้อมให้บริการ')
        }
      });
    }
    if (window.YT?.Player) initPlayer();
    else {
      const existing = document.querySelector('script[data-youtube-iframe-api]');
      if (!existing) {
        const script = document.createElement('script');
        script.dataset.youtubeIframeApi = 'true';
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); initPlayer(); };
    }
  }, [current?.video_id, isHost]);

  async function searchYouTube(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    if (!env.VITE_YOUTUBE_API_KEY) { setNotice('กรุณาตั้งค่า YouTube Data API Key ในไฟล์ .env'); return; }
    setBusy(true);
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8', q: query, key: env.VITE_YOUTUBE_API_KEY });
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'ค้นหาไม่สำเร็จ');
      setResults((data.items || []).map(x => ({ id: x.id.videoId, title: x.snippet.title, channel: x.snippet.channelTitle, thumb: x.snippet.thumbnails.medium.url })));
    } catch (err) { setNotice(err.message); }
    finally { setBusy(false); }
  }

  async function addTrack(track) {
    if (supabase) {
      const { error } = await supabase.rpc('add_track', { p_video_id: track.id, p_title: track.title, p_channel: track.channel, p_thumbnail: track.thumb, p_requester: 'ผู้ใช้ QR' });
      if (error) { setNotice(error.message); return; }
      await loadQueue();
    } else {
      const item = { id: crypto.randomUUID(), video_id: track.id, title: track.title, channel: track.channel, thumbnail: track.thumb, status: 'waiting' };
      setDemoQueue(q => [...q, item]); setQueue(q => [...q, item]);
    }
    setNotice('เพิ่มเพลงเข้าท้ายคิวแล้ว ไม่แทรกเพลงที่กำลังเล่น');
  }

  async function nextTrack() {
    if (!isAdmin) { setNotice('เฉพาะเจ้าของเครื่องเท่านั้นที่เลื่อนคิวได้'); return; }
    if (!supabase) {
      const next = demoQueue[0] || null;
      setDemoQueue(q => q.slice(1)); setQueue(q => q.slice(1)); setCurrent(next);
      return;
    }
    const { data, error } = await supabase.rpc('admin_next', { p_pin: pin });
    if (error) { setNotice(error.message); return; }
    await loadQueue();
    setCurrent(data?.video_id ? data : null);
  }

  function adminLogin() {
    if (pin && pin === (env.VITE_ADMIN_PIN || '')) { setIsAdmin(true); setNotice('เข้าสู่โหมดเจ้าของเครื่องแล้ว'); }
    else setNotice('รหัสเจ้าของเครื่องไม่ถูกต้อง หรือยังไม่ได้ตั้งค่า VITE_ADMIN_PIN');
  }

  async function removeTrack(id) {
    if (!isAdmin) return;
    if (supabase) {
      const { error } = await supabase.rpc('admin_remove_track', { p_pin: pin, p_track_id: id });
      if (error) setNotice(error.message);
      await loadQueue();
    } else { setDemoQueue(q => q.filter(x => x.id !== id)); setQueue(q => q.filter(x => x.id !== id)); }
  }

  function toggleMascots() {
    setMascotOn(v => {
      const next = !v;
      try { localStorage.setItem('jukebox-mascots', next ? 'on' : 'off'); } catch {}
      return next;
    });
  }

  return <main className="shell">
    <header><div className="brand"><span className="logo">♫</span><div><h1>JUKEBOX <b>QR</b></h1><small>เพลงของคุณ คิวของทุกคน</small></div></div><span className="live"><i/> {ready ? 'ONLINE' : 'DEMO'}</span></header>
    <div className="notice">{notice}</div>
    {isRequest ? <section className="request-page">
      <h2>ขอเพลงที่คุณอยากฟัง</h2><p>ค้นหาเพลงจาก YouTube แล้วส่งเข้าคิวได้เลย</p>
      <form onSubmit={searchYouTube} className="search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="พิมพ์ชื่อเพลงหรือศิลปิน..." /><button disabled={busy}>{busy ? 'กำลังค้นหา' : 'ค้นหาเพลง'}</button></form>
      <div className="results">{results.map(t => <article className="track" key={t.id}><img src={t.thumb} alt=""/><div className="track-info"><strong>{t.title}</strong><small>{t.channel}</small></div><button className="add" onClick={() => addTrack(t)}>＋ เพิ่ม</button></article>)}</div>
      <h3>คิวเพลง ({queue.length + (current ? 1 : 0)})</h3><Queue queue={queue} current={current}/>
    </section> : <>
      <section className="hero">
        <div className="player-wrap"><div id="yt-player"><div className="player-empty"><span>♫</span><b>JUKEBOX PLAYER</b><small>เพลงจะเล่นที่นี่เมื่อเริ่มคิว</small></div></div></div>
        <div className="now"><small>NOW PLAYING · ลำดับที่ 1</small><h2>{current?.title || 'ยังไม่มีเพลงกำลังเล่น'}</h2><p>{current?.channel || 'เพิ่มเพลงผ่าน QR Code เพื่อเริ่มต้น'}</p><div className="now-actions"><button className={`effect-toggle ${mascotOn ? 'active' : ''}`} onClick={toggleMascots}>{mascotOn ? '✨ เอฟเฟกต์เต้น: เปิด' : 'เอฟเฟกต์เต้น: ปิด'}</button></div></div>
      </section>
      {mascotOn && <section className="mascot-stage" aria-label="เสือและฮิปโปเต้น"><div className="mascot-caption"><span>🐯</span> PARTY TIME <span>🦛</span></div><img className="mascot-art" src="/assets/tiger-hippo-duo.png" alt="เสืออ้วนและฮิปโปอ้วนยืนเต้นคู่กัน"/></section>}
      <div className="grid">
        <section className="panel"><div className="panel-head"><h3>คิวเพลง <span>{queue.length + (current ? 1 : 0)}</span></h3><small>เพลงใหม่ต่อท้ายเสมอ</small></div><Queue queue={queue} current={current} onRemove={removeTrack} admin={isAdmin}/></section>
        <section className="panel qr-panel"><h3>สแกนเพื่อขอเพลง</h3><div className="qr"><QRCodeSVG value={`${roomUrl}/?request=1`} size={190} bgColor="#ffffff" fgColor="#111111" level="H"/></div><p>สแกน QR Code ด้วยกล้องมือถือ</p><a href={`${roomUrl}/?request=1`} target="_blank" rel="noreferrer">เปิดหน้าขอเพลง</a><div className="admin"><h4>เจ้าของเครื่อง</h4>{!isAdmin ? <><input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="รหัสเจ้าของเครื่อง"/><button onClick={adminLogin}>เข้าสู่ระบบควบคุม</button></> : <><span className="admin-ok">● ควบคุมเครื่องได้</span><button onClick={nextTrack}>เล่นเพลงถัดไป</button><button className="ghost" onClick={() => setIsAdmin(false)}>ออกจากโหมดควบคุม</button></>}</div></section>
      </div>
    </>}
    <footer>JUKEBOX QR · ระบบจัดคิวเพลงแบบไม่แทรกกลางเพลง</footer>
  </main>;
}

function Queue({ queue, current, onRemove, admin }) {
  if (!queue.length && !current) return <div className="empty">ยังไม่มีเพลงในคิว</div>;
  return <div className="queue">
    {current && <div className="queue-row playing-row"><span className="number">01</span><div className="playing-thumb">♫</div><div className="track-info"><strong>{current.title}</strong><small>{current.channel || 'กำลังเล่นอยู่'}</small></div><span className="status-playing">กำลังเล่น</span></div>}
    {queue.map((t, i) => <div className="queue-row" key={t.id}><span className="number">{String(i + (current ? 2 : 1)).padStart(2, '0')}</span><img src={t.thumbnail} alt=""/><div className="track-info"><strong>{t.title}</strong><small>{t.channel}</small></div><span className="status-waiting">รอเล่น</span>{admin && <button className="remove" onClick={() => onRemove(t.id)}>ลบ</button>}</div>)}
  </div>;
}
export default App;
