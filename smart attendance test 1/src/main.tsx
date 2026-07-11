
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  // Add global error handlers to prevent socket disconnections from unhandled errors
  window.addEventListener('error', (event) => {
    console.error('[Global Error Handler]', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Rejection]', event.reason);
    // Don't prevent default - let the error be logged but continue running
  });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found in index.html');
}

createRoot(rootElement).render(<App />);
  