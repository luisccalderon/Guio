import { useState } from "react";
import { ProjectList } from "./screens/ProjectList";
import { Settings } from "./screens/Settings";
import { Workspace } from "./screens/Workspace";

type Route = { name: "projects" } | { name: "settings" } | { name: "project"; slug: string };

export function App() {
  const [route, setRoute] = useState<Route>({ name: "projects" });
  const home = (): void => setRoute({ name: "projects" });

  if (route.name === "settings") {
    return <Settings onBack={home} />;
  }
  if (route.name === "project") {
    return <Workspace slug={route.slug} onBack={home} />;
  }
  return <ProjectList onOpen={(slug) => setRoute({ name: "project", slug })} onSettings={() => setRoute({ name: "settings" })} />;
}
