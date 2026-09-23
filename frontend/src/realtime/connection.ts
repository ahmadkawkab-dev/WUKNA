import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";
import { realtimeAccessToken } from "../auth";
import { rejoinThenReconcile } from "./reconcile";
import { realtimeEvents } from "./events";
import type {
  BoardPresenceSnapshot,
  NoteGeometryPreviewRequest,
} from "./events";

export type RealtimeStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

const initialRetryDelays = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

class RealtimeConnectionManager {
  private readonly connection: HubConnection;
  private readonly boardSubscriptions = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private status: RealtimeStatus = "disconnected";
  private desired = false;
  private retryAttempt = 0;
  private retryTimer: number | null = null;
  private reconcileTimer: number | null = null;
  private startPromise: Promise<void> | null = null;
  private readonly reconcileListeners = new Set<() => Promise<void>>();
  private readonly presenceListeners = new Set<(snapshot: BoardPresenceSnapshot) => void>();

  constructor() {
    this.connection = new HubConnectionBuilder()
      .withUrl("/hubs/board", { accessTokenFactory: realtimeAccessToken })
      .withAutomaticReconnect([0, 2_000, 10_000, 30_000])
      .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
      .build();

    this.connection.onreconnecting(() => this.setStatus("reconnecting"));
    this.connection.onreconnected(() => {
      this.retryAttempt = 0;
      this.setStatus("reconnecting");
      void this.reconcileAfterReconnect();
    });
    this.connection.onclose(() => {
      this.setStatus("disconnected");
      this.scheduleStart();
    });
    this.connection.on(
      realtimeEvents.boardPresenceChanged,
      (snapshot: BoardPresenceSnapshot) => this.emitPresence(snapshot),
    );
  }

  getSnapshot = () => this.status;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  on<T>(eventName: string, listener: (message: T) => void) {
    const handler = (message: T) => listener(message);
    this.connection.on(eventName, handler);
    return () => this.connection.off(eventName, handler);
  }

  onReconnected(listener: () => Promise<void>) {
    this.reconcileListeners.add(listener);
    return () => {
      this.reconcileListeners.delete(listener);
    };
  }

  onPresence(listener: (snapshot: BoardPresenceSnapshot) => void) {
    this.presenceListeners.add(listener);
    return () => {
      this.presenceListeners.delete(listener);
    };
  }

  async start() {
    this.desired = true;
    await this.ensureStarted();
  }

  async stop() {
    this.desired = false;
    this.retryAttempt = 0;
    this.boardSubscriptions.clear();
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    if (this.reconcileTimer !== null) window.clearTimeout(this.reconcileTimer);
    this.retryTimer = null;
    this.reconcileTimer = null;
    await this.connection.stop();
    this.setStatus("disconnected");

    // A newer session may request start while an older React effect is still stopping.
    if (this.desired) void this.ensureStarted();
  }

  subscribeBoard(boardId: string) {
    const subscriptions = this.boardSubscriptions.get(boardId) ?? 0;
    this.boardSubscriptions.set(boardId, subscriptions + 1);
    if (subscriptions === 0) void this.joinBoardWhenConnected(boardId);

    return () => {
      const current = this.boardSubscriptions.get(boardId) ?? 0;
      if (current > 1) {
        this.boardSubscriptions.set(boardId, current - 1);
        return;
      }
      this.boardSubscriptions.delete(boardId);
      if (this.connection.state === HubConnectionState.Connected)
        void this.leaveBoard(boardId);
    };
  }

  async sendNoteGeometryPreview(message: NoteGeometryPreviewRequest) {
    if (this.connection.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.invoke("PreviewNoteGeometry", message);
    } catch {
      // Ephemeral previews are best-effort. The final REST mutation remains authoritative.
    }
  }

  async endNoteGeometryPreview(boardId: string, noteId: string, sequence: number) {
    if (this.connection.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.invoke("EndNoteGeometryPreview", {
        boardId,
        noteId,
        sequence,
      });
    } catch {
      // Remote expiry and durable NoteUpdated cleanup cover lost end messages.
    }
  }

