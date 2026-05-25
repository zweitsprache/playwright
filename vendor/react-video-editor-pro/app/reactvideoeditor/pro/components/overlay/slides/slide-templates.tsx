/* eslint-disable @next/next/no-img-element */
"use client";

import { forwardRef, type ForwardedRef } from "react";
import styles from "./slide-templates.module.css";

export type SlideKind = "primary" | "secondary" | "tertiary";

export type SlideSpec = {
  kind: SlideKind;
  logo: string;
  tag: string;
  title?: string;
  subtitle?: string;
  course?: string;
  courseSubtitle?: string;
};

export const SHARED_LOGO = "/logo/didaktiv_logo_brand.svg";
const railChipWidths = [126, 152, 107, 140, 90] as const;

export const DEFAULT_PRIMARY: SlideSpec = {
  kind: "primary",
  logo: SHARED_LOGO,
  tag: "ONLINEKURS",
  course: "Padlet fuer den\nDaZ-Kurs",
  courseSubtitle: "Vorlagen, Workflows asdfsadf asdf asd fasd",
};

export const DEFAULT_SECONDARY: SlideSpec = {
  kind: "secondary",
  logo: SHARED_LOGO,
  tag: "01",
  title: "Informationen bereitstellen",
  subtitle: "Vorlagen, Workflows asdfsadf asdf asd fasd",
  course: "Padlet fuer den\nDaZ-Kurs",
};

export const DEFAULT_TERTIARY: SlideSpec = {
  kind: "tertiary",
  logo: SHARED_LOGO,
  tag: "01",
  title: "Informationen bereitstellen",
  course: "Padlet fuer den\nDaZ-Kurs",
};

export function defaultSpecForKind(kind: SlideKind): SlideSpec {
  if (kind === "primary") return { ...DEFAULT_PRIMARY };
  if (kind === "secondary") return { ...DEFAULT_SECONDARY };
  return { ...DEFAULT_TERTIARY };
}

type PrimaryProps = {
  logo: string;
  tag: string;
  course: string;
  courseSubtitle: string;
};

type SecondaryProps = {
  logo: string;
  tag: string;
  title: string;
  subtitle: string;
  course: string;
};

type TertiaryProps = {
  logo: string;
  tag: string;
  title: string;
  course: string;
};

const SlidePrimary = (
  { logo, tag, course, courseSubtitle }: PrimaryProps,
  ref: ForwardedRef<HTMLDivElement>,
) => (
  <div ref={ref} className={`${styles.slide} ${styles.slidePrimary}`}>
    <section className={styles.slideLeft}>
      <div className={styles.slideHeader}>
        <img className={styles.slideBrand} src={logo} alt="logo" />
        <span className={styles.slideEyebrow}>{tag}</span>
        <div className={`${styles.slideCopy} ${styles.slideCopyUrl}`}>
          <p className={`${styles.slideSubtitle} ${styles.slideSubtitleUrl}`}>didaktiv.com</p>
        </div>
      </div>
    </section>
    <section className={styles.slideRight} aria-hidden="true">
      <div className={`${styles.slideMockup} ${styles.slideMockupPrimary}`}>
        <div className={styles.slideMockupBar}>
          <span className={styles.slideDot} />
          <span className={styles.slideDot} />
          <span className={styles.slideDot} />
        </div>
        <div className={styles.slideMockupBody}>
          <div className={styles.slideRail}>
            {railChipWidths.map((width, index) => (
              <span
                key={`${width}-${index}`}
                className={`${styles.slideRailChip} ${index === 0 ? styles.slideRailChipActive : ""}`}
                style={{ width }}
              />
            ))}
          </div>
          <div className={styles.slideSurface}>
            <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineShort}`} />
            <div className={`${styles.slideSurfaceTitle} ${styles.slideSurfaceTitlePrimary}`}>{course}</div>
            <div className={`${styles.slideSurfaceSubtitle} ${styles.slideSurfaceSubtitlePrimary}`}>
              {courseSubtitle}
            </div>
            <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineMid}`} />
            <span className={styles.slideSurfaceCta} />
          </div>
        </div>
      </div>
    </section>
  </div>
);

