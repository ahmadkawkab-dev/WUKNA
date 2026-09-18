import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as Pointer,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Grid2X2,
  Link2,
  ListChecks,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Share2,
  Sidebar,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import {
  currentSession,
  exchangeGoogleCode,
  getAccountStatus,
  login,
  logout,
  logoutEverywhere,
  register,
  restoreSession,
  setSessionExpiredHandler,
  startGoogleLink,
  startGoogleLogin,
  unlinkGoogle,
  type AccountStatus,
  type AuthSession,
} from "./auth";
import {
  AuthApiError,
  boardApi,
  connectionApi,
  errorMessage,
  noteApi,
  type BoardDto,
  type ConnectionDto,
  type MemberDto,
  type NoteDto,
  type PatchNote,
} from "./api";

type Panel = "tasks" | "share" | "chat" | null;
type VisualPatch = Partial<{
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  color: string;
}>;
type ConnectionDraft = {
  sourceId: string;
  x: number;
  y: number;
  targetId: string | null;
};
const minNoteWidth = 160;
const minNoteHeight = 110;
const boardFromPath = (path: string) =>
  /^\/boards\/([0-9a-f-]{36})$/i.exec(path)?.[1] ?? null;
const initials = (email: string) => email.slice(0, 2).toUpperCase();
const isConflict = (error: unknown) =>
  error instanceof AuthApiError && error.code === "note_version_conflict";
function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <span />
      </span>
      LAPIS
    </div>
  );
}
function CircuitBackground() {
  return (
    <div className="circuit-bg" aria-hidden="true">
      <svg viewBox="0 0 1200 760" preserveAspectRatio="none">
        <path d="M40 120H180V40H330M720 60H820V170H1040V90H1150M30 610H220V530H380M780 690V560H960V460H1170M500 0V95H610V185H690M120 330H270V400H420V350H550" />
        <path d="M250 710V640H520V590H650V480H810M910 250V340H800V400H690M1080 560H1010V650H900" />
        <circle cx="180" cy="120" r="4" />
        <circle cx="720" cy="60" r="4" />
        <circle cx="380" cy="530" r="4" />
      </svg>
      <span className="pulse pulse-one" />
      <span className="pulse pulse-two" />
    </div>
  );
}

