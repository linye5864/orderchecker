/**
 * WebSocket Progress Hook
 * Provides real-time progress updates for reconciliation tasks
 * 后端 API: WS /api/v1/tasks/ws/{task_id}
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ProgressUpdate {
  type: 'progress';
  task_id: string;
  status: 'PROCESSING' | 'FINISHED' | 'FAILED' | 'CANCELLED';
  progress: number;
  message: string;
  extra?: Record<string, unknown>;
  timestamp?: string;
}

export interface UseWebSocketProgressOptions {
  taskId: string | null;
  onProgress?: (update: ProgressUpdate) => void;
  onComplete?: (update: ProgressUpdate) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export interface UseWebSocketProgressReturn {
  isConnected: boolean;
  lastUpdate: ProgressUpdate | null;
  connect: () => void;
  disconnect: () => void;
  subscribe: () => void;
  unsubscribe: () => void;
}

export function useWebSocketProgress({
  taskId,
  onProgress,
  onComplete,
  onError,
  enabled = true,
}: UseWebSocketProgressOptions): UseWebSocketProgressReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<ProgressUpdate | null>(null);
  const taskIdRef = useRef<string | null>(null);

  // Update taskId ref when it changes
  useEffect(() => {
    taskIdRef.current = taskId;
  }, [taskId]);

  const connect = useCallback(() => {
    if (!enabled || !taskId) return;

    // Close existing connection
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    // 后端 WebSocket 端点: ws://host/api/v1/tasks/ws/{task_id}
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/v1/tasks/ws/${taskId}`;
    console.log('[WS] Connecting to:', wsUrl);

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] Received:', data);

          if (data.type === 'progress') {
            const update: ProgressUpdate = {
              type: 'progress',
              task_id: data.task_id || taskId,
              status: data.status,
              progress: data.progress,
              message: data.message,
              extra: data.extra,
              timestamp: new Date().toISOString(),
            };
            
            setLastUpdate(update);
            onProgress?.(update);

            // Check for completion
            if (data.status === 'FINISHED' || data.status === 'FAILED' || data.status === 'CANCELLED') {
              onComplete?.(update);
            }
          }
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        setIsConnected(false);
      };

      wsRef.current.onerror = (error) => {
        console.error('[WS] Error:', error);
        onError?.(new Error('WebSocket connection error'));
      };
    } catch (error) {
      console.error('[WS] Failed to create connection:', error);
      onError?.(error as Error);
    }
  }, [enabled, taskId, onProgress, onComplete, onError]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const subscribe = useCallback(() => {
    // 后端在连接时自动订阅，不需要额外订阅消息
    console.log('[WS] Connected, auto-subscribed to task:', taskId);
  }, [taskId]);

  const unsubscribe = useCallback(() => {
    // 后端在断开连接时自动取消订阅
  }, []);

  // Auto-connect when enabled and taskId is provided
  useEffect(() => {
    if (enabled && taskId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, taskId, connect, disconnect]);

  return {
    isConnected,
    lastUpdate,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
}

/**
 * Simpler hook for just getting progress updates
 */
export function useReconciliationProgress(taskId: string | null, enabled = true) {
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<string>('PENDING');

  const update = useCallback((result: ProgressUpdate) => {
    setProgress(result.progress);
    setMessage(result.message);
    setStatus(result.status);
  }, []);

  const { isConnected, lastUpdate, connect, disconnect } = useWebSocketProgress({
    taskId,
    onProgress: update,
    onComplete: update,
    enabled,
  });

  useEffect(() => {
    if (lastUpdate) {
      update(lastUpdate);
    }
  }, [lastUpdate, update]);

  return {
    isConnected,
    progress,
    message,
    status,
    connect,
    disconnect,
  };
}
