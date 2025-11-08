import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, query } from 'firebase/firestore';
import { Zap, DollarSign, Cloud, Heart, BarChart2, ShieldCheck, RefreshCw } from 'lucide-react';

// --- INITIAL CONFIG & GLOBAL STATE HOOK ---
const useFirebase = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase config is missing.");
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authInstance = getAuth(app);
        
        setDb(firestore);
        setAuth(authInstance);

        onAuthStateChanged(authInstance, async (user) => {
            if (!user) {
                if (initialAuthToken) {
                    try {
                        const credential = await signInWithCustomToken(authInstance, initialAuthToken);
                        setUserId(credential.user.uid);
                    } catch (error) {
                        console.error("Custom token sign-in failed, falling back to anonymous:", error);
                        await signInAnonymously(authInstance);
                        setUserId(authInstance.currentUser.uid);
                    }
                } else {
                    await signInAnonymously(authInstance);
                    setUserId(authInstance.currentUser.uid);
                }
            } else {
                setUserId(user.uid);
            }
            setIsAuthReady(true);
        });

    }, []);

    const interventionCollectionRef = useMemo(() => {
        if (!db || !userId) return null;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        // Path: /artifacts/{appId}/users/{userId}/odas_interventions
        return collection(db, `artifacts/${appId}/users/${userId}/odas_interventions`);
    }, [db, userId]);

    return { db, auth, userId, isAuthReady, interventionCollectionRef };
};


// --- ODAS LOGIC CORE: ORCHESTRATION ---

// 1. Thresholds for Intervention (Batas Kritis)
const INTERVENTION_THRESHOLDS = {
  // Jalur Finansial
  MAX_VOLATILITY: 0.15, // > 15% volatilitas memerlukan intervensi
  MIN_LIQUIDITY: 100000, // < 100K likuiditas memerlukan intervensi
  // Jalur Infrastruktur
  MAX_LATENCY: 150, // > 150ms latency memerlukan intervensi
  // Jalur Persona
  MIN_SENTIMENT: 0.40, // < 40% sentimen publik positif memerlukan intervensi
  // Jalur Sensor
  MAX_ANOMALY_SCORE: 0.85, // > 85% skor anomali memerlukan intervensi
};

/**
 * Fungsi inti ODAS: Mengorkestrasi kontrol seluruh jalur digital.
 * @param {object} pathData - Data real-time dari setiap jalur digital.
 * @returns {object} - Status orkestrasi dan intervensi yang terdeteksi.
 */
const orchestrateControl = (pathData) => {
  const interventions = [];

  // Pengecekan Jalur Finansial (UmbraQuant)
  if (pathData.assetVolatility > INTERVENTION_THRESHOLDS.MAX_VOLATILITY) {
    interventions.push({
      path: 'Finansial',
      description: `Volatilitas aset Kritis (${(pathData.assetVolatility * 100).toFixed(1)}%). Memerlukan Chronos Executor (CE) Lock.`,
      severity: 'Kritis',
    });
  }
  if (pathData.marketLiquidity < INTERVENTION_THRESHOLDS.MIN_LIQUIDITY) {
    interventions.push({
      path: 'Finansial',
      description: `Likuiditas rendah: $${pathData.marketLiquidity.toFixed(0)}. Memerlukan injeksi dana/stabilisasi.`,
      severity: 'Peringatan',
    });
  }

  // Pengecekan Jalur Infrastruktur (CCE)
  if (pathData.systemLatency > INTERVENTION_THRESHOLDS.MAX_LATENCY) {
    interventions.push({
      path: 'Infrastruktur',
      description: `Latency sistem Kritis (${pathData.systemLatency.toFixed(0)}ms). Memerlukan realokasi sumber daya I/O.`,
      severity: 'Kritis',
    });
  }

  // Pengecekan Jalur Persona (PersonaFrame Engine)
  if (pathData.publicSentiment < INTERVENTION_THRESHOLDS.MIN_SENTIMENT) {
    interventions.push({
      path: 'Persona',
      description: `Sentimen Publik Rendah (${(pathData.publicSentiment * 100).toFixed(0)}%). Memerlukan Narasi Frame Shift Otomatis.`,
      severity: 'Peringatan',
    });
  }

  // Pengecekan Jalur Sensor (UmbraIoT & RRA)
  if (pathData.anomalyScore > INTERVENTION_THRESHOLDS.MAX_ANOMALY_SCORE) {
    interventions.push({
      path: 'Sensor',
      description: `Anomali Data Masif Terdeteksi (${(pathData.anomalyScore * 100).toFixed(0)}%). Memerlukan Recursive Resonance Alert (RRA).`,
      severity: 'Kritis',
    });
  }

  return interventions;
};

