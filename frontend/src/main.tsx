import ReactDOM from "react-dom/client";
import App from "./app/App";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import { FuturePreviewEntry } from "./features/future/FuturePreviewApp";
import { futurePreviewEnabled, isFuturePreviewPath } from "./features/future/flags";
import "./styles.css";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/foundation.css";
import "./styles/public-pages.css";
import "./styles/shell.css";
import "./styles/boards.css";
import "./styles/board-foundation.css";
import "./styles/presence.css";
import "./styles/future.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>{futurePreviewEnabled && isFuturePreviewPath(window.location.pathname) ? <FuturePreviewEntry /> : <App />}</AppErrorBoundary>,
);
