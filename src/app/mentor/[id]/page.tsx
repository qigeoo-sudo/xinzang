import { mentors } from "@/data/mentors";
import { MentorDetailClient } from "@/components/mentor/mentor-detail-client";

export function generateStaticParams() {
  return mentors.map((m) => ({ id: m.id }));
}

export default function MentorDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { session?: string };
}) {
  return <MentorDetailClient id={params.id} session={searchParams?.session} />;
}
