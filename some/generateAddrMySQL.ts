import { Address } from "@ton/core";
import { LuckyWallet } from "../wrappers/LuckyWallet";
import moment from "moment-timezone";
import mysql from "mysql2";

// Создаем соединение с базой данных
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "addresses",
});

async function getCurrentIndexFromDatabase(connection: any): Promise<number> {
  return new Promise((resolve, reject) => {
    connection.query(
      "SELECT MAX(address_index) AS max_index FROM Addresses",
      (error: any, results: any[], fields: any) => {
        if (error) {
          reject(error);
        } else {
          const maxIndex = results[0].max_index;
          resolve(maxIndex || 60000001); // Если значение не найдено, возвращаем 60000001
        }
      }
    );
  });
}

// Функция для вставки адресов в базу данных
async function insertAddressToDatabase(index: number, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const addressSuffix = address.substring(39);
    const addressSuffixInverted = addressSuffix.split("").reverse().join("").toLowerCase();
    const query = `INSERT INTO addresses (address_index, address, address_suffix_reversed) VALUES (?, ?, ?)`;
    connection.query(
      query,
      [index, address, addressSuffixInverted],
      (error: any, results: any, fields: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(); // Разрешаем промис после успешной вставки
        }
      }
    );
  });
}

async function commitTransaction() {
  return new Promise((resolve, reject) => {
    connection.commit((err: any) => {
      if (err) {
        reject(err);
      } else {
        console.log("Changes committed to the database");
        resolve(undefined); // передаем undefined в качестве успешного результата
      }
    });
  });
}

async function processAddresses(startIndex: number, endIndex: number, batchSize: number) {
  let currentIndex = startIndex;
  const luckyBank = Address.parse("EQBpqnrjhql5jbMLvKocqKFL0_fMQOwCtDQlDCFOiG98WT0C");
  const startMoment = moment().tz('Europe/Warsaw');

  while (currentIndex <= endIndex) {
    try {
      const walletK1 = await LuckyWallet.fromInit(luckyBank, BigInt(currentIndex));
      const address = walletK1.address.toString();

      // Вставляем адрес в базу данных
      await insertAddressToDatabase(currentIndex, address);

      // Обновляем currentIndex после успешной вставки
      currentIndex++;

      if (currentIndex % batchSize === 0) {
	  
        // Коммит изменений в базу данных
        await commitTransaction();
		
		//Выводим дату в консоль (текщий индекс и время работы)
		const nowMoment = moment().tz('Europe/Warsaw');
		const nowDate = nowMoment.format('YYYY-MM-DD HH:mm:ss');
        // Разница во времени между текущей итерацией и началом работы
        const differenceInMilliseconds = moment(nowMoment).diff(startMoment);
        // Продолжительность работы в часах
        const workTime = moment.duration(differenceInMilliseconds).humanize();
        console.log(
          `//PROGRESS\nWorks: ${workTime}\nCurrent Time: ${nowDate}\n\x1b[33mCurrent index: ${currentIndex}\x1b[0m\n----------------------`
        );
      }
    } catch (error) {
      console.error(`Error processing address at index ${currentIndex}:`, error);
    }
  }
}


async function run() {
  const now = moment().tz('Europe/Warsaw');
  const startDate = now.format('YYYY-MM-DD HH:mm:ss');
	console.log ("Start time: ", startDate);
  const batchSize = 5000;
  const currentIndex = await getCurrentIndexFromDatabase(connection);
  const maxIndex = 9007199253740990; // Максимальный индекс из вашего описания



  console.log("Current index from database:", currentIndex);

  await processAddresses(currentIndex, maxIndex, batchSize); // Добавлен параметр maxIndex
}

// Запускаем скрипт
run();
