import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import { LoadingSkeleton } from "./components/ui/LoadingSkeleton";
const FuturePreviewEntry = lazy(() => import("./features/future/FuturePreviewApp").then((module) => ({ default: module.FuturePreviewEntry })));
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
import './styles/brand.css';
import { initializeBrowserBrand } from './components/brand/browserBrand';
import { initializeColorPalette } from './theme/paletteState';
import { initializeBoardVariations } from './theme/boardVariationState';
import './styles/palettes.css';
import { initializeInputModality } from './components/ui/inputModality';
import { initializeLibraryShare } from './features/library/libraryShare';

initializeColorPalette();
const disposeLibraryShare = initializeLibraryShare();
import.meta.hot?.dispose(disposeLibraryShare);
initializeBoardVariations();
const disposeBrowserBrand = initializeBrowserBrand();
import.meta.hot?.dispose(disposeBrowserBrand);
const disposeInputModality = initializeInputModality();
import.meta.hot?.dispose(disposeInputModality);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>{futurePreviewEnabled && isFuturePreviewPath(window.location.pathname) ? <Suspense fallback={<LoadingSkeleton label="Opening preview" layout="cards" />}><FuturePreviewEntry /></Suspense> : <App />}</AppErrorBoundary>,
);
