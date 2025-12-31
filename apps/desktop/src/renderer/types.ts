export type IngestStatus = "pending" | "running" | "done" | "error";

export type IngestItem = {
  id: string;
  path: string;
  status: IngestStatus;
  result?: any;
  error?: string;
};
