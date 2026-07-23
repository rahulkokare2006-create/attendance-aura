import toast from 'react-hot-toast';

export interface RequestOptions<T> {
  actionName: string;
  onRequestStart?: () => void;
  onRequestEnd?: () => void;
  successMessage?: string;
  onSuccess?: (result: T) => void;
  onError?: (error: any) => void;
}

// Global in-flight request tracker to prevent duplicate rapid clicks
const pendingRequests = new Set<string>();

/**
 * Execute an action with locked button state, adaptive progress indicators, and clean error formatting.
 */
export async function executeRequest<T>(
  requestId: string,
  task: () => Promise<T>,
  options: RequestOptions<T>
): Promise<T | null> {
  // Prevent duplicate concurrent click on same action
  if (pendingRequests.has(requestId)) {
    toast.error('Processing previous request. Please wait...', { id: `dup-${requestId}` });
    return null;
  }

  pendingRequests.add(requestId);
  if (options.onRequestStart) options.onRequestStart();

  const toastId = toast.loading(`Processing ${options.actionName}...`);

  // Adaptive progress updates for slow networks
  const timer1 = setTimeout(() => {
    toast.loading(`Still processing ${options.actionName}... Please wait.`, { id: toastId });
  }, 2000);

  const timer2 = setTimeout(() => {
    toast.loading(`Almost done with ${options.actionName}...`, { id: toastId });
  }, 5000);

  try {
    const result = await task();
    clearTimeout(timer1);
    clearTimeout(timer2);

    if (options.successMessage) {
      toast.success(options.successMessage, { id: toastId });
    } else {
      toast.dismiss(toastId);
    }

    if (options.onSuccess) options.onSuccess(result);
    return result;
  } catch (err: any) {
    clearTimeout(timer1);
    clearTimeout(timer2);

    let errorMessage = err?.message || 'Request failed. Please try again.';
    if (err?.name === 'AbortError' || errorMessage.includes('timeout')) {
      errorMessage = '⏰ Network Timeout: Server took too long to respond. Please check your connection.';
    } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      errorMessage = '📡 Network Error: Unable to connect to server. Please check your internet connection.';
    }

    toast.error(errorMessage, { id: toastId });
    if (options.onError) options.onError(err);
    return null;
  } finally {
    pendingRequests.delete(requestId);
    if (options.onRequestEnd) options.onRequestEnd();
  }
}
