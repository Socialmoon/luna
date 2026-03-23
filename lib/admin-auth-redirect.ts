const ADMIN_DASHBOARD_PATH = "/leads";

function isAllowedDashboardRedirect(redirectTo: string) {
  return redirectTo === ADMIN_DASHBOARD_PATH || redirectTo.startsWith(`${ADMIN_DASHBOARD_PATH}/`) || redirectTo.startsWith(`${ADMIN_DASHBOARD_PATH}?`);
}

export function getSafeAdminRedirect(redirectTo: string | null | undefined) {
  if (!redirectTo) return ADMIN_DASHBOARD_PATH;
  return isAllowedDashboardRedirect(redirectTo) ? redirectTo : ADMIN_DASHBOARD_PATH;
}
