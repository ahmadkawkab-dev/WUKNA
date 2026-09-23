import { Check, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RealtimeStatus } from "../../realtime/connection";

export function RealtimeHealth({ status }: { status: RealtimeStatus }) {
  const previous = useRef(status);
  const hasConnected = useRef(status === "connected");
  const [recovered, setRecovered] = useState(false);
  const [showDisconnected, setShowDisconnected] = useState(false);

  useEffect(() => {
    let recoveryTimer: number | undefined;
    let failureTimer: number | undefined;
    if (status === "connected") {
      setShowDisconnected(false);
      if (hasConnected.current && previous.current !== "connected") {
        setRecovered(true);
        recoveryTimer = window.setTimeout(() => setRecovered(false), 2_500);
      }
      hasConnected.current = true;
    } else {
      setRecovered(false);
      if (status === "disconnected")
        failureTimer = window.setTimeout(() => setShowDisconnected(true), 1_500);
      else setShowDisconnected(false);
    }
    previous.current = status;
    return () => {
      if (recoveryTimer) window.clearTimeout(recoveryTimer);
      if (failureTimer) window.clearTimeout(failureTimer);
    };
  }, [status]);

  if (status === "connected" && !recovered) return null;
  if (status === "disconnected" && !showDisconnected) return null;

  const message = recovered
    ? "Back online"
    : status === "disconnected"
      ? "Live collaboration is unavailable. We’ll keep trying to reconnect."
      : status === "connecting"
        ? "Connecting live collaboration…"
        : "Reconnecting…";
  const Icon = recovered ? Check : status === "disconnected" ? CloudOff : RefreshCw;

  return (
    <span
      className={`wk-realtime-health wk-realtime-health--${recovered ? "recovered" : status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon size={15} aria-hidden="true" />
      <span>{message}</span>
    </span>
  );
}