  async startNoteEditing(boardId: string, noteId: string, sequence: number) {
    if (this.connection.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.invoke("StartNoteEditing", { boardId, noteId, sequence });
    } catch {
      // Editing awareness is best-effort and never affects the durable note mutation.
    }
  }

  async stopNoteEditing(boardId: string, noteId: string, sequence: number) {
    if (this.connection.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.invoke("StopNoteEditing", { boardId, noteId, sequence });
    } catch {
      // Remote expiry and disconnect cleanup remove a missed stop event.
    }
  }

  async moveBoardCursor(boardId: string, x: number, y: number, sequence: number) {
    if (this.connection.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.invoke("MoveBoardCursor", { boardId, x, y, sequence });
    } catch {
      // Cursor awareness is best-effort and has no durable side effects.
    }
  }

  async stopBoardCursor(boardId: string, sequence: number) {
    if (this.connection.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.invoke("StopBoardCursor", { boardId, sequence });
    } catch {
      // Server disconnect cleanup and short client expiry cover a missed stop.
    }
  }

  private async ensureStarted() {
    if (!this.desired || this.connection.state !== HubConnectionState.Disconnected)
      return;
    if (this.startPromise) return this.startPromise;

    this.setStatus("connecting");
    this.startPromise = this.connection
      .start()
      .then(async () => {
        this.retryAttempt = 0;
        this.setStatus("connected");
        await this.restoreBoardGroups();
      })
      .catch(() => {
        this.setStatus("disconnected");
        this.scheduleStart();
      })
      .finally(() => {
        this.startPromise = null;
      });
    return this.startPromise;
  }

  private scheduleStart() {
    if (!this.desired || this.retryTimer !== null) return;
    const delay =
      initialRetryDelays[Math.min(this.retryAttempt, initialRetryDelays.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.ensureStarted();
    }, delay);
  }

  private async joinBoardWhenConnected(boardId: string) {
    await this.start();
    if (
      this.connection.state === HubConnectionState.Connected &&
      this.boardSubscriptions.has(boardId)
    ) {
      await this.invokeJoin(boardId, true);
    }
  }

  private async restoreBoardGroups() {
    if (this.connection.state !== HubConnectionState.Connected) return;
    await Promise.all(
      [...this.boardSubscriptions.keys()].map((boardId) =>
        this.invokeJoin(boardId, false),
      ),
    );
  }

  private async reconcileAfterReconnect() {
    if (!this.desired || this.connection.state !== HubConnectionState.Connected)
      return;

    const reconciled = await rejoinThenReconcile(
      () => this.restoreBoardGroups(),
      [...this.reconcileListeners],
    );
    if (reconciled) {
      this.setStatus("connected");
      return;
    }

    this.setStatus("reconnecting");
    if (this.reconcileTimer !== null) return;
    this.reconcileTimer = window.setTimeout(() => {
      this.reconcileTimer = null;
      void this.reconcileAfterReconnect();
    }, 5_000);
  }

  private async invokeJoin(boardId: string, ignoreFailure: boolean) {
    try {
      const snapshot = await this.connection.invoke<BoardPresenceSnapshot>(
        "JoinBoard",
        boardId,
      );
      this.emitPresence(snapshot);
    } catch (cause) {
      // REST will surface revoked/missing board access authoritatively. A failed group join
      // must not create an unhandled rejection or weaken the server-side membership check.
      if (!ignoreFailure) throw cause;
    }
  }

  private emitPresence(snapshot: BoardPresenceSnapshot) {
    for (const listener of this.presenceListeners) listener(snapshot);
  }

  private async leaveBoard(boardId: string) {
    try {
      await this.connection.invoke("LeaveBoard", boardId);
    } catch {
      // Disconnecting also removes server-side group membership and registry entries.
    }
  }

  private setStatus(status: RealtimeStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener();
  }
}

export const realtimeConnection = new RealtimeConnectionManager();
