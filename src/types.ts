export type Priority = 'low' | 'medium' | 'high';
export type Category = 'Work' | 'Personal' | 'Shopping' | 'Urgent' | 'General';
export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Todo {
  id: string;
  uid: string;
  tenantId: string; // ID of the workspace
  title: string;
  completed: boolean;
  status?: TaskStatus;
  assignees?: string[];
  priority: Priority;
  category: Category;
  createdAt: number;
  dueDate: number | null;
  subtasks?: Subtask[];
  dependencies?: string[]; // Array of todo IDs
  tags?: string[];
  reminderTime: number | null;
  reminderSent: boolean;
  recurringInterval?: number | null;
  lastNotifiedAt?: number | null;
  estimatedMinutes?: number | null;
  completedAt?: number | null;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  members: string[]; // Array of user UIDs
  createdAt: number;
}

export interface Settings {
  uid: string;
  darkMode: boolean;
  notificationInterval: number; // in minutes
  notificationsEnabled: boolean;
  soundEnabled: boolean;
}

export type SortOption = 'createdAt' | 'dueDate' | 'priority' | 'category';
export type FilterOption = 'all' | 'active' | 'completed';
export type ViewMode = 'list' | 'board';
