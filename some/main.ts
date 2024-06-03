import moment from 'moment-timezone';
import mysql from 'mysql2/promise';
import { Worker } from 'worker_threads';
import path from 'path';

async function getCurrentIndexFromDatabase(connection: mysql.Connection): Promise<number> {
    const [rows] = await connection.execute('SELECT MAX(address_index) AS max_index FROM Addresses');
    const maxIndex = (rows as any)[0].max_index;
    return maxIndex || 60000001;
}

function createWorkerPool(numWorkers: number, workerFile: string, startIndex: number, endIndex: number): Promise<void>[] {
    const workerPromises: Promise<void>[] = [];

    for (let i = 0; i < numWorkers; i++) {
        const workerStartIndex = startIndex + i * Math.ceil((endIndex - startIndex) / numWorkers);
        const workerEndIndex = Math.min(startIndex + (i + 1) * Math.ceil((endIndex - startIndex) / numWorkers) - 1, endIndex);
        
        const worker = new Worker(workerFile, {
            workerData: {
                startIndex: workerStartIndex,
                endIndex: workerEndIndex
            }
        });

        const workerPromise = new Promise<void>((resolve, reject) => {
            worker.on('message', (message: { type: string }) => {
                if (message.type === 'done' || message.type === 'finished') {
                    resolve();
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
    console.log('Start time: ', startDate);

    const currentIndex = await getCurrentIndexFromDatabase(connection);
    const maxIndex = 9007199254740990;
    const numWorkers = 4;

    console.log('Current index from database:', currentIndex);

    const workerFile = path.resolve(__dirname, 'worker.js');
    const workerPromises = createWorkerPool(numWorkers, workerFile, currentIndex, maxIndex);

    try {
        await Promise.all(workerPromises);
        console.log('All workers have finished processing');
    } catch (error) {
        console.error('Error in batch processing:', error);
    } finally {
        await connection.end();
    }
}

main().catch(console.error);
