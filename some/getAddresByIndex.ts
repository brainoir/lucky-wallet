import { Address } from '@ton/core';
import { LuckyWallet } from '../wrappers/LuckyWallet';

const luckyBank = Address.parse('EQBpqnrjhql5jbMLvKocqKFL0_fMQOwCtDQlDCFOiG98WT0C');

async function run() {
    // Предположим, у вас есть массив значений в строке, разделенных запятыми
    const valuesString = '77091271'; // Замените эту строку на ваш массив значений
    const valuesArray = valuesString.split(',').map(value => BigInt(value.trim()));

    for (const value of valuesArray) {
        try {
            let wallet = await LuckyWallet.fromInit(luckyBank, value);
            let addr = wallet.address.toString();
            console.log(value,addr);
        } catch (error) {
            console.error(`Ошибка при обработке значения ${value}: ${error}`);
        }
    }
}

run();
