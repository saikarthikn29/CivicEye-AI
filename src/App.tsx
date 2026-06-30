import React, { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, setDoc, doc, getDocs, deleteDoc } from "firebase/firestore";
import {
  Sparkles,
  Smartphone,
  Shield,
  HelpCircle,
  Database,
  RefreshCw,
  MapPin,
  AlertTriangle,
  ArrowRight,
  Lock,
  Building2,
  Users,
  Home
} from "lucide-react";
import MobileApp from "./components/MobileApp";
import Dashboard from "./components/Dashboard";
import { SAMPLE_ISSUES } from "./data";
import { Issue } from "./types";

export default function App() {
  // Global View Mode: 'home' (Launcher), 'mobile' (Citizen Portal), 'authority_login' (Authority Access), or 'dashboard' (Authority Control Center)
  const [viewMode, setViewMode] = useState<"home" | "mobile" | "authority_login" | "dashboard">("home");
  
  // Authority Session
  const [authorityDept, setAuthorityDept] = useState<"Roads" | "Water" | "Electrical" | "Sanitation" | null>(null);
  const [authorityEmail, setAuthorityEmail] = useState("");
  const [authorityLoginError, setAuthorityLoginError] = useState("");
  
  // Real-time synced issues
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);

  // Authentication status
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<{ displayName: string; email: string } | null>(null);

  // 1. Sync User Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        setUserProfile({
          displayName: user.displayName || `Citizen #${user.uid.slice(0, 4)}`,
          email: user.email || "guest@civiceye.net"
        });
        
        // Try to fetch custom user profile doc from Firestore
        const userRef = doc(db, "users", user.uid);
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile({
              displayName: data.displayName || user.displayName || "Citizen",
              email: data.email || user.email || "guest@civiceye.net"
            });
          }
        });
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time sync of reported issues from Cloud Firestore
  useEffect(() => {
    setIssuesLoading(true);
    const issuesRef = collection(db, "issues");
    const q = query(issuesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const list: Issue[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Issue);
        });
        setIssues(list);
        setIssuesLoading(false);
      },
      (error) => {
        console.error("Firestore sync failed:", error);
        setIssuesLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 3. Database Auto-Seeding: Seed initial records if database has 0 items
  const seedSampleData = async () => {
    try {
      setIssuesLoading(true);
      for (const sample of SAMPLE_ISSUES) {
        await setDoc(doc(db, "issues", sample.issueId), sample);
      }
      alert("Firestore initialized successfully with 3 sample reports near San Francisco!");
    } catch (err) {
      console.error("Failed to seed sample database:", err);
      alert("Firestore Seeding failed. Ensure your rules permit writes.");
    } finally {
      setIssuesLoading(false);
    }
  };



  const handleAuthorityLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const email = authorityEmail.trim().toLowerCase();
    if (email === "hack.roads29@gmail.com") {
      setAuthorityDept("Roads");
      setAuthorityLoginError("");
      setViewMode("dashboard");
    } else if (email === "hack.water29@gmail.com") {
      setAuthorityDept("Water");
      setAuthorityLoginError("");
      setViewMode("dashboard");
    } else if (email === "hack.electrical29@gmail.com") {
      setAuthorityDept("Electrical");
      setAuthorityLoginError("");
      setViewMode("dashboard");
    } else if (email === "hack.sanitation29@gmail.com") {
      setAuthorityDept("Sanitation");
      setAuthorityLoginError("");
      setViewMode("dashboard");
    } else {
      setAuthorityLoginError("Unauthorized Authority Email");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col select-none">
      
      {/* Top Application Ribbon */}
      <header className={`${viewMode === "mobile" ? "hidden sm:flex" : "flex"} bg-slate-900 border-b border-slate-800 px-6 py-4 items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25 text-white font-bold text-lg">
            👁️
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              CivicEye AI
              <span className="bg-emerald-950 border border-emerald-800/40 text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                v1.2.0
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Urban Incident Analyzer & Prioritizer</p>
          </div>
        </div>

        {/* Sync / Seeding helper buttons */}
        <div className="flex items-center gap-3">
          {viewMode !== "home" && (
            <button
              onClick={() => setViewMode("home")}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 font-extrabold text-xs text-white rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Home className="w-3.5 h-3.5 text-slate-400" />
              <span>Back to Portal Home</span>
            </button>
          )}

          {issues.length === 0 && !issuesLoading && (
            <button
              onClick={seedSampleData}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 font-extrabold text-xs text-white rounded-xl flex items-center gap-1 cursor-pointer shadow-lg shadow-emerald-500/15"
              title="Populate Firebase database with dummy potholes and garbage cases"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Seed Mock Cases</span>
            </button>
          )}

          <div className="hidden md:flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-[11px] text-slate-400">
            <span className={`w-2 h-2 rounded-full ${issuesLoading ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}></span>
            <span>Firestore: {issuesLoading ? "Syncing..." : `${issues.length} active dispatches`}</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="flex-1 flex overflow-hidden">
        {viewMode === "home" ? (
          /* UNIFIED DUAL PORTAL LANDING PAGE */
          <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08)_0,transparent_100%)] pointer-events-none" />
            
            <div className="max-w-4xl w-full text-center space-y-4 mb-10">
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-none">
                CivicEye AI Platform
              </h2>
              <p className="text-sm md:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Empowering smart cities with instant AI-driven infrastructure priority routing. Report urban hazards as a citizen, and witness targeted municipal dispatch resolution.
              </p>
            </div>

            <div className="max-w-md w-full z-10">
              {/* Unified Citizen Portal Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 flex flex-col hover:border-slate-700/80 transition-all group shadow-xl">
                <div className="space-y-6">
                  <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <Smartphone className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-white">Citizen Portal</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Simulate the citizen mobile app. Capture photos, automatically identify issues via high-fidelity AI Analysis, and place geotagged incidents on OpenStreetMap.
                    </p>
                  </div>
                  <ul className="space-y-3 text-xs text-slate-300 border-t border-slate-800 pt-5">
                    <li className="flex items-center gap-2.5">
                      <span className="text-emerald-500 font-bold">📸</span>
                      <span>Snap photos & receive AI analyses</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-emerald-500 font-bold">📍</span>
                      <span>Geolocator GPS map placement</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-emerald-500 font-bold">👍</span>
                      <span>Upvote and confirm nearby hazards</span>
                    </li>
                  </ul>
                </div>
                
                <button
                  onClick={() => setViewMode("mobile")}
                  className="mt-8 w-full py-3 px-5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/15 group-hover:shadow-emerald-500/25 transition-all"
                >
                  <span>Launch Citizen App</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* Streamlined Authority Portal link located directly below */}
                <button
                  onClick={() => {
                    setAuthorityLoginError("");
                    setViewMode("authority_login");
                  }}
                  className="mt-5 text-xs text-slate-400 hover:text-white font-bold tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5 hover:underline py-1"
                >
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Looking for Authority Access? Sign in here</span>
                </button>
              </div>
            </div>

            <div className="mt-12 text-[10px] text-slate-500 font-medium tracking-wide">
              Powered by NVIDIA NIM AI • Firebase Firestore & Auth • OpenStreetMap
            </div>
          </div>
        ) : viewMode === "authority_login" ? (
          /* AUTHORITY ACCESS LOGIN SCREEN */
          <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.06)_0,transparent_100%)] pointer-events-none" />
            
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl relative z-10">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 rounded-xl flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">Authority Access</h3>
                <p className="text-xs text-slate-400">
                  Enter your assigned municipal department email to access your dispatch dashboard.
                </p>
              </div>

              <form onSubmit={handleAuthorityLogin} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Municipal Email Address
                  </label>
                  <input
                    type="email"
                    value={authorityEmail}
                    onChange={(e) => setAuthorityEmail(e.target.value)}
                    placeholder="Enter Department Email ID"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-sans"
                  />
                </div>

                {authorityLoginError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-xs font-bold text-center">
                    ⚠️ {authorityLoginError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold text-sm rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-500/15"
                >
                  Verify & Enter Dashboard
                </button>
              </form>

              <div className="text-center pt-2 border-t border-slate-800/60 mt-4">
                <button
                  onClick={() => setViewMode("home")}
                  className="text-xs text-slate-500 hover:text-slate-300 font-bold transition-colors cursor-pointer"
                >
                  ← Back to Portal Selection
                </button>
              </div>
            </div>
          </div>
        ) : viewMode === "mobile" ? (
          /* CITIZEN PORTAL WORKSPACE with embedded mobile mockup */
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-0 sm:p-6 md:p-12 overflow-y-auto">
            
            {/* Middle Frame: Android Mockup */}
            <div className="w-full h-full flex justify-center items-center">
              <MobileApp
                currentUserId={currentUser ? currentUser.uid : null}
                userEmail={userProfile ? userProfile.email : null}
                userDisplayName={userProfile ? userProfile.displayName : null}
                issues={issues}
                onAuthorityAccess={() => {
                  setAuthorityLoginError("");
                  setViewMode("authority_login");
                }}
                onExitPortal={() => setViewMode("home")}
              />
            </div>

          </div>
        ) : (
          /* AUTHORITY CONTROL CENTER CONTROL ROOM (Dashboard) */
          <Dashboard
            issues={issues}
            currentUserId={currentUser ? currentUser.uid : null}
            authorityDept={authorityDept}
            onSignOut={() => {
              setAuthorityDept(null);
              setViewMode("home");
            }}
          />
        )}
      </main>
    </div>
  );
}
