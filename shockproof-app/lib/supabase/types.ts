export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ReadingStatus =
  | "draft"
  | "uploading"
  | "processing"
  | "completed"
  | "failed";
