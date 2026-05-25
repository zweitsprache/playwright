"use client";
/* eslint-disable @next/next/no-img-element */

import { toPng } from "html-to-image";
import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import styles from "./page.module.css";

type Lesson = {
  id: string;
  moduleId: string;
  title: string;
  position: number;
};

type Module = {
  id: string;
  projectId: string;
  title: string;
  subtitle: string;
  position: number;
  lessons: Lesson[];
};

type Project = {
  id: string;
  badge: string;
  course: string;
  subtitle: string;
  position: number;
  modules: Module[];
};

type TreeResponse = {
  ok: boolean;
  tree?: Project[];
  message?: string;
};

type DragItem = {
  type: "project" | "module" | "lesson";
  id: string;
};

type DropTarget = {
  listType: "project" | "module" | "lesson";
  parentId?: string;
  index: number;
};

type ExportSlidePrimaryProps = {
  logo: string;
  tag: string;
  course: string;
  courseSubtitle: string;
};

type ExportSlideSecondaryProps = {
  logo: string;
  tag: string;
  title: string;
  subtitle: string;
  course: string;
};

type ExportSlideTertiaryProps = {
  logo: string;
  tag: string;
  title: string;
  course: string;
};

const railChipWidths = [126, 152, 107, 140, 90] as const;
const sharedLogo = "/logo/didaktiv_logo_brand.svg";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "item";
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

async function callApi<TBody extends object>(method: string, body?: TBody) {
  const response = await fetch("/api/curriculum", {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await response.json()) as TreeResponse;

  if (!response.ok || !data.ok || !data.tree) {
    throw new Error(data.message ?? "Request failed.");
  }

  return data.tree;
}

function patchLocalValue(
  tree: Project[],
  type: "project" | "module" | "lesson",
  id: string,
  field: string,
  value: string,
) {
  if (type === "project") {
    return tree.map((project) =>
      project.id === id ? { ...project, [field]: value } : project,
    );
  }

  if (type === "module") {
    return tree.map((project) => ({
      ...project,
      modules: project.modules.map((module) =>
        module.id === id ? { ...module, [field]: value } : module,
      ),
    }));
  }

  return tree.map((project) => ({
    ...project,
    modules: project.modules.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) =>
        lesson.id === id ? { ...lesson, [field]: value } : lesson,
      ),
    })),
  }));
}

