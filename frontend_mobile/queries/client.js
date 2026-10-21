import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

let generation = 0;

export function accountGeneration() {
  return generation;
}

export async function clearAccountQueries() {
  generation += 1;
  await queryClient.cancelQueries();
  queryClient.clear();
}
