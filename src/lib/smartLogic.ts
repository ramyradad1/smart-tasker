import { Priority, Category } from '../types';

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  Work: ['work', 'meeting', 'project', 'client', 'email', 'deadline'],
  Personal: ['home', 'family', 'friends', 'gym', 'workout', 'call'],
  Shopping: ['buy', 'grocery', 'store', 'shop', 'order'],
  Urgent: ['urgent', 'asap', 'important', 'emergency', 'now'],
  General: []
};

const PRIORITY_KEYWORDS: Record<Priority, string[]> = {
  high: ['urgent', 'asap', 'important', 'deadline', 'must'],
  medium: ['work', 'meeting', 'project', 'call'],
  low: ['buy', 'shop', 'gym', 'read', 'watch']
};

export function analyzeTask(title: string): { priority: Priority; category: Category } {
  const lowerTitle = title.toLowerCase();
  
  let detectedCategory: Category = 'General';
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lowerTitle.includes(kw))) {
      detectedCategory = category as Category;
      break;
    }
  }

  let detectedPriority: Priority = 'low';
  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    if (keywords.some(kw => lowerTitle.includes(kw))) {
      detectedPriority = priority as Priority;
      break;
    }
  }

  // Special case: if category is Urgent, priority should be high
  if (detectedCategory === 'Urgent') detectedPriority = 'high';

  return { priority: detectedPriority, category: detectedCategory };
}
