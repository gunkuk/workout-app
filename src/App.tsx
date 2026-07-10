import { useEffect, useState } from "react";

type RouteName = "today" | "history" | "onboarding";

function parseRoute(hash: string): RouteName {
  const path = hash.replace(/^#/, "");
  if (path === "/history") return "history";
  if (path === "/onboarding") return "onboarding";
  return "today";
}

export default function App() {
  const [route, setRoute] = useState<RouteName>(() =>
    parseRoute(window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "history") return <div>history</div>;
  if (route === "onboarding") return <div>onboarding</div>;
  return <div>today</div>;
}
