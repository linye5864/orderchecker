/**
 * WebSocket Service
 * Provides real-time progress updates for reconciliation tasks
 */

import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';

// ==================== Types ====================

export interface ProgressUpdate {
  taskId: string;
  progress: number;
  message: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  timestamp: Date;
}

export interface WSClient {
  id: string;
  ws: WebSocket;
  subscribedTasks: Set<string>;
}

// ==================== State ====================

const clients = new Map<string, WSClient>();
let wss: WebSocketServer | null = null;

// ==================== WebSocket Server ====================

/**
 * Initialize WebSocket server
 */
export function initWebSocket(server: http.Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws/progress' });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientId = generateClientId();
    console.log(`[WS] Client connected: ${clientId} from ${req.socket.remoteAddress}`);

    clients.set(clientId, {
      id: clientId,
      ws,
      subscribedTasks: new Set(),
    });

    // Send connection acknowledgment
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      clientId,
      timestamp: new Date().toISOString(),
    }));

    // Handle messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(clientId, message);
      } catch (error) {
        console.error(`[WS] Invalid message from ${clientId}:`, error);
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: 'Invalid message format',
        }));
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`);
      clients.delete(clientId);
    });

    ws.on('error', (error) => {
      console.error(`[WS] Error for client ${clientId}:`, error);
      clients.delete(clientId);
    });
  });

  console.log('[WS] WebSocket server initialized at /ws/progress');
  return wss;
}

/**
 * Close WebSocket server
 */
export function closeWebSocket(): void {
  if (wss) {
    wss.close();
    wss = null;
    console.log('[WS] WebSocket server closed');
  }
}

// ==================== Message Handling ====================

function handleMessage(clientId: string, message: any): void {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case 'SUBSCRIBE':
      if (message.taskId) {
        client.subscribedTasks.add(message.taskId);
        console.log(`[WS] Client ${clientId} subscribed to task ${message.taskId}`);
      }
      break;

    case 'UNSUBSCRIBE':
      if (message.taskId) {
        client.subscribedTasks.delete(message.taskId);
        console.log(`[WS] Client ${clientId} unsubscribed from task ${message.taskId}`);
      }
      break;

    case 'PING':
      client.ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
      break;

    default:
      console.log(`[WS] Unknown message type from ${clientId}:`, message.type);
  }
}

// ==================== Broadcast ====================

/**
 * Broadcast progress update to all subscribed clients
 */
export function broadcastProgress(update: ProgressUpdate): void {
  const message = JSON.stringify({
    type: 'PROGRESS',
    ...update,
    timestamp: update.timestamp.toISOString(),
  });

  let sentCount = 0;
  clients.forEach((client) => {
    if (client.subscribedTasks.has(update.taskId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    console.log(`[WS] Broadcast progress to ${sentCount} clients for task ${update.taskId}: ${update.progress}% - ${update.message}`);
  }
}

/**
 * Send progress update to specific task subscribers
 */
export function sendTaskProgress(taskId: string, progress: number, message: string, status: string = 'PROCESSING'): void {
  broadcastProgress({
    taskId,
    progress,
    message,
    status: status as ProgressUpdate['status'],
    timestamp: new Date(),
  });
}

// ==================== Helpers ====================

function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ==================== Progress Callback Factory ====================

/**
 * Create a progress callback that sends updates via WebSocket
 */
export function createWebSocketProgressCallback(taskId: string): (progress: number, message: string) => void {
  return (progress: number, message: string) => {
    sendTaskProgress(taskId, progress, message, 'PROCESSING');
  };
}
