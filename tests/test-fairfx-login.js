const path = require('path');
const { Worker } = require('worker_threads');
const readline = require('readline');

const workerPath = path.resolve(__dirname, '../src/fairfx/login.js');

const worker = new Worker(workerPath);

worker.on('message', (msg) => {
    console.log('WORKER MESSAGE:', msg);
});

worker.on('error', (err) => {
    console.error('WORKER ERROR:', err);
});

worker.on('exit', (code) => {
    console.log('WORKER EXITED with code', code);
    process.exit(0);
});

// Example JSON payload to start the worker. You can edit before running.
const defaultPayload = {
    email: 'ryanbays@icloud.com',
    password: 'Gabbie<30108'
};

// Send initial "start" message automatically.
// If you prefer to send it manually from the prompt, comment out the next line.
worker.postMessage({ type: 'start', payload: defaultPayload });

// Setup readline to accept OTPs (and simple commands) from terminal.
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'cmd> '
});

console.log('Type an OTP to send it to the worker. Commands:');
console.log('  otpcode           -> sends OTP payload { otp: "otpcode" }');
console.log('  start             -> resend default start payload');
console.log('  startjson {...}   -> send start with JSON payload');
console.log('  stop              -> send stop and exit');
console.log('  exit | quit       -> exit process');

rl.prompt();

rl.on('line', (line) => {
    const input = line.trim();
    if (!input) {
        rl.prompt();
        return;
    }

    if (input === 'stop') {
        worker.postMessage({ type: 'stop' });
        rl.close();
        return;
    }

    if (input === 'start') {
        worker.postMessage({ type: 'start', payload: defaultPayload });
        rl.prompt();
        return;
    }

    if (input.startsWith('startjson ')) {
        const jsonPart = input.slice('startjson '.length);
        try {
            const payload = JSON.parse(jsonPart);
            worker.postMessage({ type: 'start', payload });
        } catch (err) {
            console.error('Invalid JSON:', err.message);
        }
        rl.prompt();
        return;
    }

    if (input === 'exit' || input === 'quit') {
        worker.postMessage({ type: 'stop' });
        rl.close();
        return;
    }


    // Otherwise treat input as OTP code
    worker.postMessage({ type: 'otp', payload: { otp: input } });
    rl.prompt();
});

rl.on('close', () => {
    console.log('Input closed. Exiting.');
    process.exit(0);
});
