import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';

export function useScreenQuery(queryKey, queryFn, enabled = true) {
  const focused = useIsFocused();
  const query = useQuery({
    queryKey,
    queryFn,
    enabled: Boolean(enabled && focused && queryKey.every((part) => part != null && part !== '')),
    staleTime: 30 * 1000,
  });
  const hasData = query.data !== undefined;
  return {
    ...query,
    showLoading: query.isPending && !hasData,
    refreshing: query.isFetching && hasData,
    errorMessage: query.error?.message || '',
  };
}
