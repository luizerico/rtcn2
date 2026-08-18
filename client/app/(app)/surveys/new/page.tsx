import { redirect } from 'next/navigation';

export default function LegacyCreateSurveyRedirect() {
  redirect('/admin/surveys/new');
}
