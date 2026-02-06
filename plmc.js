const tls = require('tls');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { ECPairFactory } = require('ecpair');
const CryptoJS = require('crypto-js');
const { Buffer } = require('buffer');
const { program } = require('commander');

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const PALLADIUM_NETWORK = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'plm',
  bip32: {
    public: 76067358,
    private: 76066276
  },
  pubKeyHash: 55,
  scriptHash: 5,
  wif: 128
};

const MESSAGE_PREFIX = Buffer.from('PLMC');

class ElectrumClient {
  constructor(host, port) {
    this.host = host;
    this.port = Number(port);
    this.socket = null;
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
  }

  async connect() {
    if (this.socket && !this.socket.destroyed) return;
    return new Promise((resolve, reject) => {
      this.socket = tls.connect(
        {
          host: this.host,
          port: this.port,
          servername: this.host,
          rejectUnauthorized: false
        },
        () => resolve()
      );
      this.socket.setEncoding('utf8');
      this.socket.on('data', (chunk) => this.onData(chunk));
      this.socket.on('error', (err) => reject(err));
      this.socket.on('close', () => this.onClose());
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || 'Electrum error'));
          else resolve(msg.result);
        }
      } catch {}
    }
  }

  onClose() {
    for (const { reject } of this.pending.values()) {
      reject(new Error('Electrum connection closed'));
    }
    this.pending.clear();
  }

  async request(method, params = []) {
    await this.connect();
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(payload, 'utf8', (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  close() {
    if (this.socket) this.socket.destroy();
  }
}

function getSharedSecret(privateKey, theirPubKeyHex) {
  const theirPubKey = Buffer.from(theirPubKeyHex, 'hex');
  const sharedPoint = ecc.pointMultiply(theirPubKey, privateKey);
  const sharedHex = Buffer.from(sharedPoint).toString('hex');
  const hashed = CryptoJS.SHA256(sharedHex).toString(CryptoJS.enc.Hex);
  return Buffer.from(hashed, 'hex');
}

function encryptMessage(plaintext, theirPubKeyHex, privateKey) {
  const sharedSecret = getSharedSecret(privateKey, theirPubKeyHex);
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Hex.parse(sharedSecret.toString('hex')), {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return `${iv.toString(CryptoJS.enc.Hex)}:${encrypted.toString()}`;
}

function decryptMessage(payload, theirPubKeyHex, privateKey) {
  if (!payload.includes(':')) return payload;
  const [ivHex, ciphertext] = payload.split(':');
  const sharedSecret = getSharedSecret(privateKey, theirPubKeyHex);
  const decrypted = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Hex.parse(sharedSecret.toString('hex')), {
    iv: CryptoJS.enc.Hex.parse(ivHex),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  }).toString(CryptoJS.enc.Utf8);
  return decrypted || payload;
}

async function main() {
  program
    .option('-w, --wif <key>', 'WIF Private Key')
    .option('-h, --host <host>', 'ElectrumX Host', 'palladiumblockchain.net')
    .option('-p, --port <port>', 'ElectrumX Port', '50002')
    .option('-f, --fee <rate>', 'Fee rate (sat/vB)', '1');

  program
    .command('address')
    .description('Show address and public key')
    .action(async () => {
      const options = program.opts();
      const keyPair = ECPair.fromWIF(options.wif, PALLADIUM_NETWORK);
      const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: PALLADIUM_NETWORK });
      console.log(JSON.stringify({
        address,
        pubKey: keyPair.publicKey.toString('hex')
      }, null, 2));
    });

  program
    .command('balance')
    .description('Check balance')
    .action(async () => {
      const options = program.opts();
      const client = new ElectrumClient(options.host, options.port);
      const keyPair = ECPair.fromWIF(options.wif, PALLADIUM_NETWORK);
      const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: PALLADIUM_NETWORK });
      const script = bitcoin.address.toOutputScript(address, PALLADIUM_NETWORK);
      const scripthash = Buffer.from(bitcoin.crypto.sha256(script)).reverse().toString('hex');
      const balance = await client.request('blockchain.scripthash.get_balance', [scripthash]);
      console.log(JSON.stringify(balance, null, 2));
      client.close();
    });

  program
    .command('send <recipientPubKey> <message>')
    .description('Send an encrypted message')
    .action(async (recipientPubKey, message) => {
      const options = program.opts();
      const client = new ElectrumClient(options.host, options.port);
      const keyPair = ECPair.fromWIF(options.wif, PALLADIUM_NETWORK);
      const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: PALLADIUM_NETWORK });

      const encrypted = encryptMessage(message, recipientPubKey, keyPair.privateKey);
      const opReturnData = Buffer.concat([MESSAGE_PREFIX, Buffer.from(encrypted)]);
      const opReturnScript = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, opReturnData]);

      const script = bitcoin.address.toOutputScript(address, PALLADIUM_NETWORK);
      const scripthash = Buffer.from(bitcoin.crypto.sha256(script)).reverse().toString('hex');
      const utxos = await client.request('blockchain.scripthash.listunspent', [scripthash]);

      if (utxos.length === 0) throw new Error('No UTXOs found');

      const psbt = new bitcoin.Psbt({ network: PALLADIUM_NETWORK });
      let totalInput = 0;
      for (const utxo of utxos) {
        psbt.addInput({
          hash: utxo.tx_hash,
          index: utxo.tx_pos,
          witnessUtxo: {
            script: script,
            value: utxo.value
          }
        });
        totalInput += utxo.value;
      }

      psbt.addOutput({ script: opReturnScript, value: 0 });
      
      const { address: recipientAddr } = bitcoin.payments.p2wpkh({ 
        pubkey: Buffer.from(recipientPubKey, 'hex'), 
        network: PALLADIUM_NETWORK 
      });
      psbt.addOutput({ address: recipientAddr, value: 1000 }); // Dust-ish payment

      const fee = 500; // Simplified fee for CLI
      psbt.addOutput({ address, value: totalInput - 1000 - fee });

      psbt.signAllInputs(keyPair);
      psbt.finalizeAllInputs();
      const rawTx = psbt.extractTransaction().toHex();
      const txid = await client.request('blockchain.transaction.broadcast', [rawTx]);
      console.log(JSON.stringify({ txid }, null, 2));
      client.close();
    });

  program
    .command('inbox')
    .description('Read messages')
    .action(async () => {
      const options = program.opts();
      const client = new ElectrumClient(options.host, options.port);
      const keyPair = ECPair.fromWIF(options.wif, PALLADIUM_NETWORK);
      const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: PALLADIUM_NETWORK });
      const script = bitcoin.address.toOutputScript(address, PALLADIUM_NETWORK);
      const scripthash = Buffer.from(bitcoin.crypto.sha256(script)).reverse().toString('hex');
      const history = await client.request('blockchain.scripthash.get_history', [scripthash]);

      const messages = [];
      for (const item of history) {
        const rawTx = await client.request('blockchain.transaction.get', [item.tx_hash, false]);
        const tx = bitcoin.Transaction.fromHex(rawTx);

        let encoded = '';
        tx.outs.forEach(out => {
          const decompiled = bitcoin.script.decompile(out.script);
          if (decompiled && decompiled[0] === bitcoin.opcodes.OP_RETURN && Buffer.isBuffer(decompiled[1])) {
            const data = decompiled[1];
            if (data.slice(0, 4).equals(MESSAGE_PREFIX)) {
              encoded = data.slice(4).toString();
            }
          }
        });

        if (encoded) {
          // Get sender pubkey from first input witness
          if (tx.ins[0].witness && tx.ins[0].witness.length === 2) {
            const senderPubKey = Buffer.from(tx.ins[0].witness[1]).toString('hex');
            try {
              const text = decryptMessage(encoded, senderPubKey, keyPair.privateKey);
              messages.push({ from: senderPubKey, text, txid: item.tx_hash });
            } catch (e) {}
          }
        }
      }
      console.log(JSON.stringify(messages, null, 2));
      client.close();
    });

  program.parse();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
