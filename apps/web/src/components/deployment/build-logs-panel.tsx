'use client';

import { useEffect, useRef, useState } from 'react';
import { useBuildLogsWebSocket, BuildLogLine } from '@/hooks/use-websocket';
import { cn } from '@/lib/utils';

interface BuildLogsPanelProps {
  deploymentId: string;
  className?: string;
  maxHeight?: string;
}

export function BuildLogsPanel({
  deploymentId,
  className,
  maxHeight = '400px',
}: BuildLogsPanelProps) {
  const [logs, setLogs] = useState<BuildLogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { isConnected } = useBuildLogsWebSocket(deploymentId, {
    onLog: (log) => {
      setLogs((prev) => [...prev, log]);
    },
  });

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className={cn('flex flex-col border rounded-lg overflow-hidden bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium text-gray-300">Build Logs</span>
          {isConnected && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Scroll to bottom
            </button>
          )}
          <button
            onClick={clearLogs}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Logs container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-auto font-mono text-xs leading-5 p-4"
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            {isConnected ? 'Waiting for build logs...' : 'Connecting...'}
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={cn(
                'whitespace-pre-wrap break-all',
                log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
              )}
            >
              <span className="text-gray-600 select-none mr-3">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              {log.line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
