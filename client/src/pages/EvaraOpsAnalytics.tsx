import React, { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Play, Square, Settings, Activity, Zap, Droplets, Clock, AlertCircle, CheckCircle2 
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

// Mock data for the trend charts
const trendData = [
  { time: '00:00', level: 30, current: 4.5 },
  { time: '04:00', level: 35, current: 4.8 },
  { time: '08:00', level: 50, current: 6.2 },
  { time: '12:00', level: 75, current: 6.5 },
  { time: '16:00', level: 60, current: 5.8 },
  { time: '20:00', level: 45, current: 6.0 },
  { time: '24:00', level: 40, current: 5.5 },
];

const EvaraOpsAnalytics = () => {
  const { hardwareId } = useParams<{ hardwareId: string }>();
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRunning, setIsRunning] = useState(true);


  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!hardwareId) return <Navigate to="/nodes" replace />;

  return (
    <div className="min-h-screen bg-[#F0F4F8] text-[#1A202C] font-sans pt-[85px] pb-6 px-6 overflow-x-hidden">
      {/* Header removed as requested */}


      {/* ── Main Dashboard Grid ── */}
      <div className="grid grid-cols-12 gap-6 mt-6">
        
        {/* Left Column: Motor Status & Volume */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/40 flex-1 flex flex-col items-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-8 w-full text-center">Motor Status</h2>
            
            <div className="mb-10">
              <span className={clsx(
                "px-8 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all",
                isRunning ? "bg-green-500/20 text-green-600 border border-green-500/30" : "bg-red-500/20 text-red-600 border border-red-500/30"
              )}>
                {isRunning ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="w-full space-y-8">

              <div className="flex justify-between items-center group">
                <span className="text-slate-500 font-bold group-hover:text-blue-600 transition-colors">Voltage (L-L)</span>
                <span className="text-xl font-black text-slate-800">415 <span className="text-sm font-bold text-slate-400 ml-1">V</span></span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-slate-500 font-bold group-hover:text-blue-600 transition-colors">Current (Avg)</span>
                <span className="text-xl font-black text-blue-600">6.2 <span className="text-sm font-bold text-blue-400 ml-1">A</span></span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-slate-500 font-bold group-hover:text-blue-600 transition-colors">Power (kW)</span>
                <span className="text-xl font-black text-slate-800">3.2 <span className="text-sm font-bold text-slate-400 ml-1">kW</span></span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-slate-500 font-bold group-hover:text-blue-600 transition-colors">Frequency</span>
                <span className="text-xl font-black text-slate-800">50.0 <span className="text-sm font-bold text-slate-400 ml-1">Hz</span></span>
              </div>
            </div>
            
            <div className="mt-auto pt-8 w-full">
              <button className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-xl transition-all flex items-center justify-center gap-2 border border-dashed border-slate-200">
                <Settings size={16} />
                <span className="text-[10px] font-black uppercase tracking-wider">Configure Limits</span>
              </button>
            </div>
          </div>

          {/* Water Level & Volume Card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/40 text-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6">Water Level & Volume</h2>
            <div className="mb-6">
              <p className="text-4xl font-black text-blue-600 leading-none">45%</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Water Level</p>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-800 leading-none">22,500 <span className="text-sm text-slate-400 ml-1">L</span></p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Volume</p>
            </div>
          </div>
        </div>


        {/* Middle Column: Building Visualization */}
        <div className="col-span-12 lg:col-span-6">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/40 h-full min-h-[600px] relative overflow-hidden flex flex-col items-center justify-center">
            {/* ── Realistic System Visualization ── */}
            <div className="relative w-full h-full min-h-[550px] flex items-center justify-center">
              <svg width="100%" height="100%" viewBox="0 0 500 600" className="max-w-[500px] drop-shadow-2xl">
                <g transform="translate(30, 0)">
                  {/* Building Base/Foundation - Centered under building with gap to motor */}
                  <rect x="120" y="520" width="300" height="20" fill="#718096" />
                  <rect x="130" y="515" width="280" height="5" fill="#A0AEC0" />


                  {/* Multi-story Building Body */}
                  <rect x="130" y="240" width="280" height="275" fill="#F7FAFC" stroke="#CBD5E0" strokeWidth="2" />
                  
                  {/* Floor Dividers */}
                  {[0, 1, 2, 3].map(i => (
                    <rect key={`floor-${i}`} x="130" y={305 + i * 68} width="280" height="4" fill="#E2E8F0" />
                  ))}

                  {/* Windows with Realistic Shading */}
                  {[0, 1, 2, 3].map(row => (
                    <React.Fragment key={`win-row-${row}`}>
                      {[0, 1, 2].map(col => {
                        // Don't render the 3rd window on the bottom floor (where the door is)
                        if (row === 3 && col === 2) return null;
                        
                        return (
                          <g key={`win-${row}-${col}`} transform={`translate(${165 + col * 90}, ${265 + row * 68})`}>
                            <rect width="40" height="35" fill="#BEE3F8" stroke="#4A5568" strokeWidth="1.5" />
                            <rect x="1" y="1" width="38" height="33" fill="url(#windowGlass)" />
                            <line x1="20" y1="0" x2="20" y2="35" stroke="#4A5568" strokeWidth="1" />
                          </g>
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* Double Door Entrance */}
                  <g transform="translate(340, 445)">
                    <rect width="50" height="70" fill="#4A2C2A" stroke="#2D3748" strokeWidth="1" />
                    <rect width="24" height="70" fill="#3D2321" />
                    <circle cx="20" cy="35" r="2" fill="#ECC94B" />
                    <circle cx="30" cy="35" r="2" fill="#ECC94B" />
                  </g>

                  {/* Overhead Tank System */}
                  <g transform="translate(165, 115)">
                    {/* Main Tank Body */}
                    <rect width="210" height="125" rx="4" fill="white" stroke="#4A5568" strokeWidth="2" />
                    {/* Water Level Indicator */}
                    <rect x="4" y="45" width="202" height="61" fill="url(#tankWater)" rx="2" />
                    {/* Tank Rim */}
                    <rect width="210" height="8" fill="#CBD5E0" stroke="#4A5568" strokeWidth="1" rx="2" />
                  </g>

                  {/* Water Level Sensor - Realistic Stepped Design */}
                  <g transform="translate(250, 40)">
                    <rect x="-12" y="0" width="24" height="15" rx="2" fill="#4A5568" stroke="#1A202C" strokeWidth="1" />
                    <rect x="-8" y="15" width="16" height="8" fill="#2D3748" stroke="#1A202C" strokeWidth="1" />
                    <rect x="-4" y="23" width="8" height="5" fill="#1A202C" />
                    <text x="25" y="18" className="text-[10px] font-black fill-slate-500 uppercase tracking-widest">Water Level Sensor</text>
                    {/* Restored Green Dashed line to water */}
                    <line x1="0" y1="30" x2="0" y2="145" stroke="#48BB78" strokeWidth="2" strokeDasharray="6 4" />
                  </g>



                  {/* Main Pumping Pipe - Border Layer (Curved) */}
                  <path 
                    d="M 90 490 L 90 100 Q 90 80 110 80 L 200 80 Q 220 80 220 100" 
                    fill="none" 
                    stroke="#2D3748" 
                    strokeWidth="15" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                  {/* Main Pumping Pipe - Fill Layer (Curved) */}
                  <path 
                    d="M 90 490 L 90 100 Q 90 80 110 80 L 200 80 Q 220 80 220 100" 
                    fill="none" 
                    stroke="url(#pipeGradient)" 
                    strokeWidth="11" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />

                  {/* Decorative Pipe Rings for Realism */}
                  <rect x="82" y="105" width="16" height="4" rx="1" fill="#4A5568" />
                  <rect x="115" y="77" width="4" height="6" rx="1" fill="#4A5568" />
                  <rect x="195" y="77" width="4" height="6" rx="1" fill="#4A5568" />
                </g>

                <defs>
                  <linearGradient id="windowGlass" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#EBF8FF" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#3182CE" stopOpacity="0.4" />
                  </linearGradient>
                  <linearGradient id="tankWater" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#63B3ED" />
                    <stop offset="100%" stopColor="#3182CE" />
                  </linearGradient>
                  <linearGradient id="pipeGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#A0AEC0" />
                    <stop offset="50%" stopColor="#CBD5E0" />
                    <stop offset="100%" stopColor="#718096" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Realistic 3D Isometric Motor/Pump */}
              <div className="absolute left-[65px] bottom-[80px] flex flex-col items-center z-30 group scale-[0.95] origin-bottom">
                
                {/* Motor Body & Components (SVG for better geometry) */}
                <svg width="140" height="120" viewBox="0 0 140 120" className="drop-shadow-lg">
                  {/* Base Plate (Bottom) */}
                  <rect x="10" y="90" width="120" height="15" rx="2" fill="#4A5568" stroke="#2D3748" strokeWidth="1" />
                  <rect x="10" y="90" width="120" height="5" rx="1" fill="#718096" />

                  {/* Top Terminal Box */}
                  <rect x="55" y="15" width="40" height="15" rx="2" fill="#276749" stroke="#1A202C" strokeWidth="1.5" />
                  <rect x="55" y="15" width="40" height="4" rx="1" fill="#2F855A" />

                  {/* Main Cylindrical Body (Isometric) */}
                  <g transform="translate(45, 30)">
                    {/* Ribbed Body */}
                    <rect width="80" height="60" rx="4" fill="#2F855A" stroke="#1A202C" strokeWidth="1.5" />
                    {/* Cooling Fins */}
                    {[...Array(7)].map((_, i) => (
                      <line key={i} x1="5" y1={10 + i * 7} x2="75" y2={10 + i * 7} stroke="#1A202C" strokeWidth="1" strokeOpacity="0.3" />
                    ))}
                    {/* Highlights */}
                    <rect x="2" y="2" width="76" height="5" rx="2" fill="white" fillOpacity="0.1" />
                  </g>

                  {/* Front Circular Face/Bearing Cap */}
                  <g transform="translate(15, 35)">
                    <circle cx="30" cy="30" r="32" fill="#1C4532" stroke="#1A202C" strokeWidth="2" />
                    <circle cx="30" cy="30" r="28" fill="url(#motorFrontGrad)" stroke="#1A202C" strokeWidth="1" />
                    
                    {/* Rotating Fan visualization inside */}
                    <g transform="translate(30, 30)">
                      <g className={clsx(isRunning && "animate-spin [animation-duration:1s]")}>
                        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                          <line key={deg} x1="0" y1="0" x2="20" y2="0" stroke="white" strokeWidth="1.5" strokeOpacity="0.1" transform={`rotate(${deg})`} />
                        ))}
                      </g>
                    </g>

                    {/* Front Rim Detail */}
                    <circle cx="30" cy="30" r="32" fill="none" stroke="white" strokeOpacity="0.05" strokeWidth="1" />
                  </g>

                  {/* Connection Point to Pipe */}
                  <rect x="110" y="45" width="15" height="15" rx="2" fill="#276749" stroke="#1A202C" strokeWidth="1.5" />

                  <defs>
                    <linearGradient id="motorFrontGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#2F855A" />
                      <stop offset="100%" stopColor="#1C4532" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>


              {/* Realistic Curved Flow Animation (Following the pipe path) */}
              {isRunning && (
                <svg 
                  className="absolute inset-0 w-full h-full pointer-events-none z-20"
                  viewBox="0 0 500 600"
                >
                  <g transform="translate(30, 0)">
                    <path 
                      d="M 90 490 L 90 100 Q 90 80 110 80 L 200 80 Q 220 80 220 100" 
                      fill="none" 
                      stroke="white" 
                      strokeWidth="4" 
                      strokeDasharray="10 20" 
                      strokeLinecap="round"
                      className="animate-flow-path"
                      opacity="0.6"
                    />
                  </g>
                </svg>
              )}



            </div>

            <style>{`
              @keyframes flow-path {
                from { stroke-dashoffset: 60; }
                to { stroke-dashoffset: 0; }
              }
              .animate-flow-path {
                animation: flow-path 1.5s linear infinite;
              }
            `}</style>
          </div>
        </div>



        {/* Right Column: Control & Stats */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          
          {/* Motor Control */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/40">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 text-center">Motor Control</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button 
                onClick={() => setIsRunning(true)}
                className={clsx(
                  "flex flex-col items-center justify-center gap-2 p-4 rounded-xl shadow-lg transition-all active:scale-95 group",
                  isRunning ? "bg-[#28A745] cursor-default" : "bg-slate-100 hover:bg-[#28A745] text-slate-400 hover:text-white"
                )}
              >
                <Play size={20} className={clsx("transition-transform group-hover:scale-110", isRunning ? "fill-white" : "fill-slate-400 group-hover:fill-white")} />
                <span className="text-[10px] font-black uppercase tracking-widest">Start</span>
              </button>
              <button 
                onClick={() => setIsRunning(false)}
                className={clsx(
                  "flex flex-col items-center justify-center gap-2 p-4 rounded-xl shadow-lg transition-all active:scale-95 group",
                  !isRunning ? "bg-[#DC3545] cursor-default" : "bg-slate-100 hover:bg-[#DC3545] text-slate-400 hover:text-white"
                )}
              >
                <Square size={20} className={clsx("transition-transform group-hover:scale-110", !isRunning ? "fill-white" : "fill-slate-400 group-hover:fill-white")} />
                <span className="text-[10px] font-black uppercase tracking-widest">Stop</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mode</span>
                <span className="text-sm font-black text-green-600">Manual</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
                <span className={clsx(
                  "text-sm font-black uppercase transition-colors",
                  isRunning ? "text-green-600" : "text-red-600"
                )}>
                  {isRunning ? "Running" : "Stopped"}
                </span>
              </div>

            </div>
          </div>

          {/* Water Level Trend */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-4 shadow-2xl border border-white/40 flex-1 flex flex-col">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">Water Level Trend (Today)</h2>
            <div className="flex-1 min-h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3182CE" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3182CE" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="level" 
                    stroke="#3182CE" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorLevel)" 
                  />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                    labelStyle={{ color: '#718096' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between px-2 mt-2">
              <span className="text-[8px] font-bold text-slate-400">00:00</span>
              <span className="text-[8px] font-bold text-slate-400">12:00</span>
              <span className="text-[8px] font-bold text-slate-400">24:00</span>
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="col-span-12 lg:col-span-6 grid grid-cols-1 md:grid-cols-1 gap-6">
           {/* Current Consumption Chart */}
           <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/40">
             <div className="flex justify-between items-end mb-6">
               <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Current Consumption (Today)</h2>
               <div className="text-right">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Average Current</p>
                 <p className="text-xl font-black text-blue-600">6.2 <span className="text-sm font-bold text-blue-400">A</span></p>
               </div>
             </div>
             <div className="h-[200px]">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4A90E2" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4A90E2" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F7" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A0AEC0', fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A0AEC0', fontWeight: 'bold' }} />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="current" 
                      stroke="#4A90E2" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorCurrent)" 
                      dot={{ r: 4, fill: '#4A90E2', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </AreaChart>
               </ResponsiveContainer>
             </div>
           </div>
        </div>

        <div className="col-span-12 lg:col-span-3">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/40 h-full">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-8 text-center">Today's Summary</h2>
            <div className="grid grid-cols-1 gap-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500">
                  <Clock size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Pump Run Time</p>
                  <p className="text-xl font-black text-slate-800">02:35:20</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-500">
                  <Play size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Start Count</p>
                  <p className="text-xl font-black text-slate-800">8</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                  <Zap size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Energy (kWh)</p>
                  <p className="text-xl font-black text-slate-800">12.45</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/40 h-full flex flex-col items-center justify-center relative overflow-hidden">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 absolute top-6">Recent Alarms</h2>
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-sm">
                <CheckCircle2 size={40} className="text-green-500" />
              </div>
              <p className="text-lg font-black text-green-600">No Active Alarms</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">System healthy</p>
            </div>
            <button className="mt-8 text-[10px] font-black uppercase tracking-widest text-blue-500 hover:underline">
              View History
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};


export default EvaraOpsAnalytics;
