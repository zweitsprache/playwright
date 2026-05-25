import type { Metadata } from "next";

import { CurriculumManager } from "./curriculum-manager";

export const metadata: Metadata = {
  title: "Curriculum Manager",
  description: "Manage projects, modules, and lessons.",
};

export default function CurriculumPage() {
  return <CurriculumManager />;
}
