import { redirect } from 'next/navigation';

export default async function LegacySurveyDesignerRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/surveys/${id}`);
}
