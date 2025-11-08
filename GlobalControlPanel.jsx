import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { Network, TrendingUp, Users, Zap, Shield, Globe } from 'lucide-react';

// --- INITIAL CONFIG & FIREBASE HOOK ---
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

        // Sign In and set Auth State
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

    // Memoized Collection References (Private Data Path)
    const interventionCollectionRef = useMemo(() => {
        if (!db || !userId) return null;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        // Path: /artifacts/{appId}/users/{userId}/odas_interventions
        return collection(db, `artifacts/${appId}/users/${userId}/odas_interventions`);
    }, [db, userId]);

    // Mock/Future Strategic Asset Collections
    const assetCollectionRef = useMemo(() => {
        if (!db || !userId) return null;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        // Path: /artifacts/{appId}/users/{userId}/strategic_assets
        return collection(db, `artifacts/${appId}/users/${userId}/strategic_assets`);
    }, [db, userId]);


    return { userId, isAuthReady, interventionCollectionRef, assetCollectionRef };
};

// --- DATA CARD COMPONENT ---
const DataCard = ({ title, value, unit, icon: Icon, color, description }) => (
    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl transition duration-300 hover:shadow-cyan-500/30">
        <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
            <Icon className={`w-6 h-6 ${color}`} />
        </div>
        <p className="text-3xl font-extrabold mt-2 text-white">
            {value} <span className="text-base font-normal text-gray-500">{unit}</span>
        </p>
        <p className="text-xs text-gray-500 mt-2 italic">{description}</p>
    </div>
);

