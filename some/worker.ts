import { parentPort, workerData } from 'worker_threads';
import mysql from 'mysql2/promise';
import { Address } from '@ton/core';
import { LuckyWallet } from '../wrappers/LuckyWallet';

interface WorkerData {
  startIndex: number;
  endIndex: number;
  workerId: number;
  numWorkers: number;
  batchSize: number;
}

interface Message {
  type: string;
  error?: Error;
  currentIndex?: number;
  startIndex?: number;
  endIndex?: number;
  info?: string;
}

async function createConnection() {
  return await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'addresses',
  });
}

async function insertAddressBatchToDatabase(connection: mysql.Connection, addresses: { index: number, address: string }[]) {
  const query = `INSERT INTO addresses (address_index, address, address_suffix_reversed) VALUES (?, ?, ?)`;
  const addressValues = addresses.map(({ index, address }) => {
    const addressSuffix = address.substring(39);
    const addressSuffixInverted = addressSuffix.split('').reverse().join('').toLowerCase();
    return [index, address, addressSuffixInverted];
  });
  await connection.query('START TRANSACTION');
  try {
    for (const values of addressValues) {
      await connection.execute(query, values);
    }
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  }
}

async function processBatch(startIndex: number, endIndex: number) {
  const connection = await createConnection();
  const luckyBank = Address.parse('EQBpqnrjhql5jbMLvKocqKFL0_fMQOwCtDQlDCFOiG98WT0C');

  const addresses: { index: number, address: string }[] = [];
  const BATCH_SIZE = workerData.batchSize;

  for (let currentIndex = startIndex; currentIndex <= endIndex; currentIndex++) {
    try {
      const walletK1 = await LuckyWallet.fromInit(luckyBank, BigInt(currentIndex));
      const address = walletK1.address.toString();
      addresses.push({ index: currentIndex, address });

      // Обновляем статус воркера
      const infoMessage: Message = { type: 'info', currentIndex };
      parentPort?.postMessage(infoMessage);

      // Вставляем данные в базу, если накопили BATCH_SIZE адресов
      if (addresses.length >= BATCH_SIZE) {
        await insertAddressBatchToDatabase(connection, addresses);
        addresses.length = 0; // Очищаем массив
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const message: Message = { type: 'error', error, currentIndex };
      parentPort?.postMessage(message);
    }
  }

  // Вставляем оставшиеся адреса в базу данных
  if (addresses.length > 0) {
    await insertAddressBatchToDatabase(connection, addresses);
  }

  const doneMessage: Message = { type: 'done', startIndex, endIndex };
  parentPort?.postMessage(doneMessage);
  await connection.end();
}

const data = workerData as WorkerData;

processBatch(data.startIndex, data.endIndex)
  .then(() => {
    const finishedMessage: Message = { type: 'finished' };
    parentPort?.postMessage(finishedMessage);
  })
  .catch(err => {
    const error = err instanceof Error ? err : new Error(String(err));
    const errorMessage: Message = { type: 'error', error };
    parentPort?.postMessage(errorMessage);
  });
