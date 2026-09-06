import { describe, expect, it } from 'vitest';
import { clientIdFromPath, switchClientPath } from './clientContext';

describe('clientIdFromPath', () => {
  it('reads the client from client routes only', () => {
    expect(clientIdFromPath('/clients/CL-0014')).toBe('CL-0014');
    expect(clientIdFromPath('/clients/CL-0014/portfolio/exposure')).toBe('CL-0014');
    expect(clientIdFromPath('/book')).toBeNull();
    expect(clientIdFromPath('/clients')).toBeNull();
  });
});

describe('switchClientPath', () => {
  it('keeps the room and the query when switching on a client route', () => {
    expect(switchClientPath('/clients/CL-0014/portfolio/exposure', '?snapshot=x', 'CL-0002')).toBe(
      '/clients/CL-0002/portfolio/exposure?snapshot=x',
    );
    expect(switchClientPath('/clients/CL-0014', '', 'CL-0002')).toBe('/clients/CL-0002');
  });
  it('opens the client from book-level screens', () => {
    expect(switchClientPath('/book', '?theme=signal', 'CL-0002')).toBe('/clients/CL-0002');
  });
});
