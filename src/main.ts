import { App } from "./ui/app";
import "./styles/main.css";

declare global {
  interface Window {
    __app?: App;
  }
}

function boot(): App {
  document.getElementById("app")!.innerHTML = "";
  const app = new App();
  app.start();
  window.__app = app;
  return app;
}

const app = boot();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.destroy();
  });
  import.meta.hot.accept();
}
