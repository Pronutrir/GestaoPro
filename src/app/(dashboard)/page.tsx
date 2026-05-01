import { redirect } from 'next/server'

export default function DashboardHomePage() {
  redirect('/projects')
}
