export {};

type OcOk<T> = { ok: true } & T;
type OcErr = { ok: false; error: string };

type OcResult<T> = OcOk<T> | OcErr;

type OcPickedFile = {
  id: string;
  path: string;
  name: string;
  ext: string;
  createdAt: string;
};

type OcReconcileEvent =
  | { type: "log"; level: "info" | "warn" | "error"; message: string; ts: number }
  | { type: "progress"; progress: number; ts: number }
  | { type: "completed"; jobId: string; ts: number };

type OcUser = {
  username: string;
  name: string;
  role: string;
};

declare global {
  interface Window {
    oc?: {
      ping: () => Promise<string>;
      auth: {
        login: (username: string, password: string) => Promise<OcResult<{ token: string; user: OcUser }>>;
        logout: () => Promise<OcResult<{}>>;
      };
      files: {
        pickFiles: () => Promise<OcResult<{ files: OcPickedFile[] }>>;
      };
      reconcile: {
        start: (input: unknown) => Promise<OcResult<{ jobId: string }>>;
        onEvent: (jobId: string, callback: (event: OcReconcileEvent) => void) => () => void;
      };
      export: {
        toXlsx: (jobId: string) => Promise<unknown>;
      };
      storage: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<unknown>;
      };
    };
  }
}
