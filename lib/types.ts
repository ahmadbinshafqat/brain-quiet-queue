export type QueueItem = {
  id: string;
  url: string;
  title: string;
  summary: string;
  score: number;
  createdAt: string;
};

export type Queue = {
  id: string;
  name: string;
  items: QueueItem[];
};
