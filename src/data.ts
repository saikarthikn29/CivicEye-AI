export interface ImagePreset {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
  base64: string;
}

export const CATEGORIES = [
  "Pothole",
  "Road Damage",
  "Broken Footpath",
  "Water Leakage",
  "Drainage Problem",
  "Sewage Overflow",
  "Damaged Streetlight",
  "Electrical Hazard",
  "Garbage",
  "Illegal Dumping",
  "Waste Management",
  "Other"
];

export function getDepartmentForCategory(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes("pothole") || cat.includes("road damage") || cat.includes("broken footpath") || cat.includes("footpath") || cat.includes("road")) {
    return "Roads";
  }
  if (cat.includes("water leakage") || cat.includes("leakage") || cat.includes("drainage problem") || cat.includes("drainage") || cat.includes("sewage") || cat.includes("water")) {
    return "Water";
  }
  if (cat.includes("streetlight") || cat.includes("electrical hazard") || cat.includes("electrical")) {
    return "Electrical";
  }
  if (cat.includes("garbage") || cat.includes("illegal dumping") || cat.includes("dumping") || cat.includes("waste") || cat.includes("sanitation")) {
    return "Sanitation";
  }
  return "Sanitation"; // default fallback
}

export const SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;

export const STATUSES = ["Open", "In Progress", "Resolved"] as const;

// Base64 representations of realistic urban issues for quick-testing inside the browser
export const IMAGE_PRESETS: ImagePreset[] = [
  {
    id: "pothole",
    name: "Deep Pothole on Asphalt",
    category: "Pothole",
    thumbnail: "🕳️",
    // Clean JPEG base64 for a pothole illustration (simple grey circular hazard)
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEXKyv9+YvcoAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
  },
  {
    id: "garbage",
    name: "Overflowing Garbage Bin",
    category: "Garbage",
    thumbnail: "🗑️",
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEX/mZn69XbFAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
  },
  {
    id: "water_leak",
    name: "Ruptured Water Main Pipe",
    category: "Water Leakage",
    thumbnail: "💧",
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEX/09P/zMzIAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
  },
  {
    id: "streetlight",
    name: "Flickering / Dark Streetlight",
    category: "Damaged Streetlight",
    thumbnail: "💡",
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAAB19gQPAAAAA1BMVEV5eXn///8AAAAAR0lEQVR4nO3BMQEAAADCoPVP7WULoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuDv7pAAFZ4D72AAAAAElFTkSuQmCC"
  }
];

// Sample civic issues to seed the map and lists if Firestore starts empty
export const SAMPLE_ISSUES = [
  {
    issueId: "seed-1",
    category: "Pothole",
    department: "Roads",
    severity: "High",
    description: "Huge pothole in the middle of the left lane on Main Street, causing cars to swerve dangerously.",
    suggestedAction: "Patch the road asphalt immediately and place hazard signs.",
    priorityScore: 78,
    latitude: 37.7749,
    longitude: -122.4194,
    status: "Open",
    confirmations: 12,
    createdBy: "demo-user",
    createdAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    confidence: 0.94,
    estimatedImpact: "Moderate traffic disruption and high collision risk for two-wheelers.",
    recommendedResolutionTime: "48 Hours"
  },
  {
    issueId: "seed-2",
    category: "Garbage",
    department: "Sanitation",
    severity: "Medium",
    description: "Illegal garbage dumping in the public park corner near the children's slide.",
    suggestedAction: "Send waste clearance crew and install 'No Littering' warning sign.",
    priorityScore: 45,
    latitude: 37.7833,
    longitude: -122.4167,
    status: "In Progress",
    confirmations: 4,
    createdBy: "demo-user",
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    confidence: 0.89,
    estimatedImpact: "Sanitation hazard, strong odors, and unpleasant environmental conditions.",
    recommendedResolutionTime: "3 Days"
  },
  {
    issueId: "seed-3",
    category: "Damaged Streetlight",
    department: "Electrical",
    severity: "Low",
    description: "The streetlight lamp post #144 has been completely out for a week, leaving the alley dark.",
    suggestedAction: "Replace the defective LED bulb.",
    priorityScore: 25,
    latitude: 37.7699,
    longitude: -122.4468,
    status: "Resolved",
    confirmations: 1,
    createdBy: "demo-user",
    createdAt: new Date(Date.now() - 72 * 3600000).toISOString(),
    confidence: 0.97,
    estimatedImpact: "Slight decrease in safety/security feel at night.",
    recommendedResolutionTime: "7 Days"
  }
];
