import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  gestorOnly?: boolean;
}

export const ProtectedRoute = ({ children, adminOnly = false, gestorOnly = false }: ProtectedRouteProps) => {
  const { session, loading, isAdmin, canManage } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (gestorOnly && !canManage) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
