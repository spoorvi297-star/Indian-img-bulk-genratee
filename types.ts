
export enum ImageResultStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface ImageResult {
  id: string;
  prompt: string;
  imageUrl?: string;
  error?: string;
  status: ImageResultStatus;
}
