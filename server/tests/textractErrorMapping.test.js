const { mapTextractError } = require('../services/textractService');

describe('mapTextractError', () => {
  const cases = [
    ['SubscriptionRequiredException', 400, /subscription required/i],
    ['AccessDeniedException', 403, /access denied/i],
    ['UnrecognizedClientException', 502, /credentials/i],
    ['ExpiredTokenException', 502, /credentials/i],
    ['UnsupportedDocumentException', 400, /Unsupported document/i],
    ['DocumentTooLargeException', 400, /too large/i],
    ['InvalidS3ObjectException', 502, /S3/i],
    ['ThrottlingException', 429, /busy/i],
    ['BadDocumentException', 400, /Couldn't read this receipt/],
  ];
  test.each(cases)('%s maps to %i', (name, status, pattern) => {
    const m = mapTextractError({ name, message: 'x' });
    expect(m.statusCode).toBe(status);
    expect(m.message).toMatch(pattern);
    expect(m.hint).toBeTruthy();
  });

  test('network failures are reported as unreachable region', () => {
    const m = mapTextractError({ name: 'Error', message: 'getaddrinfo ENOTFOUND textract.ap-south-1.amazonaws.com' });
    expect(m.statusCode).toBe(502);
    expect(m.message).toMatch(/Could not reach/i);
  });

  test('unknown errors keep the generic message and name the error in the hint', () => {
    const m = mapTextractError({ name: 'WeirdError', message: 'boom' });
    expect(m.message).toMatch(/Couldn't read this receipt/);
    expect(m.hint).toMatch(/WeirdError/);
  });
});
