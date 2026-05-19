import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { 
  Satellite, 
  Thermometer, 
  Droplets, 
  Wind, 
  Move3d, 
  Signal, 
  SignalLow,
  Clock,
  Activity,
  ChevronRight
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { motion, AnimatePresence } from "motion/react";

// Initialize Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || (typeof process !== "undefined" ? process.env.VITE_SUPABASE_URL : null);
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || (typeof process !== "undefined" ? process.env.VITE_SUPABASE_ANON_KEY : null);
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

interface Telemetry {
  sat_token: string;
  temperature: number;
  humidity: number;
  gas_percent: number;
  x_axis: number;
  y_axis: number;
  z_axis: number;
  timestamp: string;
}

export default function App() {
  const [selectedSat, setSelectedSat] = useState<string | null>(null);
  const [fleetStatus, setFleetStatus] = useState<Record<string, Telemetry>>({});
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [status, setStatus] = useState<"connected" | "disconnected" | "waiting">("waiting");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setStatus("disconnected");
      return;
    }

    // 1. Fetch Latest State for All Satellites
    const fetchFleet = async () => {
      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
      
      const { data, error } = await supabase
        .from("telemetry")
        .select("*")
        .gt("created_at", tenSecondsAgo) // Only fetch very recent ones
        .order("created_at", { ascending: false });

      if (data && !error) {
        const fleet: Record<string, Telemetry> = {};
        data.forEach(item => {
          if (!fleet[item.sat_token]) {
            fleet[item.sat_token] = {
              sat_token: item.sat_token,
              temperature: item.temperature,
              humidity: item.humidity,
              gas_percent: item.gas_percent,
              x_axis: item.x_axis,
              y_axis: item.y_axis,
              z_axis: item.z_axis,
              timestamp: new Date(item.created_at).toLocaleTimeString(),
              lastSeen: new Date(item.created_at).getTime() // SYNC TIMESTAMP
            } as any;
          }
        });
        setFleetStatus(fleet);
      }
    };

    fetchFleet();

    // 2. Real-time Subscription
    const channel = supabase
      .channel("fleet-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "telemetry" },
        (payload) => {
          const newData: Telemetry = {
            sat_token: payload.new.sat_token,
            temperature: payload.new.temperature,
            humidity: payload.new.humidity,
            gas_percent: payload.new.gas_percent,
            x_axis: payload.new.x_axis,
            y_axis: payload.new.y_axis,
            z_axis: payload.new.z_axis,
            timestamp: new Date(payload.new.created_at).toLocaleTimeString()
          };

          setFleetStatus(prev => ({ 
            ...prev, 
            [newData.sat_token]: { ...newData, lastSeen: Date.now() } 
          }));

          if (newData.sat_token === selectedSat) {
            setTelemetry(newData);
            setHistory(prev => [...prev.slice(-19), newData]);
          }
          setStatus("connected");
        }
      )
      .subscribe();

    // 3. Heartbeat Monitor: Remove cards that haven't pinged in 10s
    const heartbeatInterval = setInterval(() => {
      setFleetStatus(prev => {
        const next = { ...prev };
        const now = Date.now();
        let changed = false;
        
        Object.keys(next).forEach(token => {
          const lastSeen = (next[token] as any).lastSeen || 0;
          // If we haven't seen an update in 10 seconds, remove from UI
          if (now - lastSeen > 10000) {
            delete next[token];
            changed = true;
          }
        });
        
        return changed ? next : prev;
      });
    }, 3000);

    return () => { 
      supabase.removeChannel(channel);
      clearInterval(heartbeatInterval);
    };
  }, [selectedSat]);

  // Handle Satellite Selection History Fetch
  useEffect(() => {
    if (!selectedSat || !supabase) return;

    const fetchSatHistory = async () => {
      const { data } = await supabase
        .from("telemetry")
        .select("*")
        .eq("sat_token", selectedSat)
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) {
        const formatted = data.map(item => ({
          sat_token: item.sat_token,
          temperature: item.temperature,
          humidity: item.humidity,
          gas_percent: item.gas_percent,
          x_axis: item.x_axis,
          y_axis: item.y_axis,
          z_axis: item.z_axis,
          timestamp: new Date(item.created_at).toLocaleTimeString()
        })).reverse();
        setHistory(formatted);
        setTelemetry(formatted[formatted.length - 1] || null);
      }
    };

    fetchSatHistory();
  }, [selectedSat]);

  const lastUpdateDuration = useMemo(() => {
    if (!telemetry) return "--";
    return "LIVE";
  }, [telemetry]);

  if (!supabase) {
    return (
      <div className="min-h-screen bg-dash-bg flex items-center justify-center p-6 font-mono">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-dash-card border border-dash-border p-8 rounded-2xl shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-6 text-amber-glow">
            <SignalLow className="w-8 h-8" />
            <h1 className="text-xl font-bold tracking-tighter uppercase">Config Required</h1>
          </div>
          
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
             Ground Station requires a Supabase connection to receive satellite telemetry.
          </p>

          <div className="space-y-4 mb-8">
            <div className="p-3 bg-black/40 rounded-lg border border-dash-border">
              <div className="text-[10px] text-zinc-500 mb-1">STEP 1</div>
              <div className="text-xs">Create a <code className="text-cyan-glow">telemetry</code> table in Supabase.</div>
            </div>
            <div className="p-3 bg-black/40 rounded-lg border border-dash-border">
              <div className="text-[10px] text-zinc-500 mb-1">STEP 2</div>
              <div className="text-xs">Copy your URL & Anon Key from Settings -{">"} API.</div>
            </div>
            <div className="p-3 bg-black/40 rounded-lg border border-dash-border">
              <div className="text-[10px] text-zinc-500 mb-1">STEP 3</div>
              <div className="text-xs">Add <code className="text-cyan-glow">VITE_SUPABASE_URL</code> and <code className="text-cyan-glow">VITE_SUPABASE_ANON_KEY</code> to the **Secrets** panel.</div>
            </div>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 border border-dash-border rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Check Configuration
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 relative overflow-hidden">
      <div className="scanline" />
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-dash-border pb-6">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setSelectedSat(null)}
            className="transition-transform hover:scale-105 active:scale-95"
            title="Return to Fleet Overview"
          >
            <img 
              src="/src/assets/images/logo.png" 
              alt="Lab of Future" 
              className="h-16 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </button>
          <div className="h-10 w-px bg-dash-border hidden md:block" />
          <div>
            <h1 className="text-2xl font-bold tracking-tighter uppercase font-mono text-zinc-100">
              Satellite Fleet Station
            </h1>
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
              <Activity className="w-3 h-3" />
              <span>{selectedSat ? `TRACKING: ${selectedSat}` : "FLEET OVERVIEW"}</span>
              <ChevronRight className="w-3 h-3" />
              <span className={status === "connected" ? "text-cyan-glow" : "text-red-500"}>
                {status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 font-mono">
          <div className="px-4 py-2 bg-dash-card border border-dash-border rounded-md text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center justify-end gap-1">
              <Clock className="w-3 h-3" /> Mission Time
            </div>
            <div className="text-lg font-medium">{currentTime.toLocaleTimeString()}</div>
          </div>
        </div>
      </header>

      {/* DASHBOARD GRID */}
      {!selectedSat ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {Object.values(fleetStatus).map((sat) => (
              <motion.div 
                key={sat.sat_token}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4 }}
                onClick={() => setSelectedSat(sat.sat_token)}
                className="bg-dash-card border border-dash-border p-6 rounded-2xl cursor-pointer hover:border-cyan-glow/50 transition-all group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-zinc-900 border border-dash-border rounded-xl text-cyan-glow group-hover:bg-cyan-glow/10">
                    <Satellite className="w-6 h-6" />
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Signal Strength</div>
                    <div className="text-cyan-glow font-mono text-sm">94%</div>
                  </div>
                </div>
                
                <h3 className="text-xl font-bold font-mono mb-1">{sat.sat_token}</h3>
                <p className="text-[10px] text-zinc-500 font-mono mb-6 uppercase tracking-wider">Last Ping: {sat.timestamp}</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-black/40 rounded-lg border border-dash-border">
                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Temp</div>
                    <div className="text-lg font-mono text-amber-glow">{sat.temperature.toFixed(1)}°</div>
                  </div>
                  <div className="p-3 bg-black/40 rounded-lg border border-dash-border">
                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Humid</div>
                    <div className="text-lg font-mono text-cyan-glow">{sat.humidity.toFixed(0)}%</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {Object.keys(fleetStatus).length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-600 font-mono italic">
              <Activity className="w-12 h-12 mb-4 opacity-20" />
              Scanning for telemetry broadcast...
            </div>
          )}
        </div>
      ) : (
        <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-full flex justify-between items-center mb-2">
            <button 
              onClick={() => setSelectedSat(null)}
              className="text-[10px] font-mono text-zinc-500 hover:text-cyan-glow flex items-center gap-1 uppercase tracking-widest group"
            >
              <ChevronRight className="w-3 h-3 rotate-180 group-hover:-translate-x-1 transition-transform" />
              Back to Fleet
            </button>
          </div>
          
          {/* SENSOR CARDS */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SensorCard 
              icon={<Thermometer className="w-5 h-5" />}
              label="Temperature"
              value={telemetry?.temperature}
              unit="°C"
              color="amber"
              min={0}
              max={50}
            />
            <SensorCard 
              icon={<Droplets className="w-5 h-5" />}
              label="Humidity"
              value={telemetry?.humidity}
              unit="%"
              color="cyan"
              min={0}
              max={100}
            />
            <SensorCard 
              icon={<Wind className="w-5 h-5" />}
              label="Gas Density"
              value={telemetry?.gas_percent}
              unit="%"
              color="zinc"
              min={0}
              max={100}
            />
          </div>

          {/* ORIENTATION CARD */}
          <div className="bg-dash-card border border-dash-border rounded-xl p-6 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Move3d className="w-5 h-5 text-zinc-400" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Orientation</h2>
              </div>
            </div>
            
            <div className="space-y-4">
              <AxisRow label="X-AXIS" value={telemetry?.x_axis ?? 0} color="text-red-400" />
              <AxisRow label="Y-AXIS" value={telemetry?.y_axis ?? 0} color="text-green-400" />
              <AxisRow label="Z-AXIS" value={telemetry?.z_axis ?? 0} color="text-blue-400" />
            </div>

            <div className="mt-8 flex justify-center">
              <motion.div 
                className="w-24 h-24 border-2 border-dash-border border-dashed rounded-lg flex items-center justify-center p-2"
                animate={{
                  rotateX: (telemetry?.x_axis ?? 0) * 0.5,
                  rotateY: (telemetry?.y_axis ?? 0) * 0.5,
                  rotateZ: (telemetry?.z_axis ?? 0) * 0.5,
                }}
                transition={{ type: "spring", stiffness: 50 }}
              >
                <div className="w-full h-full bg-cyan-glow/20 border border-cyan-glow/50 rounded flex items-center justify-center">
                  <Satellite className="w-10 h-10 text-cyan-glow/70" />
                </div>
              </motion.div>
            </div>
          </div>

          {/* HISTORY CHART */}
          <div className="md:col-span-2 bg-dash-card border border-dash-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Environmental History</h2>
            </div>
            
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorHumid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis dataKey="timestamp" hide={history.length < 5} stroke="#52525b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} labelStyle={{ color: "#52525b", fontSize: "10px" }} />
                  <Area type="monotone" dataKey="temperature" stroke="#fbbf24" fillOpacity={1} fill="url(#colorTemp)" strokeWidth={2} isAnimationActive={false} />
                  <Area type="monotone" dataKey="humidity" stroke="#22d3ee" fillOpacity={1} fill="url(#colorHumid)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* LOG PANEL */}
          <div className="bg-dash-card border border-dash-border rounded-xl flex flex-col h-full bg-black/40">
            <div className="p-4 border-b border-dash-border">
              <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase">Satellite Logs</span>
            </div>
            <div className="flex-1 p-4 font-mono text-[10px] leading-relaxed space-y-2 overflow-y-auto max-h-[300px]">
              <AnimatePresence initial={false}>
                {[...history].reverse().map((entry, idx) => (
                  <motion.div key={entry.timestamp + idx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 text-zinc-400">
                    <span className="text-zinc-600">[{entry.timestamp}]</span>
                    <span>T:{entry.temperature}°C H:{entry.humidity}% G:{entry.gas_percent}%</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </main>
      )}

      {/* FOOTER */}
      <footer className="mt-auto pt-6 border-t border-dash-border flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono text-zinc-500">
        <div className="flex gap-6 uppercase tracking-widest order-2 md:order-1">
          <span>Satellite System v6.0.0</span>
          <span>Gateway: Supabase PostgREST</span>
          <span>Protocol: RT Broadcast</span>
        </div>
        
        <div className="flex items-center gap-2 order-1 md:order-2 opacity-100 transition-all cursor-default">
          <img 
            src="/src/assets/images/lab_of_future_logo_white_1779009740744.png" 
            alt="Lab of Future" 
            className="h-6 w-auto"
            referrerPolicy="no-referrer"
          />
          <span className="hidden md:inline">DESIGNED FOR LAB OF FUTURE</span>
        </div>
      </footer>
    </div>
  );
}

function SensorCard({ icon, label, value, unit, color, min, max }: { 
  icon: React.ReactNode, 
  label: string, 
  value?: number, 
  unit: string, 
  color: "cyan" | "amber" | "zinc",
  min: number,
  max: number
}) {
  const percentage = value != null ? Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100) : 0;
  const colorClass = color === "cyan" ? "text-cyan-glow" : color === "amber" ? "text-amber-glow" : "text-zinc-300";
  const borderClass = color === "cyan" ? "bg-cyan-glow/20" : color === "amber" ? "bg-amber-glow/20" : "bg-zinc-500/20";
  const glowClass = color === "cyan" ? "shadow-[0_0_15px_-5px_#22d3ee]" : color === "amber" ? "shadow-[0_0_15px_-5px_#fbbf24]" : "";

  return (
    <div className="bg-dash-card border border-dash-border rounded-xl p-5 group transition-all hover:bg-zinc-800/50">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg bg-zinc-900 border border-dash-border ${colorClass}`}>
          {icon}
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-300 transition-colors">{label}</span>
      </div>
      
      <div className="flex items-baseline gap-1 mb-4">
        <span className={`text-4xl font-mono font-medium ${colorClass} ${glowClass}`}>
          {value != null ? value.toFixed(1) : "--.-"}
        </span>
        <span className="text-sm font-mono text-zinc-600">{unit}</span>
      </div>

      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
        <motion.div 
          className={`h-full ${borderClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: "spring", stiffness: 100 }}
        />
      </div>
    </div>
  );
}

function AxisRow({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="flex items-center justify-between font-mono text-xs">
      <span className="text-zinc-500">{label}</span>
      <div className="flex items-center gap-2 flex-1 mx-4">
        <div className="h-0.5 flex-1 bg-zinc-900 rounded-full relative">
          <motion.div 
            className={`absolute top-0 bottom-0 w-0.5 ${color.replace('text-', 'bg-')}`}
            animate={{ left: `${(value + 100) / 2}%` }}
          />
        </div>
      </div>
      <span className={`font-medium w-12 text-right ${color}`}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}
