export type SeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type IssueStatus = 'Open' | 'In Progress' | 'Resolved';

export interface Issue {
  issueId: string;
  category: string;
  department: string;
  severity: SeverityLevel;
  description: string;
  suggestedAction: string;
  priorityScore: number;
  latitude: number;
  longitude: number;
  status: IssueStatus;
  confirmations: number;
  createdBy: string;
  createdAt: string; // ISO string
  imageUrl?: string;
  confidence?: number;
  estimatedImpact?: string;
  recommendedResolutionTime?: string;
  votedBy?: string[]; // Array of user IDs who upvoted / confirmed
  aiCategory?: string;
  userCategory?: string;
  citizenNotes?: string;
  resolvedImageUrl?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
}

export interface CivicNotification {
  notificationId: string;
  userId: string;
  issueId: string;
  issueCategory: string;
  resolvedImageUrl: string;
  resolutionNotes?: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
}
