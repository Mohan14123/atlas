import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';

export function useLogin() {
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => {
      localStorage.setItem('atlas_token', res.data.token);
    },
  });
}

export function useLogout() {
  return () => {
    localStorage.removeItem('atlas_token');
    window.location.href = '/login';
  };
}
