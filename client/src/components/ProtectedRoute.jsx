import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

export default function ProtectedRoute({ children }) {
  const { merchant, loading } = useAuth();

  if (loading) return <LoadingSpinner text="Checking authentication..." />;
  if (!merchant) return <Navigate to="/login" replace />;

  return children;
}