// --- MAIN APPLICATION COMPONENT ---
const App = () => {
  const { userId, isAuthReady, interventionCollectionRef, assetCollectionRef } = useFirebase();
  const [interventions, setInterventions] = useState([]);
  const [strategicMetrics, setStrategicMetrics] = useState({
      totalAssets: 0,
      personaRating: 0,
      totalInterventions: 0,
      systemHealth: 'Offline',
  });

  // 1. Fetch Intervention Data (ODAS Log)
  useEffect(() => {
    if (!isAuthReady || !interventionCollectionRef) return;

    // NOTE: orderBy() is disabled per instruction, sorting is done client-side if needed
    const q = query(interventionCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedInterventions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Mock timestamp for display
            timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate().toLocaleTimeString() : 'N/A'
        }));
        
        // Count total interventions and critical ones
        const criticalCount = fetchedInterventions.filter(i => i.severity === 'Kritis').length;
        
        setInterventions(fetchedInterventions);
        setStrategicMetrics(prev => ({ 
            ...prev, 
            totalInterventions: fetchedInterventions.length,
            systemHealth: criticalCount > 5 ? 'Kritis (High Alert)' : criticalCount > 0 ? 'Peringatan' : 'Optimal',
        }));
    }, (error) => {
        console.error("Failed to fetch interventions:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, interventionCollectionRef]);

  // 2. Mock Strategic Asset Data Fetch (Simulating other ODAS apps)
  useEffect(() => {
    if (!isAuthReady || !assetCollectionRef) return;

    // This section would typically fetch data from other apps/collections
    // For now, use mock data that is dependent on the userId's existence
    if (userId) {
        setStrategicMetrics(prev => ({ 
            ...prev, 
            totalAssets: 3, // Mock count of assets being managed
            personaRating: 92.5, // Mock PersonaFrame Score
        }));
    }

  }, [isAuthReady, assetCollectionRef, userId]);

  // Status Colors based on System Health
  const statusColor = useMemo(() => {
      switch (strategicMetrics.systemHealth) {
          case 'Optimal':
              return 'bg-green-700/80 border-green-500';
          case 'Peringatan':
              return 'bg-yellow-700/80 border-yellow-500';
          case 'Kritis (High Alert)':
              return 'bg-red-700/80 border-red-500';
          default:
              return 'bg-gray-700/80 border-gray-500';
      }
  }, [strategicMetrics.systemHealth]);


  if (!isAuthReady) {
    return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
            <p className="flex items-center text-xl text-cyan-400"><Network className="w-6 h-6 mr-2 animate-pulse" /> Membangun Koneksi PSV...</p>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-8">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap');
          body { font-family: 'Inter', sans-serif; }
        `}
      </style>

      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500">
            Global Control Panel (GCP)
          </h1>
          <p className="text-gray-400 text-lg">
            Dashboard Konsolidasi Data Strategis | Node Agensi Utama
          </p>
        </header>

        {/* User Anchor & System Health */}
        <div className={`p-5 rounded-xl mb-8 shadow-2xl transition duration-300 border ${statusColor}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div className="flex items-center">
                    <Globe className="w-8 h-8 mr-3 text-white" />
                    <div>
                        <p className="text-sm font-medium text-gray-300">Persistent State Vector (PSV) Anchor</p>
                        <p className="text-lg font-mono break-all text-white mt-0.5">
                            {userId}
                        </p>
                    </div>
                </div>
                <div className="mt-4 sm:mt-0 text-right">
                    <p className="text-sm font-medium text-gray-300">Status Kesehatan Sistem</p>
                    <p className="text-2xl font-black">{strategicMetrics.systemHealth}</p>
                </div>
            </div>
        </div>

        {/* Key Strategic Metrics */}
        <h2 className="text-xl font-bold mb-4 text-gray-300 border-b border-gray-700 pb-2 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-fuchsia-400" />
            Metrik Kunci DominationProtocol
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <DataCard
            title="Total Aset ODAS"
            value={strategicMetrics.totalAssets}
            unit="Assets"
            icon={Network}
            color="text-cyan-400"
            description="Jumlah Aset Digital/Strategis yang Dikelola."
          />
          <DataCard
            title="Skor PersonaFrame"
            value={strategicMetrics.personaRating}
            unit="%"
            icon={Users}
            color="text-yellow-400"
            description="Skor Kepercayaan & Resonansi Publik (PersonaFrame)."
          />
          <DataCard
            title="Intervensi Tercatat"
            value={strategicMetrics.totalInterventions}
            unit="Aksi"
            icon={Zap}
            color="text-red-400"
            description="Total Intervensi Finalitas yang Telah Dieksekusi."
          />
          <DataCard
            title="Pelindung Agensi"
            value="Aktif"
            unit=""
            icon={Shield}
            color="text-green-400"
            description="Status Cipher Compliance Engine (CCE)."
          />
        </div>

        {/* Log Intervensi Terbaru */}
        <h2 className="text-xl font-bold mb-4 text-gray-300 border-b border-gray-700 pb-2 flex items-center">
            <Zap className="w-5 h-5 mr-2 text-red-400" />
            Log Intervensi Terbaru (Finality Chronicle)
        </h2>
        <div className="space-y-3 max-h-96 overflow-y-auto pr-3">
          {interventions.length > 0 ? (
            interventions
              .slice(0, 5) // Tampilkan 5 terbaru
              .map((intervention) => (
              <div key={intervention.id} className="bg-red-900/40 p-3 rounded-lg border border-red-700 flex justify-between items-center">
                <div>
                    <p className="font-bold text-sm text-red-200 uppercase">
                        [{intervention.path}] {intervention.severity}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">{intervention.description}</p>
                </div>
                <p className="text-xs text-gray-400 mt-1 italic whitespace-nowrap ml-4">
                    {intervention.timestamp}
                </p>
              </div>
            ))
          ) : (
            <div className="bg-gray-800 p-4 rounded-lg text-center text-gray-400">
              <Shield className="w-5 h-5 inline mr-2" /> Menunggu data Intervensi Finalitas pertama Anda.
            </div>
          )}
        </div>
        
        {/* Footer Info */}
        <div className="mt-8 pt-4 border-t border-gray-700 text-center text-xs text-gray-500">
            <p>GCP Aktif. Membangun fondasi untuk ODAS Singularity (Timestamp: 16:30 WIB, 8 November 2025)</p>
        </div>
      </div>
    </div>
  );
};

export default App;
