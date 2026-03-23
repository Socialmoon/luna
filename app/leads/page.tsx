import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import LeadsDashboardClient from "./page-client";

export default async function LeadsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin-login?redirect=/leads");
  }

  return <LeadsDashboardClient />;
}
