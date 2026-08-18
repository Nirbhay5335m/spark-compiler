import { 
  HealthStatus, 
  SparkStatus, 
  SparkTestResult, 
  SparkExecutionResult, 
  SparkCancelResult,
  DatasetItem,
  DatasetPreview,
  DatasetUploadResult
} from '../types';

const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  // When running on GitHub Pages (github.io), automatically route to the live Render production backend
  if (typeof window !== 'undefined' && window.location.hostname.includes('github.io')) {
    return 'https://spark-compiler.onrender.com/api';
  }
  return '/api';
};

const API_BASE = getApiBase();

export async function fetchHealth(): Promise<HealthStatus> {
  const start = performance.now();
  const response = await fetch(`${API_BASE}/health`, {
    headers: {
      Accept: 'application/json',
    },
  });
  const latency_ms = Math.round(performance.now() - start);

  if (!response.ok) {
    throw new Error(`Health check failed (${response.status}: ${response.statusText})`);
  }

  const data = await response.json();
  return { ...data, latency_ms };
}

export async function fetchSparkStatus(): Promise<SparkStatus> {
  const start = performance.now();
  const response = await fetch(`${API_BASE}/spark/status`, {
    headers: {
      Accept: 'application/json',
    },
  });
  const latency_ms = Math.round(performance.now() - start);

  if (!response.ok) {
    throw new Error(`Spark status check failed (${response.status}: ${response.statusText})`);
  }

  const data = await response.json();
  return { ...data, latency_ms };
}

export async function executeSparkTest(records?: Record<string, any>[]): Promise<SparkTestResult> {
  const payload = records && records.length > 0 ? { records } : {};
  const response = await fetch(`${API_BASE}/spark/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Spark test job failed with HTTP ${response.status}`);
  }

  return await response.json();
}

export async function executeSparkCode(
  code: string, 
  jobId?: string, 
  timeoutSeconds: number = 120
): Promise<SparkExecutionResult> {
  const response = await fetch(`${API_BASE}/spark/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      code,
      job_id: jobId,
      timeout_seconds: timeoutSeconds,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Execution request failed with HTTP ${response.status}`);
  }

  return await response.json();
}

export async function executeSparkSQL(
  sql: string,
  jobId?: string,
  timeoutSeconds: number = 120
): Promise<SparkExecutionResult> {
  const response = await fetch(`${API_BASE}/spark/sql/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sql,
      job_id: jobId,
      timeout_seconds: timeoutSeconds,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `SQL execution request failed with HTTP ${response.status}`);
  }

  return await response.json();
}

export async function cancelSparkJob(jobId: string): Promise<SparkCancelResult> {
  const response = await fetch(`${API_BASE}/spark/cancel/${jobId}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Cancellation request failed with HTTP ${response.status}`);
  }

  return await response.json();
}

export async function fetchDatasets(): Promise<{ datasets: DatasetItem[]; total: number }> {
  const response = await fetch(`${API_BASE}/datasets`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch datasets (${response.status})`);
  }

  return await response.json();
}

export async function fetchDatasetPreview(filename: string, limit: number = 100): Promise<DatasetPreview> {
  const response = await fetch(`${API_BASE}/datasets/${encodeURIComponent(filename)}/preview?limit=${limit}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to load dataset preview for ${filename}`);
  }

  return await response.json();
}

export function uploadDataset(
  file: File,
  onProgress?: (progressPercent: number) => void
): Promise<DatasetUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.open('POST', `${API_BASE}/datasets/upload`, true);
    xhr.responseType = 'json';

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as DatasetUploadResult);
      } else {
        const detail = xhr.response?.detail || `Upload failed with status ${xhr.status}`;
        reject(new Error(detail));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during dataset upload.'));
    };

    xhr.send(formData);
  });
}

export async function deleteDataset(filename: string): Promise<{ filename: string; deleted: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/datasets/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to delete dataset '${filename}' (${response.status})`);
  }

  return await response.json();
}

