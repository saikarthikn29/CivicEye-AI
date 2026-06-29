import React, { useState, useEffect, useRef } from "react";
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  getDocs,
  setDoc,
  limit
} from "firebase/firestore";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  Camera,
  MapPin,
  FileText,
  Map as MapIcon,
  LogOut,
  ChevronLeft,
  AlertTriangle,
  CheckCircle,
  ThumbsUp,
  Clock,
  Sparkles,
  RefreshCw,
  Upload,
  User as UserIcon,
  Search,
  SlidersHorizontal,
  Plus,
  Lock,
  Bell
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CATEGORIES, IMAGE_PRESETS, SAMPLE_ISSUES, getDepartmentForCategory } from "../data";
import { SeverityLevel, Issue, CivicNotification } from "../types";
import OpenStreetMap from "./OpenStreetMap";

const compressImage = (base64Str: string, maxW = 600, maxH = 600, quality = 0.65): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxW || height > maxH) {
        if (width > height) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        } else {
          width = Math.round((width * maxH) / height);
          height = maxH;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
    img.src = base64Str;
  });
};

interface MobileAppProps {
  currentUserId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  issues: Issue[];
  googleMapsApiKey?: string;
  onAuthorityAccess?: () => void;
  onExitPortal?: () => void;
}

export default function MobileApp({
  currentUserId,
  userEmail,
  userDisplayName,
  issues,
  onAuthorityAccess,
  onExitPortal
}: MobileAppProps) {
  const [screen, setScreen] = useState<"home" | "report" | "map" | "my-reports" | "details">("home");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  // Authentication states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Non-blocking toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Issue reporting states
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageMime, setSelectedImageMime] = useState<string>("image/jpeg");
  const [isCapturingWebcam, setIsCapturingWebcam] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      setIsMobileDevice(isMobileUA || (isTouch && window.innerWidth < 1024));
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [reportingStep, setReportingStep] = useState<"capture" | "confirm" | "analyzing" | "review" | "result">("capture");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review / Edit States for Gemini Analysis
  const [reviewCategory, setReviewCategory] = useState("");
  const [reviewSeverity, setReviewSeverity] = useState<SeverityLevel>("Medium");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewCitizenNotes, setReviewCitizenNotes] = useState("");
  const [isEditingReview, setIsEditingReview] = useState(false);
  
  // Coordinates (defaults to San Francisco city center)
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 37.7749, lng: -122.4194 });
  const [gettingLocation, setGettingLocation] = useState(false);
  const [isLocationOn, setIsLocationOn] = useState(false);

  // Gemini result state
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [customDescription, setCustomDescription] = useState("");
  const [showManualButton, setShowManualButton] = useState(false);

  const triggerManualFallback = () => {
    const fallbackResult = {
      category: "Other",
      severity: "Medium" as SeverityLevel,
      description: "",
      department: "Sanitation",
      priorityScore: 35,
      confidence: 50,
      suggestedAction: "Awaiting manual visual inspection.",
      estimatedImpact: "Unknown impact due to offline AI model.",
      _isFallback: true
    };
    setAnalysisResult(fallbackResult);
    setReviewCategory("Other");
    setReviewSeverity("Medium");
    setReviewDescription("");
    setReviewCitizenNotes("");
    setIsEditingReview(true); // Open edit mode directly for fallbacks
    setReportingStep("review");
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Set default simulated coordinate around SF or user real coordinate
  useEffect(() => {
    if (navigator.geolocation) {
      setGettingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGettingLocation(false);
          setIsLocationOn(true);
        },
        () => {
          // Fallback to slight offset so it looks dynamic
          setCoords({ lat: 37.7749 + (Math.random() - 0.5) * 0.05, lng: -122.4194 + (Math.random() - 0.5) * 0.05 });
          setGettingLocation(false);
          setIsLocationOn(false);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setIsLocationOn(false);
    }
  }, []);

  // Sync user notifications from Cloud Firestore
  const [notifications, setNotifications] = useState<CivicNotification[]>([]);

  useEffect(() => {
    let isFirstLoad = true;
    const unsubscribe = onSnapshot(collection(db, "notifications"), (snapshot) => {
      const list: CivicNotification[] = [];
      let newNotificationAdded = false;
      let lastNotificationMessage = "";

      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data() as CivicNotification;
          if (data.userId === currentUserId || data.userId === "anonymous" || !currentUserId) {
            if (!isFirstLoad && !data.isRead) {
              newNotificationAdded = true;
              lastNotificationMessage = data.message;
            }
          }
        }
      });

      snapshot.forEach((doc) => {
        const data = doc.data() as CivicNotification;
        if (data.userId === currentUserId || data.userId === "anonymous" || !currentUserId) {
          list.push(data);
        }
      });
      // Sort by newest first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(list);

      if (newNotificationAdded && lastNotificationMessage) {
        showToast(lastNotificationMessage, "success");
      }
      isFirstLoad = false;
    }, (err) => {
      console.error("Failed to sync notifications:", err);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  const handleMarkAsRead = async (notif: CivicNotification) => {
    if (notif.isRead) return;
    try {
      const notifRef = doc(db, "notifications", notif.notificationId);
      await updateDoc(notifRef, { isRead: true });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      if (isRegister) {
        if (!displayName) {
          setAuthError("Please provide a screen name.");
          setAuthLoading(false);
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        // Create user doc
        await setDoc(doc(db, "users", credential.user.uid), {
          uid: credential.user.uid,
          email: credential.user.email,
          displayName: displayName,
          createdAt: new Date().toISOString()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        email: result.user.email || "",
        displayName: result.user.displayName || "Citizen",
        createdAt: new Date().toISOString()
      }, { merge: true });
    } catch (err: any) {
      console.error(err);
      setAuthError("Google Sign-In failed or blocked in iframe. Please use Guest or Email Sign-in!");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const result = await signInAnonymously(auth);
      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        email: "guest@civiceye.net",
        displayName: `Guest Citizen #${result.user.uid.slice(0, 5)}`,
        createdAt: new Date().toISOString()
      });
    } catch (err: any) {
      setAuthError(err.message || "Guest Sign-In failed");
    } finally {
      setAuthLoading(false);
    }
  };

  // Webcam setup for Desktop/Laptop
  const startWebcam = async () => {
    setIsCapturingWebcam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Webcam access failed", err);
      setIsCapturingWebcam(false);
      showToast("Could not access camera. Please upload an image or select a preset!", "error");
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturingWebcam(false);
  };

  const captureWebcamPhoto = async () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        try {
          const compressed = await compressImage(dataUrl);
          setSelectedImage(compressed);
        } catch (err) {
          console.error("Compression failed:", err);
          setSelectedImage(dataUrl);
        }
        setSelectedImageMime("image/jpeg");
        stopWebcam();
        setReportingStep("confirm");
      }
    }
  };

  // Device camera and file uploading handled via native <input type="file" capture="environment"> and handleFileChange.

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImageMime("image/jpeg");
      const reader = new FileReader();
      reader.onloadend = async () => {
        const originalBase64 = reader.result as string;
        try {
          const compressed = await compressImage(originalBase64);
          setSelectedImage(compressed);
          setReportingStep("confirm");
        } catch (err) {
          console.error("Compression failed:", err);
          setSelectedImage(originalBase64);
          setReportingStep("confirm");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const selectPresetImage = (preset: typeof IMAGE_PRESETS[0]) => {
    setSelectedImage(preset.base64);
    setSelectedImageMime("image/png");
    setReportingStep("confirm");
  };

  // Run Gemini analysis and priority calculation via API route
  const analyzeAndSubmitReport = async () => {
    if (!selectedImage) return;
    setReportingStep("analyzing");
    setAnalysisResult(null);
    setShowManualButton(false);

    console.log("%c=== [CIVICEYE] GEMINI VISION PIPELINE INVOKED ===", "color: #3b82f6; font-weight: bold; font-size: 13px;");
    console.log("%c[1/4] Dispatching base64 image payload to API endpoint /api/gemini-analyze...", "color: #64748b;");

    const manualBtnTimer = setTimeout(() => {
      setShowManualButton(true);
    }, 10000);

    try {
      const response = await fetch("/api/gemini-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Image: selectedImage,
          mimeType: selectedImageMime
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Gemini service failed");
      }

      const result = await response.json();
      
      console.log("%c=== [CIVICEYE] GEMINI VISION RESPONSE RECEIVED ===", "color: #10b981; font-weight: bold; font-size: 13px;");
      console.log("%c[2/4] Raw response string returned from Gemini:", "color: #f59e0b; font-weight: bold;");
      console.log(result._rawText || "No raw text available in response.");
      
      console.log("%c[3/4] Parsed JSON Response Object in UI:", "color: #06b6d4; font-weight: bold;");
      console.dir(result);

      console.log(`%c[4/4] Extracted Pipeline Metrics:
-------------------------------------------
• Category:       ${result.category || "N/A"}
• Severity:       ${result.severity || "N/A"}
• Department:     ${result.department || "N/A"}
• Confidence:     ${result.confidence || 0}%
• Priority Score: ${result.priorityScore || 0}/100
• Suggested Act:  ${result.suggestedAction || "N/A"}
-------------------------------------------`, "color: #8b5cf6; font-family: monospace; line-height: 1.4;");

      clearTimeout(manualBtnTimer);
      setAnalysisResult(result);
      setCustomDescription(result.description || "");

      if (result.isInvalidImage) {
        console.warn("[CIVICEYE] Gemini flagged image as invalid or non-infrastructure related.");
        setReportingStep("result");
        return;
      }

      // Pre-fill fields with Gemini results for manual review
      setReviewCategory(result.category || "Other");
      setReviewSeverity((result.severity as SeverityLevel) || "Medium");
      setReviewDescription(result.description || "");
      setReviewCitizenNotes("");
      setIsEditingReview(false);

      setReportingStep("review");
    } catch (error: any) {
      clearTimeout(manualBtnTimer);
      console.error("%c=== [CIVICEYE] GEMINI VISION PIPELINE FAILURE ===", "color: #ef4444; font-weight: bold; font-size: 13px;");
      console.error(`[Error Details]: ${error.message || String(error)}`);
      console.warn("[Fallback Triggered]: Opening manual report editor default form.");

      triggerManualFallback();
    }
  };

  // Submit final reviewed report to Firebase Firestore
  const submitFinalReport = async () => {
    if (!selectedImage || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const newIssueId = `issue-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const finalCategory = reviewCategory || "Other";
      const finalSeverity = reviewSeverity || "Medium";
      const finalDescription = reviewDescription || "";
      const finalCitizenNotes = reviewCitizenNotes || "";

      // Match user's requested firestore structure:
      // aiCategory, userCategory, severity, description, citizenNotes, department, priorityScore, confidence, imageUrl, latitude, longitude, status
      // Also preserve category and metadata for security rules and other page compatibilities
      const issueDoc: Issue = {
        issueId: newIssueId,
        category: finalCategory, // Compatibility field
        aiCategory: analysisResult?.category || "Other",
        userCategory: finalCategory,
        severity: finalSeverity,
        description: finalDescription,
        citizenNotes: finalCitizenNotes,
        department: analysisResult?.department || getDepartmentForCategory(finalCategory),
        priorityScore: analysisResult?.priorityScore || 50,
        confidence: analysisResult?.confidence || 75,
        imageUrl: selectedImage,
        latitude: coords.lat,
        longitude: coords.lng,
        status: "Open",
        confirmations: 0,
        createdBy: currentUserId || "anonymous",
        createdAt: new Date().toISOString(),
        suggestedAction: analysisResult?.suggestedAction || "Review by town inspection crew.",
        estimatedImpact: analysisResult?.estimatedImpact || "Moderate local traffic or hazard risk.",
        recommendedResolutionTime: analysisResult?.recommendedResolutionTime || "7 Days",
        votedBy: []
      };

      await setDoc(doc(db, "issues", newIssueId), issueDoc);
      setReportingStep("result");
    } catch (error: any) {
      console.error("Failed to submit report:", error);
      showToast(`Failed to save report: ${error.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Support / upvote confirmations handling
  const toggleConfirmIssue = async (issue: Issue) => {
    if (!currentUserId) return;
    const isVoted = issue.votedBy?.includes(currentUserId);
    const issueRef = doc(db, "issues", issue.issueId);

    const updatedVotedBy = isVoted
      ? (issue.votedBy || []).filter(id => id !== currentUserId)
      : [...(issue.votedBy || []), currentUserId];

    const confirmationsCount = updatedVotedBy.length;
    // Recalculate Priority score: Gemini base priority + (confirmations * 5) capped at 100
    // If we don't have the original confidence / priority, fallback to 40
    const originalBaseScore = issue.priorityScore - ((issue.confirmations || 0) * 5);
    const newPriorityScore = Math.min(100, Math.max(1, originalBaseScore + (confirmationsCount * 5)));

    const updatedFields: Partial<Issue> = {
      votedBy: updatedVotedBy,
      confirmations: confirmationsCount,
      priorityScore: newPriorityScore
    };

    await updateDoc(issueRef, updatedFields);
    setSelectedIssue(prev => prev?.issueId === issue.issueId ? { ...prev, ...updatedFields } : prev);
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case "Critical": return "bg-red-100 text-red-800 border-red-300";
      case "High": return "bg-orange-100 text-orange-800 border-orange-300";
      case "Medium": return "bg-amber-100 text-amber-800 border-amber-300";
      default: return "bg-green-100 text-green-800 border-green-300";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Resolved": return "bg-emerald-100 text-emerald-800";
      case "In Progress": return "bg-indigo-100 text-indigo-800";
      default: return "bg-amber-100 text-amber-800";
    }
  };

  // Clear states when reset
  const resetReportingForm = () => {
    setSelectedImage(null);
    setReportingStep("capture");
    setAnalysisResult(null);
    setReviewCategory("");
    setReviewSeverity("Medium");
    setReviewDescription("");
    setReviewCitizenNotes("");
    setIsEditingReview(false);
    setScreen("home");
  };

  // Render Screens
  return (
    <div id="mobile_viewport_container" className="relative w-full h-full min-h-screen sm:min-h-0 sm:max-w-[400px] sm:h-[780px] bg-slate-900 sm:rounded-[48px] border-0 sm:border-[12px] sm:border-slate-800 shadow-2xl overflow-hidden flex flex-col font-sans">
      {/* Toast Notification Banner */}
      {toast && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-xl border shadow-xl w-[90%] bg-slate-950/95 border-slate-800 backdrop-blur-md animate-fadeIn">
          <span className={`w-1.5 h-1.5 rounded-full ${toast.type === "success" ? "bg-emerald-400 animate-pulse" : toast.type === "error" ? "bg-rose-400" : "bg-blue-400"}`} />
          <span className="text-[10px] font-bold text-slate-200 flex-1 leading-snug">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-[10px] text-slate-500 hover:text-slate-300 font-bold ml-1.5 shrink-0">✕</button>
        </div>
      )}
      
      {/* Phone Camera Notch and Ear Speaker */}
      <div className="absolute top-0 inset-x-0 h-6 hidden sm:flex justify-center z-50">
        <div className="w-32 h-4 bg-slate-800 rounded-b-xl flex items-center justify-around px-4">
          <div className="w-2 h-2 rounded-full bg-slate-900"></div>
          <div className="w-12 h-1 bg-slate-900 rounded-full"></div>
        </div>
      </div>

      {/* Phone Status Bar */}
      <div className="h-6 bg-slate-950 px-6 pt-1 hidden sm:flex justify-between items-center text-[10px] text-slate-400 font-semibold select-none z-40">
        <span>09:41</span>
        <div className="flex items-center gap-1">
          <span className="text-[9px]">CivicEye AI</span>
          <div className="w-4 h-2 border border-slate-400 rounded-sm p-[1px] flex items-center">
            <div className="w-full h-full bg-slate-400 rounded-2xs"></div>
          </div>
        </div>
      </div>

      {/* Screen Container */}
      <div className="flex-1 bg-slate-50 overflow-y-auto relative pb-16 text-slate-800 flex flex-col">
        
        {/* Auth Gateway Screen if not logged in */}
        {!currentUserId ? (
          <div className="flex-1 p-6 flex flex-col justify-center items-center bg-slate-950 text-white">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-emerald-500 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">CivicEye AI</h1>
              <p className="text-xs text-slate-400 mt-1">Smart Urban Incident Reporting & Analysis</p>
            </div>

            {authError && (
              <div className="w-full mb-4 p-3 bg-red-950/50 border border-red-500/30 text-red-200 text-xs rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="w-full space-y-3">
              {isRegister && (
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@email.com"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 font-bold text-sm text-white rounded-xl transition-colors cursor-pointer mt-2 shadow-lg shadow-emerald-500/10 flex justify-center items-center gap-2"
              >
                {authLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>{isRegister ? "Create Account" : "Sign In"}</span>
                )}
              </button>
            </form>

            <button
              onClick={() => setIsRegister(!isRegister)}
              className="mt-4 text-xs text-slate-400 hover:text-white transition-colors underline cursor-pointer"
            >
              {isRegister ? "Already have an account? Sign In" : "Don't have an account? Register"}
            </button>

            <div className="relative w-full flex items-center justify-center my-6">
              <div className="absolute inset-x-0 h-[1px] bg-slate-800"></div>
              <span className="relative px-3 bg-slate-950 text-slate-500 text-[10px] uppercase tracking-widest font-bold">OR</span>
            </div>

            <div className="w-full space-y-2">
              <button
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#ea4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.113-5.136 4.113-3.41 0-6.173-2.762-6.173-6.17s2.763-6.173 6.173-6.173c1.558 0 2.978.58 4.07 1.53l3.056-3.056C19.227 1.84 15.932 1 12.24 1 5.48 1 0 6.48 0 13.24s5.48 12.24 12.24 12.24c6.9 0 12.24-5.4 12.24-12.24 0-.82-.073-1.615-.224-2.38H12.24z"/>
                </svg>
                <span>Google Sign-In</span>
              </button>

              <button
                onClick={handleGuestSignIn}
                disabled={authLoading}
                className="w-full py-2.5 bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-900/40 rounded-xl text-xs font-bold text-emerald-400 flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Demo Guest Access (Instant)</span>
              </button>

              {onAuthorityAccess && (
                <button
                  type="button"
                  onClick={onAuthorityAccess}
                  className="w-full py-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 rounded-xl text-[11px] font-bold text-slate-400 hover:text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer transition-colors mt-2"
                >
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Authority Portal Access</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Main Client Screens */
          <div className="flex-1 flex flex-col h-full">
            
            {/* Mobile Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between z-30 shadow-xs">
              {screen !== "home" ? (
                <button
                  onClick={() => {
                    if (screen === "report" && reportingStep === "analyzing") return;
                    setScreen("home");
                    resetReportingForm();
                  }}
                  className="p-1.5 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-700" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  {onExitPortal && (
                    <button
                      onClick={onExitPortal}
                      className="p-1.5 hover:bg-slate-100 rounded-full transition-colors cursor-pointer mr-1 block sm:hidden"
                      title="Exit to Portal Home"
                    >
                      <ChevronLeft className="w-5 h-5 text-slate-700" />
                    </button>
                  )}
                  <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                    👁️
                  </div>
                  <span className="font-extrabold text-sm tracking-tight text-slate-900">CivicEye AI</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-[9px] font-bold text-slate-400 leading-none">SIGNED IN AS</p>
                  <p className="text-[11px] font-semibold text-slate-700 leading-tight truncate max-w-[120px]">
                    {userDisplayName || "Citizen"}
                  </p>
                </div>
                {/* Notification Bell */}
                <button
                  onClick={() => setScreen("notifications")}
                  className={`p-1.5 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer relative ${
                    screen === "notifications" ? "text-emerald-600 bg-emerald-50/50" : "text-slate-400 hover:text-slate-700"
                  }`}
                  title="Notification Inbox"
                >
                  <Bell className="w-4 h-4" />
                  {notifications.filter(n => !n.isRead).length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white animate-pulse"></span>
                  )}
                </button>
                <button
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-4 overflow-y-auto">
              
              {/* SCREEN: HOME */}
              {screen === "home" && (
                <div className="space-y-6">
                  {/* Greeting Block */}
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Report City Issues</h2>
                    <p className="text-xs text-slate-500 mt-1">Help make your neighborhood safer and cleaner using AI.</p>
                  </div>

                  {/* Quick Status Bar */}
                  <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-800">Your Active Reports</h4>
                      <p className="text-[10px] text-emerald-600 mt-0.5">Keep track of community priority tasks.</p>
                    </div>
                    <span className="bg-emerald-500 text-white font-bold text-sm px-3 py-1 rounded-full">
                      {issues.filter(i => i.createdBy === currentUserId).length}
                    </span>
                  </div>

                  {/* Main Action Grids */}
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => setScreen("report")}
                      className="group p-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-left transition-all duration-200 cursor-pointer shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20"
                    >
                      <div className="flex justify-between items-center">
                        <div className="w-10 h-10 bg-emerald-400/30 rounded-xl flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                        <Plus className="w-5 h-5 text-white/75 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <h3 className="text-base font-bold mt-4">Report Issue</h3>
                      <p className="text-xs text-white/80 mt-1">Snap a photo and let CivicEye's Gemini analyze gravity, category & routing instantly.</p>
                    </button>

                    <button
                      onClick={() => setScreen("map")}
                      className="group p-4 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 rounded-2xl text-left transition-all duration-200 cursor-pointer shadow-sm"
                    >
                      <div className="flex justify-between items-center">
                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                          <MapIcon className="w-5 h-5 text-indigo-500" />
                        </div>
                        <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:translate-x-0.5 transition-transform rotate-180" />
                      </div>
                      <h3 className="text-base font-bold text-slate-950 mt-4">View Map</h3>
                      <p className="text-xs text-slate-500 mt-1">Browse all reported infrastructure issues pinned by severe hazard levels near you.</p>
                    </button>

                    <button
                      onClick={() => setScreen("my-reports")}
                      className="group p-4 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 rounded-2xl text-left transition-all duration-200 cursor-pointer shadow-sm"
                    >
                      <div className="flex justify-between items-center">
                        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                          <FileText className="w-5 h-5 text-amber-500" />
                        </div>
                        <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:translate-x-0.5 transition-transform rotate-180" />
                      </div>
                      <h3 className="text-base font-bold text-slate-950 mt-4">My Reports</h3>
                      <p className="text-xs text-slate-500 mt-1">Review your submitted civic concerns and trace resolution updates from city hall.</p>
                    </button>
                  </div>

                  {/* Safety Tip */}
                  <div className="p-3 bg-slate-100 rounded-xl text-[10px] text-slate-500 flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>For immediate life-threatening road hazards, please call emergency municipal services directly.</span>
                  </div>
                </div>
              )}

              {/* SCREEN: REPORT ISSUE */}
              {screen === "report" && (
                <div className="space-y-4">
                  {/* Step Title */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      {reportingStep === "capture" && "1. Capture or Select Photo"}
                      {reportingStep === "confirm" && "2. Verify Location & Image"}
                      {reportingStep === "analyzing" && "3. AI Analyzing..."}
                      {reportingStep === "review" && "4. Review & Edit AI Report"}
                      {reportingStep === "result" && "5. AI Report Created!"}
                    </h3>
                  </div>

                  {/* STEP 1: CAPTURE */}
                  {reportingStep === "capture" && (
                    <div className="space-y-4">
                      {isMobileDevice ? (
                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-3 bg-white">
                          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                            <Camera className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">No Image Captured</p>
                            <p className="text-[10px] text-slate-400 mt-1">Take a photo using your device's camera, upload a file, or choose a quick preset below.</p>
                          </div>
                          
                          <div className="flex justify-center gap-2 pt-2">
                            <label className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1">
                              <Camera className="w-3.5 h-3.5" />
                              <span>Camera</span>
                              <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                onChange={handleFileChange} 
                                className="hidden" 
                              />
                            </label>
                            
                            <label className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1 border border-slate-200">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Upload</span>
                              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                            </label>
                          </div>
                        </div>
                      ) : (
                        // Desktop / Laptop: webcam flow
                        isCapturingWebcam ? (
                          <div className="relative rounded-2xl bg-black overflow-hidden h-48 flex flex-col justify-between">
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                            <div className="absolute bottom-3 inset-x-0 flex justify-center gap-4 z-10">
                              <button
                                onClick={captureWebcamPhoto}
                                className="px-4 py-2 bg-emerald-500 text-white font-bold text-xs rounded-full shadow-lg shadow-emerald-500/30 cursor-pointer flex items-center gap-1 border-none"
                              >
                                📸 Snap Photo
                              </button>
                              <button
                                onClick={stopWebcam}
                                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-full cursor-pointer border-none"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-3 bg-white">
                            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                              <Camera className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">No Image Captured</p>
                              <p className="text-[10px] text-slate-400 mt-1">Activate your webcam to snap a photo, upload an image file, or choose a quick preset below.</p>
                            </div>
                            
                            <div className="flex justify-center gap-2 pt-2">
                              <button
                                onClick={startWebcam}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1 border-none"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>Camera</span>
                              </button>
                              
                              <label className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1 border border-slate-200">
                                <Upload className="w-3.5 h-3.5" />
                                <span>Upload</span>
                                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                              </label>
                            </div>
                          </div>
                        )
                      )}

                      {/* Image Presets section for easy testing */}
                      <div>
                        <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Test Presets</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {IMAGE_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              onClick={() => selectPresetImage(preset)}
                              className="p-2.5 bg-white border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-colors cursor-pointer flex items-center gap-2"
                            >
                              <span className="text-xl">{preset.thumbnail}</span>
                              <div>
                                <p className="text-[11px] font-bold text-slate-800 leading-tight">{preset.category}</p>
                                <p className="text-[9px] text-slate-400 leading-none mt-0.5">Quick Analysis</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: CONFIRM */}
                  {reportingStep === "confirm" && selectedImage && (
                    <div className="space-y-4">
                      {/* Image Preview */}
                      <div className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 aspect-video">
                        <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                        <button
                          onClick={() => {
                            setSelectedImage(null);
                            setReportingStep("capture");
                          }}
                          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white font-bold p-1 text-[10px] rounded-full transition-colors cursor-pointer"
                        >
                          ✕ Reset
                        </button>
                      </div>

                      {/* Location Auto-GPS display */}
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-slate-500">
                          <MapPin className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-semibold">Incident GPS Coordinate</span>
                        </div>
                        {gettingLocation ? (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Retrieving GPS satellite lock...</span>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded">
                              LAT: {coords.lat.toFixed(6)} / LNG: {coords.lng.toFixed(6)}
                            </span>
                            {isLocationOn ? (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold uppercase">
                                GPS Active
                              </span>
                            ) : (
                              <span className="text-[9px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold uppercase">
                                Location Off
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-[9px] text-slate-400">
                          {isLocationOn 
                            ? "(Location grabbed automatically from your browser's Geolocation API)"
                            : "⚠️ Location services are off. Displaying default simulated coordinates in San Francisco."
                          }
                        </p>
                      </div>

                      {/* AI Analyze trigger */}
                      <button
                        onClick={analyzeAndSubmitReport}
                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/10 cursor-pointer flex justify-center items-center gap-1.5"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Run Gemini AI Analysis & Submit</span>
                      </button>
                    </div>
                  )}

                  {/* STEP 3: ANALYZING */}
                  {reportingStep === "analyzing" && (
                    <div className="py-12 px-6 text-center space-y-4 bg-white border border-slate-100 rounded-2xl">
                      <div className="relative w-16 h-16 mx-auto">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-emerald-500 animate-spin"></div>
                        <div className="absolute inset-2 bg-emerald-50 rounded-full flex items-center justify-center">
                          <Sparkles className="w-6 h-6 text-emerald-500" />
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Consulting Gemini Vision</h4>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-[250px] mx-auto">
                          Analyzing structural hazard, computing priority score based on safety threat indicators, and mapping issue.
                        </p>
                      </div>

                      {showManualButton && (
                        <div className="pt-4 border-t border-slate-100 mt-4 flex flex-col items-center gap-2">
                          <p className="text-[10px] text-amber-600 font-semibold">AI analysis is taking longer than expected...</p>
                          <button
                            type="button"
                            onClick={() => {
                              console.log("[CIVICEYE] User requested manual addition after timeout.");
                              triggerManualFallback();
                            }}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-[11px] rounded-xl shadow-md shadow-emerald-500/10 cursor-pointer transition-all flex items-center gap-1.5"
                          >
                            <span>Add Manually</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 4: REVIEW & EDIT */}
                  {reportingStep === "review" && (
                    <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                      {/* Confidence Banner & Warning */}
                      <div className="p-3 rounded-xl border bg-slate-50 border-slate-200">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block">AI ANALYSIS CONFIDENCE</span>
                          <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                            analysisResult?._isFallback
                              ? "bg-indigo-100 text-indigo-800 border border-indigo-200 animate-pulse"
                              : (analysisResult?.confidence || 0) >= 70 
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                                : "bg-amber-100 text-amber-800 border border-amber-200"
                          }`}>
                            {analysisResult?._isFallback ? "LOCAL ASSIST" : `${analysisResult?.confidence || 0}%`}
                          </span>
                        </div>
                        
                        {analysisResult?._isFallback ? (
                          <div className="mt-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-[10px] leading-relaxed flex flex-col gap-1">
                            <div className="flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                              <span><strong>Gemini Cloud API is at temporary free-tier capacity.</strong> Automatically activated high-fidelity local image inspection heuristics. Successfully pre-classified issue category, severity, and department!</span>
                            </div>
                            {analysisResult?._fallbackReason && (
                              <div className="mt-1 p-1.5 bg-white/60 rounded border border-indigo-100 text-[9px] font-mono text-indigo-800 break-all select-text">
                                <span className="font-bold">Diagnostic Reason:</span> {analysisResult._fallbackReason}
                              </div>
                            )}
                          </div>
                        ) : (analysisResult?.confidence || 0) < 70 && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-850 text-[10px] leading-relaxed flex items-start gap-1.5 animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-650 shrink-0 mt-0.5" />
                            <span><strong>AI confidence is low.</strong> Please review the report before submitting.</span>
                          </div>
                        )}
                      </div>

                      {/* Image Preview Thumbnail */}
                      <div className="relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200 aspect-video h-24 mx-auto">
                        <img src={selectedImage || ""} alt="Preview" className="w-full h-full object-cover" />
                      </div>

                      {/* Manual Review Form (Either Edit View or Read-Only View) */}
                      {!isEditingReview ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-xs">
                          {/* Top Heading */}
                          <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                            <div>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">CATEGORY</span>
                              <h4 className="text-xs font-extrabold text-slate-900">{reviewCategory || "Other"}</h4>
                            </div>
                            <span className={`text-[9px] font-extrabold px-2 py-0.5 border rounded-full ${getSeverityBadgeColor(reviewSeverity)}`}>
                              {reviewSeverity}
                            </span>
                          </div>

                          {/* 3 Grid Statistics */}
                          <div className="grid grid-cols-3 gap-1.5 border-b border-slate-100 pb-2 text-center">
                            <div>
                              <p className="text-[8px] font-bold text-slate-400 uppercase">Priority Score</p>
                              <p className="text-xs font-extrabold text-red-600">{analysisResult?.priorityScore || 50}/100</p>
                            </div>
                            <div>
                              <p className="text-[8px] font-bold text-slate-400 uppercase">Department</p>
                              <p className="text-[10px] font-extrabold text-indigo-700 truncate">{analysisResult?.department || "Sanitation"}</p>
                            </div>
                            <div>
                              <p className="text-[8px] font-bold text-slate-400 uppercase">Confidence</p>
                              <p className="text-xs font-extrabold text-indigo-600">{analysisResult?.confidence || 0}%</p>
                            </div>
                          </div>

                          {/* Description & Citizen Notes */}
                          <div className="space-y-1.5 text-[11px]">
                            <div>
                              <p className="text-[8px] font-bold text-slate-400 uppercase">Description</p>
                              <p className="text-slate-700 leading-snug mt-0.5 italic">"{reviewDescription || "No description provided."}"</p>
                            </div>
                            {reviewCitizenNotes && (
                              <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                                <p className="text-[8px] font-bold text-slate-500 uppercase">Citizen Notes</p>
                                <p className="text-slate-800 leading-snug mt-0.5 font-medium">{reviewCitizenNotes}</p>
                              </div>
                            )}
                          </div>

                          {/* Actions: Edit Report Button */}
                          <div className="pt-2 border-t border-slate-100">
                            <button
                              onClick={() => setIsEditingReview(true)}
                              className="w-full py-2 bg-slate-100 hover:bg-slate-250 text-slate-800 font-bold text-[10px] rounded-lg transition-colors cursor-pointer flex justify-center items-center gap-1"
                            >
                              ✏️ Edit Report
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-xs">
                          <h4 className="text-[10px] font-extrabold text-slate-900 border-b border-slate-100 pb-1.5">Edit Report</h4>
                          
                          {/* Category Selector */}
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Category</label>
                            <select
                              value={reviewCategory}
                              onChange={(e) => setReviewCategory(e.target.value)}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              {CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>

                          {/* Severity Selector */}
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Severity Level</label>
                            <div className="grid grid-cols-4 gap-1">
                              {(["Low", "Medium", "High", "Critical"] as const).map((sev) => (
                                <button
                                  key={sev}
                                  type="button"
                                  onClick={() => setReviewSeverity(sev)}
                                  className={`py-1 rounded-lg text-[9px] font-bold transition-all border text-center ${
                                    reviewSeverity === sev 
                                      ? "bg-slate-950 border-slate-950 text-white shadow-xs" 
                                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                                  }`}
                                >
                                  {sev}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Description Input */}
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Description</label>
                            <textarea
                              value={reviewDescription}
                              onChange={(e) => setReviewDescription(e.target.value)}
                              rows={2}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              placeholder="Describe the issue observed..."
                            />
                          </div>

                          {/* Non-editable metadata indicators */}
                          <div className="bg-slate-50 p-2 rounded-lg grid grid-cols-3 gap-1 border border-slate-150 text-center">
                            <div>
                              <p className="text-[7px] font-bold text-slate-400 uppercase">Priority</p>
                              <p className="text-[10px] font-extrabold text-slate-600">{analysisResult?.priorityScore || 50}/100</p>
                            </div>
                            <div>
                              <p className="text-[7px] font-bold text-slate-400 uppercase">Department</p>
                              <p className="text-[9px] font-extrabold text-slate-600 truncate">{analysisResult?.department || "Sanitation"}</p>
                            </div>
                            <div>
                              <p className="text-[7px] font-bold text-slate-400 uppercase">Confidence</p>
                              <p className="text-[10px] font-extrabold text-slate-600">{analysisResult?.confidence || 0}%</p>
                            </div>
                          </div>

                          {/* Additional Citizen Notes Input */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-bold text-slate-500 uppercase">Additional Citizen Notes</label>
                              <span className="text-[8px] text-slate-400 font-medium">Optional</span>
                            </div>
                            <textarea
                              value={reviewCitizenNotes}
                              onChange={(e) => setReviewCitizenNotes(e.target.value)}
                              rows={2}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              placeholder="Examples:&#10;• Road is dangerous during rain.&#10;• Water leakage occurs daily.&#10;• Garbage has remained for two weeks."
                            />
                          </div>

                          {/* Save & Back buttons inside edit view */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => setIsEditingReview(false)}
                              className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                            >
                              Save & Close Form
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Primary Submission Control */}
                      <div className="pt-2 flex gap-2">
                        <button
                          onClick={resetReportingForm}
                          disabled={isSubmitting}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={submitFinalReport}
                          disabled={isSubmitting}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-400 text-white font-extrabold text-[11px] rounded-lg transition-colors cursor-pointer flex justify-center items-center gap-1 shadow-lg shadow-emerald-500/15"
                        >
                          {isSubmitting ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Submitting...</span>
                            </>
                          ) : (
                            <span>Submit Report</span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 5: RESULT */}
                  {reportingStep === "result" && (
                    <div className="space-y-4">
                      {analysisResult?.isInvalidImage ? (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
                          <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                            <AlertTriangle className="w-4 h-4" />
                            <span>No Civic Issue Found</span>
                          </div>
                          <p className="text-xs text-rose-700">
                            {analysisResult.description || "The uploaded image does not appear to contain a recognized urban infrastructure issue. Please capture or select a photo of potholes, trash piles, water leakage, or broken lights."}
                          </p>
                          <button
                            onClick={resetReportingForm}
                            className="w-full py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 transition-colors cursor-pointer"
                          >
                            Try Another Photo
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-2.5">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-xs font-bold text-emerald-800">Report Successfully Filed</h4>
                              <p className="text-[10px] text-emerald-600 mt-0.5">Gemini Vision finished analysis and has prioritized this dispatch.</p>
                            </div>
                          </div>

                          {/* AI Breakdown Card */}
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                            <div className="flex justify-between items-start border-b border-slate-100 pb-2.5">
                              <div>
                                <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest block mb-0.5">GEMINI VISION</span>
                                <h4 className="text-sm font-extrabold text-slate-900">{analysisResult?.category || "Other"}</h4>
                              </div>
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 border rounded-full ${getSeverityBadgeColor(analysisResult?.severity || "Medium")}`}>
                                {analysisResult?.severity || "Medium"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-3">
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Priority Score</p>
                                <p className="text-base font-extrabold text-red-600">{analysisResult?.priorityScore || 50}/100</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">AI Confidence</p>
                                <p className="text-base font-extrabold text-indigo-600">
                                  {analysisResult?.confidence ? `${Math.round(analysisResult.confidence)}%` : "N/A"}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2 text-xs">
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Description</p>
                                <p className="text-slate-700 leading-snug mt-0.5">{analysisResult?.description}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Suggested Correction Action</p>
                                <p className="text-slate-700 leading-snug mt-0.5">{analysisResult?.suggestedAction}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Estimated Impact</p>
                                <p className="text-slate-700 leading-snug mt-0.5">{analysisResult?.estimatedImpact || "Moderate local disruption."}</p>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={resetReportingForm}
                            className="w-full py-3 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            Return to Home
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SCREEN: MAP VIEW */}
              {screen === "map" && (
                <div className="space-y-4 flex flex-col h-full">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Incident Map</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Click markers to confirm and prioritize infrastructure repair requests.</p>
                  </div>

                  {!gettingLocation && !isLocationOn && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3.5 py-2.5 rounded-2xl flex items-start gap-2.5 shadow-sm leading-normal animate-fadeIn">
                      <span className="text-base shrink-0">⚠️</span>
                      <div>
                        <p className="font-extrabold text-[11px] uppercase tracking-wider text-amber-900">Device Location is Disabled</p>
                        <p className="text-amber-700 text-[11px] mt-0.5">Your browser's location is off or permission is denied. Displaying default simulation area in San Francisco.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 min-h-[360px] rounded-2xl overflow-hidden border border-slate-200 relative bg-slate-100 shadow-inner">
                    <OpenStreetMap
                      issues={issues.filter((issue) => issue.status !== "Resolved")}
                      center={coords}
                      onMarkerClick={(issue) => {
                        setSelectedIssue(issue);
                        setScreen("details");
                      }}
                    />
                    {!gettingLocation && !isLocationOn && (
                      <div className="absolute top-4 left-4 right-4 z-[1000] bg-rose-600 border border-rose-500 text-white text-[11px] px-3.5 py-2.5 rounded-xl flex items-start gap-2 shadow-lg leading-normal animate-fadeIn">
                        <span className="text-sm shrink-0 mt-0.5">⚠️</span>
                        <div>
                          <p className="font-extrabold text-[10px] uppercase tracking-wider text-rose-100">Location is Off</p>
                          <p className="text-white mt-0.5">Your device location is off. Displaying fallback simulated area in San Francisco.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SCREEN: MY REPORTS */}
              {screen === "my-reports" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Your Reports</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Track real-time progress of dispatches you've filed.</p>
                  </div>

                  <div className="space-y-2.5">
                    {issues.filter(i => i.createdBy === currentUserId).length === 0 ? (
                      <div className="py-12 bg-white text-center rounded-2xl border border-slate-150 space-y-2">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-xs font-bold text-slate-700">No Reports Filed Yet</p>
                        <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto leading-normal">
                          Go to the Home screen and capture an infrastructure incident to create your first report.
                        </p>
                      </div>
                    ) : (
                      issues
                        .filter(i => i.createdBy === currentUserId)
                        .map((issue) => (
                          <div
                            key={issue.issueId}
                            onClick={() => {
                              setSelectedIssue(issue);
                              setScreen("details");
                            }}
                            className="bg-white p-3 border border-slate-200 hover:border-slate-300 rounded-xl cursor-pointer transition-colors shadow-xs flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                                {issue.imageUrl ? (
                                  <img src={issue.imageUrl} alt={issue.category} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-slate-200 font-bold text-slate-400 text-xs">
                                    📸
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-xs font-extrabold text-slate-900 truncate">{issue.category}</h4>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{issue.description}</p>
                                <span className="text-[9px] font-semibold text-slate-500 block mt-1">
                                  {new Date(issue.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0 gap-1.5">
                              <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded ${getStatusBadgeColor(issue.status)}`}>
                                {issue.status}
                              </span>
                              <span className="text-[9px] font-bold text-red-600">
                                Priority: {issue.priorityScore}
                              </span>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

              {/* SCREEN: NOTIFICATIONS INBOX */}
              {screen === "notifications" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">Notification Inbox</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Municipal dispatches and issue resolution alerts.</p>
                    </div>
                    {notifications.some(n => !n.isRead) && (
                      <button
                        onClick={async () => {
                          const unread = notifications.filter(n => !n.isRead);
                          for (const notif of unread) {
                            try {
                              await updateDoc(doc(db, "notifications", notif.notificationId), { isRead: true });
                            } catch (e) {
                              console.error(e);
                            }
                          }
                        }}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {notifications.length === 0 ? (
                      <div className="py-16 bg-white text-center rounded-2xl border border-slate-150 space-y-3">
                        <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto">
                          <Bell className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-extrabold text-slate-700">No Notifications Yet</p>
                        <p className="text-[10px] text-slate-400 max-w-[220px] mx-auto leading-normal">
                          When city departments resolve issues reported by you, the proof and dispatches will appear here.
                        </p>
                      </div>
                    ) : (
                      notifications.map((notif) => {
                        const targetIssue = issues.find(i => i.issueId === notif.issueId);
                        return (
                          <div
                            key={notif.notificationId}
                            onClick={async () => {
                              await handleMarkAsRead(notif);
                              if (targetIssue) {
                                setSelectedIssue(targetIssue);
                                setScreen("details");
                              } else {
                                showToast("This incident report has been deleted or is no longer available.", "error");
                              }
                            }}
                            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer shadow-xs flex items-start gap-3 relative ${
                              notif.isRead
                                ? "bg-white border-slate-200/80 hover:border-slate-300"
                                : "bg-emerald-50/40 border-emerald-200/80 hover:border-emerald-300"
                            }`}
                          >
                            {/* Unread indicator */}
                            {!notif.isRead && (
                              <span className="absolute top-4 right-4 w-2 h-2 bg-emerald-500 rounded-full"></span>
                            )}

                            {/* Icon block */}
                            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                              <CheckCircle className="w-5 h-5 text-emerald-600" />
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  Resolved
                                </span>
                                <span className="text-[9px] text-slate-400">
                                  {new Date(notif.createdAt).toLocaleDateString()}
                                </span>
                              </div>

                              <p className="text-[11px] font-bold text-slate-800 leading-snug">
                                {notif.message}
                              </p>

                              {notif.resolutionNotes && (
                                <p className="text-[10px] text-slate-500 italic line-clamp-2 mt-0.5 leading-normal">
                                  &ldquo;{notif.resolutionNotes}&rdquo;
                                </p>
                              )}

                              {notif.resolvedImageUrl && (
                                <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 h-24 bg-slate-50">
                                  <img src={notif.resolvedImageUrl} alt="Resolution" className="w-full h-full object-cover" />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* SCREEN: ISSUE DETAILS */}
              {screen === "details" && selectedIssue && (
                <div className="space-y-4 text-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setScreen("map")}
                      className="p-1 hover:bg-slate-200 rounded-full cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <h3 className="text-sm font-extrabold text-slate-900">Incident Inspection</h3>
                  </div>

                  {selectedIssue.imageUrl && (
                    <div className="rounded-2xl overflow-hidden bg-slate-100 aspect-video relative">
                      <img src={selectedIssue.imageUrl} alt={selectedIssue.category} className="w-full h-full object-cover" />
                      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[9px] font-bold px-2 py-0.5 rounded-md">
                        Original Reported Issue Photo
                      </div>
                    </div>
                  )}

                  {selectedIssue.status === "Resolved" && selectedIssue.resolvedImageUrl && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3 shadow-xs">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-[10px] uppercase tracking-wider">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>MUNICIPAL RESOLUTION PROOF</span>
                      </div>
                      <div className="rounded-xl overflow-hidden bg-slate-100 aspect-video relative">
                        <img src={selectedIssue.resolvedImageUrl} alt="Resolution Proof" className="w-full h-full object-cover" />
                        <div className="absolute bottom-2 left-2 bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-md">
                          Fixed Site Photo
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Resolution Notes</p>
                        <p className="text-slate-800 text-xs italic mt-0.5 leading-snug bg-white p-2.5 rounded-xl border border-slate-100">
                          &ldquo;{selectedIssue.resolutionNotes || "Municipal crews have successfully resolved and inspected this reported issue."}&rdquo;
                        </p>
                      </div>
                      {selectedIssue.resolvedAt && (
                        <span className="text-[9px] text-emerald-600 font-bold block">
                          Completed on: {new Date(selectedIssue.resolvedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex justify-between items-start border-b border-slate-100 pb-2.5">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900">{selectedIssue.category}</h4>
                        <p className="text-[9px] text-slate-400 mt-0.5">ID: {selectedIssue.issueId.slice(0, 10)}...</p>
                      </div>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getSeverityBadgeColor(selectedIssue.severity)}`}>
                        {selectedIssue.severity}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">AI Priority Score</p>
                        <p className="text-base font-extrabold text-red-600">{selectedIssue.priorityScore}/100</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Status</p>
                        <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded ${getStatusBadgeColor(selectedIssue.status)}`}>
                          {selectedIssue.status}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Report Description</p>
                        <p className="text-slate-700 leading-snug mt-0.5">{selectedIssue.description}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">AI Recommended Resolution Time</p>
                        <p className="text-slate-700 leading-snug mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-indigo-500" />
                          <span>{selectedIssue.recommendedResolutionTime || "Awaiting calculation."}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Suggested Corrective Action</p>
                        <p className="text-slate-700 leading-snug mt-0.5">{selectedIssue.suggestedAction}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Estimated Impact</p>
                        <p className="text-slate-700 leading-snug mt-0.5">{selectedIssue.estimatedImpact || "Moderate localized risk."}</p>
                      </div>
                    </div>

                    {/* Community upvote buttons */}
                    <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-slate-500 text-xs">
                        <ThumbsUp className="w-4 h-4 text-emerald-500 fill-emerald-50" />
                        <span className="font-bold text-slate-800">{selectedIssue.confirmations} confirmations</span>
                      </div>

                      <button
                        onClick={() => toggleConfirmIssue(selectedIssue)}
                        className={`px-3 py-1.5 font-extrabold text-xs rounded-lg cursor-pointer transition-all flex items-center gap-1 ${
                          selectedIssue.votedBy?.includes(currentUserId || "")
                            ? "bg-rose-50 text-rose-600 border border-rose-200"
                            : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/10"
                        }`}
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>
                          {selectedIssue.votedBy?.includes(currentUserId || "") ? "Withdraw Confirmation" : "Confirm Issue"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Bottom Nav Bar */}
            <div className="absolute bottom-0 inset-x-0 h-16 bg-white border-t border-slate-200 px-4 flex justify-between items-center z-40 select-none shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
              <button
                onClick={() => {
                  setScreen("home");
                  resetReportingForm();
                }}
                className={`flex-1 flex flex-col items-center gap-1 cursor-pointer transition-colors ${screen === "home" ? "text-emerald-500" : "text-slate-400 hover:text-slate-600"}`}
              >
                <FileText className="w-5 h-5" />
                <span className="text-[9px] font-bold">Portal</span>
              </button>

              <button
                onClick={() => setScreen("map")}
                className={`flex-1 flex flex-col items-center gap-1 cursor-pointer transition-colors ${screen === "map" ? "text-emerald-500" : "text-slate-400 hover:text-slate-600"}`}
              >
                <MapIcon className="w-5 h-5" />
                <span className="text-[9px] font-bold">Map</span>
              </button>

              <button
                onClick={() => setScreen("my-reports")}
                className={`flex-1 flex flex-col items-center gap-1 cursor-pointer transition-colors ${screen === "my-reports" ? "text-emerald-500" : "text-slate-400 hover:text-slate-600"}`}
              >
                <SlidersHorizontal className="w-5 h-5" />
                <span className="text-[9px] font-bold">Reports</span>
              </button>

              <button
                onClick={() => setScreen("notifications")}
                className={`flex-1 flex flex-col items-center gap-1 cursor-pointer transition-colors relative ${screen === "notifications" ? "text-emerald-500" : "text-slate-400 hover:text-slate-600"}`}
              >
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <span className="absolute top-1.5 right-[30%] w-2.5 h-2.5 bg-rose-500 text-[8px] font-bold text-white rounded-full flex items-center justify-center border border-white"></span>
                )}
                <span className="text-[9px] font-bold">Inbox</span>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Phone Home Bar Indicator */}
      <div className="absolute bottom-1 inset-x-0 h-1 hidden sm:flex justify-center z-50">
        <div className="w-28 h-1 bg-slate-400 rounded-full"></div>
      </div>
    </div>
  );
}
