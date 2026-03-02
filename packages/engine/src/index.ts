import { randomUUID } from "node:crypto";

export type ReconcileJobStatus = "queued" | "running" | "success" | "failed";

export interface ReconcileJob {
  id: string;
  status: ReconcileJobStatus;
  progress: number;
}

export interface ReconcileEvent {
  jobId: string;
  status: ReconcileJobStatus;
  progress: number;
  message?: string;
}

export const createJob = (): ReconcileJob => {
  return {
    id: randomUUID(),
    status: "queued",
    progress: 0
  };
};
