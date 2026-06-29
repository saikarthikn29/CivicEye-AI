import React, { useState } from "react";
import { db } from "../firebase";
import { doc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import {
  ShieldAlert,
  Clock,
  CheckCircle,
  AlertTriangle,
  Search,
  Filter,
  ArrowUpDown,
  ThumbsUp,
  FileText,
  MapPin,
  Sparkles,
  Calendar,
  ExternalLink,
  SlidersHorizontal,
  Trash2,
  LogOut,
  Plus
} from "lucide-react";
import { CATEGORIES, SEVERITIES, STATUSES, getDepartmentForCategory } from "../data";
import { SeverityLevel, Issue } from "../types";

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

interface DashboardProps {
  issues: Issue[];
  currentUserId: string | null;
  authorityDept: "Roads" | "Water" | "Electrical" | "Sanitation" | null;
  onSignOut: () => void;
}

export default function Dashboard({ issues, currentUserId, authorityDept, onSignOut }: DashboardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"priority" | "date">("priority");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [issueIdToDelete, setIssueIdToDelete] = useState<string | null>(null);
  
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Resolving states
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedPhoto, setResolvedPhoto] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolvingIssueId, setResolvingIssueId] = useState<string | null>(null);
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);

  // Standard high-fidelity mock resolution base64 proof images by department
  const RESOLVED_PRESETS_BY_DEPT: Record<string, Array<{ id: string; name: string; thumbnail: string; base64: string }>> = {
    Roads: [
      {
        id: "roads_fixed_1",
        name: "Fresh Asphalt Patch",
        thumbnail: "🛣️",
        base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEVsbGx6enpAAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
      },
      {
        id: "roads_fixed_2",
        name: "Repaired Curb Corner",
        thumbnail: "🧱",
        base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEXKyv9+YvcoAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
      }
    ],
    Water: [
      {
        id: "water_fixed_1",
        name: "Dry Repaired Valve",
        thumbnail: "🔧",
        base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEX/09P/zMzIAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
      }
    ],
    Electrical: [
      {
        id: "electrical_fixed_1",
        name: "Working LED Streetlamp",
        thumbnail: "💡",
        base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEV5eXn///8AAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
      }
    ],
    Sanitation: [
      {
        id: "sanitation_fixed_1",
        name: "Cleared Waste Container",
        thumbnail: "🗑️",
        base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEX/mZn69XbFAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
      }
    ]
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const originalBase64 = reader.result as string;
        try {
          const compressed = await compressImage(originalBase64);
          setResolvedPhoto(compressed);
        } catch (err) {
          console.error("Compression failed:", err);
          setResolvedPhoto(originalBase64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Filter issues for the specific department, with fallback category mapping
  const departmentIssues = issues.map((issue) => ({
    ...issue,
    department: issue.department || getDepartmentForCategory(issue.category)
  })).filter((issue) => issue.department === authorityDept);

  // Status counters
  const totalReports = departmentIssues.length;
  const openCount = departmentIssues.filter((i) => i.status === "Open").length;
  const inProgressCount = departmentIssues.filter((i) => i.status === "In Progress").length;
  const resolvedCount = departmentIssues.filter((i) => i.status === "Resolved").length;
  
  // Calculate average priority score of non-resolved issues
  const activeIssues = departmentIssues.filter((i) => i.status !== "Resolved");
  const avgPriority = activeIssues.length
    ? Math.round(activeIssues.reduce((acc, curr) => acc + curr.priorityScore, 0) / activeIssues.length)
    : 0;

  // Filter & Sort Logic
  const filteredIssues = departmentIssues
    .filter((issue) => {
      const matchesSearch =
        issue.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.issueId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "All" || issue.category === selectedCategory;
      const matchesSeverity = selectedSeverity === "All" || issue.severity === selectedSeverity;
      const matchesStatus = selectedStatus === "All" || issue.status === selectedStatus;
      return matchesSearch && matchesCategory && matchesSeverity && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "priority") {
        return sortOrder === "desc"
          ? b.priorityScore - a.priorityScore
          : a.priorityScore - b.priorityScore;
      } else {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      }
    });

  // Action: Update issue status
  const handleUpdateStatus = async (issueId: string, newStatus: "Open" | "In Progress" | "Resolved") => {
    if (newStatus === "Resolved") {
      setIsResolving(true);
      setResolvingIssueId(issueId);
      setResolvedPhoto(selectedIssue?.resolvedImageUrl || null);
      setResolutionNotes(selectedIssue?.resolutionNotes || "");
      return;
    }

    try {
      setIsResolving(false);
      setResolvingIssueId(null);
      const issueRef = doc(db, "issues", issueId);
      await updateDoc(issueRef, { status: newStatus });
      if (selectedIssue && selectedIssue.issueId === issueId) {
        setSelectedIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      showToast(`Status updated to ${newStatus} successfully.`);
    } catch (err) {
      console.error("Error updating issue status:", err);
      showToast("Failed to update status in Firestore. Ensure you have authorized permissions.", "error");
    }
  };

  const handleSubmitResolution = async () => {
    if (!resolvingIssueId || !selectedIssue) return;
    if (!resolvedPhoto) {
      showToast("Please upload or select a resolution photo as proof of work completion.", "error");
      return;
    }

    try {
      setIsSubmittingResolution(true);
      const issueRef = doc(db, "issues", resolvingIssueId);
      
      const updatePayload = {
        status: "Resolved" as const,
        resolvedImageUrl: resolvedPhoto,
        resolutionNotes: resolutionNotes || "Repairs successfully completed by municipal crew.",
        resolvedAt: new Date().toISOString()
      };

      await updateDoc(issueRef, updatePayload);

      // Create notification for the reporter
      const newNotifId = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const notificationDoc = {
        notificationId: newNotifId,
        userId: selectedIssue.createdBy || "anonymous",
        issueId: selectedIssue.issueId,
        issueCategory: selectedIssue.category,
        resolvedImageUrl: resolvedPhoto,
        resolutionNotes: resolutionNotes || "Repairs successfully completed by municipal crew.",
        message: `Success! The ${selectedIssue.category} reported by you has been fully RESOLVED by the ${authorityDept} department.`,
        createdAt: new Date().toISOString(),
        isRead: false
      };

      await setDoc(doc(db, "notifications", newNotifId), notificationDoc);

      // Close the report details view after successful resolution
      setSelectedIssue(null);

      // Reset resolution form state
      setIsResolving(false);
      setResolvedPhoto(null);
      setResolutionNotes("");
      setResolvingIssueId(null);
      showToast("Issue resolved successfully! Citizen was notified.");
    } catch (err) {
      console.error("Error submitting resolution:", err);
      showToast("Failed to resolve issue: " + (err as Error).message, "error");
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  // Action: Delete issue
  const handleDeleteIssue = async (issueId: string) => {
    try {
      await deleteDoc(doc(db, "issues", issueId));
      setSelectedIssue(null);
      setIssueIdToDelete(null);
      showToast("Incident report deleted successfully.", "success");
    } catch (err) {
      console.error("Error deleting issue:", err);
      showToast("Failed to delete issue report.", "error");
    }
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case "Critical": return "bg-red-500/10 text-red-500 border border-red-500/20";
      case "High": return "bg-orange-500/10 text-orange-500 border border-orange-500/20";
      case "Medium": return "bg-amber-500/10 text-amber-500 border border-amber-500/20";
      default: return "bg-green-500/10 text-green-500 border border-green-500/20";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Resolved": return "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
      case "In Progress": return "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20";
      default: return "bg-amber-500/10 text-amber-500 border border-amber-500/20";
    }
  };

  return (
    <div className="flex-1 bg-slate-900 text-slate-100 flex flex-col h-full font-sans relative">
      {/* Toast Overlay Banner */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-2xl bg-slate-950 border-slate-800 animate-fadeIn">
          <span className={`w-2 h-2 rounded-full ${toast.type === "success" ? "bg-emerald-400 animate-pulse" : toast.type === "error" ? "bg-rose-400" : "bg-blue-400"}`} />
          <span className="text-xs font-bold text-slate-200">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-[10px] text-slate-500 hover:text-slate-300 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Dashboard Toolbar Header */}
      <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0">
        <div>
          <span className="text-xs text-emerald-400 font-extrabold tracking-widest uppercase flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            {authorityDept} Department Portal
          </span>
          <h1 className="text-xl font-black text-white tracking-tight mt-0.5">
            {authorityDept} Department Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300">
            Signed in as: <span className="font-mono text-[11px] text-emerald-400">hack.{authorityDept?.toLowerCase()}29@gmail.com</span>
          </div>

          <button
            onClick={onSignOut}
            className="px-3.5 py-1.5 bg-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-300 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer border border-rose-500/30 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Stats Header Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-6 shrink-0 bg-slate-950/40 border-b border-slate-800">
        <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Reports</p>
          <p className="text-2xl font-extrabold text-white mt-1">{totalReports}</p>
          <span className="text-[9px] text-slate-500">All submitted reports</span>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unopened / Open</p>
          <p className="text-2xl font-extrabold text-amber-500 mt-1">{openCount}</p>
          <span className="text-[9px] text-amber-500/60 font-semibold">Needs attention</span>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">In Progress</p>
          <p className="text-2xl font-extrabold text-indigo-400 mt-1">{inProgressCount}</p>
          <span className="text-[9px] text-indigo-400/60 font-semibold">Crews dispatched</span>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resolved Cases</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{resolvedCount}</p>
          <span className="text-[9px] text-emerald-400/60 font-semibold">Repairs completed</span>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-2xl col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Incident Priority</p>
          <p className="text-2xl font-extrabold text-red-500 mt-1">{avgPriority}<span className="text-xs text-slate-500">/100</span></p>
          <span className="text-[9px] text-red-500/60 font-semibold">Active threats gravity</span>
        </div>
      </div>

      {/* Dashboard Body Split Pane */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Side: Search, Filter, List */}
        <div className="flex-1 flex flex-col overflow-y-auto border-r border-slate-800 p-6 min-w-0">
          
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by ID, Category, or Description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent text-xs text-slate-300 focus:outline-none border-none cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-slate-950">{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="bg-transparent text-xs text-slate-300 focus:outline-none border-none cursor-pointer"
                >
                  <option value="All">All Severity</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s} className="bg-slate-950">{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-transparent text-xs text-slate-300 focus:outline-none border-none cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-slate-950">{s}</option>
                  ))}
                </select>
              </div>

              {/* Sort Toggle Button */}
              <button
                onClick={() => {
                  if (sortBy === "priority") {
                    setSortBy("date");
                  } else {
                    setSortBy("priority");
                  }
                }}
                className="px-3 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center gap-1 cursor-pointer transition-colors"
                title="Toggle sorting criteria"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Sort: {sortBy === "priority" ? "Priority Score" : "Date Filed"}</span>
              </button>

              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs text-slate-300 cursor-pointer"
                title="Toggle Sort Order"
              >
                {sortOrder === "desc" ? "DESC" : "ASC"}
              </button>
            </div>
          </div>

          {/* Table / List representation */}
          <div className="flex-1 min-h-[300px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold select-none">
                    <th className="p-4 w-12 text-center">Score</th>
                    <th className="p-4">Report Details</th>
                    <th className="p-4 hidden md:table-cell">Coordinates</th>
                    <th className="p-4">Severity</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Confirmations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredIssues.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-500 font-semibold">
                        No reported incidents match the current search or filters.
                      </td>
                    </tr>
                  ) : (
                    filteredIssues.map((issue) => (
                      <tr
                        key={issue.issueId}
                        onClick={() => setSelectedIssue(issue)}
                        className={`hover:bg-slate-900/40 cursor-pointer transition-colors ${
                          selectedIssue?.issueId === issue.issueId ? "bg-slate-900/70" : ""
                        }`}
                      >
                        {/* Priority Score Column */}
                        <td className="p-4 text-center">
                          <span className={`inline-block font-extrabold text-sm px-2.5 py-1 rounded-lg ${
                            issue.priorityScore >= 75
                              ? "bg-red-500/20 text-red-500"
                              : issue.priorityScore >= 45
                              ? "bg-orange-500/20 text-orange-500"
                              : "bg-emerald-500/20 text-emerald-500"
                          }`}>
                            {issue.priorityScore}
                          </span>
                        </td>

                        {/* Details Column */}
                        <td className="p-4 max-w-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-800 shrink-0">
                              {issue.imageUrl ? (
                                <img src={issue.imageUrl} alt={issue.category} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-800 font-bold text-slate-600">
                                  👁️
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-white truncate">{issue.category}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{issue.description}</p>
                              <span className="text-[9px] text-slate-500 font-medium block mt-1">
                                Reported {new Date(issue.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Coordinates */}
                        <td className="p-4 hidden md:table-cell font-mono text-slate-400 text-[11px]">
                          {issue.latitude.toFixed(4)}, {issue.longitude.toFixed(4)}
                        </td>

                        {/* Severity */}
                        <td className="p-4">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${getSeverityBadgeColor(issue.severity)}`}>
                            {issue.severity}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="p-4">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${getStatusBadgeColor(issue.status)}`}>
                            {issue.status}
                          </span>
                        </td>

                        {/* Confirmations count */}
                        <td className="p-4 text-right pr-6 font-extrabold text-slate-300">
                          <div className="flex items-center justify-end gap-1">
                            <ThumbsUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{issue.confirmations || 0}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Detailed Admin Panel */}
        <div className="w-full lg:w-[420px] bg-slate-950/70 p-6 border-t lg:border-t-0 border-slate-800 overflow-y-auto shrink-0 flex flex-col justify-between">
          {selectedIssue ? (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              
              {/* Top details section */}
              <div className="space-y-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block">ADMIN SPECTOR</span>
                    <h3 className="text-base font-black text-white mt-0.5">{selectedIssue.category}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedIssue(null)}
                    className="text-slate-400 hover:text-white text-xs bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg cursor-pointer"
                  >
                    Close Pane
                  </button>
                </div>

                {selectedIssue.imageUrl && (
                  <div className="rounded-2xl overflow-hidden border border-slate-800 aspect-video relative bg-slate-900 shadow-lg">
                    <img src={selectedIssue.imageUrl} alt={selectedIssue.category} className="w-full h-full object-cover" />
                  </div>
                )}

                {selectedIssue.status === "Resolved" && selectedIssue.resolvedImageUrl && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-2xl space-y-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px] uppercase tracking-wider">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Resolution Proof Asset</span>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-emerald-500/10 aspect-video relative bg-slate-950">
                      <img src={selectedIssue.resolvedImageUrl} alt="Resolution Proof" className="w-full h-full object-cover" />
                    </div>
                    {selectedIssue.resolutionNotes && (
                      <p className="text-[11px] text-slate-300 italic mt-1 leading-relaxed">
                        &ldquo;{selectedIssue.resolutionNotes}&rdquo;
                      </p>
                    )}
                    {selectedIssue.resolvedAt && (
                      <span className="text-[9px] text-emerald-500/70 font-semibold block mt-0.5">
                        Resolved on {new Date(selectedIssue.resolvedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Severity & Confidence & Upvotes HUD */}
                <div className="grid grid-cols-3 gap-2.5 bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Severity</p>
                    <span className={`inline-block text-[10px] font-bold mt-1 px-2 py-0.5 rounded-full ${getSeverityBadgeColor(selectedIssue.severity)}`}>
                      {selectedIssue.severity}
                    </span>
                  </div>

                  <div className="text-center border-x border-slate-800">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">AI Conf</p>
                    <p className="text-xs font-extrabold text-indigo-400 mt-1">
                      {selectedIssue.confidence ? `${Math.round(selectedIssue.confidence)}%` : "N/A"}
                    </p>
                  </div>

                  <div className="text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Upvotes</p>
                    <p className="text-xs font-extrabold text-white mt-1 flex items-center justify-center gap-1">
                      <ThumbsUp className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{selectedIssue.confirmations}</span>
                    </p>
                  </div>
                </div>

                {/* AI generated assessment block */}
                <div className="space-y-3.5 text-xs text-slate-300">
                  <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/60">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Citizen Description</p>
                    <p className="text-slate-200 leading-relaxed mt-1">{selectedIssue.description}</p>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">AI Impact Analysis</p>
                    <p className="text-slate-200 leading-relaxed mt-1">{selectedIssue.estimatedImpact || "Moderate local environment or transit disturbance."}</p>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">AI Target Resolution Window</p>
                    <p className="text-slate-200 leading-relaxed mt-1 font-semibold text-indigo-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{selectedIssue.recommendedResolutionTime || "7 Days"}</span>
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">AI Corrective Guidelines</p>
                    <p className="text-slate-200 leading-relaxed mt-1 border-l-2 border-emerald-500 pl-2.5 italic">
                      {selectedIssue.suggestedAction}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Actions Panel */}
              <div className="border-t border-slate-800 pt-5 mt-6 space-y-3.5">
                {isResolving && resolvingIssueId === selectedIssue.issueId ? (
                  <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block">Provide Resolution Proof</span>
                      <button
                        onClick={() => {
                          setIsResolving(false);
                          setResolvingIssueId(null);
                        }}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase transition-colors"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Image Upload Input */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 block uppercase">Upload Resolution Photo *</label>
                      <label className="w-full flex items-center justify-center gap-2 py-2 bg-slate-950 border border-slate-800 hover:bg-slate-850 text-slate-300 rounded-xl cursor-pointer text-xs font-semibold transition-colors">
                        <Plus className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Upload Resolution Image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Presets Grid */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Or Select Standard Proof Asset</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(RESOLVED_PRESETS_BY_DEPT[authorityDept || "Roads"] || []).map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setResolvedPhoto(preset.base64)}
                            className={`p-2 bg-slate-950 hover:bg-slate-850 rounded-xl border text-[10px] font-bold flex items-center gap-1.5 transition-all text-left cursor-pointer ${
                              resolvedPhoto === preset.base64
                                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                                : "border-slate-800 text-slate-300"
                            }`}
                          >
                            <span className="text-base shrink-0">{preset.thumbnail}</span>
                            <span className="truncate">{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Preview of Resolved Image */}
                    {resolvedPhoto && (
                      <div className="relative rounded-xl overflow-hidden border border-slate-800 aspect-video bg-slate-950">
                        <img src={resolvedPhoto} alt="Resolution Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setResolvedPhoto(null)}
                          className="absolute top-1 right-1 p-1 bg-slate-950/85 hover:bg-rose-600 rounded-full text-white text-[10px] w-5 h-5 flex items-center justify-center transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Resolution Notes */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 block uppercase">Resolution Notes / Details</label>
                      <textarea
                        rows={2}
                        placeholder="Detail the work completed by the municipal dispatch crews..."
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none resize-none"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      onClick={handleSubmitResolution}
                      disabled={isSubmittingResolution || !resolvedPhoto}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/15"
                    >
                      {isSubmittingResolution ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                          <span>Submitting Resolution...</span>
                        </>
                      ) : (
                        <span>Verify & Mark Resolved</span>
                      )}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Update Incident Status</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleUpdateStatus(selectedIssue.issueId, "Open")}
                        className={`py-2 text-xs font-bold rounded-xl cursor-pointer border transition-colors ${
                          selectedIssue.status === "Open"
                            ? "bg-amber-500 text-slate-950 border-amber-500"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                        }`}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedIssue.issueId, "In Progress")}
                        className={`py-2 text-xs font-bold rounded-xl cursor-pointer border transition-colors ${
                          selectedIssue.status === "In Progress"
                            ? "bg-indigo-500 text-white border-indigo-500"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                        }`}
                      >
                        In Progress
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedIssue.issueId, "Resolved")}
                        className={`py-2 text-xs font-bold rounded-xl cursor-pointer border transition-colors ${
                          selectedIssue.status === "Resolved"
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                        }`}
                      >
                        Resolved
                      </button>
                    </div>
                  </>
                )}

                <div className="flex justify-between items-center pt-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span>SF Incident Zone</span>
                  </span>
                  
                  {issueIdToDelete === selectedIssue.issueId ? (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-2 flex items-center justify-between gap-3 shrink-0 animate-fadeIn">
                      <span className="text-[9px] font-bold text-rose-400">Delete report permanently?</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDeleteIssue(selectedIssue.issueId)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-extrabold uppercase transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setIssueIdToDelete(null)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-extrabold uppercase transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIssueIdToDelete(selectedIssue.issueId)}
                      className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                      title="Delete Incident Report"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-[10px] font-bold">Remove Report</span>
                    </button>
                  )}
                </div>

              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center text-center py-20 text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl p-4">
              <FileText className="w-12 h-12 text-slate-700 mb-3" />
              <h4 className="text-sm font-bold text-slate-400">No Incident Selected</h4>
              <p className="text-xs text-slate-600 mt-1 max-w-[240px] leading-relaxed">
                Click on any reported row on the left grid to view deep AI assessments, inspect submitted photo assets, and dispatch municipal correction crews.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
