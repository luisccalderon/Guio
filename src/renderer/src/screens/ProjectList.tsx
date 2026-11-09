import { useEffect, useState, type FormEvent } from "react";
import type { ProjectMeta, Template } from "../../../core/domain/schemas";
import { formatDuration } from "../../../core/script/timing";
import { call } from "../api";

interface ProjectListProps {
  onOpen(slug: string): void;
  onSettings(): void;
}

export function ProjectList({ onOpen, onSettings }: ProjectListProps) {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("news");
  const [language, setLanguage] = useState("es");
  const [minutes, setMinutes] = useState(10);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([call("listProjects", {}), call("listTemplates", {})]).then(
      ([loadedProjects, loadedTemplates]) => {
        setProjects(loadedProjects);
        setTemplates(loadedTemplates);
      },
      (failure: Error) => setError(failure.message),
    );
  }, []);

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      const meta = await call("createProject", {
        title,
        templateId,
        language,
        targetSeconds: Math.round(minutes * 60),
      });
      onOpen(meta.slug);
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Guio</h1>
        <button type="button" className="quiet" onClick={onSettings}>
          Settings
        </button>
      </header>

      {error === null ? null : <p className="notice notice-error">{error}</p>}

      <form className="form" onSubmit={(event) => void create(event)}>
        <h2>New video</h2>
        <label>
          <span>Title</span>
          <input value={title} required onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>Template</span>
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Script language</span>
          <input value={language} required onChange={(event) => setLanguage(event.target.value)} />
        </label>
        <label>
          <span>Target minutes</span>
          <input
            type="number"
            min={1}
            step={0.5}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
        </label>
        <div className="row">
          <button type="submit" className="primary">
            Create
          </button>
        </div>
      </form>

      <section>
        <h2>Videos</h2>
        {projects.length === 0 ? <p className="muted">Your videos appear here once you create one.</p> : null}
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.slug}>
              <button type="button" className="project-row" onClick={() => onOpen(project.slug)}>
                <span>{project.title}</span>
                <span className="muted">
                  {project.templateId} · {project.language} · {formatDuration(project.targetSeconds)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
