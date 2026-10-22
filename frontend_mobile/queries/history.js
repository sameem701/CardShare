import { getHolderHistory } from '../api/holder';
import { getRequesterHistory } from '../api/requester';
import { asList } from '../utils/format';

export function loadHistory(sessionId, userId, { signal, client }) {
  const previous = client.getQueryData(['history', userId]) || {};
  return Promise.allSettled([
    getRequesterHistory(sessionId, userId, { signal }),
    getHolderHistory(sessionId, userId, { signal }),
  ]).then(([asked, held]) => {
    if (signal?.aborted) {
      const aborted = new Error('Aborted');
      aborted.name = 'AbortError';
      throw aborted;
    }
    const failed = [asked, held].filter((result) => result.status === 'rejected');
    if (failed.length === 2) {
      throw new Error(failed[0].reason?.message || 'Could not load history.');
    }
    return {
      asRequester: asked.status === 'fulfilled' ? asList(asked.value) : (previous.asRequester || []),
      asHolder: held.status === 'fulfilled' ? asList(held.value) : (previous.asHolder || []),
      error: failed.length ? (failed[0].reason?.message || 'Could not load history.') : '',
    };
  });
}