export function CurriculumManager() {
  const [tree, setTree] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading...");
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [generatingProjectId, setGeneratingProjectId] = useState<string | null>(null);
  const exportProjectNodes = useRef<Record<string, HTMLDivElement | null>>({});
  const exportModuleNodes = useRef<Record<string, HTMLDivElement | null>>({});
  const exportLessonNodes = useRef<Record<string, HTMLDivElement | null>>({});

  function bindProjectNode(id: string, node: HTMLDivElement | null) {
    exportProjectNodes.current[id] = node;
  }

  function bindModuleNode(id: string, node: HTMLDivElement | null) {
    exportModuleNodes.current[id] = node;
  }

  function bindLessonNode(id: string, node: HTMLDivElement | null) {
    exportLessonNodes.current[id] = node;
  }

  async function refreshTree() {
    const response = await fetch("/api/curriculum", { method: "GET" });
    const data = (await response.json()) as TreeResponse;

    if (!response.ok || !data.ok || !data.tree) {
      throw new Error(data.message ?? "Failed to load tree.");
    }

    setTree(data.tree);
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const response = await fetch("/api/curriculum", { method: "GET" });
        const data = (await response.json()) as TreeResponse;

        if (!response.ok || !data.ok || !data.tree) {
          throw new Error(data.message ?? "Failed to load tree.");
        }

        if (!isMounted) {
          return;
        }

        setTree(data.tree);
        setMessage("Ready.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setMessage(error instanceof Error ? error.message : "Failed to load tree.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const canDrop = useMemo(() => {
    if (!dragItem || !dropTarget) {
      return false;
    }

    if (dragItem.type !== dropTarget.listType) {
      return false;
    }

    return true;
  }, [dragItem, dropTarget]);

  async function handleCreateProject() {
    setSaving(true);

    try {
      const nextTree = await callApi("POST", { type: "project" });
      setTree(nextTree);
      setMessage("Project created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateModule(projectId: string) {
    setSaving(true);

    try {
      const nextTree = await callApi("POST", { type: "module", projectId });
      setTree(nextTree);
      setMessage("Module created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create module.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLesson(moduleId: string) {
    setSaving(true);

    try {
      const nextTree = await callApi("POST", { type: "lesson", moduleId });
      setTree(nextTree);
      setMessage("Lesson created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create lesson.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(type: "project" | "module" | "lesson", id: string) {
    setSaving(true);

    try {
      const nextTree = await callApi("DELETE", { type, id });
      setTree(nextTree);
      setMessage("Item removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete item.");
    } finally {
      setSaving(false);
    }
  }

  function handleChange(
    type: "project" | "module" | "lesson",
    id: string,
    field: string,
    value: string,
  ) {
    setTree((currentTree) => patchLocalValue(currentTree, type, id, field, value));
  }

  async function handleCommit(
    type: "project" | "module" | "lesson",
    id: string,
    data: Record<string, string>,
  ) {
    setSaving(true);

    try {
      const nextTree = await callApi("PATCH", { type, id, data });
      setTree(nextTree);
      setMessage("Changes saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save changes.");
      await refreshTree();
    } finally {
      setSaving(false);
    }
  }

  function onDragStart(item: DragItem) {
    setDragItem(item);
  }

  function onDragEnd() {
    setDragItem(null);
    setDropTarget(null);
  }

  function onDragOver(target: DropTarget, event: DragEvent<HTMLDivElement>) {
    if (!dragItem || dragItem.type !== target.listType) {
      return;
    }

    event.preventDefault();
    setDropTarget(target);
  }

  async function onDrop(target: DropTarget, event: DragEvent<HTMLDivElement>) {
    if (!dragItem || dragItem.type !== target.listType) {
      return;
    }

    event.preventDefault();

    setSaving(true);

    try {
      const nextTree = await callApi("PUT", {
        type: dragItem.type,
        id: dragItem.id,
        toParentId: target.parentId,
        toIndex: target.index,
      });

      setTree(nextTree);
      setMessage("Order updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to move item.");
    } finally {
      setSaving(false);
      setDragItem(null);
      setDropTarget(null);
    }
  }

  async function exportNodeToPngBase64(node: HTMLDivElement | null, fileName: string) {
    if (!node) {
      throw new Error(`Export node not ready for ${fileName}.`);
    }

    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
    });

    const payload = dataUrl.split(",")[1];

    if (!payload) {
      throw new Error(`Invalid PNG payload for ${fileName}.`);
    }

    return payload;
  }

  async function handleGenerateGraphics(project: Project) {
    setSaving(true);
    setGeneratingProjectId(project.id);
    setMessage("Generating PNG assets...");

    try {
      const projectBase = slugify(project.course || project.badge || project.id);
      const zip = new JSZip();

      const projectPng = await exportNodeToPngBase64(
        exportProjectNodes.current[project.id],
        `${projectBase}__project__design-1.png`,
      );
      zip.file(`${projectBase}__project__design-1.png`, projectPng, { base64: true });

      for (const moduleItem of project.modules) {
        const moduleBase = slugify(moduleItem.title || moduleItem.id);

        const modulePng = await exportNodeToPngBase64(
          exportModuleNodes.current[moduleItem.id],
          `${projectBase}__module__${moduleBase}__design-2.png`,
        );
        zip.file(`${projectBase}__module__${moduleBase}__design-2.png`, modulePng, { base64: true });

        for (const lesson of moduleItem.lessons) {
          const lessonBase = slugify(lesson.title || lesson.id);

          const lessonPng = await exportNodeToPngBase64(
            exportLessonNodes.current[lesson.id],
            `${projectBase}__lesson__${moduleBase}__${lessonBase}__design-3.png`,
          );
          zip.file(`${projectBase}__lesson__${moduleBase}__${lessonBase}__design-3.png`, lessonPng, {
            base64: true,
          });
        }
      }

      const archive = await zip.generateAsync({ type: "blob" });
      downloadBlob(archive, `${projectBase}__graphics.zip`);

      setMessage("Graphics ZIP generated and downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate graphics.");
    } finally {
      setSaving(false);
      setGeneratingProjectId(null);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>Curriculum Tree Manager</h1>
            <p>Create projects, modules, and lessons in one place.</p>
          </div>
          <button
            className={styles.button}
            type="button"
            onClick={handleCreateProject}
            disabled={saving}
          >
            Add project
          </button>
        </header>

        <p className={styles.message} aria-live="polite">
          {loading ? "Loading..." : message}
        </p>

        <section className={styles.tree}>
          <div
            className={`${styles.dropZone} ${
              dropTarget?.listType === "project" && dropTarget.index === 0 ? styles.dropZoneActive : ""
            }`}
            onDragOver={(event) => onDragOver({ listType: "project", index: 0 }, event)}
            onDrop={(event) => onDrop({ listType: "project", index: 0 }, event)}
          />

          {tree.map((project, projectIndex) => (
            <div
              key={project.id}
              className={styles.projectCard}
              draggable
              onDragStart={() => onDragStart({ type: "project", id: project.id })}
              onDragEnd={onDragEnd}
            >
              <div className={styles.rowHeader}>
                <span className={styles.dragHandle}>Drag</span>
                <span className={styles.rowLabel}>Project</span>
                <button
                  className={styles.buttonSmall}
                  type="button"
                  onClick={() => void handleGenerateGraphics(project)}
                  disabled={saving}
                >
                  {generatingProjectId === project.id ? "Generating..." : "Generate graphics"}
                </button>
                <button
                  className={styles.buttonGhost}
                  type="button"
                  onClick={() => handleDelete("project", project.id)}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>

              <div className={styles.fields}>
                <label>
                  <span>Badge</span>
                  <input
                    value={project.badge}
                    onChange={(event) =>
                      handleChange("project", project.id, "badge", event.target.value)
                    }
                    onBlur={() =>
                      void handleCommit("project", project.id, {
                        badge: project.badge,
                        course: project.course,
                        subtitle: project.subtitle,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Course</span>
                  <input
                    value={project.course}
                    onChange={(event) =>
                      handleChange("project", project.id, "course", event.target.value)
                    }
                    onBlur={() =>
                      void handleCommit("project", project.id, {
                        badge: project.badge,
                        course: project.course,
                        subtitle: project.subtitle,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Subtitle</span>
                  <input
                    value={project.subtitle}
                    onChange={(event) =>
                      handleChange("project", project.id, "subtitle", event.target.value)
                    }
                    onBlur={() =>
                      void handleCommit("project", project.id, {
                        badge: project.badge,
                        course: project.course,
                        subtitle: project.subtitle,
                      })
                    }
                  />
                </label>
              </div>

              <div className={styles.childActions}>
                <button
                  className={styles.buttonSmall}
                  type="button"
                  onClick={() => handleCreateModule(project.id)}
                  disabled={saving}
                >
                  Add module
                </button>
              </div>

              <div className={styles.moduleList}>
                <div
                  className={`${styles.dropZone} ${
                    dropTarget?.listType === "module" &&
                    dropTarget.parentId === project.id &&
                    dropTarget.index === 0
                      ? styles.dropZoneActive
                      : ""
                  }`}
                  onDragOver={(event) =>
                    onDragOver({ listType: "module", parentId: project.id, index: 0 }, event)
                  }
                  onDrop={(event) =>
                    onDrop({ listType: "module", parentId: project.id, index: 0 }, event)
                  }
                />

                {project.modules.map((moduleItem, moduleIndex) => (
                  <div
                    key={moduleItem.id}
                    className={styles.moduleCard}
                    draggable
                    onDragStart={() => onDragStart({ type: "module", id: moduleItem.id })}
                    onDragEnd={onDragEnd}
                  >
                    <div className={styles.rowHeader}>
                      <span className={styles.dragHandle}>Drag</span>
                      <span className={styles.rowLabel}>Module</span>
                      <button
                        className={styles.buttonGhost}
                        type="button"
                        onClick={() => handleDelete("module", moduleItem.id)}
                        disabled={saving}
                      >
                        Delete
                      </button>
                    </div>

                    <div className={styles.fields}>
                      <label>
                        <span>Title</span>
                        <input
                          value={moduleItem.title}
                          onChange={(event) =>
                            handleChange("module", moduleItem.id, "title", event.target.value)
                          }
                          onBlur={() =>
                            void handleCommit("module", moduleItem.id, {
                              title: moduleItem.title,
                              subtitle: moduleItem.subtitle,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Subtitle</span>
                        <input
                          value={moduleItem.subtitle}
                          onChange={(event) =>
                            handleChange("module", moduleItem.id, "subtitle", event.target.value)
                          }
                          onBlur={() =>
                            void handleCommit("module", moduleItem.id, {
                              title: moduleItem.title,
                              subtitle: moduleItem.subtitle,
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className={styles.childActions}>
                      <button
                        className={styles.buttonSmall}
                        type="button"
                        onClick={() => handleCreateLesson(moduleItem.id)}
                        disabled={saving}
                      >
                        Add lesson
                      </button>
                    </div>

                    <div className={styles.lessonList}>
                      <div
                        className={`${styles.dropZone} ${
                          dropTarget?.listType === "lesson" &&
                          dropTarget.parentId === moduleItem.id &&
                          dropTarget.index === 0
                            ? styles.dropZoneActive
                            : ""
                        }`}
                        onDragOver={(event) =>
                          onDragOver({ listType: "lesson", parentId: moduleItem.id, index: 0 }, event)
                        }
                        onDrop={(event) =>
                          onDrop({ listType: "lesson", parentId: moduleItem.id, index: 0 }, event)
                        }
                      />

                      {moduleItem.lessons.map((lesson, lessonIndex) => (
                        <div
                          key={lesson.id}
                          className={styles.lessonRow}
                          draggable
                          onDragStart={() => onDragStart({ type: "lesson", id: lesson.id })}
                          onDragEnd={onDragEnd}
                        >
                          <span className={styles.dragHandle}>Drag</span>
                          <label>
                            <span>Lesson title</span>
                            <input
                              value={lesson.title}
                              onChange={(event) =>
                                handleChange("lesson", lesson.id, "title", event.target.value)
                              }
                              onBlur={() =>
                                void handleCommit("lesson", lesson.id, {
                                  title: lesson.title,
                                })
                              }
                            />
                          </label>
                          <button
                            className={styles.buttonGhost}
                            type="button"
                            onClick={() => handleDelete("lesson", lesson.id)}
                            disabled={saving}
                          >
                            Delete
                          </button>
                          <div
                            className={`${styles.dropZone} ${
                              dropTarget?.listType === "lesson" &&
                              dropTarget.parentId === moduleItem.id &&
                              dropTarget.index === lessonIndex + 1
                                ? styles.dropZoneActive
                                : ""
                            }`}
                            onDragOver={(event) =>
                              onDragOver(
                                {
                                  listType: "lesson",
                                  parentId: moduleItem.id,
                                  index: lessonIndex + 1,
                                },
                                event,
                              )
                            }
                            onDrop={(event) =>
                              onDrop(
                                {
                                  listType: "lesson",
                                  parentId: moduleItem.id,
                                  index: lessonIndex + 1,
                                },
                                event,
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>

                    <div
                      className={`${styles.dropZone} ${
                        dropTarget?.listType === "module" &&
                        dropTarget.parentId === project.id &&
                        dropTarget.index === moduleIndex + 1
                          ? styles.dropZoneActive
                          : ""
                      }`}
                      onDragOver={(event) =>
                        onDragOver(
                          { listType: "module", parentId: project.id, index: moduleIndex + 1 },
                          event,
                        )
                      }
                      onDrop={(event) =>
                        onDrop(
                          { listType: "module", parentId: project.id, index: moduleIndex + 1 },
                          event,
                        )
                      }
                    />
                  </div>
                ))}
              </div>

              <div
                className={`${styles.dropZone} ${
                  dropTarget?.listType === "project" && dropTarget.index === projectIndex + 1
                    ? styles.dropZoneActive
                    : ""
                }`}
                onDragOver={(event) =>
                  onDragOver({ listType: "project", index: projectIndex + 1 }, event)
                }
                onDrop={(event) => onDrop({ listType: "project", index: projectIndex + 1 }, event)}
              />
            </div>
          ))}
        </section>

        {dragItem && dropTarget ? (
          <p className={styles.hint}>{canDrop ? "Drop to move item." : "Drop not allowed here."}</p>
        ) : (
          <p className={styles.hint}>Drag items using the Drag label to reorder in the tree.</p>
        )}

        <section className={styles.exportHost} aria-hidden="true">
          {tree.map((project) => (
            <div key={project.id}>
              <div ref={(node) => bindProjectNode(project.id, node)} className={styles.exportCapture}>
                <ExportSlidePrimary
                  logo={sharedLogo}
                  tag={project.badge || "PROJECT"}
                  course={project.course || "Untitled project"}
                  courseSubtitle={project.subtitle || "No subtitle"}
                />
              </div>

              {project.modules.map((moduleItem, moduleIndex) => (
                <div key={moduleItem.id}>
                  <div ref={(node) => bindModuleNode(moduleItem.id, node)} className={styles.exportCapture}>
                    <ExportSlideSecondary
                      logo={sharedLogo}
                      tag={String(moduleIndex + 1).padStart(2, "0")}
                      title={moduleItem.title || "Untitled module"}
                      subtitle={moduleItem.subtitle || "No subtitle"}
                      course={project.course || "Untitled project"}
                    />
                  </div>

                  {moduleItem.lessons.map((lesson, lessonIndex) => (
                    <div
                      key={lesson.id}
                      ref={(node) => bindLessonNode(lesson.id, node)}
                      className={styles.exportCapture}
                    >
                      <ExportSlideTertiary
                        logo={sharedLogo}
                        tag={`L${String(lessonIndex + 1).padStart(2, "0")}`}
                        title={lesson.title || "Untitled lesson"}
                        course={moduleItem.title || "Untitled module"}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function ExportSlidePrimary({ logo, tag, course, courseSubtitle }: ExportSlidePrimaryProps) {
  return (
    <div className={`${styles.logoSlide} ${styles.logoSlidePrimary}`}>
      <section className={styles.logoSlideLeft}>
        <div className={styles.logoSlideHeader}>
          <img className={styles.logoSlideBrand} src={logo} alt="didaktiv" />
          <span className={styles.logoSlideEyebrow}>{tag}</span>
          <div className={styles.logoSlideCopy}></div>
        </div>
      </section>

      <section className={styles.logoSlideRight} aria-hidden="true">
        <div className={`${styles.logoSlideMockup} ${styles.logoSlideMockupPrimary}`}>
          <div className={styles.logoSlideMockupBar}>
            <span className={styles.logoSlideDot}></span>
            <span className={styles.logoSlideDot}></span>
            <span className={styles.logoSlideDot}></span>
          </div>

          <div className={styles.logoSlideMockupBody}>
            <div className={styles.logoSlideRail}>
              {railChipWidths.map((width, index) => (
                <span
                  key={`${width}-${index}`}
                  className={`${styles.logoSlideRailChip} ${index === 0 ? styles.logoSlideRailChipActive : ""}`}
                  style={{ width }}
                ></span>
              ))}
            </div>

            <div className={styles.logoSlideSurface}>
              <span className={`${styles.logoSlideSurfaceLine} ${styles.logoSlideSurfaceLineShort}`}></span>
              <div className={`${styles.logoSlideSurfaceTitle} ${styles.logoSlideSurfaceTitlePrimary}`}>
                {course}
              </div>
              <div className={`${styles.logoSlideSurfaceSubtitle} ${styles.logoSlideSurfaceSubtitlePrimary}`}>
                {courseSubtitle}
              </div>
              <span className={`${styles.logoSlideSurfaceLine} ${styles.logoSlideSurfaceLineMid}`}></span>
              <span className={styles.logoSlideSurfaceCta}></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ExportSlideSecondary({ logo, tag, title, subtitle, course }: ExportSlideSecondaryProps) {
  return (
    <div className={styles.logoSlide}>
      <section className={styles.logoSlideLeft}>
        <div className={styles.logoSlideHeader}>
          <img className={styles.logoSlideBrand} src={logo} alt="didaktiv" />
          <span className={`${styles.logoSlideEyebrow} ${styles.logoSlideEyebrowWide}`}>{tag}</span>
          <div className={styles.logoSlideCopy}>
            <h2 className={styles.logoSlideTitle}>{title}</h2>
            <p className={styles.logoSlideSubtitle}>{subtitle}</p>
          </div>
        </div>
      </section>

      <section className={styles.logoSlideRight} aria-hidden="true">
        <div className={styles.logoSlideMockup}>
          <div className={styles.logoSlideMockupBar}>
            <span className={styles.logoSlideDot}></span>
            <span className={styles.logoSlideDot}></span>
            <span className={styles.logoSlideDot}></span>
          </div>

          <div className={styles.logoSlideMockupBody}>
            <div className={styles.logoSlideRail}>
              {railChipWidths.map((width, index) => (
                <span
                  key={`${width}-${index}`}
                  className={`${styles.logoSlideRailChip} ${index === 0 ? styles.logoSlideRailChipActive : ""}`}
                  style={{ width }}
                ></span>
              ))}
            </div>

            <div className={styles.logoSlideSurface}>
              <span className={`${styles.logoSlideSurfaceLine} ${styles.logoSlideSurfaceLineShort}`}></span>
              <div className={styles.logoSlideSurfaceTitle}>{course}</div>
              <span className={`${styles.logoSlideSurfaceLine} ${styles.logoSlideSurfaceLineMid}`}></span>
              <span className={styles.logoSlideSurfaceCta}></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ExportSlideTertiary({ logo, tag, title, course }: ExportSlideTertiaryProps) {
  return (
    <div className={`${styles.logoSlide} ${styles.logoSlideTertiary}`}>
      <section className={styles.logoSlideLeft}>
        <div className={styles.logoSlideHeader}>
          <img className={styles.logoSlideBrand} src={logo} alt="didaktiv" />
          <span className={`${styles.logoSlideEyebrow} ${styles.logoSlideEyebrowWide}`}>{tag}</span>
          <div className={styles.logoSlideCopy}>
            <h2 className={styles.logoSlideTitle}>{title}</h2>
          </div>
        </div>
      </section>

      <section className={styles.logoSlideRight} aria-hidden="true">
        <div className={`${styles.logoSlideMockup} ${styles.logoSlideMockupTertiary}`}>
          <div className={styles.logoSlideMockupBar}>
            <span className={styles.logoSlideDot}></span>
            <span className={styles.logoSlideDot}></span>
            <span className={styles.logoSlideDot}></span>
          </div>

          <div className={styles.logoSlideMockupBody}>
            <div className={styles.logoSlideRail}>
              {railChipWidths.map((width, index) => (
                <span
                  key={`${width}-${index}`}
                  className={`${styles.logoSlideRailChip} ${index === 0 ? styles.logoSlideRailChipActive : ""}`}
                  style={{ width }}
                ></span>
              ))}
            </div>

            <div className={styles.logoSlideSurface}>
              <span className={`${styles.logoSlideSurfaceLine} ${styles.logoSlideSurfaceLineShort}`}></span>
              <div className={styles.logoSlideSurfaceTitle}>{course}</div>
              <span className={`${styles.logoSlideSurfaceLine} ${styles.logoSlideSurfaceLineMid}`}></span>
              <span className={styles.logoSlideSurfaceCta}></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
