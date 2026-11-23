import React,{useEffect,useRef,useState} from 'react';

export default function AudioMixerV2({hidden=false,youtubeVolume=70,onYoutubeVolumeChange}){
 const audioRef=useRef(null),ctxRef=useRef(null),nodesRef=useRef(null),urlRef=useRef('');
 const [file,setFile]=useState(null),[fileKey,setFileKey]=useState(0),[playing,setPlaying]=useState(false);
 const [bass,setBass]=useState(0),[mid,setMid]=useState(0),[treble,setTreble]=useState(0);
 const [hp,setHp]=useState(20),[lp,setLp]=useState(20000),[wet,setWet]=useState(0),[room,setRoom]=useState(1.8),[master,setMaster]=useState(80);
 const buildImpulse=(ctx,seconds)=>{const length=Math.max(1,Math.floor(ctx.sampleRate*seconds)),buffer=ctx.createBuffer(2,length,ctx.sampleRate);for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<length;i++){const fade=Math.pow(1-i/length,2.5);data[i]=(Math.random()*2-1)*fade}}return buffer};
 const setup=()=>{const audio=audioRef.current;if(!audio||nodesRef.current)return;const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;const ctx=new AudioCtx(),source=ctx.createMediaElementSource(audio);
 const bassF=ctx.createBiquadFilter();bassF.type='lowshelf';bassF.frequency.value=120;
 const midF=ctx.createBiquadFilter();midF.type='peaking';midF.frequency.value=1000;midF.Q.value=1;
 const trebleF=ctx.createBiquadFilter();trebleF.type='highshelf';trebleF.frequency.value=8000;
 const highpass=ctx.createBiquadFilter();highpass.type='highpass';
 const lowpass=ctx.createBiquadFilter();lowpass.type='lowpass';
 const dry=ctx.createGain(),wetGain=ctx.createGain(),masterGain=ctx.createGain(),convolver=ctx.createConvolver();
 convolver.buffer=buildImpulse(ctx,room);
 source.connect(bassF);bassF.connect(midF);midF.connect(trebleF);trebleF.connect(highpass);highpass.connect(lowpass);
 lowpass.connect(dry);dry.connect(masterGain);lowpass.connect(convolver);convolver.connect(wetGain);wetGain.connect(masterGain);masterGain.connect(ctx.destination);
 nodesRef.current={ctx,source,bassF,midF,trebleF,highpass,lowpass,dry,wetGain,masterGain,convolver};ctxRef.current=ctx;apply();
 };
 const apply=()=>{const n=nodesRef.current;if(!n)return;n.bassF.gain.setTargetAtTime(bass,n.ctx.currentTime,.015);n.midF.gain.setTargetAtTime(mid,n.ctx.currentTime,.015);n.trebleF.gain.setTargetAtTime(treble,n.ctx.currentTime,.015);n.highpass.frequency.setTargetAtTime(Math.max(20,hp),n.ctx.currentTime,.015);n.lowpass.frequency.setTargetAtTime(Math.max(hp+1,lp),n.ctx.currentTime,.015);n.wetGain.gain.setTargetAtTime(wet/100,n.ctx.currentTime,.015);n.dry.gain.setTargetAtTime(1-wet/100,n.ctx.currentTime,.015);n.masterGain.gain.setTargetAtTime(master/100,n.ctx.currentTime,.015)};
 useEffect(()=>{apply()},[bass,mid,treble,hp,lp,wet,master]);
 useEffect(()=>{setMaster(youtubeVolume)},[youtubeVolume]);
 useEffect(()=>{const n=nodesRef.current;if(n&&n.convolver)n.convolver.buffer=buildImpulse(n.ctx,room)},[room]);
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);ctxRef.current?.close()},[]);
 const choose=e=>{const f=e.target.files?.[0];if(!f)return;if(urlRef.current)URL.revokeObjectURL(urlRef.current);urlRef.current=URL.createObjectURL(f);setFile(f);setFileKey(k=>k+1);setPlaying(false);ctxRef.current?.close();ctxRef.current=null;nodesRef.current=null};
 const toggle=async()=>{const audio=audioRef.current;if(!audio||!file)return;setup();if(ctxRef.current?.state==='suspended')await ctxRef.current.resume();if(audio.paused){await audio.play();setPlaying(true)}else{audio.pause();setPlaying(false)}};
 const preset=(b,m,t,w)=>{setBass(b);setMid(m);setTreble(t);setWet(w)};
 return <section className={`audio-mixer mixer-v2 ${hidden?'mixer-hidden':''}`}><header className="mixer-header"><div><small>WEB AUDIO ENGINE · V2</small><h2>Audio Mixer Pro</h2></div><span className="mixer-badge">ระบบประมวลผลไฟล์เสียง</span></header>
 <div className="mixer-upload"><label className="file-pick">＋ เลือกไฟล์เพลง<input type="file" accept="audio/*" onChange={choose}/></label><span className="mixer-filename">{file?.name||'ยังไม่ได้เลือกไฟล์'}</span><button disabled={!file} onClick={toggle}>{playing?'⏸ หยุด':'▶ เล่นไฟล์'}</button><audio key={fileKey} ref={audioRef} onEnded={()=>setPlaying(false)} onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)} /></div>
 <div className="mixer-presets"><button onClick={()=>preset(6,0,2,15)}>Bass Boost</button><button onClick={()=>preset(-2,3,4,8)}>Vocal Clear</button><button onClick={()=>preset(0,0,0,0)}>Flat</button><button onClick={()=>preset(2,1,1,30)}>Room</button></div>
 <div className="mixer-section"><h3>3-Band EQ <small>Gain · dB</small></h3><div className="mixer-sliders">{[['Bass',bass,setBass],['Mid',mid,setMid],['Treble',treble,setTreble]].map(([name,val,set])=><label key={name}><b>{name}</b><span>{val>0?'+':''}{val} dB</span><input type="range" min="-12" max="12" step="1" value={val} onChange={e=>set(Number(e.target.value))}/></label>)}</div></div>
 <div className="mixer-section"><h3>Crossover / Filter</h3><label className="mixer-range"><span>High-pass · ตัดเสียงต่ำ</span><b>{hp} Hz</b><input type="range" min="20" max="1000" step="10" value={hp} onChange={e=>setHp(Number(e.target.value))}/></label><label className="mixer-range"><span>Low-pass · ตัดเสียงสูง</span><b>{lp>=20000?'20 kHz':lp+' Hz'}</b><input type="range" min="1000" max="20000" step="100" value={lp} onChange={e=>setLp(Number(e.target.value))}/></label></div>
 <div className="mixer-section"><h3>Reverb</h3><label className="mixer-range"><span>Wet mix</span><b>{wet}%</b><input type="range" min="0" max="100" value={wet} onChange={e=>setWet(Number(e.target.value))}/></label><label className="mixer-range"><span>Room decay</span><b>{room.toFixed(1)} s</b><input type="range" min="0.5" max="4" step="0.1" value={room} onChange={e=>setRoom(Number(e.target.value))}/></label><p className="mixer-note">ปรับความยาวเสียงก้องและสัดส่วนเสียงสะท้อนแบบเรียลไทม์</p></div>
 <div className="mixer-section"><h3>Master Output</h3><label className="mixer-range"><span>ระดับเสียง</span><b>{master}%</b><input type="range" min="0" max="100" value={master} onChange={e=>{const value=Number(e.target.value);setMaster(value);onYoutubeVolumeChange?.(value)}}/></label></div>
 <div className="mixer-warning">Master Output ควบคุม Volume ของ YouTube ในคิวหลักได้ ส่วน EQ / Crossover / Reverb ใช้กับไฟล์เสียงที่เลือกเท่านั้น</div></section>
}
