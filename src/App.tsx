import React, { useState, useEffect, useRef, FormEvent, createContext, useContext, ReactNode, Component } from 'react';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  Moon, 
  Sun, 
  Bell, 
  BellOff, 
  Settings as SettingsIcon,
  X,
  AlertCircle,
  Clock,
  LogOut,
  LogIn,
  Calendar,
  ChevronDown,
  Edit2,
  Save,
  Filter,
  ArrowUpDown,
  RotateCcw,
  CheckSquare,
  Square,
  Trash,
  Check,
  Link as LinkIcon,
  ListTodo,
  Tag as TagIcon,
  Users,
  PlusCircle,
  Mic,
  BarChart2,
  Sparkles,
  Loader2,
  LayoutList,
  Columns,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Todo, Priority, Category, Settings, SortOption, FilterOption, Subtask, Workspace, ViewMode, TaskStatus } from './types';
import { analyzeTask } from './lib/smartLogic';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { generateSubtasks } from './lib/gemini';
import { 
  onSnapshot, 
  collection, 
  query, 
  where, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  orderBy, 
  getDoc 
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

// --- Context ---
interface AuthContextType {
  user: User | null;
  loading: boolean;
}
const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

// --- Helpers ---
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const NOTIFY_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

// --- Task Item Component ---
function TaskItem({ 
  todo, 
  onToggle, 
  onDelete, 
  onUpdate,
  isSelected,
  onSelect,
  allTodos,
  workspaceMembers
}: { 
  todo: Todo; 
  onToggle: (id: string) => Promise<void> | void; 
  onDelete: (id: string) => Promise<void> | void;
  onUpdate: (id: string, updates: Partial<Todo>) => Promise<void> | void;
  isSelected: boolean;
  onSelect: (id: string) => void;
  allTodos: Todo[];
  workspaceMembers: string[];
  key?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editPriority, setEditPriority] = useState<Priority>(todo.priority);
  const [editCategory, setEditCategory] = useState<Category>(todo.category);
  const [editSubtasks, setEditSubtasks] = useState<Subtask[]>(todo.subtasks || []);
  const [editTags, setEditTags] = useState<string[]>(todo.tags || []);
  const [editDependencies, setEditDependencies] = useState<string[]>(todo.dependencies || []);
  const [editAssignees, setEditAssignees] = useState<string[]>(todo.assignees || []);
  const [editDuration, setEditDuration] = useState<string>(todo.estimatedMinutes ? todo.estimatedMinutes.toString() : '');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [newTag, setNewTag] = useState('');

  const isOverdue = todo.dueDate && !todo.completed && todo.dueDate < Date.now();

  // Check if dependencies are met
  const unmetDependencies = (todo.dependencies || []).filter(depId => {
    const depTask = allTodos.find(t => t.id === depId);
    return depTask && !depTask.completed;
  });
  const canComplete = unmetDependencies.length === 0;

  const handleSave = () => {
    onUpdate(todo.id, { 
      title: editTitle, 
      priority: editPriority, 
      category: editCategory,
      subtasks: editSubtasks,
      tags: editTags,
      dependencies: editDependencies,
      assignees: editAssignees,
      estimatedMinutes: editDuration ? parseInt(editDuration) : null
    });
    setIsEditing(false);
  };

  const addSubtask = () => {
    if (newSubtaskTitle.trim()) {
      setEditSubtasks([...editSubtasks, { id: generateId(), title: newSubtaskTitle.trim(), completed: false }]);
      setNewSubtaskTitle('');
    }
  };

  const handleAIGenerate = async () => {
    setIsGeneratingAI(true);
    try {
      const generated = await generateSubtasks(editTitle);
      const newSubtasks = generated.map(t => ({
        id: generateId(),
        title: t,
        completed: false
      }));
      setEditSubtasks(prev => [...prev, ...newSubtasks]);
    } catch (e) {
      console.error(e);
      alert("Failed to generate subtasks from AI.");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const toggleSubtask = (subId: string) => {
    setEditSubtasks(editSubtasks.map(s => s.id === subId ? { ...s, completed: !s.completed } : s));
  };

  const removeSubtask = (subId: string) => {
    setEditSubtasks(editSubtasks.filter(s => s.id !== subId));
  };

  const addTag = () => {
    if (!newTag.trim() || editTags.includes(newTag.trim())) return;
    setEditTags([...editTags, newTag.trim()]);
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setEditTags(editTags.filter(t => t !== tag));
  };

  const toggleDependency = (depId: string) => {
    setEditDependencies(prev => 
      prev.includes(depId) ? prev.filter(id => id !== depId) : [...prev, depId]
    );
  };

  const priorityColors = {
    high: 'text-red-500 bg-red-50 dark:bg-red-900/20',
    medium: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
    low: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
  };

  const priorityDots = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-emerald-500'
  };

  const subtaskProgress = todo.subtasks && todo.subtasks.length > 0
    ? Math.round((todo.subtasks.filter(s => s.completed).length / todo.subtasks.length) * 100)
    : 0;

  return (
    <motion.div
      layout
      whileHover={{ y: -4, scale: 1.01 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group relative flex flex-col gap-3 glass-card p-4 md:p-5 rounded-3xl border-l-[6px] ${
        todo.priority === 'high' ? 'border-l-red-500' : 
        todo.priority === 'medium' ? 'border-l-amber-500' : 'border-l-emerald-500'
      } ${isSelected ? 'ring-2 ring-indigo-500 shadow-indigo-500/20' : ''} transition-all duration-300`}
    >
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-4">
          <motion.button 
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            title={isSelected ? "Deselect" : "Select"}
            onClick={() => onSelect(todo.id)}
            className={`p-1.5 rounded-lg transition-colors ${isSelected ? 'text-indigo-500 bg-indigo-500/10' : 'text-slate-300 hover:text-slate-400'}`}
          >
            {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
          </motion.button>
          
          <motion.button 
            whileHover={canComplete ? { scale: 1.1 } : {}}
            whileTap={canComplete ? { scale: 0.9 } : {}}
            title={todo.completed ? "Mark as Active" : "Mark as Completed"}
            onClick={() => canComplete ? onToggle(todo.id) : null}
            disabled={!canComplete}
            className={`relative transition-all duration-500 ${!canComplete ? 'opacity-20 cursor-not-allowed' : todo.completed ? 'text-emerald-500 bg-emerald-500/10 rounded-full p-1' : 'text-slate-400 hover:text-indigo-500'}`}
          >
            {todo.completed ? <CheckCircle2 size={24} className="md:w-[28px] md:h-[28px]" /> : <Circle size={24} className="md:w-[28px] md:h-[28px]" />}
          </motion.button>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <input
                type="text"
                title="Task Title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full min-w-0 bg-slate-100/50 dark:bg-slate-800/50 border-none rounded-xl px-3 py-2 text-lg font-black focus:ring-2 ring-primary/30 text-slate-950 dark:text-white"
                autoFocus
              />
            ) : (
              <h4 
                onClick={() => setIsEditing(true)}
                className={`text-base md:text-lg font-black break-words cursor-pointer transition-all whitespace-pre-wrap ${todo.completed ? 'line-through text-slate-400 opacity-60' : 'text-slate-950 dark:text-white hover:text-primary'}`}
              >
                {todo.title}
              </h4>
            )}
            
            {todo.reminderTime && !todo.completed && (
              <motion.div 
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-primary bg-primary/10 p-1.5 rounded-lg"
                title="Active Reminder"
              >
                <Bell size={14} />
              </motion.div>
            )}
          </div>
          
          {!isEditing && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${priorityColors[todo.priority]}`}>
                {todo.priority}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
                {todo.category}
              </span>
              
              {todo.dueDate && (
                <span className={`text-[10px] flex items-center gap-1.5 font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${isOverdue ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-primary/10 text-primary'}`}>
                  <Clock size={12} />
                  {new Date(todo.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
              
              {todo.estimatedMinutes && (
                <span className="text-[10px] flex items-center gap-1.5 font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Clock size={12} />
                  {todo.estimatedMinutes >= 60 ? `${(todo.estimatedMinutes / 60).toFixed(1).replace(/\.0$/, '')}h` : `${todo.estimatedMinutes}m`}
                </span>
              )}

              {/* Progress for subtasks */}
              {todo.subtasks && todo.subtasks.length > 0 && (
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-white/5">
                  <Bell size={14} className="text-primary" />
                  <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${subtaskProgress}%` }}
                      className="h-full bg-emerald-500" 
                    />
                  </div>
                  <span className="text-[10px] font-black text-slate-400">{subtaskProgress}%</span>
                </div>
              )}
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1.5 md:gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsEditing(true)}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary transition-colors"
            >
              <Edit2 size={18} />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Delete Task"
              onClick={() => onDelete(todo.id)}
              className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
            >
              <Trash2 size={18} />
            </motion.button>
          </div>
        )}
      </div>

      {isEditing && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-6 pt-4 border-t border-slate-100 dark:border-slate-800"
        >
          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Priority</label>
              <div className="flex flex-wrap gap-2">
                {(['low', 'medium', 'high'] as Priority[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setEditPriority(p)}
                    className={`flex-1 min-w-[30%] py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${editPriority === p ? priorityColors[p] + ' ring-2 ring-current ring-offset-2 dark:ring-offset-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Category</label>
              <select 
                title="Category"
                value={editCategory} 
                onChange={(e) => setEditCategory(e.target.value as Category)}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 ring-primary/30"
              >
                {['Work', 'Personal', 'Shopping', 'Urgent', 'General'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Duration (minutes)</label>
              <input 
                type="number"
                min="0"
                title="Estimated Minutes"
                value={editDuration}
                onChange={(e) => setEditDuration(e.target.value)}
                placeholder="e.g. 30"
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 ring-primary/30 text-slate-950 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-3">
             <div className="flex flex-wrap items-center justify-between px-1 gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Subtasks Breakdown</label>
                <button 
                  onClick={handleAIGenerate} 
                  disabled={isGeneratingAI}
                  className="text-[10px] font-black text-primary bg-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                >
                  {isGeneratingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {isGeneratingAI ? 'Processing...' : 'AI Breakdown'}
                </button>
             </div>
             <div className="space-y-2">
                {editSubtasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-3 bg-slate-100/30 dark:bg-slate-800/30 p-3 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                    <button 
                      type="button"
                      title={sub.completed ? "Mark subtask active" : "Mark subtask completed"}
                      onClick={() => toggleSubtask(sub.id)} 
                      className={sub.completed ? 'text-emerald-500' : 'text-slate-300'}
                    >
                      {sub.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </button>
                    <span className={`text-xs font-medium flex-1 ${sub.completed ? 'line-through opacity-40' : 'text-slate-950 dark:text-slate-300'}`}>{sub.title}</span>
                    <button 
                      type="button"
                      title="Remove subtask"
                      onClick={() => removeSubtask(sub.id)} 
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newSubtaskTitle} 
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Break it down..."
                    className="w-full min-w-0 flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 ring-primary/50 text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                  />
                  <button 
                    type="button"
                    title="Add subtask"
                    onClick={addSubtask} 
                    className="p-3 bg-primary text-white rounded-xl shadow-lg shadow-cyan-500/20 shrink-0"
                  >
                    <Plus size={18} />
                  </button>
                </div>
             </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              onClick={() => setIsEditing(false)}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave} 
              className="flex-1 py-3 premium-gradient text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-cyan-500/30"
            >
              Save Changes
            </button>
          </div>
        </motion.div>
      )}

      {/* Dependency Warning */}
      {unmetDependencies.length > 0 && !isEditing && (
        <div className="mt-2 flex items-center gap-2 bg-amber-500/10 text-amber-500 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
          <AlertCircle size={14} />
          Blocked by {unmetDependencies.length} unfinished tasks
        </div>
      )}

      {/* Tags Display */}
      {todo.tags && todo.tags.length > 0 && !isEditing && (
        <div className="flex gap-2 mt-1">
          {todo.tags.map(tag => (
            <span key={tag} className="text-[8px] font-black uppercase tracking-tighter text-primary bg-cyan-500/5 px-1.5 py-0.5 rounded border border-cyan-500/10">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// --- Main App Component ---
function SmartTasker() {
  const { user, loading: authLoading } = useContext(AuthContext);
  
  // --- State ---
  const [todos, setTodos] = useState<Todo[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [settings, setSettings] = useState<Settings>({
    uid: '',
    darkMode: false,
    notificationInterval: 15,
    notificationsEnabled: false,
    soundEnabled: true
  });

  const [inputValue, setInputValue] = useState('');
  const [dueDateValue, setDueDateValue] = useState('');
  const [durationValue, setDurationValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [categoryFilter, setCategoryFilter] = useState<'All' | Category>('All');
  const [sortBy, setSortBy] = useState<SortOption>('createdAt');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastDeletedTodo, setLastDeletedTodo] = useState<Todo | null>(null);
  const [reminderMinutes, setReminderMinutes] = useState<string>('0');
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // --- Refs ---
  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const addTaskInputRef = useRef<HTMLInputElement>(null);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'n') {
        e.preventDefault();
        addTaskInputRef.current?.focus();
      } else if (key === 's') {
        e.preventDefault();
        setIsSettingsOpen(prev => !prev);
      } else if (key === 'enter' && selectedIds.length > 0) {
        e.preventDefault();
        handleBulkComplete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds]);

  // --- Firebase Sync ---
  useEffect(() => {
    if (!user) {
      setTodos([]);
      setWorkspaces([]);
      setCurrentWorkspace(null);
      return;
    }

    // Sync Workspaces
    const wq = query(collection(db, 'workspaces'), where('members', 'array-contains', user.uid));
    const unsubWorkspaces = onSnapshot(wq, (snapshot) => {
      const newWorkspaces = snapshot.docs.map(doc => ({ ...doc.data() } as Workspace));
      newWorkspaces.sort((a, b) => b.createdAt - a.createdAt);
      setWorkspaces(newWorkspaces);
      
      // Set current workspace if not set or if current one is gone
      if (newWorkspaces.length > 0) {
        if (!currentWorkspace || !newWorkspaces.find(w => w.id === currentWorkspace.id)) {
          setCurrentWorkspace(newWorkspaces[0]);
        } else {
          // Update current workspace data
          const updated = newWorkspaces.find(w => w.id === currentWorkspace.id);
          if (updated) setCurrentWorkspace(updated);
        }
      } else {
        // Create a default workspace if none exist
        const id = generateId();
        const defaultWorkspace: Workspace = {
          id,
          name: 'My Workspace',
          ownerId: user.uid,
          members: [user.uid],
          createdAt: Date.now()
        };
        setCurrentWorkspace(defaultWorkspace);
        setDoc(doc(db, 'workspaces', id), defaultWorkspace)
          .catch(err => handleFirestoreError(err, OperationType.WRITE, `workspaces/${id}`));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'workspaces'));

    // Sync Todos (scoped to current workspace)
    let unsubTodos = () => {};
    if (currentWorkspace) {
      const q = query(collection(db, 'todos'), where('tenantId', '==', currentWorkspace.id));
      unsubTodos = onSnapshot(q, (snapshot) => {
        const newTodos = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            dueDate: data.dueDate ?? null,
            reminderTime: data.reminderTime ?? null,
            reminderSent: data.reminderSent ?? false
          } as Todo;
        });
        setTodos(newTodos);
      }, (error) => handleFirestoreError(error, OperationType.GET, 'todos'));
    }

    // Sync Settings
    const unsubSettings = onSnapshot(doc(db, 'settings', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as Settings);
      } else {
        // Initialize settings if they don't exist
        const initialSettings: Settings = {
          uid: user.uid,
          darkMode: false,
          notificationInterval: 15,
          notificationsEnabled: false,
          soundEnabled: true
        };
        setDoc(doc(db, 'settings', user.uid), initialSettings)
          .catch(err => handleFirestoreError(err, OperationType.WRITE, `settings/${user.uid}`));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `settings/${user.uid}`));

    return () => {
      unsubWorkspaces();
      unsubTodos();
      unsubSettings();
    };
  }, [user, currentWorkspace?.id]);

  // --- Effects ---
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  // --- Notifications Logic ---
  const checkNotifications = async () => {
    if (!settings.notificationsEnabled) return;
    
    const now = Date.now();
    const tasksToNotify = todos.filter(t => 
      !t.completed && 
      t.reminderTime && 
      !t.reminderSent && 
      now >= t.reminderTime
    );

    for (const task of tasksToNotify) {
      new Notification('Task Reminder', {
        body: `Time to work on: ${task.title}`,
        icon: '/logo192.png'
      });

      // Play Sound if enabled
      if (settings.soundEnabled) {
        try {
          const audio = new Audio(NOTIFY_SOUND_URL);
          audio.play().catch(e => console.warn('Audio play failed (interaction required):', e));
        } catch (e) {
          console.error('Error playing notification sound:', e);
        }
      }
      
      // Mark as sent in Firestore
      try {
        await updateDoc(doc(db, 'todos', task.id), { reminderSent: true });
      } catch (err) {
        console.error('Error marking reminder as sent:', err);
      }
    }
  };

  useEffect(() => {
    const timer = setInterval(checkNotifications, 10000); // Check every 10 seconds
    return () => clearInterval(timer);
  }, [todos, settings.notificationsEnabled]);

  // --- Handlers ---
  const handleAddTodo = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    console.log('handleAddTodo called', { inputValue, user: !!user });
    
    if (!inputValue.trim() || !user) {
      console.warn('Add aborted: Empty input or no user');
      return;
    }

    const workspaceId = currentWorkspace?.id || 'default';
    const { priority, category } = analyzeTask(inputValue);
    const id = generateId();
    
    const dueTime = dueDateValue ? new Date(dueDateValue).getTime() : null;
    const minutes = parseInt(reminderMinutes);
    const reminderTime = (dueTime && minutes > 0) ? dueTime - (minutes * 60 * 1000) : null;

    const newTodo: Todo = {
      id,
      uid: user.uid,
      tenantId: workspaceId,
      title: inputValue.trim(),
      completed: false,
      priority,
      category,
      createdAt: Date.now(),
      dueDate: dueTime,
      reminderTime,
      reminderSent: false,
      estimatedMinutes: durationValue ? parseInt(durationValue) : null
    };

    try {
      await setDoc(doc(db, 'todos', id), newTodo);
      console.log('Task added successfully', id);
      setInputValue('');
      setDueDateValue('');
      setDurationValue('');
    } catch (err) {
      console.error('Error in handleAddTodo:', err);
      handleFirestoreError(err, OperationType.WRITE, `todos/${id}`);
    }
  };

  const toggleTodo = async (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    try {
      const updates: Partial<Todo> = { completed: !todo.completed };
      if (!todo.completed) {
        updates.completedAt = Date.now();
      } else {
        updates.completedAt = null;
      }
      await updateDoc(doc(db, 'todos', id), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `todos/${id}`);
    }
  };

  const deleteTodo = async (id: string) => {
    const todoToDelete = todos.find(t => t.id === id);
    if (!todoToDelete) return;
    
    try {
      await deleteDoc(doc(db, 'todos', id));
      setLastDeletedTodo(todoToDelete);
      setShowUndoToast(true);
      setTimeout(() => setShowUndoToast(false), 5000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `todos/${id}`);
    }
  };

  const handleUndoDelete = async () => {
    if (!lastDeletedTodo) return;
    try {
      await setDoc(doc(db, 'todos', lastDeletedTodo.id), lastDeletedTodo);
      setLastDeletedTodo(null);
      setShowUndoToast(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `todos/${lastDeletedTodo.id}`);
    }
  };

  const handleClearCompleted = async () => {
    const completedTodos = todos.filter(t => t.completed && t.tenantId === currentWorkspace?.id);
    for (const todo of completedTodos) {
      try {
        await deleteDoc(doc(db, 'todos', todo.id));
      } catch (err) {
        console.error('Error clearing completed:', err);
      }
    }
    setShowClearConfirm(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim() || !user) return;
    const id = generateId();
    const newWorkspace: Workspace = {
      id,
      name: newWorkspaceName.trim(),
      ownerId: user.uid,
      members: [user.uid],
      createdAt: Date.now()
    };
    try {
      await setDoc(doc(db, 'workspaces', id), newWorkspace);
      setNewWorkspaceName('');
      setShowWorkspaceModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `workspaces/${id}`);
    }
  };

  const handleInviteMember = async () => {
    if (!inviteUserId.trim() || !currentWorkspace || !user) return;
    if (currentWorkspace.ownerId !== user.uid) {
      alert("Only the owner can invite members.");
      return;
    }
    if (currentWorkspace.members.includes(inviteUserId.trim())) {
      alert("User is already a member.");
      return;
    }
    try {
      await updateDoc(doc(db, 'workspaces', currentWorkspace.id), {
        members: [...currentWorkspace.members, inviteUserId.trim()]
      });
      setInviteUserId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workspaces/${currentWorkspace.id}`);
    }
  };

  const handleBulkComplete = async () => {
    for (const id of selectedIds) {
      try {
        await updateDoc(doc(db, 'todos', id), { 
          completed: true,
          completedAt: Date.now()
        });
      } catch (err) {
        console.error('Error bulk completing:', err);
      }
    }
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      try {
        await deleteDoc(doc(db, 'todos', id));
      } catch (err) {
        console.error('Error bulk deleting:', err);
      }
    }
    setSelectedIds([]);
  };

  const updateTodo = async (id: string, updates: Partial<Todo>) => {
    try {
      await updateDoc(doc(db, 'todos', id), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `todos/${id}`);
    }
  };

  const updateSettings = async (updates: Partial<Settings>) => {
    if (!user) return;
    
    // Create new object to avoid sending undefined fields
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    setSettings(prev => ({ ...prev, ...cleanUpdates }));
    try {
      await setDoc(doc(db, 'settings', user.uid), cleanUpdates, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `settings/${user.uid}`);
    }
  };

  const toggleNotifications = async () => {
    if (!settings.notificationsEnabled) {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('Please enable notifications in your browser settings.');
          return;
        }
      }
    }
    updateSettings({ notificationsEnabled: !settings.notificationsEnabled });
  };

  // --- Voice Input Logic ---
  const handleVoiceInput = (e: React.MouseEvent) => {
    e.preventDefault();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setInputValue(prev => prev ? `${prev} ${text}` : text);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // --- Sorting & Filtering ---
  const filteredTodos = todos
    .filter(t => {
      if (filter === 'active') return !t.completed;
      if (filter === 'completed') return t.completed;
      return true;
    })
    .filter(t => categoryFilter === 'All' || t.category === categoryFilter)
    .sort((a, b) => {
      if (sortBy === 'createdAt') return b.createdAt - a.createdAt;
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate - b.dueDate;
      }
      if (sortBy === 'priority') {
        const pMap = { high: 3, medium: 2, low: 1 };
        return pMap[b.priority] - pMap[a.priority];
      }
      if (sortBy === 'category') return a.category.localeCompare(b.category);
      return 0;
    });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-4 border-neutral-200 dark:border-neutral-800 border-t-neutral-900 dark:border-t-neutral-100 rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white dark:bg-neutral-900 p-10 rounded-[2.5rem] shadow-2xl text-center border border-neutral-100 dark:border-neutral-800"
        >
          <div className="w-20 h-20 bg-neutral-900 dark:bg-neutral-100 rounded-3xl mx-auto mb-8 flex items-center justify-center text-white dark:text-neutral-900">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-3xl font-bold mb-4 tracking-tight text-slate-950 dark:text-white">UPWARD Smart ToDO</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mb-10 leading-relaxed">
            Sync your tasks across devices, get smart reminders, and stay organized with ease.
          </p>
          <button 
            onClick={signInWithGoogle}
            className="w-full py-4 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-2xl font-bold flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg"
          >
            <LogIn size={20} />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-950 dark:text-slate-100 transition-all duration-500 font-sans pb-10 md:pb-20 selection:bg-primary/30">
      {/* Premium Glass Header */}
      <header className="sticky top-0 z-40 glass border-b border-white/10 px-4 md:px-0">
        <div className="max-w-4xl mx-auto py-3 md:py-4 flex justify-between items-center gap-2">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <div className="w-12 h-12 premium-gradient rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <h1 className="text-3xl font-black italic tracking-tighter text-gradient leading-none text-high-contrast">
            UPWARD
          </h1>
                <button 
                  onClick={() => setShowWorkspaceModal(true)}
                  className="flex items-center gap-2.5 px-5 py-2.5 glass-card rounded-2xl! transition-all hover:scale-105 active:scale-95"
                >
                  <Users size={18} className="text-primary" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-950 dark:text-white">
                    {currentWorkspace?.name || 'My Workspace'}
                  </span>
                  <ChevronDown size={14} className="text-slate-400 group-hover:text-primary transition-colors" />
                </button>
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-1.5 md:gap-3">
            <motion.button 
              whileHover={{ scale: 1.1, rotate: 15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => updateSettings({ darkMode: !settings.darkMode })}
              className="p-2 md:p-3 rounded-2xl bg-slate-200/40 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:text-primary transition-all shadow-sm"
              title="Toggle Theme"
            >
              {settings.darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsAnalyticsOpen(true)}
              className="p-2 md:p-3 rounded-2xl bg-indigo-500/10 text-indigo-500 hover:bg-indigo-600/20 hover:text-indigo-600 transition-all shadow-sm"
              title="Analytics & History"
            >
              <BarChart2 size={20} />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 md:p-3 rounded-2xl bg-slate-200/40 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:text-primary transition-all shadow-sm"
              title="Settings"
            >
              <SettingsIcon size={20} />
            </motion.button>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />
            <motion.button 
              whileHover={{ scale: 1.1, x: 5 }}
              whileTap={{ scale: 0.9 }}
              onClick={logout}
              className="p-2 md:p-3 rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-600/20 hover:text-red-600 transition-all shadow-sm active:scale-95"
              title="Logout"
            >
              <LogOut size={20} />
            </motion.button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 pt-8 md:pt-12">
        {/* Modern Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 md:p-8 lg:col-span-2 group"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3.5 rounded-2xl premium-gradient text-white shadow-lg shadow-cyan-500/20">
                <BarChart2 size={24} />
              </div>
              <div>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-high-contrast mb-1">OVERALL PROGRESS</h2>
                <p className="text-4xl font-black text-slate-950 dark:text-white tracking-tighter">
                  {todos.length > 0 ? Math.round((todos.filter(t => t.completed).length / todos.length) * 100) : 0}
                  <span className="text-xl ml-1 opacity-40">%</span>
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-2 mb-3">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${todos.length === 0 ? 0 : (todos.filter(t => t.completed).length / todos.length) * 100}%` }}
                  transition={{ duration: 1.5, ease: "circOut" }}
                  className="h-full premium-gradient rounded-full shadow-lg dark:shadow-[0_0_10px_rgba(6,182,212,0.6)]"
                />
              </div>
              <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-slate-950 dark:text-white">
                <span className="text-high-contrast font-black">0%</span>
                <span className="text-secondary-contrast font-black tracking-widest">{todos.filter(t => t.completed).length} of {todos.length} Tasks Fixed</span>
                <span className="text-high-contrast font-black">100%</span>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-6">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-6 flex items-center gap-6"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <ListTodo size={28} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-high-contrast mb-1">Active</p>
                <p className="text-2xl font-black text-high-contrast">{todos.filter(t => !t.completed).length}</p>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-6 flex items-center gap-6"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={28} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-high-contrast mb-1">Done</p>
                <p className="text-2xl font-black text-high-contrast">{todos.filter(t => t.completed).length}</p>
              </div>
            </motion.div>
          </div>
        </div>

        <form onSubmit={handleAddTodo} className="glass-card p-6 md:p-10 mb-10 md:mb-12">
          <div className="flex flex-col gap-6">
            <div className="relative group">
              <input
                ref={addTaskInputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="اكتب التاسك هنا..."
                className="w-full glass-input border-2 border-transparent focus:border-primary/50 pl-6 md:pl-8 pr-24 md:pr-28 py-5 md:py-6 text-base md:text-xl font-black outline-none transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-20">
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  title="Voice Input"
                  onClick={handleVoiceInput}
                  className={`p-3 rounded-2xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200/40 dark:bg-slate-700/40 text-slate-400 hover:text-primary transition-colors'}`}
                >
                  <Mic size={24} />
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="submit"
                  title="Add Task"
                  onClick={handleAddTodo}
                  className="p-4 bg-primary text-white rounded-2xl shadow-lg shadow-cyan-500/30 hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer"
                >
                  <Plus size={24} />
                </motion.button>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row md:items-center gap-4 px-2 mt-4">
              <div className="flex items-center gap-3 bg-slate-100/50 dark:bg-slate-800/50 px-4 py-2 rounded-xl text-high-contrast text-sm font-black transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-700/50">
                <Calendar size={18} className="text-primary" />
                <input 
                  type="date" 
                  title="Due Date"
                  value={dueDateValue}
                  onChange={(e) => setDueDateValue(e.target.value)}
                  className="bg-transparent border-none p-0 text-sm font-black focus:ring-0 cursor-pointer text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-3 bg-slate-100/50 dark:bg-slate-800/50 px-4 py-2 rounded-xl text-high-contrast text-sm font-black transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-700/50 w-full md:w-auto">
                <Clock size={18} className="text-primary" />
                <input 
                  type="number" 
                  min="0"
                  title="Duration (Minutes)"
                  placeholder="Duration (mins)"
                  value={durationValue}
                  onChange={(e) => setDurationValue(e.target.value)}
                  className="bg-transparent border-none p-0 text-[10px] md:text-sm uppercase font-black tracking-widest focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-800 dark:text-white w-28 md:w-32"
                />
              </div>

              <div className="flex items-center gap-3 bg-slate-100/50 dark:bg-slate-800/50 px-4 py-2 rounded-xl text-high-contrast text-sm font-black transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-700/50">
                <Bell size={18} className="text-primary" />
                <select
                  title="Reminder Time"
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(e.target.value)}
                  className="bg-transparent border-none p-0 text-sm font-black focus:ring-0 cursor-pointer text-slate-800 dark:text-white appearance-none"
                >
                  <option value="0">Never</option>
                  <option value="5">5 mins before</option>
                  <option value="15">15 mins before</option>
                  <option value="30">30 mins before</option>
                  <option value="60">1 hour before</option>
                </select>
              </div>
            </div>
          </div>
        </form>

        {/* Navigation & Controls Bar */}
        <section className="glass-card rounded-3xl p-4 mb-10 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6 w-full lg:w-auto">
            {/* View Mode & Filter Tabs */}
            <div className="flex bg-slate-100/50 dark:bg-slate-800/50 p-1.5 rounded-2xl">
              <button 
                type="button"
                title="List View"
                onClick={() => setViewMode('list')}
                className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-slate-200 dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-950 dark:text-white opacity-40 hover:opacity-100 hover:text-slate-600 dark:hover:text-slate-200'}`}
              >
                <LayoutList size={20} />
              </button>
              <button 
                type="button"
                title="Board View"
                onClick={() => setViewMode('board')}
                className={`p-2.5 rounded-xl transition-all ${viewMode === 'board' ? 'bg-slate-200 dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-950 dark:text-white opacity-40 hover:opacity-100 hover:text-slate-600 dark:hover:text-slate-200'}`}
              >
                <Columns size={20} />
              </button>
            </div>

            <div className="flex bg-slate-100/50 dark:bg-slate-800/50 p-1.5 rounded-2xl flex-1 lg:flex-none">
              {(['all', 'active', 'completed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`flex-1 lg:flex-none px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-slate-200 dark:bg-slate-700 text-high-contrast shadow-sm' : 'text-secondary-contrast opacity-60 hover:opacity-100 hover:text-slate-800 dark:hover:text-white'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 w-full lg:w-auto justify-end">
            {/* Category & Sort Selects */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-slate-400 bg-slate-100/30 dark:bg-slate-800/30 px-3 py-2 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                <TagIcon size={14} />
                <select 
                  title="Filter by Category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest focus:ring-0 cursor-pointer text-slate-700 dark:text-slate-300 min-w-[100px]"
                >
                  <option value="All">All Categories</option>
                  {['Work', 'Personal', 'Shopping', 'Urgent', 'General'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-slate-400 bg-slate-100/30 dark:bg-slate-800/30 px-3 py-2 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                <ArrowUpDown size={14} />
                <select 
                  title="Sort Tasks"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest focus:ring-0 cursor-pointer text-slate-700 dark:text-slate-300 min-w-[100px]"
                >
                  <option value="createdAt">Created Date</option>
                  <option value="dueDate">Due Date</option>
                  <option value="priority">Priority</option>
                </select>
              </div>
            </div>

            {todos.some(t => t.completed) && (
              <button 
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"
              >
                <Trash size={14} />
                Clear Done
              </button>
            )}
          </div>
        </section>

        {/* Bulk Actions Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mb-8 flex items-center justify-between premium-gradient text-white p-6 rounded-3xl shadow-xl shadow-cyan-500/20"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <CheckSquare size={20} />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-widest">{selectedIds.length} Selected</p>
                  <button 
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="text-[10px] font-bold opacity-60 hover:opacity-100 underline decoration-2 transition-opacity"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setDueDateValue(new Date().toISOString().split('T')[0])}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Calendar size={14} />
                  Today
                </button>
                <button 
                  type="button"
                  onClick={handleBulkComplete}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary hover:bg-cyan-50 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-sm"
                >
                  <Check size={16} />
                  Complete
                </button>
                <button 
                  type="button"
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white hover:bg-red-600 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-sm"
                >
                  <Trash size={16} />
                  Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Todo List / Board Content */}
        {viewMode === 'list' ? (
          <div className="space-y-6">
            <motion.div 
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.1
                  }
                }
              }}
              className="space-y-4"
            >
              <AnimatePresence mode="popLayout">
                {filteredTodos.map((todo) => (
                  <TaskItem 
                    key={todo.id} 
                    todo={todo} 
                    onToggle={toggleTodo} 
                    onDelete={deleteTodo}
                    onUpdate={updateTodo}
                    isSelected={selectedIds.includes(todo.id)}
                    onSelect={toggleSelect}
                    allTodos={todos}
                    workspaceMembers={currentWorkspace?.members || []}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {filteredTodos.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-32 text-center glass-card rounded-[3rem]"
              >
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl mx-auto mb-6 flex items-center justify-center text-slate-300">
                  <Sparkles size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Nothing here</h3>
                <p className="text-slate-500 font-medium mt-2">All tasks completed or none found.</p>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {(['todo', 'in-progress', 'done'] as TaskStatus[]).map((status, idx) => {
              const columnTasks = filteredTodos.filter(t => 
                status === 'done' ? t.completed || t.status === 'done' : 
                status === 'todo' ? !t.completed && (!t.status || t.status === 'todo') : 
                !t.completed && t.status === 'in-progress'
              );

              return (
                <motion.div 
                  key={status}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="glass-card p-5 rounded-[2.5rem] min-h-[600px] border shadow-sm dark:shadow-none"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const todoId = e.dataTransfer.getData('todoId');
                    if (!todoId) return;
                    await updateTodo(todoId, { status, completed: status === 'done' });
                  }}
                >
                  <div className="flex items-center justify-between mb-8 px-2">
                    <h3 className="font-black uppercase text-[10px] tracking-[0.2em] text-slate-400">{status.replace('-', ' ')}</h3>
                    <span className="bg-white dark:bg-slate-800 text-primary text-[10px] font-black px-3 py-1 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
                      {columnTasks.length}
                    </span>
                  </div>
                  <div className="space-y-6">
                    <AnimatePresence mode="popLayout">
                      {columnTasks.map(todo => (
                        <motion.div 
                          key={todo.id}
                          layout
                          draggable 
                          onDragStartCapture={(e: React.DragEvent) => e.dataTransfer.setData('todoId', todo.id)} 
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <TaskItem 
                            todo={todo} 
                            onToggle={toggleTodo} 
                            onDelete={deleteTodo} 
                            onUpdate={updateTodo} 
                            isSelected={selectedIds.includes(todo.id)} 
                            onSelect={toggleSelect} 
                            allTodos={todos} 
                            workspaceMembers={currentWorkspace?.members || []} 
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Workspace Modal */}
      <AnimatePresence>
        {showWorkspaceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWorkspaceModal(false)}
              className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 glass-card border-none"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold tracking-tight">Workspaces</h2>
                  <button 
                    title="Close"
                    onClick={() => setShowWorkspaceModal(false)}
                    className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Workspace List */}
                <div className="space-y-2 mb-8">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-300 font-bold mb-3">Your Workspaces</p>
                  {workspaces.map(w => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setCurrentWorkspace(w);
                        setShowWorkspaceModal(false);
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${currentWorkspace?.id === w.id ? 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 border-transparent' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Users size={18} />
                        <span className="font-semibold">{w.name}</span>
                      </div>
                      {currentWorkspace?.id === w.id && <Check size={18} />}
                    </button>
                  ))}
                </div>

                {/* Create Workspace */}
                <div className="space-y-4 mb-8 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Create New Workspace</p>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Workspace Name"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 ring-primary/50 transition-all text-slate-950 dark:text-white"
                    />
                    <button 
                      title="Create workspace"
                      onClick={handleCreateWorkspace}
                      className="p-3 bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded-xl hover:scale-105 active:scale-95 transition-all"
                    >
                      <PlusCircle size={20} />
                    </button>
                  </div>
                </div>

                {/* Manage Current Workspace */}
                {currentWorkspace && (
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Manage "{currentWorkspace.name}"</p>
                    <div className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl">
                      <p className="text-xs text-neutral-500 mb-4">Workspace ID: <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">{currentWorkspace.id}</code></p>
                      <p className="text-xs text-neutral-500 mb-4">Members: {currentWorkspace.members.length}</p>
                      
                      {currentWorkspace.ownerId === user.uid && (
                        <div className="space-y-3">
                          <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Invite Member (by UID)</p>
                          <div className="flex gap-2">
                            <input 
                              type="text"
                              placeholder="User UID"
                              value={inviteUserId}
                              onChange={(e) => setInviteUserId(e.target.value)}
                              className="flex-1 bg-white dark:bg-neutral-900 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 ring-neutral-900 dark:ring-neutral-100 transition-all"
                            />
                            <button 
                              onClick={handleInviteMember}
                              className="px-4 py-3 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-xl font-bold text-sm hover:scale-105 active:scale-95 transition-all"
                            >
                              Invite
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 glass-card rounded-[2.5rem] p-10 shadow-2xl border border-slate-200/50 dark:border-slate-800"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h2>
                <button title="Close Settings" onClick={() => setIsSettingsOpen(false)} className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="space-y-8">
                {/* Reminders Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${settings.notificationsEnabled ? 'bg-blue-50 text-blue-500 dark:bg-blue-900/20' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'}`}>
                      {settings.notificationsEnabled ? <Bell size={24} /> : <BellOff size={24} />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">Reminders</p>
                      <p className="text-xs text-neutral-500">Browser notifications</p>
                    </div>
                  </div>
                  <button 
                    title="Toggle Notifications"
                    onClick={toggleNotifications}
                    className={`w-14 h-7 rounded-full transition-all relative ${settings.notificationsEnabled ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.notificationsEnabled ? 32 : 4 }}
                      className="absolute top-1 w-5 h-5 rounded-full shadow-sm bg-white"
                    />
                  </button>
                </div>

                {/* Sound Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${settings.soundEnabled ? 'bg-indigo-50 text-indigo-500 dark:bg-indigo-900/20' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'}`}>
                      {settings.soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">Sound Effects</p>
                      <p className="text-xs text-neutral-500">Play sound on notification</p>
                    </div>
                  </div>
                  <button 
                    title="Toggle Sound"
                    onClick={() => {
                      const newSoundState = !settings.soundEnabled;
                      updateSettings({ soundEnabled: newSoundState });
                      if (newSoundState) {
                        new Audio(NOTIFY_SOUND_URL).play().catch(() => {});
                      }
                    }}
                    className={`w-14 h-7 rounded-full transition-all relative ${settings.soundEnabled ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.soundEnabled ? 32 : 4 }}
                      className="absolute top-1 w-5 h-5 rounded-full shadow-sm bg-white"
                    />
                  </button>
                </div>

                {/* Reminder Interval */}
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-slate-900 dark:text-white">
                    <div className="p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800">
                      <Clock size={24} className="text-neutral-500" />
                    </div>
                    <div>
                      <p className="font-bold">Reminder Interval</p>
                      <p className="text-xs text-neutral-500">How often to notify (minutes)</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 5, 15, 30, 60].map((min) => (
                      <button
                        key={min}
                        onClick={() => updateSettings({ notificationInterval: min })}
                        className={`py-3 rounded-2xl text-xs font-black tracking-widest uppercase transition-all ${settings.notificationInterval === min ? 'bg-slate-950 text-white dark:bg-slate-200 dark:text-slate-950 shadow-md scale-105' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-start gap-4 text-neutral-500">
                    <AlertCircle size={20} className="mt-0.5 shrink-0" />
                    <p className="text-xs leading-relaxed dark:text-slate-300">
                      Notifications require browser permission. If they don't appear, check your browser settings for this site.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Analytics & History Modal */}
      <AnimatePresence>
        {isAnalyticsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAnalyticsOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-slate-900 glass-card rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200/50 dark:border-slate-800 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-slate-900 dark:text-white">
                  <BarChart2 className="text-indigo-500" size={28} />
                  This Month's Progress
                </h2>
                <button title="Close" onClick={() => setIsAnalyticsOpen(false)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400">
                  <X size={20} />
                </button>
              </div>

              {(() => {
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                
                const currentMonthCompleted = todos.filter(t => 
                  t.tenantId === (currentWorkspace?.id || 'default') && 
                  t.completed && 
                  t.completedAt && 
                  t.completedAt >= startOfMonth
                ).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

                const totalMinutes = currentMonthCompleted.reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);
                const totalHours = Math.floor(totalMinutes / 60);
                const remainingMinutes = totalMinutes % 60;

                return (
                  <div className="space-y-8">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-500/20">
                        <div className="flex items-center gap-2 text-indigo-500 mb-2">
                          <CheckCircle2 size={18} />
                          <h3 className="text-xs font-black uppercase tracking-widest">Tasks Done</h3>
                        </div>
                        <p className="text-4xl font-black text-slate-900 dark:text-white">
                          {currentMonthCompleted.length}
                        </p>
                      </div>

                      <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-500/20">
                        <div className="flex items-center gap-2 text-emerald-500 mb-2">
                          <Clock size={18} />
                          <h3 className="text-xs font-black uppercase tracking-widest">Time Spent</h3>
                        </div>
                        <p className="text-4xl font-black text-slate-900 dark:text-white">
                          {totalHours > 0 ? `${totalHours}h ` : ''}{remainingMinutes}m
                        </p>
                      </div>
                    </div>

                    {/* Task List */}
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 px-1">Completed History</h3>
                      {currentMonthCompleted.length > 0 ? (
                        <div className="space-y-3">
                          {currentMonthCompleted.map(todo => (
                            <div key={todo.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm">
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{todo.title}</span>
                                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                                  {new Date(todo.completedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {todo.estimatedMinutes && (
                                <span className="text-xs font-black text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-xl whitespace-nowrap">
                                  {todo.estimatedMinutes} mins
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10 px-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                          <Sparkles size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                          <p className="text-slate-500 dark:text-slate-400 font-medium">No tasks completed this month yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Undo Toast */}
      <AnimatePresence>
        {showUndoToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-6 py-4 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <Trash2 size={18} className="text-red-400" />
              <p className="text-sm font-medium">Task deleted</p>
            </div>
            <button 
              onClick={handleUndoDelete}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
            >
              <RotateCcw size={14} />
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 shadow-2xl border border-neutral-100 dark:border-neutral-800 text-center"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl mx-auto mb-6 flex items-center justify-center">
                <Trash2 size={32} />
              </div>
              <h2 className="text-xl font-bold mb-2">Clear Completed?</h2>
              <p className="text-neutral-500 dark:text-neutral-300 text-sm mb-8">
                This will permanently delete all tasks marked as completed. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded-xl font-bold hover:bg-neutral-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleClearCompleted}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Auth Provider ---
function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SmartTasker />
    </AuthProvider>
  );
}
