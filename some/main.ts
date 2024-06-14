import moment from 'moment-timezone';
import mysql from 'mysql2/promise';
import { Worker } from 'worker_threads';
import path from 'path';
import chalk from 'chalk';
import { SingleBar, Presets } from 'cli-progress';
import { performance } from 'perf_hooks';

const BATCH_SIZE = 5000;

async function getCurrentIndexFromDatabase(connection: mysql.Connection): Promise<number> {
    const [rows] = await connection.execute('SELECT MAX(address_index) AS max_index FROM Addresses');
    const maxIndex = (rows as any)[0].max_index;
    return maxIndex || 60000001;
}

function createWorkerPool(numWorkers: number, workerFile: string, startIndex: number, endIndex: number, workersIteration: number): Promise<void>[] {
    const workerPromises: Promise<void>[] = [];
    const progressBars: SingleBar[] = [];

    for (let i = 0; i < numWorkers; i++) {
        const progressBar = new SingleBar({}, Presets.shades_classic);
        progressBars.push(progressBar);

        const workerStartIndex = startIndex + i * BATCH_SIZE + (BATCH_SIZE * numWorkers * workersIteration);
        const workerEndIndex = Math.min(workerStartIndex + BATCH_SIZE - 1, endIndex);
        
        const worker = new Worker(workerFile, {
            workerData: {
                startIndex: workerStartIndex,
                endIndex: workerEndIndex
            },
            execArgv: ['-r', 'ts-node/register']
        });

        const workerPromise = new Promise<void>((resolve, reject) => {
            worker.on('message', (message: { type: string, currentIndex?: number }) => {
                if (message.type === 'done' || message.type === 'finished') {
                    resolve();
                } else if (message.type === 'info') {
                    progressBar.update(message.currentIndex! - workerStartIndex);
                }
            });

            worker.on('error', reject);
            worker.on('exit', (code: number) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });

        workerPromises.push(workerPromise);
    }

    return workerPromises;
}

async function main() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'root',
        database: 'addresses',
    });

    const now = moment().tz('Europe/Warsaw');
    const startDate = now.format('YYYY-MM-DD HH:mm:ss');
    console.log(chalk.blue.bold('Start time:'), startDate);

    const currentIndex = await getCurrentIndexFromDatabase(connection);
    const maxIndex = 9007199254740990; // Set maximum index if known
    const numWorkers = 4;
    let workersIteration = 0;

    console.log(chalk.blue.bold('Current index from database:'), currentIndex);

    let startIndex = currentIndex + 1;
    while (startIndex <= maxIndex) {
        const workerFile = path.resolve(__dirname, 'worker.ts');

        const start = performance.now();
        const workerPromises = createWorkerPool(numWorkers, workerFile, startIndex, maxIndex, workersIteration);

        try {
            await Promise.all(workerPromises);
            const end = performance.now();
            const executionTime = end - start;

            console.log(chalk.green.bold('\nAll workers have finished processing iteration', workersIteration));
            console.log(chalk.yellow.bold(`Average worker execution time: ${(executionTime / numWorkers).toFixed(2)} milliseconds`));
        } catch (error) {
            console.error(chalk.red.bold('Error in batch processing:'), error);
        }

        workersIteration++;
        startIndex = currentIndex + 1 + (BATCH_SIZE * numWorkers * workersIteration);
    }

    await connection.end();
    console.log(chalk.blue.bold('Processing complete'));
}

main().catch(console.error);
