export type QueueItem = {
  url: string;
  title: string;
  description: string;
  summary: string;
  priorityScore: number;
  estimatedMinutes: number;
  reason: string;
};

export type SavedQueue = {
  id: string;
  createdAt: string;
  items: QueueItem[];
};

export type QueueResponse = {
  queue: QueueItem[];
  shareId?: string;
  shareUrl?: string;
  createdAt?: string;
};
