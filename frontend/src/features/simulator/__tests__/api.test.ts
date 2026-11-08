import { ApiError, resolveApiBaseUrl, simulatorApi } from '../api';
import { recordingClips } from '../recordings/catalog';

describe('resolveApiBaseUrl', () => {
  const original = process.env.EXPO_PUBLIC_API_URL;
  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = original;
  });

  it('uses EXPO_PUBLIC_API_URL when set, without a trailing slash', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://10.0.0.5:9000/';
    expect(resolveApiBaseUrl()).toBe('http://10.0.0.5:9000');
  });

  it('falls back to port 8000 on the dev host', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    expect(resolveApiBaseUrl()).toMatch(/^http:\/\/[^/]+:8000$/);
  });
});

describe('simulatorApi', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('surfaces the backend detail message on errors', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: 'that response is not available right now' }),
    }) as unknown as typeof fetch;
    await expect(simulatorApi.choose('s1', 'x')).rejects.toEqual(
      new ApiError('that response is not available right now', 409),
    );
  });

  it('reports an unreachable server clearly', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    await expect(simulatorApi.scenarios()).rejects.toThrow(/Can’t reach the practice server/);
  });

  it('sends JSON bodies to the simulator routes', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await simulatorApi.say('abc', 'hello');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/simulator\/sessions\/abc\/say$/);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ text: 'hello' }) });
  });
});

describe('bundled recordings', () => {
  it('no clip transcript contains a phone number or callback instruction', () => {
    const unsafe = /\d{3}[\s.-]*\d{3,4}|\d{7,}|\(\d{3}\)|call (us )?(back )?(at|on)\b|toll[- ]free/i;
    for (const c of recordingClips) expect([c.id, unsafe.test(c.transcript)]).toEqual([c.id, false]);
  });
});
