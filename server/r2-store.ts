import { AwsClient } from 'aws4fetch';
import { isSafeKey, type ObjectStore, type StoredObject } from './object-store.ts';

/**
 * The R2 bucket of the app, through its S3-compatible API. Requests are
 * signed with an R2 API token that may read and write this one bucket.
 */

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** The S3 endpoint; by default the one of the account. */
  endpoint?: string;
}

/** The R2 settings in an environment, or null when they are not all there. */
export function r2ConfigFrom(env: Record<string, string | undefined>): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    endpoint: env.R2_ENDPOINT || undefined,
  };
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

const unescapeXml = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]);

/** The objects in one page of a ListObjectsV2 answer, and the token of the next page. */
export function parseListing(xml: string): { objects: StoredObject[]; next: string | null } {
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, part]) => ({
    key: unescapeXml(/<Key>([\s\S]*?)<\/Key>/.exec(part)?.[1] ?? ''),
    etag: unescapeXml(/<ETag>([\s\S]*?)<\/ETag>/.exec(part)?.[1] ?? '').replace(/"/g, ''),
  }));
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { objects, next: truncated && next ? unescapeXml(next) : null };
}

export class R2Store implements ObjectStore {
  private readonly client: AwsClient;
  private readonly base: string;
  private readonly send: typeof fetch;

  constructor(config: R2Config, fetchImplementation: typeof fetch = fetch) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
    const endpoint = config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`;
    this.base = `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(config.bucket)}`;
    this.send = fetchImplementation;
  }

  private url(key: string): string {
    if (!isSafeKey(key)) throw new Error(`Not a valid key: ${key}`);
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    return this.send(await this.client.sign(url, init));
  }

  private async fail(response: Response, action: string): Promise<never> {
    const detail = /<Code>([^<]+)<\/Code>/.exec(await response.text().catch(() => ''))?.[1];
    throw new Error(`R2 could not ${action} (${response.status}${detail ? ` ${detail}` : ''}).`);
  }

  async get(key: string): Promise<string | null> {
    const response = await this.request(this.url(key));
    if (response.status === 404) return null;
    if (!response.ok) return this.fail(response, `read ${key}`);
    return response.text();
  }

  async put(key: string, body: string, contentType = 'application/octet-stream'): Promise<void> {
    const response = await this.request(this.url(key), {
      method: 'PUT',
      body,
      headers: { 'Content-Type': contentType },
    });
    if (!response.ok) await this.fail(response, `write ${key}`);
  }

  /** Stores bytes, such as a backup of the database. */
  async putBytes(
    key: string,
    body: Uint8Array<ArrayBuffer>,
    contentType = 'application/octet-stream',
  ): Promise<void> {
    const response = await this.request(this.url(key), {
      method: 'PUT',
      body,
      headers: { 'Content-Type': contentType },
    });
    if (!response.ok) await this.fail(response, `write ${key}`);
  }

  async delete(key: string): Promise<void> {
    const response = await this.request(this.url(key), { method: 'DELETE' });
    if (!response.ok && response.status !== 404) await this.fail(response, `delete ${key}`);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let token: string | null = null;
    do {
      const query = new URLSearchParams({ 'list-type': '2', prefix });
      if (token) query.set('continuation-token', token);
      const response = await this.request(`${this.base}?${query.toString()}`);
      if (!response.ok) await this.fail(response, `list ${prefix}`);
      const page = parseListing(await response.text());
      objects.push(...page.objects);
      token = page.next;
    } while (token);
    return objects;
  }
}
