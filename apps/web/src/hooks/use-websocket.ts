import { useCallback, useEffect, useRef, useState } from 'react';
import { ServerStatus } from '@/types';

// Constants
const DEFAULT_RECONNECT_INTERVAL = 3000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

// WebSocket message types matching backend
export type WsMessageType =
  | 'DeploymentStatus'
  | 'ServerStatus'
  | 'BuildLog'
  | 'ServerLog'
  | 'Error'
  | 'Ping'
  | 'Pong'
  | 'Auth'
  | 'AuthSuccess'
  | 'AuthError';

export interface DeploymentStatusUpdate {
  deployment_id: string;
  server_id: string;
  status: DeploymentStatus;
  error_message?: string;
  progress?: number;
  timestamp: string;
}

export interface ServerStatusUpdate {
  server_id: string;
  status: ServerStatus;
  endpoint_url?: string;
  error_message?: string;
  timestamp: string;
}

export interface BuildLogLine {
  deployment_id: string;
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface ServerLogLine {
  server_id: string;
  line: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  timestamp: string;
}

export type DeploymentStatus =
  | 'pending'
  | 'building'
  | 'pushing'
  | 'deploying'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type WebSocketMessage =
  | { type: 'DeploymentStatus'; data: DeploymentStatusUpdate }
  | { type: 'ServerStatus'; data: ServerStatusUpdate }
  | { type: 'BuildLog'; data: BuildLogLine }
  | { type: 'ServerLog'; data: ServerLogLine }
  | { type: 'Error'; data: { code: string; message: string } }
  | { type: 'Ping' }
  | { type: 'Pong' }
  | { type: 'AuthSuccess' }
  | { type: 'AuthError'; data: { message: string } };

export function useWebSocket({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  reconnect = true,
  reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
  maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
}: UseWebSocketOptions) {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Store callbacks in refs to avoid dependency issues
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onMessage, onConnect, onDisconnect, onError]);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    // SECURITY: WebSocket authentication using cookies
    // The server will read the access_token cookie from the upgrade request headers
    // No need to pass token in URL or localStorage
    const ws = new WebSocket(url);

    ws.onopen = () => {
      if (!isMountedRef.current) {
        ws.close();
        return;
      }
      // Server authenticates via cookie from upgrade request
      // Send a ping to confirm connection
      ws.send(JSON.stringify({ type: 'Ping' }));
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;

        // Handle ping/pong
        if (message.type === 'Pong') {
          setStatus('connected');
          reconnectAttemptsRef.current = 0;
          onConnectRef.current?.();
          return;
        }

        // Handle auth error (server could not authenticate via cookie)
        if (message.type === 'AuthError') {
          setStatus('error');
          ws.close();
          return;
        }

        setLastMessage(message);
        onMessageRef.current?.(message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (error) => {
      if (!isMountedRef.current) return;
      setStatus('error');
      onErrorRef.current?.(error);
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      setStatus('disconnected');
      wsRef.current = null;
      onDisconnectRef.current?.();

      // Attempt to reconnect
      if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts && isMountedRef.current) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, reconnectInterval);
      }
    };

    wsRef.current = ws;
  }, [url, reconnect, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const sendMessage = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    status,
    lastMessage,
    connect,
    disconnect,
    sendMessage,
    isConnected: status === 'connected',
  };
}

// Helper to get WebSocket URL from API URL
function getWsUrl(path: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return apiUrl.replace(/^http/, 'ws') + path;
}

// Convenience hooks for specific WebSocket connections

export function useDeploymentWebSocket(deploymentId: string, options?: {
  onStatusUpdate?: (status: DeploymentStatusUpdate) => void;
  onBuildLog?: (log: BuildLogLine) => void;
}) {
  const wsUrl = getWsUrl(`/ws/deployments/${deploymentId}`);

  return useWebSocket({
    url: wsUrl,
    onMessage: (message) => {
      if (message.type === 'DeploymentStatus') {
        options?.onStatusUpdate?.(message.data);
      }
    },
  });
}

export function useBuildLogsWebSocket(deploymentId: string, options?: {
  onLog?: (log: BuildLogLine) => void;
}) {
  const wsUrl = getWsUrl(`/ws/deployments/${deploymentId}/logs`);

  return useWebSocket({
    url: wsUrl,
    onMessage: (message) => {
      if (message.type === 'BuildLog') {
        options?.onLog?.(message.data);
      }
    },
  });
}

export function useServerLogsWebSocket(workspaceId: string, serverId: string, options?: {
  onLog?: (log: ServerLogLine) => void;
}) {
  const wsUrl = getWsUrl(`/ws/workspaces/${workspaceId}/servers/${serverId}/logs`);

  return useWebSocket({
    url: wsUrl,
    onMessage: (message) => {
      if (message.type === 'ServerLog') {
        options?.onLog?.(message.data);
      }
    },
  });
}

export function useServerStatusWebSocket(workspaceId: string, serverId: string, options?: {
  onStatusUpdate?: (status: ServerStatusUpdate) => void;
}) {
  const wsUrl = getWsUrl(`/ws/workspaces/${workspaceId}/servers/${serverId}/status`);

  return useWebSocket({
    url: wsUrl,
    onMessage: (message) => {
      if (message.type === 'ServerStatus') {
        options?.onStatusUpdate?.(message.data);
      }
    },
  });
}
