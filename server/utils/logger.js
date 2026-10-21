const pino = require('pino');
const crypto = require('crypto');

const isDev = process.env.NODE_ENV === 'development';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  base: {
    service: 'finsight-api',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'newPassword',
      'token',
      'secret',
      '*.password',
      '*.newPassword',
      '*.token',
      '*.secret',
    ],
    remove: false,
  },
});

/**
 * Express middleware for correlation ID and structured HTTP request/response logging
 */
function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Attach child logger to request with correlation ID
  req.log = logger.child({ requestId });

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    req.log[level]({
      type: 'HTTP_REQUEST',
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      contentLength: res.get('content-length'),
      userAgent: req.get('user-agent'),
    });
  });

  next();
}

/**
 * Log structured details for every AWS API call with duration and outcome
 */
function logAwsCall({ service, operation, durationMs, success, error = null, requestId = null, metadata = {} }) {
  const logFn = success ? logger.info.bind(logger) : logger.error.bind(logger);
  logFn({
    type: 'AWS_CALL',
    service,
    operation,
    durationMs,
    success,
    error: error ? (error.message || String(error)) : null,
    errorCode: error?.code || error?.name || null,
    requestId,
    ...metadata,
  });
}

module.exports = {
  logger,
  requestLoggingMiddleware,
  logAwsCall,
};
