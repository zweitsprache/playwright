"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { toPng } from "html-to-image";
import { forwardRef, useRef, useState, type ForwardedRef, type ReactNode } from "react";

import styles from "./page.module.css";

type PrimarySlide = {
  tag: string;
  course: string;
  courseSubtitle: string;
};

type SecondarySlide = {
  tag: string;
  title: string;
  subtitle: string;
  course: string;
};

const railChipWidths = [126, 152, 107, 140, 90] as const;
const sharedLogo = "/logo/didaktiv_logo_brand.svg";

export default function LogoEditor() {
  const primaryRef = useRef<HTMLDivElement | null>(null);
  const secondaryRef = useRef<HTMLDivElement | null>(null);
  const tertiaryRef = useRef<HTMLDivElement | null>(null);

  const [logo, setLogo] = useState(sharedLogo);
  const [status, setStatus] = useState("Ready to export all designs.");
  const [downloadingId, setDownloadingId] = useState<"primary" | "secondary" | "tertiary" | null>(null);
  const [primary, setPrimary] = useState<PrimarySlide>({
    tag: "ONLINEKURS",
    course: "Padlet fuer den\nDaZ-Kurs",
    courseSubtitle: "Vorlagen, Workflows asdfsadf asdf asd fasd",
  });
  const [secondary, setSecondary] = useState<SecondarySlide>({
    tag: "01",
    title: "Informationen bereitstellen",
    subtitle: "Vorlagen, Workflows asdfsadf asdf asd fasd",
    course: "Padlet fuer den\nDaZ-Kurs",
  });

  async function downloadSlide(kind: "primary" | "secondary" | "tertiary") {
    const node =
      kind === "primary"
        ? primaryRef.current
        : kind === "secondary"
          ? secondaryRef.current
          : tertiaryRef.current;

    if (!node) {
      setStatus("The slide preview is not ready yet.");
      return;
    }

    setDownloadingId(kind);
    setStatus(
      `Rendering ${
        kind === "primary" ? "Design 1" : kind === "secondary" ? "Design 2" : "Design 3"
      }...`,
    );

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${
        kind === "primary" ? "design-1" : kind === "secondary" ? "design-2" : "design-3"
      }.png`;
      link.click();
      setStatus(
        `${kind === "primary" ? "Design 1" : kind === "secondary" ? "Design 2" : "Design 3"} downloaded as PNG.`,
      );
    } catch (error) {
      const nextStatus = error instanceof Error ? error.message : "PNG export failed.";
      setStatus(nextStatus);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Logo Slide Studio</p>
            <h1>Text in, PNG out.</h1>
            <p className={styles.heroText}>
              Edit both slide variants live, keep the current layout decisions, and export each design
              as a 1920 x 1080 PNG.
            </p>
          </div>
          <div className={styles.heroMeta}>
            <span className={styles.metaPill}>1920 x 1080 export</span>
            <Link className={styles.backLink} href="/">
              Back to launcher
            </Link>
          </div>
        </header>

        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Shared asset</h2>
                <p>The logo path stays shared across both designs.</p>
              </div>
              <label className={styles.field} htmlFor="logoPath">
                <span>Logo path</span>
                <input
                  id="logoPath"
                  className={styles.input}
                  type="text"
                  value={logo}
                  onChange={(event) => setLogo(event.target.value)}
                  spellCheck={false}
                />
              </label>
              <p className={styles.status} aria-live="polite">
                {status}
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Design 1</h2>
                <p>Mockup-first variation with badge, course, and subtitle inside the surface.</p>
              </div>
              <label className={styles.field} htmlFor="primaryTag">
                <span>Badge</span>
                <input
                  id="primaryTag"
                  className={styles.input}
                  type="text"
                  value={primary.tag}
                  onChange={(event) =>
                    setPrimary((current) => ({ ...current, tag: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field} htmlFor="primaryCourse">
                <span>Course</span>
                <textarea
                  id="primaryCourse"
                  className={styles.textareaLarge}
                  value={primary.course}
                  onChange={(event) =>
                    setPrimary((current) => ({ ...current, course: event.target.value }))
                  }
                  rows={3}
                />
              </label>
              <label className={styles.field} htmlFor="primarySubtitle">
                <span>Subtitle</span>
                <textarea
                  id="primarySubtitle"
                  className={styles.textarea}
                  value={primary.courseSubtitle}
                  onChange={(event) =>
                    setPrimary((current) => ({ ...current, courseSubtitle: event.target.value }))
                  }
                  rows={3}
                />
              </label>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Design 2</h2>
                <p>Badge, title, subtitle, and course remain editable independently here.</p>
              </div>
              <label className={styles.field} htmlFor="secondaryTag">
                <span>Badge</span>
                <input
                  id="secondaryTag"
                  className={styles.input}
                  type="text"
                  value={secondary.tag}
                  onChange={(event) =>
                    setSecondary((current) => ({ ...current, tag: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field} htmlFor="secondaryTitle">
                <span>Title</span>
                <textarea
                  id="secondaryTitle"
                  className={styles.textareaLarge}
                  value={secondary.title}
                  onChange={(event) =>
                    setSecondary((current) => ({ ...current, title: event.target.value }))
                  }
                  rows={3}
                />
              </label>
              <label className={styles.field} htmlFor="secondarySubtitle">
                <span>Subtitle</span>
                <textarea
                  id="secondarySubtitle"
                  className={styles.textarea}
                  value={secondary.subtitle}
                  onChange={(event) =>
                    setSecondary((current) => ({ ...current, subtitle: event.target.value }))
                  }
                  rows={3}
                />
              </label>
              <label className={styles.field} htmlFor="secondaryCourse">
                <span>Course</span>
                <textarea
                  id="secondaryCourse"
                  className={styles.textarea}
                  value={secondary.course}
                  onChange={(event) =>
                    setSecondary((current) => ({ ...current, course: event.target.value }))
                  }
                  rows={3}
                />
              </label>
            </section>
          </aside>

          <section className={styles.previewColumn}>
            <PreviewCard
              title="Design 1"
              caption="Wider mockup, badge on the left, copy inside the mockup surface."
              buttonLabel={downloadingId === "primary" ? "Rendering..." : "Download PNG"}
              onDownload={() => downloadSlide("primary")}
              disabled={downloadingId !== null}
            >
              <PreviewFrame>
                <ForwardedSlidePrimary
                  ref={primaryRef}
                  logo={logo}
                  tag={primary.tag}
                  course={primary.course}
                  courseSubtitle={primary.courseSubtitle}
                />
              </PreviewFrame>
            </PreviewCard>

            <PreviewCard
              title="Design 2"
              caption="Tag, title, subtitle, and course preview with the current secondary layout."
              buttonLabel={downloadingId === "secondary" ? "Rendering..." : "Download PNG"}
              onDownload={() => downloadSlide("secondary")}
              disabled={downloadingId !== null}
            >
              <PreviewFrame>
                <ForwardedSlideSecondary
                  ref={secondaryRef}
                  logo={logo}
                  tag={secondary.tag}
                  title={secondary.title}
                  subtitle={secondary.subtitle}
                  course={secondary.course}
                />
              </PreviewFrame>
            </PreviewCard>

            <PreviewCard
              title="Design 3"
              caption="Based on Design 2 with a 50% mockup anchored to the same top-right origin."
              buttonLabel={downloadingId === "tertiary" ? "Rendering..." : "Download PNG"}
              onDownload={() => downloadSlide("tertiary")}
              disabled={downloadingId !== null}
            >
              <PreviewFrame>
                <ForwardedSlideTertiary
                  ref={tertiaryRef}
                  logo={logo}
                  tag={secondary.tag}
                  title={secondary.title}
                  subtitle={secondary.subtitle}
                  course={secondary.course}
                />
              </PreviewFrame>
            </PreviewCard>
          </section>
        </div>
      </div>
    </div>
  );
}

type PreviewCardProps = {
  title: string;
  caption: string;
  buttonLabel: string;
  onDownload: () => void;
  disabled: boolean;
  children: ReactNode;
};

function PreviewCard({
  title,
  caption,
  buttonLabel,
  onDownload,
  disabled,
  children,
}: PreviewCardProps) {
  return (
    <article className={styles.previewCard}>
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.previewEyebrow}>{title}</p>
          <p className={styles.previewCaption}>{caption}</p>
        </div>
        <button className={styles.downloadButton} type="button" onClick={onDownload} disabled={disabled}>
          {buttonLabel}
        </button>
      </div>
      {children}
    </article>
  );
}

function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.previewFrame}>
      <div className={styles.previewScaled}>
        <div className={styles.previewViewport}>{children}</div>
      </div>
    </div>
  );
}

type PrimaryProps = PrimarySlide & { logo: string };
type SecondaryProps = SecondarySlide & { logo: string };

const SlidePrimary = (
  { logo, tag, course, courseSubtitle }: PrimaryProps,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  return (
    <div ref={ref} className={`${styles.slide} ${styles.slidePrimary}`}>
      <section className={styles.slideLeft}>
        <div className={styles.slideHeader}>
          <img className={styles.slideBrand} src={logo} alt="didaktiv" />
          <span className={styles.slideEyebrow}>{tag}</span>
          <div className={`${styles.slideCopy} ${styles.slideCopyUrl}`}>
              <p className={`${styles.slideSubtitle} ${styles.slideSubtitleUrl}`}>didaktiv.com</p>
          </div>
        </div>
      </section>

      <section className={styles.slideRight} aria-hidden="true">
        <div className={`${styles.slideMockup} ${styles.slideMockupPrimary}`}>
          <div className={styles.slideMockupBar}>
            <span className={styles.slideDot}></span>
            <span className={styles.slideDot}></span>
            <span className={styles.slideDot}></span>
          </div>

          <div className={styles.slideMockupBody}>
            <div className={styles.slideRail}>
              {railChipWidths.map((width, index) => (
                <span
                  key={`${width}-${index}`}
                  className={`${styles.slideRailChip} ${index === 0 ? styles.slideRailChipActive : ""}`}
                  style={{ width }}
                ></span>
              ))}
            </div>

            <div className={styles.slideSurface}>
              <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineShort}`}></span>
              <div className={`${styles.slideSurfaceTitle} ${styles.slideSurfaceTitlePrimary}`}>{course}</div>
              <div className={`${styles.slideSurfaceSubtitle} ${styles.slideSurfaceSubtitlePrimary}`}>
                {courseSubtitle}
              </div>
              <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineMid}`}></span>
              <span className={styles.slideSurfaceCta}></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const SlideSecondary = (
  { logo, tag, title, subtitle, course }: SecondaryProps,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  return (
    <div ref={ref} className={styles.slide}>
      <section className={styles.slideLeft}>
        <div className={styles.slideHeader}>
          <img className={styles.slideBrand} src={logo} alt="didaktiv" />
          <span className={`${styles.slideEyebrow} ${styles.slideEyebrowWide}`}>{tag}</span>
          <div className={styles.slideCopy}>
            <h2 className={styles.slideTitle}>{title}</h2>
            <p className={styles.slideSubtitle}>{subtitle}</p>
          </div>
        </div>
      </section>

      <section className={styles.slideRight} aria-hidden="true">
        <div className={styles.slideMockup}>
          <div className={styles.slideMockupBar}>
            <span className={styles.slideDot}></span>
            <span className={styles.slideDot}></span>
            <span className={styles.slideDot}></span>
          </div>

          <div className={styles.slideMockupBody}>
            <div className={styles.slideRail}>
              {railChipWidths.map((width, index) => (
                <span
                  key={`${width}-${index}`}
                  className={`${styles.slideRailChip} ${index === 0 ? styles.slideRailChipActive : ""}`}
                  style={{ width }}
                ></span>
              ))}
            </div>

            <div className={styles.slideSurface}>
              <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineShort}`}></span>
              <div className={styles.slideSurfaceTitle}>{course}</div>
              <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineMid}`}></span>
              <span className={styles.slideSurfaceCta}></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const SlideTertiary = (
  { logo, tag, title, course }: SecondaryProps,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  return (
    <div ref={ref} className={`${styles.slide} ${styles.slideTertiary}`}>
      <section className={styles.slideLeft}>
        <div className={styles.slideHeader}>
          <img className={styles.slideBrand} src={logo} alt="didaktiv" />
          <span className={`${styles.slideEyebrow} ${styles.slideEyebrowWide}`}>{tag}</span>
          <div className={styles.slideCopy}>
            <h2 className={styles.slideTitle}>{title}</h2>
          </div>
        </div>
      </section>

      <section className={styles.slideRight} aria-hidden="true">
        <div className={`${styles.slideMockup} ${styles.slideMockupTertiary}`}>
          <div className={styles.slideMockupBar}>
            <span className={styles.slideDot}></span>
            <span className={styles.slideDot}></span>
            <span className={styles.slideDot}></span>
          </div>

          <div className={styles.slideMockupBody}>
            <div className={styles.slideRail}>
              {railChipWidths.map((width, index) => (
                <span
                  key={`${width}-${index}`}
                  className={`${styles.slideRailChip} ${index === 0 ? styles.slideRailChipActive : ""}`}
                  style={{ width }}
                ></span>
              ))}
            </div>

            <div className={styles.slideSurface}>
              <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineShort}`}></span>
              <div className={styles.slideSurfaceTitle}>{course}</div>
              <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineMid}`}></span>
              <span className={styles.slideSurfaceCta}></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const ForwardedSlidePrimary = forwardRef(SlidePrimary);
ForwardedSlidePrimary.displayName = "SlidePrimary";

const ForwardedSlideSecondary = forwardRef(SlideSecondary);
ForwardedSlideSecondary.displayName = "SlideSecondary";

const ForwardedSlideTertiary = forwardRef(SlideTertiary);
ForwardedSlideTertiary.displayName = "SlideTertiary";
