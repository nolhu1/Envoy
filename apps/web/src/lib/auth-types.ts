export type AppUserRole = "ADMIN" | "MEMBER" | "VIEWER";

export type AppSessionUser = {
  email: string;
  id: string;
  name?: string | null;
  role: AppUserRole;
  workspaceId: string;
};

export type AppJwt = {
  role?: AppUserRole;
  workspaceId?: string;
};

export type AppAuthContext = {
  email: string;
  role: AppUserRole;
  userId: string;
  workspaceId: string;
};
