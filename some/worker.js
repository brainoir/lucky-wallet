const { parentPort, workerData } = require('worker_threads');
const mysql = require('mysql2/promise');
const { Address } = require('@ton/core');
//import { LuckyWallet } from '../wrappers/LuckyWallet.ts';
const { LuckyWallet } = require('../wrappers/LuckyWallet');

async function createConnection() {
  return await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'addresses',
  });
}

async function insertAddressToDatabase(connection, index, address) {
  const addressSuffix = address.substring(39);
  const addressSuffixInverted = addressSuffix.split('').reverse().join('').toLowerCase();
  const query = `INSERT INTO addresses (address_index, address, address_suffix_reversed) VALUES (?, ?, ?)`;
  await connection.execute(query, [index, address, addressSuffixInverted]);
}

async function processBatch(startIndex, endIndex) {
  const connection = await createConnection();
  const luckyBank = Address.parse('EQBpqnrjhql5jbMLvKocqKFL0_fMQOwCtDQlDCFOiG98WT0C');

  for (let currentIndex = startIndex; currentIndex <= endIndex; currentIndex++) {
    try {
      const walletK1 = await LuckyWallet.fromInit(luckyBank, BigInt(currentIndex));
      const address = walletK1.address.toString();
      //await insertAddressToDatabase(connection, currentIndex, address); //temp
    } catch (error) {
      parentPort.postMessage({ type: 'error', error, currentIndex });
    }
  }
  parentPort.postMessage({ type: 'done', startIndex, endIndex });
  await connection.end();
}

processBatch(workerData.startIndex, workerData.endIndex)
  .then(() => parentPort.postMessage({ type: 'finished' }))
  .catch(error => parentPort.postMessage({ type: 'error', error }));
