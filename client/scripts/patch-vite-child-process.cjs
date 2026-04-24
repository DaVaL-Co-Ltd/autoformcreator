const childProcess = require('node:child_process')
const { syncBuiltinESMExports } = require('node:module')

const originalExec = childProcess.exec

childProcess.exec = function patchedExec(command, ...args) {
  if (process.platform === 'win32' && command === 'net use') {
    const callback = args.find((arg) => typeof arg === 'function')
    if (callback) {
      process.nextTick(() => callback(new Error('Skipped net use on Windows dev startup'), ''))
    }

    return {
      pid: 0,
      kill() {},
      on() { return this },
      once() { return this },
      removeListener() { return this },
    }
  }

  return originalExec.call(this, command, ...args)
}

syncBuiltinESMExports()
