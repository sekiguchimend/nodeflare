import { useCallback, useEffect, useRef, useState } from 'react';

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
  | 'BuildLog'
  | 'ServerLog'
  | 'Error'
  | 'Ping'
  | 'Pong';

export interface DeploymentStatusUpdate {
  deployment_id: string;
  server_id: string;
  status: DeploymentStatus;
  error_message?: string;
  progress?: number;
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
  | { type: 'BuildLog'; data: BuildLogLine }
  | { type: 'ServerLog'; data: ServerLogLine }
  | { type: 'Error'; data: { code: string; message: string } }
  | { type: 'Ping' }
  | { type: 'Pong' };

export function useWebSocket({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  reconnect = true,
  reconnectInterval = 3000,
  maxReconnectAttempts = 10,
}: UseWebSocketOptions) {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Get the access token
    const token = localStorage.getItem('access_token');
    if (!token) {
      setStatus('error');
      return;
    }

    // Add token to URL
    const wsUrl = new URL(url);
    wsUrl.searchParams.set('token', token);

    setStatus('connecting');
    const ws = new WebSocket(wsUrl.toString());

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptsRef.current = 0;
      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(message);
        onMessage?.(message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (error) => {
      setStatus('error');
      onError?.(error);
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      onDisconnect?.();

      // Attempt to reconnect
      if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    };

    wsRef.current = ws;
  }, [url, onMessage, onConnect, onDisconnect, onError, reconnect, reconnectInterval, maxReconnectAttempts]);

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
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    lastMessage,
    connect,
    disconnect,
    sendMessage,
    isConnected: status === 'connected',
  };
}

// Convenience hooks for specific WebSocket connections

export function useDeploymentWebSocket(deploymentId: string, options?: {
  onStatusUpdate?: (status: DeploymentStatusUpdate) => void;
  onBuildLog?: (log: BuildLogLine) => void;
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/deployments/${deploymentId}`;

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
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/deployments/${deploymentId}/logs`;

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
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/workspaces/${workspaceId}/servers/${serverId}/logs`;

  return useWebSocket({
    url: wsUrl,
    onMessage: (message) => {
      if (message.type === 'ServerLog') {
        options?.onLog?.(message.data);
      }
    },
  });
}