const SlideSecondary = (
  { logo, tag, title, subtitle, course }: SecondaryProps,
  ref: ForwardedRef<HTMLDivElement>,
) => (
  <div ref={ref} className={styles.slide}>
    <section className={styles.slideLeft}>
      <div className={styles.slideHeader}>
        <img className={styles.slideBrand} src={logo} alt="logo" />
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
          <span className={styles.slideDot} />
          <span className={styles.slideDot} />
          <span className={styles.slideDot} />
        </div>
        <div className={styles.slideMockupBody}>
          <div className={styles.slideRail}>
            {railChipWidths.map((width, index) => (
              <span
                key={`${width}-${index}`}
                className={`${styles.slideRailChip} ${index === 0 ? styles.slideRailChipActive : ""}`}
                style={{ width }}
              />
            ))}
          </div>
          <div className={styles.slideSurface}>
            <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineShort}`} />
            <div className={styles.slideSurfaceTitle}>{course}</div>
            <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineMid}`} />
            <span className={styles.slideSurfaceCta} />
          </div>
        </div>
      </div>
    </section>
  </div>
);

const SlideTertiary = (
  { logo, tag, title, course }: TertiaryProps,
  ref: ForwardedRef<HTMLDivElement>,
) => (
  <div ref={ref} className={`${styles.slide} ${styles.slideTertiary}`}>
    <section className={styles.slideLeft}>
      <div className={styles.slideHeader}>
        <img className={styles.slideBrand} src={logo} alt="logo" />
        <span className={`${styles.slideEyebrow} ${styles.slideEyebrowWide}`}>{tag}</span>
        <div className={styles.slideCopy}>
          <h2 className={styles.slideTitle}>{title}</h2>
        </div>
      </div>
    </section>
    <section className={styles.slideRight} aria-hidden="true">
      <div className={`${styles.slideMockup} ${styles.slideMockupTertiary}`}>
        <div className={styles.slideMockupBar}>
          <span className={styles.slideDot} />
          <span className={styles.slideDot} />
          <span className={styles.slideDot} />
        </div>
        <div className={styles.slideMockupBody}>
          <div className={styles.slideRail}>
            {railChipWidths.map((width, index) => (
              <span
                key={`${width}-${index}`}
                className={`${styles.slideRailChip} ${index === 0 ? styles.slideRailChipActive : ""}`}
                style={{ width }}
              />
            ))}
          </div>
          <div className={styles.slideSurface}>
            <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineShort}`} />
            <div className={styles.slideSurfaceTitle}>{course}</div>
            <span className={`${styles.slideSurfaceLine} ${styles.slideSurfaceLineMid}`} />
            <span className={styles.slideSurfaceCta} />
          </div>
        </div>
      </div>
    </section>
  </div>
);

export const ForwardedSlidePrimary = forwardRef(SlidePrimary);
ForwardedSlidePrimary.displayName = "SlidePrimary";
export const ForwardedSlideSecondary = forwardRef(SlideSecondary);
ForwardedSlideSecondary.displayName = "SlideSecondary";
export const ForwardedSlideTertiary = forwardRef(SlideTertiary);
ForwardedSlideTertiary.displayName = "SlideTertiary";

/**
 * Renders a slide of the given kind, using the spec's text fields.
 * Always renders at 1920x1080.
 */
export const SlideRenderer = forwardRef(function SlideRenderer(
  { spec }: { spec: SlideSpec },
  ref: ForwardedRef<HTMLDivElement>,
) {
  if (spec.kind === "primary") {
    return (
      <ForwardedSlidePrimary
        ref={ref}
        logo={spec.logo || SHARED_LOGO}
        tag={spec.tag}
        course={spec.course ?? ""}
        courseSubtitle={spec.courseSubtitle ?? ""}
      />
    );
  }
  if (spec.kind === "secondary") {
    return (
      <ForwardedSlideSecondary
        ref={ref}
        logo={spec.logo || SHARED_LOGO}
        tag={spec.tag}
        title={spec.title ?? ""}
        subtitle={spec.subtitle ?? ""}
        course={spec.course ?? ""}
      />
    );
  }
  return (
    <ForwardedSlideTertiary
      ref={ref}
      logo={spec.logo || SHARED_LOGO}
      tag={spec.tag}
      title={spec.title ?? ""}
      course={spec.course ?? ""}
    />
  );
});
