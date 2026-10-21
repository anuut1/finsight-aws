import { useAuthContext } from '../context/AuthContext.jsx';

const useAuth = () => {
  return useAuthContext();
};

export default useAuth;

