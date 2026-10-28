// Loaded in the CLI and inherited worker threads; does not replace any runtime API.
const { isMainThread, threadId } = require('node:worker_threads');
const emit = (phase, detail = {}) => process.stderr.write(`[profile-runtime] ${JSON.stringify({ phase, pid: process.pid, threadId, isMainThread, time: Date.now(), ...detail })}\n`);
emit('start');
process.on('exit', code => emit('exit', { code }));
process.on('uncaughtExceptionMonitor', error => emit('uncaught', { name: error.name, message: error.message }));