// --- REACT COMPONENT START ---

const App = () => {
  const { userId, isAuthReady, interventionCollectionRef } = useFirebase();

  const [pathData, setPathData] = useState({
    assetVolatility: 0.05, // 5%
    marketLiquidity: 500000,
    systemLatency: 50, // ms
    publicSentiment: 0.80, // 80% positif
    anomalyScore: 0.30, // 30% anomali
    lastScan: new Date().toLocaleTimeString(),
  });

  const [interventions, setInterventions] = useState([]);
  const [odasStatus, setOdasStatus] = useState('Initializing...');
  const [isSimulating, setIsSimulating] = useState(false);

  // 1. Fetch real-time interventions from Firestore
  useEffect(() => {
    if (!isAuthReady || !interventionCollectionRef) {
        setOdasStatus('Memuat Database ODAS...');
        return;
    }
    setOdasStatus('ODAS Online');
    setIsSimulating(true);

    const q = query(interventionCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedInterventions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate().toLocaleTimeString() : 'N/A'
        }));
        
        // Sort client-side by time
        fetchedInterventions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setInterventions(fetchedInterventions);
    }, (error) => {
        console.error("Failed to fetch interventions:", error);
        setOdasStatus('DB Error');
    });

    return () => unsubscribe();
  }, [isAuthReady, interventionCollectionRef]);

  // 2. Main ODAS Scan and Logging
  const runOdasScan = useCallback(async () => {
    if (!isSimulating || !interventionCollectionRef) return;

    // Simulate input data fluctuations (Randomness for 'Digital Chaos')
    const newPathData = {
      assetVolatility: Math.min(0.5, pathData.assetVolatility + (Math.random() * 0.1 - 0.05)),
      marketLiquidity: Math.max(0, pathData.marketLiquidity + (Math.random() * 50000 - 30000)),
      systemLatency: Math.min(300, pathData.systemLatency + (Math.random() * 40 - 20)),
      publicSentiment: Math.min(1.0, pathData.publicSentiment + (Math.random() * 0.2 - 0.1)),
      anomalyScore: Math.min(1.0, pathData.anomalyScore + (Math.random() * 0.3 - 0.1)),
      lastScan: new Date().toLocaleTimeString(),
    };

    setPathData(newPathData);

    // Run Orchestration Core
    const newInterventions = orchestrateControl(newPathData);

    if (newInterventions.length > 0) {
        setOdasStatus(`Intervensi ${newInterventions.length} Kritis`);
        // Log to Firestore
        try {
            for (const intervention of newInterventions) {
                const { timestamp: clientTimestamp, ...interventionToSave } = intervention; 
                await addDoc(interventionCollectionRef, { ...interventionToSave, timestamp: serverTimestamp() });
            }
        } catch (error) {
            console.error("Failed to log intervention to Firestore:", error);
        }
    } else {
        setOdasStatus('ODAS Operasional Normal');
    }

  }, [isSimulating, pathData, interventionCollectionRef]);

  // 3. Execution Loop (Chronos Executor Simulation)
  useEffect(() => {
    let interval;
    if (isSimulating && isAuthReady) {
        interval = setInterval(runOdasScan, 5000); // Scan setiap 5 detik
    }
    return () => clearInterval(interval);
  }, [isSimulating, isAuthReady, runOdasScan]);

  // --- UI Components ---

  const StatusCard = ({ title, value, unit, icon: Icon, isCritical }) => {
    const displayValue = unit === '$' ? `$${value.toFixed(0)}` : unit === '%' ? `${(value * 100).toFixed(1)}${unit}` : `${value.toFixed(0)}${unit}`;
    const color = isCritical ? 'text-red-400' : 'text-teal-400';
    return (
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-400 uppercase">{title}</h3>
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <p className={`text-2xl font-extrabold mt-1 ${color}`}>
          {displayValue}
        </p>
      </div>
    );
  };

  const MainStatusDisplay = useMemo(() => {
    const isCritical = interventions.some(i => i.severity === 'Kritis');
    const color = isCritical ? 'bg-red-800' : 'bg-green-700';
    const Icon = isCritical ? Zap : ShieldCheck;

    return (
      <div className={`p-6 rounded-xl shadow-2xl transition duration-300 ${color} text-white`}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Status ODAS Master Control</h2>
          <Icon className="w-7 h-7" />
        </div>
        <p className="text-3xl font-extrabold mt-2">{odasStatus}</p>
        <p className="text-xs mt-1 opacity-70">User ID: {userId}</p>
      </div>
    );
  }, [odasStatus, interventions, userId]);
  
  // Tampilan Utama
  if (!isAuthReady) {
    return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
            <p className="flex items-center text-xl text-teal-400"><RefreshCw className="w-6 h-6 mr-2 animate-spin" /> Menginisialisasi ODAS Database...</p>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-8">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
          body { font-family: 'Inter', sans-serif; }
        `}
      </style>

      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500">
            ODAS: Omnidirectional Digital Asset Steward
          </h1>
          <p className="text-gray-400">
            Pusat Kontrol Orkestrasi Jalur Digital Global (Simulasi Agensi ODAS)
          </p>
        </header>

        {/* Status Master */}
        <div className="mb-8">
            {MainStatusDisplay}
        </div>

        {/* Data Path Mapping */}
        <h2 className="text-xl font-bold mb-4 text-gray-300 border-b border-gray-700 pb-2 flex items-center">
            <BarChart2 className="w-5 h-5 mr-2 text-cyan-400" />
            Pemetaan Jalur Utama (Real-time Simulation)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatusCard
            title="Volatilitas Aset"
            value={pathData.assetVolatility}
            unit="%"
            icon={DollarSign}
            isCritical={pathData.assetVolatility > INTERVENTION_THRESHOLDS.MAX_VOLATILITY}
          />
          <StatusCard
            title="Latency Sistem"
            value={pathData.systemLatency}
            unit="ms"
            icon={Cloud}
            isCritical={pathData.systemLatency > INTERVENTION_THRESHOLDS.MAX_LATENCY}
          />
          <StatusCard
            title="Sentimen Publik"
            value={pathData.publicSentiment}
            unit="%"
            icon={Heart}
            isCritical={pathData.publicSentiment < INTERVENTION_THRESHOLDS.MIN_SENTIMENT}
          />
          <StatusCard
            title="Skor Anomali"
            value={pathData.anomalyScore}
            unit="%"
            icon={Zap}
            isCritical={pathData.anomalyScore > INTERVENTION_THRESHOLDS.MAX_ANOMALY_SCORE}
          />
        </div>

        {/* Intervensi Finalitas Log */}
        <h2 className="text-xl font-bold mb-4 text-gray-300 border-b border-gray-700 pb-2 flex items-center">
            <Zap className="w-5 h-5 mr-2 text-red-400" />
            Log Intervensi Finalitas ({interventions.length})
        </h2>
        <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
          {interventions.length > 0 ? (
            interventions.map((intervention) => (
              <div key={intervention.id} className="bg-red-900/40 p-3 rounded-lg border border-red-700">
                <p className="font-bold text-sm text-red-200 uppercase">
                    [{intervention.path}] {intervention.severity}
                </p>
                <p className="text-xs text-gray-300 mt-1">{intervention.description}</p>
                <p className="text-xs text-gray-400 mt-1 italic">Logged: {intervention.timestamp}</p>
              </div>
            ))
          ) : (
            <div className="bg-green-900/30 p-4 rounded-lg text-center text-gray-400">
              <ShieldCheck className="w-5 h-5 inline mr-2" /> Tidak ada intervensi kritis yang diperlukan. Semua jalur dalam batas.
            </div>
          )}
        </div>
        
        {/* Footer Info */}
        <div className="mt-8 pt-4 border-t border-gray-700 text-center text-xs text-gray-500">
            <p>ODAS beroperasi. Semua data intervensi dicatat ke Firestore untuk pelacakan Agensi.</p>
        </div>
      </div>
    </div>
  );
};

export default App;
