import ProjectView from "./ProjectView";

export default function ProjectPage({ params }: { params: { id: string } }) {
  return <ProjectView projectId={params.id} />;
}
