declare module '@vercel/blob' {
  export function put(
    pathname: string,
    body: string | Blob | ArrayBuffer,
    options?: {
      access?: 'public' | 'private';
      addRandomSuffix?: boolean;
      token?: string;
      contentType?: string;
    },
  ): Promise<{ url: string; pathname: string }>;

  export function list(options?: {
    prefix?: string;
    token?: string;
    limit?: number;
  }): Promise<{ blobs: Array<{ url: string; pathname: string }> }>;
}