function AuthScreen({
  mode,
  error: initialError,
  onSuccess,
  navigate,
}: {
  mode: "login" | "register";
  error: string;
  onSuccess: (s: AuthSession) => void;
  navigate: (p: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  useEffect(() => setError(initialError), [initialError, mode]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSuccess(
        mode === "login"
          ? await login(email.trim(), password)
          : await register(email.trim(), password),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-glow" />
      <section className="auth-card">
        <Logo />
        <div className="auth-heading">
          <span className="eyebrow">Your connected workspace</span>
          <h1>
            {mode === "login" ? "Welcome back." : "Create your workspace."}
          </h1>
          <p>Organize ideas spatially with your team.</p>
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "register" ? 8 : undefined}
              required
            />
          </label>
          <button
            className="primary-button full"
            disabled={busy || !email.trim() || !password}
          >
            {busy
              ? "Connecting…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}{" "}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="auth-divider">or continue with</div>
        <button className="google-button" onClick={startGoogleLogin}>
          Continue with Google
        </button>
        <button
          className="auth-switch"
          onClick={() => navigate(mode === "login" ? "/register" : "/login")}
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </button>
      </section>
    </main>
  );
}

function SidebarNav({
  user,
  boards,
  active,
  navigate,
  signOut,
  signOutEverywhere,
  notify,
}: {
  user: AuthSession["user"];
  boards: BoardDto[];
  active: string | null;
  navigate: (p: string) => void;
  signOut: () => void;
  signOutEverywhere: () => void;
  notify: (m: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false),
    [account, setAccount] = useState(false),
    [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null),
    [accountLoading, setAccountLoading] = useState(false),
    [accountError, setAccountError] = useState("");
  const loadAccount = useCallback(async () => {
    setAccountLoading(true);
    setAccountError("");
    try {
      setAccountStatus(await getAccountStatus());
    } catch (cause) {
      setAccountStatus(null);
      setAccountError(errorMessage(cause));
    } finally {
      setAccountLoading(false);
    }
  }, []);
  useEffect(() => {
    if (account) void loadAccount();
  }, [account, loadAccount]);
  async function link() {
    try {
      await startGoogleLink();
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function unlink() {
    try {
      await unlinkGoogle();
      await loadAccount();
      notify("Google login removed");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top">
        <Logo />
        <button
          className="collapse"
          aria-label="Toggle sidebar"
          onClick={() => setCollapsed(!collapsed)}
        >
          <Sidebar size={17} />
        </button>
      </div>
      <button className="nav-item selected" onClick={() => navigate("/boards")}>
        <Grid2X2 size={17} />
        <span>Boards</span>
      </button>
      <div className="sidebar-section">
        <div className="section-label">Your boards</div>
        {boards.map((board) => (
          <button
            className={`recent-board ${active === board.id ? "current" : ""}`}
            key={board.id}
            onClick={() => navigate(`/boards/${board.id}`)}
          >
            <span className="board-dot" />
            {board.title}
          </button>
        ))}
      </div>
      <div className="sidebar-bottom">
        <button
          className="user-row"
          onClick={() => setAccount(!account)}
          aria-expanded={account}
        >
          <span className="avatar user-avatar">{initials(user.email)}</span>
          <span className="user-copy">
            <strong>{user.email}</strong>
            <small>Account</small>
          </span>
        </button>
        {account && (
          <div className="account-actions">
            <div className="provider-status">
              <strong>Google</strong>
              {accountLoading ? (
                <span>Checking…</span>
              ) : accountError ? (
                <button onClick={() => void loadAccount()}>Retry status</button>
              ) : accountStatus?.externalLogins.includes("Google") ? (
                <>
                  <span>Connected</span>
                  {accountStatus.hasPassword ||
                  accountStatus.externalLogins.some((provider) => provider !== "Google") ? (
                    <button onClick={() => void unlink()}>Remove Google</button>
                  ) : (
                    <small>Only sign-in method</small>
                  )}
                </>
              ) : accountStatus ? (
                <button onClick={() => void link()}>Link Google</button>
              ) : null}
            </div>
            <button onClick={signOutEverywhere}>Sign out everywhere</button>
          </div>
        )}
        <button className="nav-item" onClick={signOut}>
          <LogOut size={17} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

function Dashboard({
  boards,
  loading,
  failure,
  retry,
  navigate,
  create,
}: {
  boards: BoardDto[];
  loading: boolean;
  failure: string;
  retry: () => void;
  navigate: (p: string) => void;
  create: (title: string) => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [form, setForm] = useState(false),
    [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await create(title.trim());
      setTitle("");
      setForm(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  const shown = boards.filter((board) =>
    board.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="dashboard">
      <div className="dashboard-head">
        <div>
          <span className="eyebrow">Workspace / Boards</span>
          <h1>My Boards</h1>
          <p>Keep your thinking connected and moving forward.</p>
        </div>
        <button className="primary-button" onClick={() => setForm(true)}>
          <Plus size={16} /> New board
        </button>
      </div>
      {form && (
        <form className="inline-form" onSubmit={submit}>
          <label>
            Board title
            <input
              autoFocus
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <button className="primary-button" disabled={busy || !title.trim()}>
            Create
          </button>
          <button
            className="soft-button"
            type="button"
            onClick={() => setForm(false)}
          >
            Cancel
          </button>
          {error && <span className="form-error">{error}</span>}
        </form>
      )}
      <div className="board-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search boards"
            placeholder="Search boards"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <div className="empty-state">Loading boards…</div>
      ) : failure ? (
        <div className="empty-state">
          <h2>Could not load boards</h2>
          <p>{failure}</p>
          <button className="soft-button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : shown.length ? (
        <div className="boards-grid">
          {shown.map((board, index) => (
            <button
              className="board-card"
              key={board.id}
              onClick={() => navigate(`/boards/${board.id}`)}
            >
              <div className={`card-preview preview-${index % 4}`}>
                <div className="preview-line" />
                <div className="preview-note" />
              </div>
              <div className="card-body">
                <div className="card-title">{board.title}</div>
                <p>
                  {board.role === 1
                    ? "Owned by you"
                    : board.canEdit
                      ? "Shared · can edit"
                      : "Shared · read only"}
                </p>
                <div className="card-meta">
                  Created {new Date(board.createdAt).toLocaleDateString()}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Grid2X2 size={26} />
          <h2>{query ? "No boards found" : "No boards yet"}</h2>
          <p>
            {query ? "Try another search." : "Create a board to get started."}
          </p>
        </div>
      )}
    </div>
  );
}

function InlineText({
  value,
  label,
  editable,
  autoEdit = false,
  activation = "click",
  onSave,
  onFinish,
}: {
  value: string;
  label: string;
  editable: boolean;
  autoEdit?: boolean;
  activation?: "click" | "double";
  onSave: (value: string) => void;
  onFinish?: () => void;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  function finish() {
    setEditing(false);
    onFinish?.();
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value);
      return;
    }
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  }
  if (editing && editable)
    return (
      <input
        className="inline-edit"
        aria-label={label}
        autoFocus
        maxLength={200}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            cancelled.current = true;
            event.currentTarget.blur();
          }
        }}
      />
    );
  return (
    <span
      className={editable ? "editable-text" : ""}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      title={editable ? (activation === "double" ? "Double-click to edit" : "Click to edit") : undefined}
      onClick={editable && activation === "click" ? () => setEditing(true) : undefined}
      onDoubleClick={editable && activation === "double" ? () => setEditing(true) : undefined}
      onKeyDown={editable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditing(true);
        }
      } : undefined}
    >
      {value}
    </span>
  );
}

function TasksPanel({
  notes,
  editable,
  toggle,
  edit,
  remove,
  close,
}: {
  notes: NoteDto[];
  editable: boolean;
  toggle: (note: NoteDto) => void;
  edit: (note: NoteDto, title: string) => void;
  remove: (note: NoteDto) => void;
  close: () => void;
}) {
  const items = notes.filter((note) => note.kind === 2);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  return (
    <aside className="side-panel">
      <div className="panel-head">
        <h2>Tasks</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close tasks"
        >
          <X size={17} />
        </button>
      </div>
      <div className="task-group">
        {items.length ? (
          items.map((item) => (
            <div
              className={`panel-task ${item.isCompleted ? "completed" : ""}`}
              key={item.id}
            >
              <input
                type="checkbox"
                checked={item.isCompleted}
                disabled={!editable}
                onChange={() => toggle(item)}
              />
              <InlineText
                value={item.title}
                label="Checklist item title"
                editable={editable}
                onSave={(title) => edit(item, title)}
              />
              {editable && (
                confirmRemove === item.id ? (
                  <>
                    <button className="task-action" onClick={() => setConfirmRemove(null)}>Cancel</button>
                    <button className="task-action danger" onClick={() => {
                      setConfirmRemove(null);
                      remove(item);
                    }}>Confirm delete</button>
                  </>
                ) : (
                  <button className="task-action" onClick={() => setConfirmRemove(item.id)}>
                    Delete
                  </button>
                )
              )}
            </div>
          ))
        ) : (
          <p>No checklist items yet.</p>
        )}
      </div>
      <div className="panel-footer">
        {items.filter((item) => item.isCompleted).length} / {items.length}{" "}
        complete
      </div>
    </aside>
  );
}

function SharePanel({
  board,
  members,
  setGuest,
  removeGuest,
  close,
}: {
  board: BoardDto;
  members: MemberDto[];
  setGuest: (email: string, edit: boolean) => Promise<void>;
  removeGuest: (id: string) => Promise<void>;
  close: () => void;
}) {
  const [email, setEmail] = useState(""),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setGuest(email.trim(), edit);
      setEmail("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await removeGuest(id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="side-panel">
      <div className="panel-head">
        <h2>Board members</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close sharing"
        >
          <X size={17} />
        </button>
      </div>
      <div className="member-list">
        {members.map((member) => (
          <div className="member-row" key={member.userId}>
            <span className="avatar">{initials(member.email)}</span>
            <div>
              <strong>{member.email}</strong>
              <small>
                {member.role === 1
                  ? "Owner"
                  : member.canEdit
                    ? "Can edit"
                    : "Read only"}
              </small>
            </div>
            {board.role === 1 && member.role === 0 && (
              <>
                <button
                  className="soft-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await setGuest(member.email, !member.canEdit);
                    } catch (cause) {
                      setError(errorMessage(cause));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {member.canEdit ? "Make read only" : "Allow edit"}
                </button>
                <button
                  className="soft-button"
                  disabled={busy}
                  onClick={() => void remove(member.userId)}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {board.role === 1 && (
        <form className="share-form" onSubmit={submit}>
          <label>
            Registered guest email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={edit}
              onChange={(e) => setEdit(e.target.checked)}
            />{" "}
            Allow editing
          </label>
          <button className="primary-button" disabled={busy || !email.trim()}>
            Add or update guest
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}

function NoteCard({
  note,
  items,
  selected,
  editable,
  select,
  toggle,
  addItem,
  editTitle,
  editItem,
  removeItem,
  autoEditTitle,
  preview,
  cancelPreview,
  commitVisual,
  connectStart,
  connectMove,
  connectEnd,
  connectCancel,
  connecting,
  targetHighlighted,
}: {
  note: NoteDto;
  items: NoteDto[];
  selected: boolean;
  editable: boolean;
  select: () => void;
  toggle: (n: NoteDto) => void;
  addItem: (title: string) => void;
  editTitle: (title: string) => void;
  editItem: (item: NoteDto, title: string) => void;
  removeItem: (item: NoteDto) => void;
  autoEditTitle: boolean;
  preview: (id: string, patch: VisualPatch) => void;
  cancelPreview: (id: string, patch: VisualPatch) => void;
  commitVisual: (id: string, patch: VisualPatch) => Promise<void>;
  connectStart: (id: string, event: Pointer<HTMLButtonElement>) => void;
  connectMove: (event: Pointer<HTMLButtonElement>) => void;
  connectEnd: (event: Pointer<HTMLButtonElement>) => void;
  connectCancel: () => void;
  connecting: boolean;
  targetHighlighted: boolean;
}) {
  const drag = useRef<{
    px: number; py: number; x: number; y: number; last: VisualPatch;
  } | null>(null);
  const resize = useRef<{
    px: number; py: number; width: number; height: number; last: VisualPatch;
  } | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [itemDraft, setItemDraft] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const addingDone = useRef(false);
  function submitItem() {
    if (addingDone.current) return;
    addingDone.current = true;
    const title = itemDraft.trim();
    setAddingItem(false);
    setItemDraft("");
    if (title) addItem(title);
  }
  function down(e: Pointer<HTMLDivElement>) {
    if (!editable || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("input, textarea, button, select, .editable-text, [contenteditable='true']")) return;
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      x: note.positionX ?? 0,
      y: note.positionY ?? 0,
      last: {},
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: Pointer<HTMLDivElement>) {
    if (!drag.current) return;
    if (!(e.buttons & 1)) return up(e);
    drag.current.last = {
      positionX: Math.max(0, drag.current.x + e.clientX - drag.current.px),
      positionY: Math.max(0, drag.current.y + e.clientY - drag.current.py),
    };
    preview(note.id, drag.current.last);
  }
  function up(e: Pointer<HTMLDivElement>) {
    if (!drag.current) return;
    const active = drag.current;
    drag.current = null;
    const final = {
      positionX: Math.max(0, active.x + e.clientX - active.px),
      positionY: Math.max(0, active.y + e.clientY - active.py),
    };
    if (Math.abs(final.positionX - active.x) + Math.abs(final.positionY - active.y) > 2) {
      preview(note.id, final);
      void commitVisual(note.id, final);
    } else cancelPreview(note.id, active.last);
  }
  function cancelDrag() {
    if (!drag.current) return;
    cancelPreview(note.id, drag.current.last);
    drag.current = null;
  }
  function resizeMove(e: Pointer<HTMLButtonElement>) {
    if (!resize.current) return;
    if (!(e.buttons & 1)) return resizeUp(e);
    resize.current.last = {
      width: Math.max(minNoteWidth, resize.current.width + e.clientX - resize.current.px),
      height: Math.max(minNoteHeight, resize.current.height + e.clientY - resize.current.py),
    };
    preview(note.id, resize.current.last);
  }
  function resizeUp(e: Pointer<HTMLButtonElement>) {
    if (!resize.current) return;
    const active = resize.current;
    resize.current = null;
    const final = {
      width: Math.max(minNoteWidth, active.width + e.clientX - active.px),
      height: Math.max(minNoteHeight, active.height + e.clientY - active.py),
    };
    if (final.width !== active.width || final.height !== active.height) {
      preview(note.id, final);
      void commitVisual(note.id, final);
    } else cancelPreview(note.id, active.last);
  }
  function cancelResize() {
    if (!resize.current) return;
    cancelPreview(note.id, resize.current.last);
    resize.current = null;
  }
  return (
    <div
      data-note-id={note.id}
      className={`sticky-note ${selected ? "selected" : ""} ${note.kind === 1 ? "task-note" : ""}`}
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${note.positionX ?? 0}px, ${note.positionY ?? 0}px, 0)`,
        backgroundColor: note.color,
        width: note.width,
        height: note.height,
        zIndex: note.zIndex,
      }}
      onClick={select}
    >
      <div
        className={`note-head ${editable ? "drag-handle" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancelDrag}
      >
        <span className="note-type">
          {note.kind === 1 ? (
            <ListChecks size={13} />
          ) : (
            <StickyNote size={13} />
          )}
        </span>
        <strong>
          <InlineText
            value={note.title}
            label={note.kind === 1 ? "Task title" : "Note title"}
            editable={editable}
            autoEdit={autoEditTitle}
            activation="click"
            onSave={editTitle}
          />
        </strong>
      </div>
      {note.kind === 1 ? (
        <div className="checklist">
          {items.map((item) => (
            <div key={item.id} className={`checklist-row ${item.isCompleted ? "checked" : ""}`}>
              <input
                type="checkbox"
                aria-label={`Complete ${item.title}`}
                checked={item.isCompleted}
                disabled={!editable}
                onChange={() => toggle(item)}
                onClick={(e) => e.stopPropagation()}
              />
              <InlineText
                value={item.title}
                label="Checklist item title"
                editable={editable}
                onSave={(title) => editItem(item, title)}
              />
              {editable && (confirmRemove === item.id ? (
                <>
                  <button className="task-action" onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRemove(null);
                  }}>Cancel</button>
                  <button className="task-action danger" onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRemove(null);
                    removeItem(item);
                  }}>Confirm</button>
                </>
              ) : (
                <button className="task-action" aria-label={`Delete ${item.title}`} onClick={(e) => {
                  e.stopPropagation();
                  setConfirmRemove(item.id);
                }}>×</button>
              ))}
            </div>
          ))}
          {editable && (
            addingItem ? (
              <input
                className="inline-edit new-item-input"
                aria-label="New checklist item"
                placeholder="Type checklist item…"
                autoFocus
                maxLength={200}
                value={itemDraft}
                onChange={(e) => setItemDraft(e.target.value)}
                onBlur={submitItem}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    addingDone.current = true;
                    setAddingItem(false);
                    setItemDraft("");
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                className="add-task"
                onClick={(e) => {
                  e.stopPropagation();
                  addingDone.current = false;
                  setAddingItem(true);
                }}
              >
                <Plus size={13} /> Add item
              </button>
            )
          )}
          <div className="progress-line">
            <span
              style={{
                width: `${items.length ? (items.filter((item) => item.isCompleted).length / items.length) * 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {items.filter((item) => item.isCompleted).length} / {items.length}{" "}
            complete
          </small>
        </div>
      ) : (
        <p>{note.content}</p>
      )}
      {editable && (
        <>
          <button
            className="connection-handle connection-source"
            type="button"
            aria-label={`Connect from ${note.title}`}
            title="Drag to another note"
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              connectStart(note.id, event);
            }}
            onPointerMove={connectMove}
            onPointerUp={connectEnd}
            onPointerCancel={connectCancel}
            onClick={(event) => event.stopPropagation()}
          />
          <button
            className="resize-handle"
            type="button"
            aria-label={`Resize ${note.title}`}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0) return;
              resize.current = {
                px: event.clientX,
                py: event.clientY,
                width: note.width,
                height: note.height,
                last: {},
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={resizeMove}
            onPointerUp={resizeUp}
            onPointerCancel={cancelResize}
            onClick={(event) => event.stopPropagation()}
          />
        </>
      )}
      <span className={`connection-handle connection-target ${connecting || targetHighlighted ? "visible" : ""} ${targetHighlighted ? "highlighted" : ""}`} aria-hidden="true" />
    </div>
  );
}

function Editor({
  note,
  visualColor,
  visualWidth,
  visualHeight,
  editable,
  patch,
  removeNote,
  deleted,
  preview,
  cancelPreview,
  commitVisual,
  changeColor,
  failed,
  notify,
}: {
  note: NoteDto;
  visualColor: string;
  visualWidth: number;
  visualHeight: number;
  editable: boolean;
  patch: (id: string, changes: PatchNote) => Promise<NoteDto>;
  removeNote: (id: string) => Promise<void>;
  deleted: (id: string) => void;
  preview: (id: string, patch: VisualPatch) => void;
  cancelPreview: (id: string, patch: VisualPatch) => void;
  commitVisual: (id: string, patch: VisualPatch) => Promise<void>;
  changeColor: (id: string, color: string) => void;
  failed: (id: string, cause: unknown) => void;
  notify: (m: string) => void;
}) {
  const [title, setTitle] = useState(note.title),
    [content, setContent] = useState(note.content),
    [width, setWidth] = useState(String(note.width)),
    [height, setHeight] = useState(String(note.height)),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.title, note.content]);
  useEffect(() => {
    setWidth(String(note.width));
    setHeight(String(note.height));
  }, [note.width, note.height]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const changes: PatchNote = {};
    if (title.trim() !== note.title) changes.title = title.trim();
    if (content !== note.content) changes.content = content;
    if (!Object.keys(changes).length) return;
    setBusy(true);
    try {
      await patch(note.id, changes);
      notify("Note saved");
    } catch (cause) {
      failed(note.id, cause);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await removeNote(note.id);
      deleted(note.id);
      notify("Note deleted");
    } catch (cause) {
      failed(note.id, cause);
    } finally {
      setBusy(false);
    }
  }
  function setDimension(field: "width" | "height", value: string) {
    if (field === "width") setWidth(value);
    else setHeight(value);
    const number = Number(value);
    const minimum = field === "width" ? minNoteWidth : minNoteHeight;
    if (value && Number.isFinite(number) && number >= minimum)
      preview(note.id, { [field]: number });
  }
  function finishDimension(field: "width" | "height") {
    const value = field === "width" ? width : height;
    const number = Number(value);
    const minimum = field === "width" ? minNoteWidth : minNoteHeight;
    if (!value || !Number.isFinite(number) || number < minimum) {
      cancelPreview(note.id, { [field]: field === "width" ? visualWidth : visualHeight });
      if (field === "width") setWidth(String(note.width));
      else setHeight(String(note.height));
      return;
    }
    if (number !== note[field]) void commitVisual(note.id, { [field]: number });
  }
  return (
    <form className="note-editor" onSubmit={submit}>
      <h3>{note.kind === 1 ? "Task list" : "Note"}</h3>
      <label>
        Title
        <input
          value={title}
          maxLength={200}
          disabled={!editable}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Content
        <textarea
          value={content}
          disabled={!editable}
          onChange={(e) => setContent(e.target.value)}
        />
      </label>
      {editable && (
        <>
          <label>
            Color
            <input
              type="color"
              value={visualColor.slice(0, 7)}
              onChange={(e) => changeColor(note.id, e.target.value)}
            />
          </label>
          <div className="dimension-row">
            <label>
              Width
              <input
                type="number"
                min={minNoteWidth}
                value={width}
                onChange={(e) => setDimension("width", e.target.value)}
                onBlur={() => finishDimension("width")}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                min={minNoteHeight}
                value={height}
                onChange={(e) => setDimension("height", e.target.value)}
                onBlur={() => finishDimension("height")}
              />
            </label>
          </div>
          <div className="editor-actions">
            <button
              className="primary-button"
              disabled={busy || !title.trim()}
            >
              Save
            </button>
            {confirmDelete ? (
              <>
                <button type="button" className="soft-button" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="soft-button danger" disabled={busy} onClick={() => void remove()}>Confirm delete</button>
              </>
            ) : (
              <button type="button" className="soft-button" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>
            )}
          </div>
        </>
      )}
    </form>
  );
}

function Workspace({
  id,
  back,
  boardLoaded,
  notify,
}: {
  id: string;
  back: () => void;
  boardLoaded: (b: BoardDto) => void;
  notify: (m: string) => void;
}) {
  const [board, setBoard] = useState<BoardDto | null>(null),
    [notes, setNotes] = useState<NoteDto[]>([]),
    [edges, setEdges] = useState<ConnectionDto[]>([]),
    [members, setMembers] = useState<MemberDto[]>([]);
  const [loading, setLoading] = useState(true),
    [failure, setFailure] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [editTitleId, setEditTitleId] = useState<string | null>(null),
    [panel, setPanel] = useState<Panel>(null),
    [connecting, setConnecting] = useState(false),
    [type, setType] = useState<0 | 1>(0),
    [conflicted, setConflicted] = useState<string | null>(null),
    [visuals, setVisuals] = useState<Record<string, VisualPatch>>({}),
    [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const notesRef = useRef<NoteDto[]>([]);
  const mutationQueues = useRef(new Map<string, Promise<void>>());
  const blockedNotes = useRef(new Set<string>());
  const colorTimers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; color: string }>());
  const draftRef = useRef<ConnectionDraft | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const publishNotes = useCallback((update: (current: NoteDto[]) => NoteDto[]) => {
    const next = update(notesRef.current);
    notesRef.current = next;
    setNotes(next);
  }, []);
  const preview = useCallback((noteId: string, patch: VisualPatch) => {
    setVisuals((current) => ({
      ...current,
      [noteId]: { ...current[noteId], ...patch },
    }));
  }, []);
  const cancelPreview = useCallback((noteId: string, patch: VisualPatch) => {
    setVisuals((current) => {
      if (!current[noteId]) return current;
      const next = { ...current[noteId] };
      for (const key of Object.keys(patch) as (keyof VisualPatch)[]) {
        if (next[key] === patch[key]) delete next[key];
      }
      const all = { ...current };
      if (Object.keys(next).length) all[noteId] = next;
      else delete all[noteId];
      return all;
    });
  }, []);
  const enqueueNote = useCallback(<T,>(
    noteId: string,
    action: (current: NoteDto) => Promise<T>,
  ): Promise<T> => {
    const previous = mutationQueues.current.get(noteId) ?? Promise.resolve();
    const operation = previous.then(async () => {
      if (blockedNotes.current.has(noteId))
        throw new AuthApiError("note_version_conflict", 409);
      const current = notesRef.current.find((note) => note.id === noteId);
      if (!current) throw new AuthApiError("not_found", 404);
      try {
        return await action(current);
      } catch (cause) {
        if (isConflict(cause)) blockedNotes.current.add(noteId);
        throw cause;
      }
    });
    const tail = operation.then(() => undefined, () => undefined);
    mutationQueues.current.set(noteId, tail);
    void tail.then(() => {
      if (mutationQueues.current.get(noteId) === tail)
        mutationQueues.current.delete(noteId);
    });
    return operation;
  }, []);
  const patchNote = useCallback((noteId: string, changes: PatchNote) =>
    enqueueNote(noteId, async (current) => {
      const updated = await noteApi.patch(id, noteId, current.version, changes);
      publishNotes((all) => all.map((note) => note.id === noteId ? updated : note));
      return updated;
    }), [enqueueNote, id, publishNotes]);
  const deleteNote = useCallback((noteId: string) =>
    enqueueNote(noteId, async (current) => {
      await noteApi.remove(id, noteId, current.version);
      publishNotes((all) => all.filter((note) => note.id !== noteId));
      setEdges((all) => all.filter((edge) =>
        edge.sourceNoteId !== noteId && edge.targetNoteId !== noteId));
      setVisuals((all) => {
        const next = { ...all };
        delete next[noteId];
        return next;
      });
    }), [enqueueNote, id, publishNotes]);
  const failed = useCallback((noteId: string, cause: unknown) => {
    if (isConflict(cause)) setConflicted(noteId);
    notify(errorMessage(cause));
  }, [notify]);
  const commitVisual = useCallback(async (noteId: string, changes: VisualPatch) => {
    try {
      await patchNote(noteId, changes);
    } catch (cause) {
      failed(noteId, cause);
    } finally {
      cancelPreview(noteId, changes);
    }
  }, [patchNote, failed, cancelPreview]);
  function changeColor(noteId: string, color: string) {
    preview(noteId, { color });
    const pending = colorTimers.current.get(noteId);
    if (pending) clearTimeout(pending.timer);
    const timer = setTimeout(() => {
      colorTimers.current.delete(noteId);
      void commitVisual(noteId, { color });
    }, 250);
    colorTimers.current.set(noteId, { timer, color });
  }
  const load = useCallback(async () => {
    setLoading(true);
    setFailure("");
    try {
      const [b, n, e, m] = await Promise.all([
        boardApi.get(id),
        noteApi.list(id),
        connectionApi.list(id),
        boardApi.members(id),
      ]);
      setBoard(b);
      notesRef.current = n;
      setNotes(n);
      setEdges(e);
      setMembers(m);
      setVisuals({});
      blockedNotes.current.clear();
      boardLoaded(b);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [id, boardLoaded]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => () => {
    for (const [noteId, pending] of colorTimers.current) {
      clearTimeout(pending.timer);
      void commitVisual(noteId, { color: pending.color });
    }
    colorTimers.current.clear();
  }, [commitVisual]);
  async function create(kind: 0 | 1) {
    try {
      setConnecting(false);
      draftRef.current = null;
      setConnectionDraft(null);
      const count = notes.filter((note) => note.kind !== 2).length;
      const value = await noteApi.create(id, {
        kind,
        title: kind === 1 ? "New task list" : "New note",
        content: "",
        positionX: 120 + (count % 2) * 300,
        positionY: 120 + Math.floor(count / 2) * 210,
        color: kind === 1 ? "#443D29" : "#1D3841",
      });
      publishNotes((previous) => [...previous, value]);
      setSelected(value.id);
      setEditTitleId(value.id);
      notify(kind === 1 ? "Task list created" : "Note created");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function addItem(parentId: string, title: string) {
    try {
      const value = await noteApi.create(id, {
        kind: 2,
        title: title.trim(),
        parentNoteId: parentId,
      });
      publishNotes((previous) => [...previous, value]);
      notify("Checklist item added");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function toggle(item: NoteDto) {
    try {
      await enqueueNote(item.id, async (current) => {
        const updated = await noteApi.patch(id, item.id, current.version, {
          isCompleted: !current.isCompleted,
        });
        publishNotes((all) => all.map((note) => note.id === item.id ? updated : note));
      });
    } catch (cause) {
      failed(item.id, cause);
    }
  }
  async function editTitle(noteId: string, title: string) {
    try {
      await patchNote(noteId, { title });
      setEditTitleId(null);
    } catch (cause) {
      failed(noteId, cause);
    }
  }
  async function editItem(item: NoteDto, title: string) {
    try {
      await patchNote(item.id, { title });
      notify("Checklist item updated");
    } catch (cause) {
      failed(item.id, cause);
    }
  }
  async function removeItem(item: NoteDto) {
    try {
      await deleteNote(item.id);
      notify("Checklist item deleted");
    } catch (cause) {
      failed(item.id, cause);
    }
  }
  function targetAt(clientX: number, clientY: number, sourceId: string): string | null {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const targetId = element?.closest<HTMLElement>("[data-note-id]")?.dataset.noteId ?? null;
    return targetId !== sourceId ? targetId : null;
  }
  function connectStart(sourceId: string, event: Pointer<HTMLButtonElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    const value = {
      sourceId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      targetId: null,
    };
    draftRef.current = value;
    setConnectionDraft(value);
    setConnecting(true);
  }
  function connectMove(event: Pointer<HTMLButtonElement>) {
    const current = draftRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!current || !rect) return;
    if (!(event.buttons & 1)) return connectEnd(event);
    const value = {
      ...current,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      targetId: targetAt(event.clientX, event.clientY, current.sourceId),
    };
    draftRef.current = value;
    setConnectionDraft(value);
  }
  function connectCancel() {
    draftRef.current = null;
    setConnectionDraft(null);
    setConnecting(false);
  }
  async function connectEnd(event: Pointer<HTMLButtonElement>) {
    const current = draftRef.current;
    connectCancel();
    if (!current) return;
    const targetId = targetAt(event.clientX, event.clientY, current.sourceId);
    if (!targetId) return;
    try {
      const edge = await connectionApi.create(id, current.sourceId, targetId, type);
      setEdges((previous) => [...previous, edge]);
      notify("Connection created");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function removeEdge(edgeId: string) {
    try {
      await connectionApi.remove(id, edgeId);
      setEdges((previous) => previous.filter((edge) => edge.id !== edgeId));
      notify("Connection removed");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function setGuest(email: string, edit: boolean) {
    await boardApi.setGuest(id, email, edit);
    setMembers(await boardApi.members(id));
    notify("Member access updated");
  }
  async function removeGuest(guestId: string) {
    await boardApi.removeGuest(id, guestId);
    setMembers(await boardApi.members(id));
    notify("Member removed");
  }
  async function latest() {
    if (!conflicted) return;
    try {
      const fresh = await noteApi.get(id, conflicted);
      publishNotes((all) => all.map((note) => note.id === fresh.id ? fresh : note));
      blockedNotes.current.delete(conflicted);
      setVisuals((all) => {
        const next = { ...all };
        delete next[conflicted];
        return next;
      });
      setConflicted(null);
      notify("Latest note loaded");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  const top = notes.filter((note) => note.kind !== 2),
    visualTop = top.map((note) => ({ ...note, ...visuals[note.id] })),
    selectedNote = top.find((note) => note.id === selected),
    editable = board?.canEdit ?? false;
  return (
    <div className="workspace">
      <header className="board-header">
        <div className="board-heading">
          <button className="back-button" onClick={back}>
            <ArrowLeft size={17} /> Boards
          </button>
          <span className="divider" />
          <span className="board-symbol">
            <Sparkles size={14} />
          </span>
          <strong>{board?.title ?? "Board"}</strong>
        </div>
        <div className="board-actions">
          {board && (
            <span className="permission-label">
              {board.role === 1 ? "Owner" : editable ? "Can edit" : "Read only"}
            </span>
          )}
          <button
            className="outline-button"
            disabled={!board}
            onClick={() => setPanel(panel === "share" ? null : "share")}
          >
            <Share2 size={15} /> Share
          </button>
          <button
            className="outline-button"
            onClick={() => setPanel(panel === "chat" ? null : "chat")}
          >
            <MessageSquare size={15} /> Chat
          </button>
        </div>
      </header>
      {loading ? (
        <div className="workspace-state">Loading board…</div>
      ) : failure ? (
        <div className="workspace-state">
          <h2>Board unavailable</h2>
          <p>{failure}</p>
          <button className="soft-button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : (
        <main className="board-main">
          <div className="canvas-tools">
            {editable && (
              <>
                <button
                  className="icon-button"
                  title="New note"
                  aria-label="New note"
                  onClick={() => void create(0)}
                >
                  <StickyNote size={17} />
                </button>
                <button
                  className="icon-button"
                  title="New task list"
                  aria-label="New task list"
                  onClick={() => void create(1)}
                >
                  <ListChecks size={17} />
                </button>
                <button
                  className={`icon-button ${connecting ? "active" : ""}`}
                  title="Connect notes"
                  aria-label="Connect notes"
                  onClick={() => {
                    if (connecting) connectCancel();
                    else setConnecting(true);
                  }}
                >
                  <Link2 size={17} />
                </button>
              </>
            )}
            <span className="tool-rule" />
            <button
              className="icon-button"
              title="Tasks"
              aria-label="Tasks"
              onClick={() => setPanel(panel === "tasks" ? null : "tasks")}
            >
              <ListChecks size={17} />
            </button>
          </div>
          <div className="canvas" ref={canvasRef}>
            <CircuitBackground />
            {connecting && (
              <div className="canvas-label">
                Drag from a note’s right handle to another note{" "}
                <select
                  value={type}
                  onChange={(e) => setType(Number(e.target.value) as 0 | 1)}
                >
                  <option value={0}>Related</option>
                  <option value={1}>Prerequisite</option>
                </select>
              </div>
            )}
            <svg className="connections">
              <defs>
                <marker id="connection-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const a = visualTop.find((n) => n.id === edge.sourceNoteId),
                  b = visualTop.find((n) => n.id === edge.targetNoteId);
                const startX = (a?.positionX ?? 0) + (a?.width ?? 0),
                  startY = (a?.positionY ?? 0) + (a?.height ?? 0) / 2,
                  endX = b?.positionX ?? 0,
                  endY = (b?.positionY ?? 0) + (b?.height ?? 0) / 2,
                  bend = Math.max(45, Math.abs(endX - startX) / 2);
                return a && b ? (
                  <path
                    key={edge.id}
                    d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`}
                    className={edge.type === 1 ? "prerequisite-edge" : "related-edge"}
                    markerEnd="url(#connection-arrow)"
                  />
                ) : null;
              })}
              {connectionDraft && (() => {
                const sourceNote = visualTop.find((note) => note.id === connectionDraft.sourceId);
                if (!sourceNote) return null;
                const startX = (sourceNote.positionX ?? 0) + sourceNote.width;
                const startY = (sourceNote.positionY ?? 0) + sourceNote.height / 2;
                const bend = Math.max(45, Math.abs(connectionDraft.x - startX) / 2);
                return <path className="draft-edge" d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${connectionDraft.x - bend} ${connectionDraft.y}, ${connectionDraft.x} ${connectionDraft.y}`} markerEnd="url(#connection-arrow)" />;
              })()}
            </svg>
            {visualTop.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                items={notes.filter((item) => item.parentNoteId === note.id)}
                selected={selected === note.id}
                editable={editable}
                select={() => setSelected(note.id)}
                toggle={toggle}
                addItem={(title) => void addItem(note.id, title)}
                editTitle={(title) => void editTitle(note.id, title)}
                editItem={(item, title) => void editItem(item, title)}
                removeItem={(item) => void removeItem(item)}
                autoEditTitle={editTitleId === note.id}
                preview={preview}
                cancelPreview={cancelPreview}
                commitVisual={commitVisual}
                connectStart={connectStart}
                connectMove={connectMove}
                connectEnd={(event) => void connectEnd(event)}
                connectCancel={connectCancel}
                connecting={connecting}
                targetHighlighted={connectionDraft?.targetId === note.id}
              />
            ))}
            {!top.length && (
              <div className="canvas-empty">
                {editable
                  ? "Create a note or task list to start."
                  : "This board has no notes yet."}
              </div>
            )}
            {selectedNote && (
              <div className="editor-panel">
                <button
                  className="icon-button editor-close"
                  onClick={() => setSelected(null)}
                  aria-label="Close note editor"
                >
                  <X size={17} />
                </button>
                <Editor
                  key={selectedNote.id}
                  note={selectedNote}
                  visualColor={visuals[selectedNote.id]?.color ?? selectedNote.color}
                  visualWidth={visuals[selectedNote.id]?.width ?? selectedNote.width}
                  visualHeight={visuals[selectedNote.id]?.height ?? selectedNote.height}
                  editable={editable}
                  patch={patchNote}
                  removeNote={deleteNote}
                  deleted={() => setSelected(null)}
                  preview={preview}
                  cancelPreview={cancelPreview}
                  commitVisual={commitVisual}
                  changeColor={changeColor}
                  failed={failed}
                  notify={notify}
                />
                <div className="connection-list">
                  <h3>Connections</h3>
                  {edges
                    .filter(
                      (edge) =>
                        edge.sourceNoteId === selected ||
                        edge.targetNoteId === selected,
                    )
                    .map((edge) => (
                      <div key={edge.id}>
                        {edge.type === 1 ? "Prerequisite" : "Related"} ·{" "}
                        {
                          top.find(
                            (n) =>
                              n.id ===
                              (edge.sourceNoteId === selected
                                ? edge.targetNoteId
                                : edge.sourceNoteId),
                          )?.title
                        }
                        {editable && (
                          <button onClick={() => void removeEdge(edge.id)}>
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          {panel === "tasks" && (
            <TasksPanel
              notes={notes}
              editable={editable}
              toggle={toggle}
              edit={(item, title) => void editItem(item, title)}
              remove={(item) => void removeItem(item)}
              close={() => setPanel(null)}
            />
          )}
          {panel === "share" && board && (
            <SharePanel
              board={board}
              members={members}
              setGuest={setGuest}
              removeGuest={removeGuest}
              close={() => setPanel(null)}
            />
          )}
          {panel === "chat" && (
            <aside className="side-panel">
              <div className="panel-head">
                <h2>Board chat</h2>
                <button
                  className="icon-button"
                  onClick={() => setPanel(null)}
                  aria-label="Close chat"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="panel-empty">
                Board chat is unavailable until persistent chat support is added
                to the API.
              </div>
            </aside>
          )}
        </main>
      )}
      {conflicted && (
        <div
          className="conflict-dialog"
          role="alertdialog"
          aria-label="Note conflict"
        >
          <h2>This note was modified by another board member.</h2>
          <p>Load the latest version before editing again.</p>
          <button className="primary-button" onClick={() => void latest()}>
            View latest
          </button>
          <button
            className="soft-button"
            onClick={() => void load().then(() => setConflicted(null))}
          >
            Reload board
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname),
    [session, setSession] = useState<AuthSession | null>(currentSession()),
    [starting, setStarting] = useState(true),
    [startupError, setStartupError] = useState(""),
    [notice, setNotice] = useState(""),
    [boards, setBoards] = useState<BoardDto[]>([]),
    [loading, setLoading] = useState(false),
    [failure, setFailure] = useState("");
  const started = useRef(false);
  const navigate = useCallback((next: string) => {
    window.history.pushState(null, "", next);
    setPath(next);
  }, []);
  useEffect(() => {
    const pop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        if (window.location.pathname === "/auth/callback") {
          const params = new URLSearchParams(window.location.search),
            code = params.get("code"),
            error = params.get("error"),
            linked = params.get("linked");
          window.history.replaceState(null, "", "/boards");
          setPath("/boards");
          if (error) setStartupError(errorMessage(new AuthApiError(error)));
          if (code) {
            setSession(await exchangeGoogleCode(code));
            return;
          }
          if (linked) setNotice("Google account linked");
        }
        setSession(await restoreSession());
      } catch (cause) {
        setStartupError(errorMessage(cause));
      } finally {
        setStarting(false);
      }
    })();
  }, []);
  const loadBoards = useCallback(async () => {
    setLoading(true);
    setFailure("");
    try {
      setBoards(await boardApi.list());
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);
  const boardLoaded = useCallback(
    (board: BoardDto) =>
      setBoards((previous) =>
        previous.some((item) => item.id === board.id)
          ? previous
          : [board, ...previous],
      ),
    [],
  );
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setSession(null);
      setBoards([]);
      setStartupError("Your session expired. Please sign in again.");
      window.history.replaceState(null, "", "/login");
      setPath("/login");
    });
    return () => setSessionExpiredHandler(null);
  }, []);
  useEffect(() => {
    if (!starting && !session && path !== "/login" && path !== "/register") {
      window.history.replaceState(null, "", "/login");
      setPath("/login");
    }
  }, [starting, session, path]);
  useEffect(() => {
    if (session) void loadBoards();
  }, [session, loadBoards]);
  async function signOut(all: boolean) {
    try {
      if (all) await logoutEverywhere();
      else await logout();
      setSession(null);
      setBoards([]);
      navigate("/login");
    } catch (cause) {
      setNotice(errorMessage(cause));
    }
  }
  const boardId = boardFromPath(path);
  if (starting)
    return <div className="startup-state">Restoring your session…</div>;
  if (!session)
    return (
      <AuthScreen
        mode={path === "/register" ? "register" : "login"}
        error={startupError}
        navigate={navigate}
        onSuccess={(value) => {
          setSession(value);
          setStartupError("");
          navigate("/boards");
        }}
      />
    );
  if (
    path === "/" ||
    path === "/login" ||
    path === "/register" ||
    path === "/auth/callback"
  ) {
    window.history.replaceState(null, "", "/boards");
    queueMicrotask(() => setPath("/boards"));
    return <div className="startup-state">Opening boards…</div>;
  }
  return (
    <div className="app-shell">
      <SidebarNav
        user={session.user}
        boards={boards}
        active={boardId}
        navigate={navigate}
        signOut={() => void signOut(false)}
        signOutEverywhere={() => void signOut(true)}
        notify={setNotice}
      />
      {boardId ? (
        <Workspace
          key={boardId}
          id={boardId}
          back={() => navigate("/boards")}
          boardLoaded={boardLoaded}
          notify={setNotice}
        />
      ) : (
        <Dashboard
          boards={boards}
          loading={loading}
          failure={failure}
          retry={() => void loadBoards()}
          navigate={navigate}
          create={async (title) => {
            const board = await boardApi.create(title);
            setBoards((previous) => [board, ...previous]);
            setNotice("Board created");
            navigate(`/boards/${board.id}`);
          }}
        />
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
