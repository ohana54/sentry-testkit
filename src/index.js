'use strict'

const { parseDsn } = require('./parseDsn')

function getException(report) {
  return report.error
}

function transformReport(report) {
  const exception =
    report.exception && report.exception.values && report.exception.values[0]
  const error = exception
    ? {
        name: exception.type,
        message: exception.value,
        stacktrace: exception.stacktrace,
      }
    : undefined

  return {
    breadcrumbs: report.breadcrumbs || [],
    error,
    message: report.message,
    extra: report.extra,
    level: report.level || 'error',
    release: report.release,
    user: report.user,
    tags: report.tags || {},
    originalReport: report,
  }
}

module.exports = () => {
  let reports = []
  const puppeteerHandler = request => {
    if (/https:\/\/sentry\.io\/api\/[0-9]*\/store/.test(request.url())) {
      reports.push(transformReport(JSON.parse(request.postData())))
    }
  }
  return {
    sentryTransport: function(options) {
      const sendEvent = function(report) {
        reports.push(transformReport(report))
        return Promise.resolve({
          status: 'success',
          event: report,
        })
      }

      const close = function() {
        return Promise.resolve(true);
      }

      return {
        // captureEvent(event: SentryEvent): Promise<SentryResponse>;
        captureEvent: sendEvent, // support for v4 API
        sendEvent, // support for v5 API

        // close(timeout?: number): Promise<boolean>;
        close,
      }
    },
    initNetworkInterceptor: (dsn, cb) => {
      const { protocol, host } = parseDsn(dsn)
      const baseUrl = `${protocol}://${host}`
      const handleRequestBody = requestBody =>
        reports.push(transformReport(requestBody))

      return cb(baseUrl, handleRequestBody)
    },
    testkit: {
      puppeteer: {
        startListening: page => {
          page.on('request', puppeteerHandler)
        },

        stopListening: page => {
          page.removeListener('request', puppeteerHandler)
        },
      },

      reports() {
        return reports
      },

      reset() {
        reports = []
      },

      getExceptionAt(index) {
        return getException(reports[index])
      },

      findReport(e) {
        return reports.find(r => {
          const err = getException(r)
          return err.name === e.name && err.message === e.message
        })
      },

      isExist(e) {
        return this.findReport(e) !== undefined
      },
    },
  }
}
